import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ProductCategoryService } from './product_category.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('product-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class ProductCategoryController {
  constructor(
    private readonly productCategoryService: ProductCategoryService,
  ) {}

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('isActive') isActive?: string,
  ) {
    // Sin el parámetro → todas (activas e inactivas). Con él, filtra.
    const active =
      isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.productCategoryService.findAllByCompany(req.user.sub, active);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productCategoryService.findOne(id, req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateProductCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productCategoryService.create(dto, req.user.sub);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductCategoryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productCategoryService.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.productCategoryService.remove(id, req.user.sub);
  }
}
