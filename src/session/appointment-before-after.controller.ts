import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AppointmentBeforeAfterService } from './appointment-before-after.service';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';

/**
 * Recurso "Antes y después" de una sesión (cita).
 *
 * Autorización:
 *  - Lectura (GET): cliente dueño, worker asignado y admin de la compañía.
 *  - Escritura (PUT/DELETE): solo worker asignado o admin de la compañía
 *    (validado a nivel de servicio vía `validateSessionAccess(..., true)`).
 */
@Controller('sessions/:sessionId/before-after')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentBeforeAfterController {
  constructor(private readonly service: AppointmentBeforeAfterService) {}

  @Get()
  @Roles('adm', 'wrk', 'cli')
  async getBeforeAfter(
    @Request() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    return this.service.getBeforeAfter(+sessionId, userId, userRole);
  }

  @Put(':slot')
  @Roles('adm', 'wrk')
  @UseInterceptors(FileInterceptor('photo'))
  async upsertSlot(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Param('slot') slot: string,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    return this.service.upsertSlot(+sessionId, slot, file, userId, userRole);
  }

  @Delete(':slot')
  @Roles('adm', 'wrk')
  async deleteSlot(
    @Request() req: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
    @Param('slot') slot: string,
  ) {
    const userId = req.user.sub;
    const userRole = req.user?.userType;
    return this.service.deleteSlot(+sessionId, slot, userId, userRole);
  }
}
