import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { OnboardingTemplateService } from './onboarding-template.service';
import { OnboardingServicesService } from './onboarding-services.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingState } from './entities/onboarding_state.entity';
import { OnboardingRubroTemplate } from './entities/onboarding_rubro_template.entity';
import { CompanyCategory } from '../company_category/entities/company_category.entity';
import { ServiceCategory } from '../service_category/entities/service_category.entity';
import { Service } from '../service/entities/service.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';

/**
 * ONB-1 + ONB-2 + ONB-3. Los servicios leen y escriben con repositorios propios
 * (no inyectan ServiceService/CompanyWorkerService) para que los módulos que
 * disparan los hooks de ONB-1 puedan importar este módulo sin ciclos.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      OnboardingState,
      OnboardingRubroTemplate,
      CompanyCategory,
      ServiceCategory,
      Service,
      CompanyWorker,
    ]),
  ],
  providers: [
    OnboardingService,
    OnboardingTemplateService,
    OnboardingServicesService,
  ],
  controllers: [OnboardingController],
  exports: [
    OnboardingService,
    OnboardingTemplateService,
    OnboardingServicesService,
  ],
})
export class OnboardingModule {}
