import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientService } from './client.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  /**
   * Endpoint principal para listar clientes según las reglas de visibilidad
   * 
   * Reglas:
   * 1. Clientes PÚBLICOS: Visibles para TODOS los administradores logueados
   * 2. Clientes PRIVADOS: Solo visibles para administradores cuyas compañías 
   *    están en el array 'companies' del cliente
   * 3. Admin sin compañías: Solo puede ver clientes públicos
   */
  @Get('admin/companies')
  async findAllByAdminCompanies(
    @Request() req,
    @Query() paginationDto: PaginationDto,
  ) {
    // Extraer adminId del token JWT (soporta tanto 'id' como 'sub')
    const adminId = req.user?.id || req.user?.sub;
    
    if (!adminId) {
      throw new UnauthorizedException('Usuario no autenticado correctamente');
    }
    
    return await this.clientService.findAllByAdminCompanies(adminId, paginationDto);
  }
}