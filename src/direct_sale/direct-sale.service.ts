import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DirectSale } from './entities/direct-sale.entity';
import { Company } from '../company/entities/company.entity';
import { Client } from '../client/entities/client.entity';
import { SessionProduct } from '../product/entities/session_product.entity';
import { SessionProductService } from '../product/session_product.service';
import {
  AttributionConceptItem,
  PayrollEarningsService,
} from '../payroll/payroll-earnings.service';
import { pct } from '../payroll/payroll-money.util';
import { CreateDirectSaleDto } from './dto/create-direct-sale.dto';

@Injectable()
export class DirectSaleService {
  private readonly logger = new Logger(DirectSaleService.name);

  constructor(
    @InjectRepository(DirectSale)
    private readonly directSaleRepository: Repository<DirectSale>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly sessionProductService: SessionProductService,
    private readonly payrollEarningsService: PayrollEarningsService,
    private readonly dataSource: DataSource,
  ) {}

  async create(adminId: number, dto: CreateDirectSaleDto) {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company) {
      throw new ForbiddenException('No tienes una compañía asignada');
    }

    // Cliente opcional: si viene, debe existir y pertenecer a la compañía.
    if (dto.clientId != null) {
      const client = await this.clientRepository.findOne({
        where: { id: dto.clientId },
      });
      if (!client) {
        throw new NotFoundException('Cliente no encontrado');
      }
      if (!client.companies || !client.companies.includes(company.id)) {
        throw new ForbiddenException(
          'Este cliente no está asociado a tu compañía',
        );
      }
    }

    // Toda moneda distinta de Bs debe traer su tasa (para convertir a Bs).
    for (const line of dto.lines) {
      const cur = line.currency.toUpperCase();
      if (cur !== 'VES' && !line.exchangeRate) {
        throw new BadRequestException(
          `Falta la tasa de cambio para la moneda ${cur}.`,
        );
      }
    }

    const now = new Date();
    const paidAt = now;

    // 1) Venta + cabecera, atómico.
    const { sale, savedProducts } = await this.dataSource.transaction(
      async (manager) => {
        const saleRepo = manager.getRepository(DirectSale);
        const sale = await saleRepo.save(
          saleRepo.create({
            companyId: company.id,
            clientId: dto.clientId ?? null,
            method: dto.method ?? null,
            reference: dto.reference ?? null,
            totalBs: dto.totalBs ?? null,
            lines: dto.lines,
            collectedAt: dto.pendingCollection ? null : paidAt,
            wasPending: !!dto.pendingCollection,
            companyAdjustmentBs: dto.companyAdjustmentBs ?? null,
            createdByUserId: adminId,
          }),
        );

        const savedProducts = await this.sessionProductService.sellProducts(
          null,
          company.id,
          dto.products.map((p) => ({
            productId: p.productId,
            quantity: p.quantity,
            unitPriceMinor: p.unitPriceMinor,
            sellerEmployeeId: p.sellerEmployeeId ?? null,
          })),
          manager,
          sale.id,
        );

        return { sale, savedProducts };
      },
    );

    // 2) Comisiones/propinas → nómina (best-effort, fuera de la transacción de la
    //    venta; si falla no rompe la venta, igual que en el cobro de una cita).
    if (dto.attributions?.length) {
      try {
        const rateByCurrency = new Map<string, number>();
        for (const line of dto.lines) {
          const cur = line.currency.toUpperCase();
          rateByCurrency.set(cur, cur === 'VES' ? 1 : (line.exchangeRate ?? 0));
        }

        const attrItems = dto.attributions
          .map((a): AttributionConceptItem | null => {
            const sp = savedProducts[a.sourceId];
            if (!sp) return null; // índice fuera de rango
            const itemCurrency = (sp.currency || 'USD').toUpperCase();
            const itemPriceMinor = Number(sp.unitPriceMinor) * sp.quantity;
            const attrCurrency =
              a.basisMode === 'fixed' && a.currency
                ? a.currency.toUpperCase()
                : itemCurrency;
            const rawRate = rateByCurrency.get(attrCurrency);
            const rate =
              rawRate !== undefined
                ? rawRate
                : attrCurrency === 'VES'
                  ? 1
                  : null;
            const amountItemMinor =
              a.basisMode === 'percentage'
                ? pct(itemPriceMinor, a.value)
                : Math.round(a.value);
            return {
              kind: a.kind,
              companyWorkerId: a.employeeId,
              amountItemMinor,
              currency: attrCurrency,
              exchangeRate: rate,
              sourceType: 'direct_sale',
              sourceId: sp.id,
              label: `${a.kind === 'tip' ? 'Propina' : 'Comisión'} — ${
                sp.product?.name || 'Producto'
              }`,
              rateBps: a.basisMode === 'percentage' ? a.value : undefined,
            };
          })
          .filter((x): x is AttributionConceptItem => x !== null);

        await this.payrollEarningsService.recordAttributionConcepts(
          company.id,
          paidAt,
          attrItems,
          dto.method,
        );
      } catch (e) {
        this.logger.error(
          `Venta directa ${sale.id}: fallo al generar conceptos de nómina`,
          e instanceof Error ? e.stack : String(e),
        );
      }
    }

    return {
      id: sale.id,
      collectedAt: sale.collectedAt,
      wasPending: sale.wasPending,
      products: savedProducts.map((sp: SessionProduct) => ({
        id: sp.id,
        productId: sp.productId,
        quantity: sp.quantity,
        unitPriceMinor: Number(sp.unitPriceMinor),
        currency: sp.currency,
      })),
    };
  }
}
