import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../company/entities/company.entity';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminCompaniesController } from './admin-companies.controller';
import { CompanyDeactivationService } from './company-deactivation.service';

/**
 * El botón del panel (escritura). La lectura —"¿está desactivado?"— vive en
 * `DeactivatedCompaniesModule`, que es global y no importa nada del dominio;
 * este sí importa AuthModule (para cerrar los accesos de soporte) y por eso no
 * puede ser el mismo módulo sin formar un ciclo con JwtStrategy.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Company]), AuthModule, RealtimeModule],
  controllers: [AdminCompaniesController],
  providers: [CompanyDeactivationService],
})
export class CompanyDeactivationModule {}
