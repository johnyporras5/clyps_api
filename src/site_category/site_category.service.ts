import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteCategory } from './entities/site_category.entity';

@Injectable()
export class SiteCategoryService {
  constructor(
    @InjectRepository(SiteCategory)
    private readonly siteCategoryRepository: Repository<SiteCategory>,
  ) {}

  /** Listado completo del catálogo de categorías del sitio. */
  findAll(): Promise<SiteCategory[]> {
    return this.siteCategoryRepository.find({ order: { name: 'ASC' } });
  }
}
