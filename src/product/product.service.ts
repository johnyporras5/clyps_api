import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductStockMovement } from './entities/product_stock_movement.entity';
import { ProductCategory } from '../product_category/entities/product_category.entity';
import { Company } from '../company/entities/company.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductStockMovement)
    private readonly movementRepository: Repository<ProductStockMovement>,
    @InjectRepository(ProductCategory)
    private readonly categoryRepository: Repository<ProductCategory>,
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

  private async getCategoryOrFail(
    categoryId: number,
    companyId: number,
  ): Promise<ProductCategory> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, companyId },
    });
    if (!category)
      throw new BadRequestException(
        `Categoría con id ${categoryId} no encontrada o no pertenece a tu compañía`,
      );
    return category;
  }

  async findAllByCompany(
    adminId: number,
    categoryId?: number,
    isActive?: boolean,
  ): Promise<Product[]> {
    const company = await this.getCompanyOrFail(adminId);
    return this.productRepository.find({
      where: {
        companyId: company.id,
        ...(categoryId ? { categoryId } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      relations: ['category'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number, adminId: number): Promise<Product> {
    const company = await this.getCompanyOrFail(adminId);
    const product = await this.productRepository.findOne({
      where: { id, companyId: company.id },
      relations: ['category'],
    });
    if (!product)
      throw new NotFoundException(`Producto con id ${id} no encontrado`);
    return product;
  }

  async create(dto: CreateProductDto, adminId: number): Promise<Product> {
    const company = await this.getCompanyOrFail(adminId);
    const category = await this.getCategoryOrFail(dto.categoryId, company.id);

    const appliesCommission = dto.appliesCommission ?? false;
    // Herencia: si aplica comisión y no mandan %, hereda el default de la
    // categoría (editable). Si no aplica comisión, no se guarda %.
    const commissionBps = appliesCommission
      ? (dto.commissionBps ?? category.defaultCommissionBps ?? null)
      : null;

    const product = this.productRepository.create({
      companyId: company.id,
      categoryId: category.id,
      name: dto.name,
      currency: dto.currency ?? 'VES',
      salePriceMinor: dto.salePriceMinor,
      stock: dto.stock ?? 0,
      appliesCommission,
      commissionBps,
      isActive: dto.isActive ?? true,
    });
    return this.productRepository.save(product);
  }

  async update(
    id: number,
    dto: UpdateProductDto,
    adminId: number,
  ): Promise<Product> {
    const product = await this.findOne(id, adminId);

    // Si cambia de categoría, validar que la nueva sea de la misma company.
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      await this.getCategoryOrFail(dto.categoryId, product.companyId);
    }

    Object.assign(product, dto);
    // Si deja de dar comisión, se limpia el %.
    if (product.appliesCommission === false) product.commissionBps = null;
    return this.productRepository.save(product);
  }

  async remove(id: number, adminId: number): Promise<void> {
    const product = await this.findOne(id, adminId);
    await this.productRepository.delete(product.id);
  }

  /**
   * Ajuste manual de stock (entrada de mercancía / corrección). Registra el
   * movimiento con quién y cuándo. No lo limita la config de venta en negativo:
   * esa solo aplica al vender (CLYP-321).
   */
  async adjustStock(
    id: number,
    dto: AdjustStockDto,
    adminId: number,
  ): Promise<Product> {
    if (dto.delta === 0)
      throw new BadRequestException('El ajuste de stock no puede ser 0');
    const product = await this.findOne(id, adminId);
    product.stock += dto.delta;
    const saved = await this.productRepository.save(product);
    await this.movementRepository.save(
      this.movementRepository.create({
        productId: saved.id,
        delta: dto.delta,
        resultingStock: saved.stock,
        reason: dto.reason ?? null,
        createdByUserId: adminId,
      }),
    );
    return saved;
  }
}
