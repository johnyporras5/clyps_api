import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashTransaction } from './entities/cash-transaction.entity';
import { CashCategory } from '../cash_category/entities/cash-category.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';
import { UpdateCashTransactionDto } from './dto/update-cash-transaction.dto';
import { QueryCashTransactionsDto } from './dto/query-cash-transactions.dto';
import { assertPositiveAmountMinor, toBsMinor } from './cash-transaction.util';
import { normalizeSupplierName } from './cash-supplier.util';
import { categoryAllowsKind } from '../cash_category/cash-category.enums';
import type {
  CashTransactionKind,
  CashPaymentMethod,
} from './cash-transaction.enums';
import {
  paginate,
  type PaginationResult,
} from '../common/utils/pagination.util';

@Injectable()
export class CashTransactionService {
  constructor(
    @InjectRepository(CashTransaction)
    private readonly transactionRepository: Repository<CashTransaction>,
    @InjectRepository(CashCategory)
    private readonly categoryRepository: Repository<CashCategory>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company;
  }

  async create(
    adminId: number,
    dto: CreateCashTransactionDto,
  ): Promise<CashTransaction> {
    const company = await this.getCompanyOrFail(adminId);

    // El DTO ya validó el monto; esto cubre a quien llame al servicio directo.
    assertPositiveAmountMinor(dto.amountMinor);
    await this.assertCategoryFits(company.id, dto.categoryId, dto.kind, true);
    assertPaymentReferenceFits(dto.paymentMethod, dto.paymentReference);

    const currency = dto.currency ?? 'VES';
    const exchangeRate = dto.exchangeRate ?? null;
    assertExchangeRateFits(currency, exchangeRate);

    const transaction = this.transactionRepository.create({
      companyId: company.id,
      kind: dto.kind,
      concept: dto.concept.trim(),
      categoryId: dto.categoryId,
      amountMinor: dto.amountMinor,
      currency,
      exchangeRate,
      // Se congela al registrar: es lo que sumarán los reportes para siempre.
      amountBsMinor: toBsMinor(currency, dto.amountMinor, exchangeRate),
      date: dto.date,
      paymentMethod: dto.paymentMethod,
      paymentReference: dto.paymentReference ?? null,
      // `supplierKey` no se asigna aquí: lo deriva la entidad al guardar.
      supplierName: dto.supplierName ?? null,
      isRecurring: dto.isRecurring ?? false,
      createdByUserId: adminId,
    });

    const saved = await this.transactionRepository.save(transaction);
    // Se relee para responder con la misma forma que el listado y el detalle
    // (categoría incluida), y no una versión pelada.
    return this.findOne(saved.id, adminId);
  }

  /**
   * Listado paginado, del más reciente al más viejo. Los filtros son
   * opcionales y se combinan entre sí.
   */
  async findAll(
    adminId: number,
    query: QueryCashTransactionsDto,
  ): Promise<PaginationResult<CashTransaction>> {
    const company = await this.getCompanyOrFail(adminId);

    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException(
        'El rango de fechas está invertido: "from" es posterior a "to".',
      );
    }

    const qb = this.transactionRepository
      .createQueryBuilder('t')
      // Solo id y nombre: lo que la fila necesita para mostrarse. Traer la
      // categoría entera repetiría companyId en cada movimiento sin aportar.
      .leftJoin('t.category', 'category')
      .addSelect(['category.id', 'category.name'])
      .where('t.companyId = :companyId', { companyId: company.id });

