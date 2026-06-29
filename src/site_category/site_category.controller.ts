import { Controller, Get } from '@nestjs/common';
import { SiteCategoryService } from './site_category.service';
import { SiteCategory } from './entities/site_category.entity';

/**
 * Catálogo global de tipos de negocio del sitio. Endpoint PÚBLICO (sin token):
 * el registro de cliente lo consume antes del login para poblar el multi-select
 * de categorías de interés. Reemplaza el listado hardcodeado del front.
 */
@Controller('site-categories')
export class SiteCategoryController {
  constructor(private readonly siteCategoryService: SiteCategoryService) {}

  @Get()
  findAll(): Promise<SiteCategory[]> {
    return this.siteCategoryService.findAll();
  }
}
