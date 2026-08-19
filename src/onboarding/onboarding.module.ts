import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingState } from './entities/onboarding_state.entity';

/**
 * ONB-1. El servicio lee el estado real del sistema con consultas directas
 * (no inyecta los servicios de Servicios/Equipo/Citas/Cobro) para que los
 * módulos que disparan los hooks puedan importar este módulo sin ciclos.
 */
@Module({
  imports: [TypeOrmModule.forFeature([OnboardingState])],
  providers: [OnboardingService],
  controllers: [OnboardingController],
  exports: [OnboardingService],
})
export class OnboardingModule {}
