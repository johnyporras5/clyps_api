import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SessionProduct } from './entities/session_product.entity';
import { Product } from './entities/product.entity';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';

export interface SellProductLine {
  productId: number;
  quantity: number;
  // Precio unitario en unidades mínimas (editable en el cobro). Si se omite, se
  // toma el del catálogo.
  unitPriceMinor?: number;
  // company_worker que lo vendió; null/omitido = "nadie / sin comisión".
  sellerEmployeeId?: number | null;
}

@Injectable()
export class SessionProductService {
  constructor(
    @InjectRepository(SessionProduct)
    private readonly sessionProductRepository: Repository<SessionProduct>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private readonly companyWorkerRepository: Repository<CompanyWorker>,
  ) {}

  /**
   * Registra la venta de 0..N productos en el cobro de una sesión: crea las
   * filas `session_product` y descuenta stock (respetando
   * company.allowNegativeStock). NO genera comisión — eso lo hace CLYP-318
   * desde las atribuciones del payload, trazando a `session_product.id`.
   *
   * Pensada para correr DENTRO de la transacción del cobro: pasar el `manager`
   * del queryRunner para que venta + descuento de stock sean atómicos. La
   * idempotencia la garantiza el cobro (una sesión solo se cobra una vez).
   */
  async sellProducts(
    sessionId: number | null,
    companyId: number,
    lines: SellProductLine[],
    manager?: EntityManager,
    // Venta directa (sin cita): enlaza cada línea a la cabecera `direct_sale`.
    directSaleId?: number | null,
  ): Promise<SessionProduct[]> {
    if (!lines?.length) return [];

    const productRepo = manager
      ? manager.getRepository(Product)
      : this.productRepository;
    const spRepo = manager
      ? manager.getRepository(SessionProduct)
      : this.sessionProductRepository;
    const companyRepo = manager
      ? manager.getRepository(Company)
      : this.companyRepository;
    const workerRepo = manager
      ? manager.getRepository(CompanyWorker)
      : this.companyWorkerRepository;

    const company = await companyRepo.findOne({ where: { id: companyId } });
    const allowNegative = !!company?.allowNegativeStock;

    const created: SessionProduct[] = [];
    for (const line of lines) {
      const quantity = line.quantity;
      if (!Number.isInteger(quantity) || quantity <= 0)
        throw new BadRequestException(
          'La cantidad del producto debe ser un entero mayor a 0',
        );

      const product = await productRepo.findOne({
        where: { id: line.productId, companyId },
      });
      if (!product)
        throw new BadRequestException(
          `Producto con id ${line.productId} no encontrado o no pertenece a la compañía`,
        );

      const unitPriceMinor = line.unitPriceMinor ?? product.salePriceMinor;
      if (unitPriceMinor < 0)
        throw new BadRequestException(
          'El precio del producto no puede ser negativo',
        );

      // Vendedor opcional: si viene, debe ser un trabajador de la company.
      let sellerEmployeeId: number | null = null;
      if (line.sellerEmployeeId != null) {
        const seller = await workerRepo.findOne({
          where: { id: line.sellerEmployeeId, companyId },
        });
        if (!seller)
          throw new BadRequestException(
            `El vendedor ${line.sellerEmployeeId} no pertenece a la compañía`,
          );
        sellerEmployeeId = seller.id;
      }

      // Stock: si la company no permite negativo y no alcanza → bloquear.
      if (!allowNegative && product.stock < quantity) {
        throw new BadRequestException(
          `Stock insuficiente para "${product.name}" (disponible ${product.stock}, se piden ${quantity})`,
        );
      }

      // Congelar costo y comisión de la línea para el reporte. La comisión solo
      // aplica si el producto la da y hay vendedor; % del total o fijo por unidad.
      const lineTotal = unitPriceMinor * quantity;
      const costMinor = (product.costMinor || 0) * quantity;
      let commissionMinor = 0;
      if (product.appliesCommission && sellerEmployeeId != null) {
        commissionMinor =
          product.commissionMode === 'fixed'
            ? (product.commissionFixedMinor || 0) * quantity
            : Math.round((lineTotal * (product.commissionBps || 0)) / 10000);
      }

      const sp = spRepo.create({
        companyId,
        sessionId,
        saleType: 'client',
        productId: product.id,
        quantity,
        unitPriceMinor,
        currency: product.currency,
        costMinor,
        commissionMinor,
        sellerEmployeeId,
        buyerEmployeeId: null,
        directSaleId: directSaleId ?? null,
      });
      const savedSp = await spRepo.save(sp);

      product.stock -= quantity;
      await productRepo.save(product);

      // Adjuntamos el producto (para que el cobro use su nombre en el label del
      // concepto de comisión: "Comisión — <nombre>").
      savedSp.product = product;
      created.push(savedSp);
    }
    return created;
  }

  async findBySession(sessionId: number): Promise<
    {
      id: number;
      productId: number;
      name: string;
      quantity: number;
      unitPriceMinor: number;
      currency: string;
      sellerName: string | null;
    }[]
  > {
    const rows = await this.sessionProductRepository.find({
      where: { sessionId },
      relations: ['product', 'seller', 'seller.worker'],
      order: { id: 'ASC' },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      name: r.product?.name ?? 'Producto',
      quantity: r.quantity,
      unitPriceMinor: Number(r.unitPriceMinor),
      currency: r.currency,
      sellerName: r.seller?.worker?.name?.trim() || null,
    }));
  }
}
