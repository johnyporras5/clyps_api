import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { User } from '../user/entities/user.entity';
import { DeactivatedCompaniesService } from './deactivated-companies.service';

/**
 * `@Global` porque lo necesitan módulos que no se conocen entre sí (auth,
 * correo, notificaciones, sesiones, reserva pública, salones). Sin esto habría
 * que importarlo en cada uno, y olvidarlo en uno solo deja a ese camino
 * mandando correos a un salón desactivado.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Company, CompanyWorker, User])],
  providers: [DeactivatedCompaniesService],
  exports: [DeactivatedCompaniesService],
})
export class DeactivatedCompaniesModule {}
