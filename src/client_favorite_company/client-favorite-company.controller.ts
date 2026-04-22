import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ClientFavoriteCompanyService } from './client-favorite-company.service';
import { ClientFavoriteCompany } from './entities/client-favorite-company.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationResult } from '../common/utils/pagination.util';

@Controller('favorites/companies')
@UseGuards(JwtAuthGuard)
export class ClientFavoriteCompanyController {
  constructor(
    private readonly favoriteService: ClientFavoriteCompanyService,
  ) {}

  // ------------------------------------------------------------
  // 1. Añadir compañía a favoritos del cliente autenticado
  // POST /favorites/companies/:companyId
  // ------------------------------------------------------------
  @Post(':companyId')
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Req() req: any,
  ): Promise<ClientFavoriteCompany> {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return this.favoriteService.addFavorite(userId, companyId);
  }

  // ------------------------------------------------------------
  // 2. Listar favoritos del cliente autenticado (paginado)
  // GET /favorites/companies?page=1&limit=10
  // ------------------------------------------------------------
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @Query() paginationDto: PaginationDto,
    @Req() req: any,
  ): Promise<PaginationResult<ClientFavoriteCompany>> {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return this.favoriteService.listFavorites(
      userId,
      paginationDto.page,
      paginationDto.limit,
    );
  }

  // ------------------------------------------------------------
  // 3. Consultar si una compañía es favorita del cliente autenticado
  // GET /favorites/companies/:companyId/status
  // ------------------------------------------------------------
  @Get(':companyId/status')
  @HttpCode(HttpStatus.OK)
  async status(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Req() req: any,
  ): Promise<{ isFavorite: boolean }> {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    return this.favoriteService.isFavorite(userId, companyId);
  }

  // ------------------------------------------------------------
  // 4. Quitar compañía de favoritos del cliente autenticado
  // DELETE /favorites/companies/:companyId
  // ------------------------------------------------------------
  @Delete(':companyId')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const userId = req.user?.sub;
    if (!userId) throw new UnauthorizedException('User not authenticated');
    await this.favoriteService.removeFavorite(userId, companyId);
    return { message: 'Compañía eliminada de favoritos' };
  }
}
