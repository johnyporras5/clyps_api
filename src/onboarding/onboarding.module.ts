import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { OnboardingTemplateService } from './onboarding-template.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingState } from './entities/onboarding_state.entity';
import { OnboardingRubroTemplate } from './entities/onboarding_rubro_template.entity';
import { CompanyCategory } from '../company_category/entities/company_category.entity';

/**
 * ONB-1 + ONB-2. Los servicios leen el estado real del sistema con consultas
 * directas (no inyectan los servicios de Servicios/Equipo/Citas/Cobro) para que
 * los módulos que disparan los hooks puedan importar este módulo sin ciclos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OnboardingState,
      OnboardingRubroTemplate,
      CompanyCategory,
    ]),
  ],
  providers: [OnboardingService, OnboardingTemplateService],
  controllers: [OnboardingController],
  exports: [OnboardingService, OnboardingTemplateService],
})
export class OnboardingModule {}
