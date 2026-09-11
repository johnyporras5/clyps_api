import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EntitlementsService } from './entitlements.service';
import { Company } from '../company/entities/company.entity';
import type { AccessResponse } from './dto/access-response.dto';

/**
 * Lo que devuelve la consulta. `hasCompany: false` NO es un error: un usuario
 * puede no tener salón porque es cliente, trabajador, o un dueño a medio
 * registrar. Por eso responde 200 con la bandera en vez de 404 — el panel
 * necesita distinguir "no tiene salón" de "algo falló".
 */
export interface AdminUserSubscriptionResponse {
  userId: number;
  hasCompany: boolean;
  companyId: number | null;
  companyName: string | null;
  /** null cuando el usuario no tiene salón. */
  access: AccessResponse | null;
}

/**
 * Consulta de suscripción para el administrador de la PLATAFORMA (`padm`).
 *
 * Existe porque `/subscription/access` es `@Roles('adm')` y resuelve el salón
 * a partir del TOKEN de quien pregunta: sirve para que un dueño vea lo suyo,
 * no para que el operador de Clyps vea lo de otro. Esto hace lo mismo pero
 * partiendo de un `userId`.
 *
 * `@Roles('padm')` va en el método a propósito: el RolesGuard lee la metadata
 * solo del handler, así que a nivel de clase se ignoraría en silencio y dejaría
 * pasar a cualquier usuario autenticado — incluido un dueño de salón, que
 * podría leer la suscripción de la competencia.
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminSubscriptionController {
  constructor(
    private readonly entitlements: EntitlementsService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  /**
   * Plan, estado y fechas del salón que pertenece a este usuario.
   *
   * El salón se busca por `company.user_id`. No se reutiliza
   * `resolveCompanyIdForAdmin()` porque esa lanza "No tienes una compañía
   * asignada": un mensaje correcto para el dueño y equivocado aquí, donde
   * quien pregunta es el operador por cuenta de un tercero.
   */
  @Roles('padm')
  @Get(':id/subscription')
  async forUser(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<AdminUserSubscriptionResponse> {
    const company = await this.companies.findOne({
      where: { userId: id },
      select: { id: true, name: true },
    });

    if (!company) {
      return {
        userId: id,
        hasCompany: false,
        companyId: null,
        companyName: null,
        access: null,
      };
    }

    return {
      userId: id,
      hasCompany: true,
      companyId: company.id,
      companyName: company.name ?? null,
      // Recalcula el estado con la hora de ahora: no se fía de la columna
      // `status`, que es una caché que escribe el cron.
      access: await this.entitlements.getAccessResponse(company.id),
    };
  }
}
