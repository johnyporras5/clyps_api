import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';
import { CashCategory } from './entities/cash-category.entity';
import { CashTransaction } from '../cash_transaction/entities/cash-transaction.entity';
import { Company } from '../company/entities/company.entity';
import { CreateCashCategoryDto } from './dto/create-cash-category.dto';
import { UpdateCashCategoryDto } from './dto/update-cash-category.dto';
import { DEFAULT_CASH_CATEGORIES } from './cash-category.seed';
import {
  categoryAllowsKind,
  type CashCategoryKind,
} from './cash-category.enums';
import type { CashTransactionKind } from '../cash_transaction/cash-transaction.enums';

@Injectable()
export class CashCategoryService {
  private readonly logger = new Logger(CashCategoryService.name);

  constructor(
    @InjectRepository(CashCategory)
    private readonly categoryRepository: Repository<CashCategory>,
    @InjectRepository(CashTransaction)
    private readonly transactionRepository: Repository<CashTransaction>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly dataSource: DataSource,
  ) {}

  private async getCompanyOrFail(adminId: number): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { userId: adminId },
    });
    if (!company)
      throw new UnauthorizedException('No tienes una compañía asignada');
    return company;
  }

  /**
   * Siembra las categorías por defecto la primera vez que la company abre caja
   * ("al activar el módulo"). Solo actúa si no tiene NINGUNA: no repone las que
   * el dueño borró, ni pisa las que renombró.
   *
   * La unique (company_id, name) es la red por si dos peticiones simultáneas
   * intentan sembrar a la vez: la segunda choca y se ignora.
   */
  async ensureSeeded(companyId: number): Promise<void> {
    const existing = await this.categoryRepository.count({
      where: { companyId },
    });
    if (existing > 0) return;

    const rows = DEFAULT_CASH_CATEGORIES.map((c) =>
      this.categoryRepository.create({
        companyId,
        name: c.name,
        kind: c.kind,
        isActive: true,
      }),
    );
    try {
      await this.categoryRepository.save(rows);
    } catch (error) {
      // Carrera con otra petición que sembró primero: el estado final es el
      // correcto, así que no se propaga.
      this.logger.warn(
        `Seed de categorías de caja omitido para company ${companyId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Categorías de la company. `usableFor` filtra las que sirven para un tipo de
   * movimiento — incluye siempre las 'both', que valen para ambos.
   */
  async findAllByCompany(
    adminId: number,
    filters: { isActive?: boolean; usableFor?: CashTransactionKind } = {},
  ): Promise<CashCategory[]> {
    const company = await this.getCompanyOrFail(adminId);
    await this.ensureSeeded(company.id);

    const kinds: CashCategoryKind[] = filters.usableFor
      ? [filters.usableFor, 'both']
      : ['income', 'expense', 'both'];

    return this.categoryRepository.find({
      where: {
        companyId: company.id,
        kind: In(kinds),
        ...(filters.isActive !== undefined
          ? { isActive: filters.isActive }
          : {}),
      },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number, adminId: number): Promise<CashCategory> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.categoryRepository.findOne({
      where: { id, companyId: company.id },
    });
    if (!category)
      throw new NotFoundException(`Categoría con id ${id} no encontrada`);
    return category;
  }

  async create(
    dto: CreateCashCategoryDto,
    adminId: number,
  ): Promise<CashCategory> {
    const company = await this.getCompanyOrFail(adminId);
    await this.assertNameIsFree(company.id, dto.name);

    const category = this.categoryRepository.create({
      companyId: company.id,
      name: dto.name.trim(),
      kind: dto.kind,
      isActive: dto.isActive ?? true,
    });
    return this.categoryRepository.save(category);
  }

  async update(
    id: number,
    dto: UpdateCashCategoryDto,
    adminId: number,
  ): Promise<CashCategory> {
    const category = await this.findOne(id, adminId);

    if (dto.name !== undefined && dto.name.trim() !== category.name) {
      await this.assertNameIsFree(category.companyId, dto.name, category.id);
      category.name = dto.name.trim();
    }

    // Estrechar el kind (p. ej. 'both' -> 'expense') dejaría movimientos ya
    // clasificados bajo una categoría que no los admite. Se bloquea.
    if (dto.kind !== undefined && dto.kind !== category.kind) {
      const orphaned = await this.countTransactionsNotAllowedBy(
        category.id,
        dto.kind,
      );
      if (orphaned > 0) {
        throw new ConflictException(
          `No se puede cambiar el tipo de "${category.name}": tiene ${orphaned} movimiento(s) que ya no encajarían. Reasígnalos primero.`,
        );
      }
      category.kind = dto.kind;
    }

    if (dto.isActive !== undefined) category.isActive = dto.isActive;

    return this.categoryRepository.save(category);
  }

  /**
   * Borra la categoría. Si tiene movimientos hay que decir a dónde se mueven
   * (`reassignTo`); sin eso la operación se rechaza y el histórico queda
   * intacto — es la regla del ticket.
   */
  async remove(
    id: number,
    adminId: number,
    reassignToId?: number,
  ): Promise<void> {
    const category = await this.findOne(id, adminId);
    const used = await this.transactionRepository.count({
      where: { companyId: category.companyId, categoryId: category.id },
    });

    if (used === 0) {
      await this.categoryRepository.delete(category.id);
      return;
    }

    if (reassignToId == null) {
      throw new ConflictException(
        `No se puede eliminar la categoría "${category.name}" porque tiene ${used} movimiento(s). Reasígnalos a otra categoría (reassignTo) o desactívala.`,
      );
    }

    const target = await this.resolveReassignTarget(category, reassignToId);

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        CashTransaction,
        { companyId: category.companyId, categoryId: category.id },
        { categoryId: target.id },
      );
      await manager.delete(CashCategory, { id: category.id });
    });

    this.logger.log(
      `Categoría de caja ${category.id} eliminada; ${used} movimiento(s) reasignados a ${target.id}`,
    );
  }

  /** La categoría destino existe, es de la misma company y admite lo que recibe. */
  private async resolveReassignTarget(
    category: CashCategory,
    reassignToId: number,
  ): Promise<CashCategory> {
    if (reassignToId === category.id) {
      throw new ConflictException(
        'La categoría destino no puede ser la que se está eliminando.',
      );
    }

    const target = await this.categoryRepository.findOne({
      where: { id: reassignToId, companyId: category.companyId },
    });
    if (!target) {
      throw new NotFoundException(
        `Categoría destino con id ${reassignToId} no encontrada`,
      );
    }

    const notAllowed = await this.countTransactionsNotAllowedBy(
      category.id,
      target.kind,
    );
    if (notAllowed > 0) {
      throw new ConflictException(
        `"${target.name}" no admite ${notAllowed} de los movimientos a reasignar (es de tipo ${target.kind}).`,
      );
    }
    return target;
  }

  /** Movimientos de la categoría que un `kind` dado NO podría clasificar. */
  private async countTransactionsNotAllowedBy(
    categoryId: number,
    kind: CashCategoryKind,
  ): Promise<number> {
    const rejected: CashTransactionKind[] = (
      ['income', 'expense'] as CashTransactionKind[]
    ).filter((txKind) => !categoryAllowsKind(kind, txKind));
    if (rejected.length === 0) return 0;

    return this.transactionRepository.count({
      where: { categoryId, kind: In(rejected) },
    });
  }

  private async assertNameIsFree(
    companyId: number,
    name: string,
    exceptId?: number,
  ): Promise<void> {
    const clash = await this.categoryRepository.findOne({
      where: {
        companyId,
        name: name.trim(),
        ...(exceptId != null ? { id: Not(exceptId) } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(`Ya tienes una categoría llamada "${name}".`);
    }
  }
}
