import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RemindersService } from './reminders.service';

/**
 * Disparo manual del barrido de recordatorios (SUB-8 / CLYP-339).
 *
 * Es del administrador de PLATAFORMA (`padm`), no del dueño del salón: el
 * barrido cruza todos los tenants.
 *
 * Sirve para dos cosas: probar el escalado sin esperar a las 9 am, y recuperar
 * un día en que el cron no corrió. Es seguro llamarlo cuantas veces haga falta
 * — la bitácora impide que alguien reciba dos veces el mismo aviso.
 */
@Controller('admin/reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminRemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Roles('padm')
  @Post('sweep')
  @HttpCode(HttpStatus.OK)
  async sweep(): Promise<{ sent: number }> {
    return { sent: await this.reminders.sweep() };
  }
}
