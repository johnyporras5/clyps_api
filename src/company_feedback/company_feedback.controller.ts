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
} from '@nestjs/common';
import { CompanyFeedbackService } from './company_feedback.service';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('companyfeedbacks')
export class CompanyFeedbackController {
  constructor(private readonly companyFeedbackService: CompanyFeedbackService) {}

  @Get()
  async findAll(): Promise<CompanyFeedback[]> {
    return this.companyFeedbackService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<CompanyFeedback> {
    return this.companyFeedbackService.findOne(id);
  }

  /**
   * Crear feedback para una company (autenticado)
   * POST /companyfeedbacks/company/:companyId
   * Body: { stars, description }
   */
  @Post('company/:companyId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createForCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() createDto: CreateCompanyFeedbackDto,
    @Req() req: any,
  ): Promise<CompanyFeedback> {
    const clientId = req.user?.sub;
    return this.companyFeedbackService.create(createDto, companyId, clientId);
  }

  @Get('company/:companyId')
  @HttpCode(HttpStatus.OK)
  async findByCompany(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: CompanyFeedback[]; meta: any }> {
    const p = page ? parseInt(page, 10) || 1 : 1;
    const l = limit ? parseInt(limit, 10) || 10 : 10;
    return this.companyFeedbackService.findByCompany(companyId, p, l);
  }

  // NUEVO: listar reseñas que el cliente autenticado escribió hacia companies
  @Get('my-feedbacks')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async myCompanyFeedbacks(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{ data: CompanyFeedback[]; meta: any }> {
    const clientId = req.user?.sub;
    const p = page ? parseInt(page, 10) || 1 : 1;
    const l = limit ? parseInt(limit, 10) || 10 : 10;
    return this.companyFeedbackService.findByClient(clientId, p, l);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateCompanyFeedbackDto,
    @Req() req: any,
  ): Promise<CompanyFeedback> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    return this.companyFeedbackService.update(id, updateDto, requesterUserId, requesterUserType);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any): Promise<{ message: string }> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    await this.companyFeedbackService.remove(id, requesterUserId, requesterUserType);
    return { message: 'Feedback eliminado correctamente' };
  }
}
