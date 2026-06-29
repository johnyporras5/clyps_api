import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SiteCategoryService } from './site_category.service';
import { SiteCategoryController } from './site_category.controller';
import { SiteCategory } from './entities/site_category.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SiteCategory])],
  providers: [SiteCategoryService],
  controllers: [SiteCategoryController],
  exports: [SiteCategoryService],
})
export class SiteCategoryModule {}
