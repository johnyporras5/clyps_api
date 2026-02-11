import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  Req,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  UnauthorizedException
} from '@nestjs/common';
import { CompanyFeedbackService } from './company_feedback.service';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationResult } from '../common/utils/pagination.util';

@Controller('companyfeedbacks')
@UseGuards(JwtAuthGuard)
export class CompanyFeedbackController {
  constructor(private readonly companyFeedbackService: CompanyFeedbackService) { }

  // ------------------------------------------------------------
  // 1. Crear feedback para una compañía (cliente autenticado)
  // POST /companyfeedbacks/company/:companyId
  // ------------------------------------------------------------

  @Post('company/:companyId')
  @HttpCode(HttpStatus.CREATED)
  async createForCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createDto: CreateCompanyFeedbackDto,
    @Req() req: any,
  ): Promise<CompanyFeedback> {
    const clientId = req.user?.sub;
    return this.companyFeedbackService.create(createDto, companyId, clientId);
  }
  // ------------------------------------------------------------
  // 2. (ADMIN) Listar feedbacks de la compañía del admin autenticado
  // GET /companyfeedbacks/company?page=1&limit=10
  // ------------------------------------------------------------
  @Get('company')
  @HttpCode(HttpStatus.OK)
  async findByCompany(
    @Query() paginationDto: PaginationDto,
    @Req() req: any,
  ): Promise<PaginationResult<CompanyFeedback>> {
    const userId = req.user?.sub;  // ID del usuario autenticado (JWT)
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return this.companyFeedbackService.findByCompany(
      userId,
      paginationDto.page,
      paginationDto.limit,
    );
  }

  // ------------------------------------------------------------
  // 3. Obtener un feedback por ID
  // GET /companyfeedbacks/:id
  // ------------------------------------------------------------
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CompanyFeedback> {
    return this.companyFeedbackService.findOne(id);
  }

  // ------------------------------------------------------------
  // 4. Actualizar feedback (solo autor o admin)
  // PUT /companyfeedbacks/:id
  // ------------------------------------------------------------
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateCompanyFeedbackDto,
    @Req() req: any,
  ): Promise<CompanyFeedback> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    return this.companyFeedbackService.update(id, updateDto, requesterUserId, requesterUserType);
  }
  // ------------------------------------------------------------
  // 5. Eliminar feedback (solo autor o admin)
  // DELETE /companyfeedbacks/:id
  // ------------------------------------------------------------
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any): Promise<{ message: string }> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    await this.companyFeedbackService.remove(id, requesterUserId, requesterUserType);
    return { message: 'Feedback eliminado correctamente' };
  }

}