    if (query.from) qb.andWhere('t.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('t.date <= :to', { to: query.to });
    if (query.kind) qb.andWhere('t.kind = :kind', { kind: query.kind });
    if (query.categoryId != null) {
      qb.andWhere('t.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }
    if (query.supplier) {
      // Se compara por la clave normalizada, no por el texto crudo.
      qb.andWhere('t.supplierKey = :supplierKey', {
        supplierKey: normalizeSupplierName(query.supplier),
      });
    }

    // Dos criterios: la fecha es contable (varios movimientos comparten día),
    // así que el id desempata y el orden queda estable entre páginas.
    qb.orderBy('t.date', 'DESC').addOrderBy('t.id', 'DESC');

    return paginate(qb, { page: query.page, limit: query.limit });
  }

  /** Detalle del movimiento, con la categoría resuelta (id y nombre). */
  async findOne(id: number, adminId: number): Promise<CashTransaction> {
    const company = await this.getCompanyOrFail(adminId);
    const transaction = await this.transactionRepository
      .createQueryBuilder('t')
      .leftJoin('t.category', 'category')
      .addSelect(['category.id', 'category.name'])
      .where('t.id = :id', { id })
      .andWhere('t.companyId = :companyId', { companyId: company.id })
      .getOne();

    if (!transaction)
      throw new NotFoundException(`Movimiento con id ${id} no encontrado`);
    return transaction;
  }

  /**
   * El movimiento sin la relación cargada, para escribirlo. Guardar una entidad
   * que trae `category` a medias (solo id y nombre) es pedir problemas.
   */
  private async findOwnedOrFail(
    id: number,
    companyId: number,
  ): Promise<CashTransaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id, companyId },
    });
    if (!transaction)
      throw new NotFoundException(`Movimiento con id ${id} no encontrado`);
    return transaction;
  }

  async update(
    id: number,
    adminId: number,
    dto: UpdateCashTransactionDto,
  ): Promise<CashTransaction> {
    const company = await this.getCompanyOrFail(adminId);
    const transaction = await this.findOwnedOrFail(id, company.id);

    // Las reglas se revalidan contra el estado FINAL, no contra lo que llegó:
    // cambiar solo el kind también puede romper el encaje con la categoría.
    const kind = dto.kind ?? transaction.kind;
    const categoryId = dto.categoryId ?? transaction.categoryId;
    const paymentMethod = dto.paymentMethod ?? transaction.paymentMethod;
    const paymentReference =
      dto.paymentReference !== undefined
        ? dto.paymentReference
        : transaction.paymentReference;

    if (dto.amountMinor !== undefined) {
      assertPositiveAmountMinor(dto.amountMinor);
      transaction.amountMinor = dto.amountMinor;
    }

    // Monto, moneda y tasa se recalculan juntos: cambiar cualquiera de los tres
    // deja obsoleto el equivalente en Bs que guardaron los otros dos.
    const currency = dto.currency ?? transaction.currency;
    const exchangeRate =
      dto.exchangeRate !== undefined
        ? dto.exchangeRate
        : dto.currency !== undefined &&
            (dto.currency as string) !== transaction.currency
          ? // Cambió de moneda sin mandar tasa: la vieja no sirve para la nueva.
            null
          : transaction.exchangeRate;
    assertExchangeRateFits(currency, exchangeRate);
    transaction.currency = currency;
    transaction.exchangeRate = exchangeRate;
    transaction.amountBsMinor = toBsMinor(
      currency,
      transaction.amountMinor,
      exchangeRate,
    );
    if (kind !== transaction.kind || categoryId !== transaction.categoryId) {
      // En la edición se admite una categoría inactiva si ya era la suya: el
      // dueño puede corregir el concepto sin verse obligado a reclasificar.
      await this.assertCategoryFits(
        transaction.companyId,
        categoryId,
        kind,
        categoryId !== transaction.categoryId,
      );
    }
    assertPaymentReferenceFits(paymentMethod, paymentReference);

    transaction.kind = kind;
    transaction.categoryId = categoryId;
    transaction.paymentMethod = paymentMethod;
    transaction.paymentReference = paymentReference ?? null;
    if (dto.concept !== undefined) transaction.concept = dto.concept.trim();
    if (dto.date !== undefined) transaction.date = dto.date;
    if (dto.supplierName !== undefined) {
      // La clave normalizada se recalcula sola en el @BeforeUpdate.
      transaction.supplierName = dto.supplierName;
    }
    if (dto.isRecurring !== undefined)
      transaction.isRecurring = dto.isRecurring;

    await this.transactionRepository.save(transaction);
    return this.findOne(transaction.id, adminId);
  }

  async remove(id: number, adminId: number): Promise<void> {
    const company = await this.getCompanyOrFail(adminId);
    const transaction = await this.findOwnedOrFail(id, company.id);
    await this.transactionRepository.delete(transaction.id);
  }

  /**
   * La categoría existe, es de la company y admite este tipo de movimiento
   * (una categoría de gastos no clasifica un ingreso).
   */
  private async assertCategoryFits(
    companyId: number,
    categoryId: number,
    kind: CashTransactionKind,
    requireActive: boolean,
  ): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, companyId },
    });
    if (!category) {
      throw new NotFoundException(
        `Categoría con id ${categoryId} no encontrada`,
      );
    }
    if (requireActive && !category.isActive) {
      throw new BadRequestException(
        `La categoría "${category.name}" está desactivada.`,
      );
    }
    if (!categoryAllowsKind(category.kind, kind)) {
      throw new BadRequestException(
        `La categoría "${category.name}" es de tipo ${category.kind} y no admite un movimiento de tipo ${kind}.`,
      );
    }
  }
}

/**
 * La referencia es siempre opcional, pero en efectivo no existe: aceptarla ahí
 * ensuciaría el dato y confundiría al conciliar.
 */
function assertPaymentReferenceFits(
  paymentMethod: CashPaymentMethod,
  paymentReference: string | null | undefined,
): void {
  const hasReference =
    paymentReference != null && paymentReference.trim() !== '';
  if (paymentMethod === 'efectivo' && hasReference) {
    throw new BadRequestException('Un pago en efectivo no lleva referencia.');
  }
}

/**
 * En Bs no hay tasa que guardar; en cualquier otra moneda es obligatoria.
 *
 * Aceptar un movimiento en dólares sin tasa lo dejaría fuera de todos los
 * reportes, y rellenarla después con la tasa de hoy falsearía el histórico.
 */
function assertExchangeRateFits(
  currency: string,
  exchangeRate: number | null | undefined,
): void {
  if (currency === 'VES') {
    if (exchangeRate != null) {
      throw new BadRequestException(
        'Un movimiento en Bs no lleva tasa de cambio.',
      );
    }
    return;
  }
  if (exchangeRate == null || !(exchangeRate > 0)) {
    throw new BadRequestException(
      `Falta la tasa de cambio para la moneda ${currency}.`,
    );
  }
}
