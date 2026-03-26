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
import { ServiceFeedbackService } from './service_feedback.service';
import { ServiceFeedback } from './entities/service_feedback.entity';
import { CreateServiceFeedbackDto } from './dto/create-service_feedback.dto';
import { UpdateServiceFeedbackDto } from './dto/update-service_feedback.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationResult } from '../common/utils/pagination.util';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('servicefeedbacks')
@UseGuards(JwtAuthGuard)
export class ServiceFeedbackController {
  constructor(private readonly serviceFeedbackService: ServiceFeedbackService) {}

  // =============================================
  // Crear feedback para un servicio (cliente)
  // POST /servicefeedbacks/service/:serviceId
  // =============================================
  @Post('service/:serviceId')
  @HttpCode(HttpStatus.CREATED)
  async createForService(
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Body() createDto: CreateServiceFeedbackDto,
    @Req() req: any,
  ): Promise<ServiceFeedback> {
    const clientId = req.user?.sub;
    return this.serviceFeedbackService.create(createDto, serviceId, clientId);
  }

  // =============================================
  // Listar feedbacks de un servicio específico
  // GET /servicefeedbacks/service/:serviceId?page=1&limit=10
  // =============================================
  @Get('service/:serviceId')
  @HttpCode(HttpStatus.OK)
  async findByService(
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginationResult<ServiceFeedback>> {
    return this.serviceFeedbackService.findByService(
      serviceId,
      paginationDto.page,
      paginationDto.limit,
    );
  }

  // =============================================
  // (ADMIN) Listar feedbacks de los servicios de su compañía
  // GET /servicefeedbacks?page=1&limit=10
  // =============================================
  @Get()
  @UseGuards(RolesGuard)
  @Roles('adm')
  @HttpCode(HttpStatus.OK)
  async findAllByAdminCompany(
    @Query() paginationDto: PaginationDto,
    @Req() req: any,
  ): Promise<PaginationResult<ServiceFeedback>> {
    const userId = req.user?.sub;
    return this.serviceFeedbackService.findAllByAdminCompany(
      userId,
      paginationDto.page,
      paginationDto.limit,
    );
  }

  // =============================================
  // Obtener un feedback por ID
  // GET /servicefeedbacks/:id
  // =============================================
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<ServiceFeedback> {
    return this.serviceFeedbackService.findOne(id);
  }

  // =============================================
  // Actualizar feedback (solo autor o admin)
  // PUT /servicefeedbacks/:id
  // =============================================
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateServiceFeedbackDto,
    @Req() req: any,
  ): Promise<ServiceFeedback> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    return this.serviceFeedbackService.update(id, updateDto, requesterUserId, requesterUserType);
  }

  // =============================================
  // Eliminar feedback (solo autor o admin)
  // DELETE /servicefeedbacks/:id
  // =============================================
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ): Promise<{ message: string }> {
    const requesterUserId = req.user?.sub;
    const requesterUserType = req.user?.userType;
    await this.serviceFeedbackService.remove(id, requesterUserId, requesterUserType);
    return { message: 'Feedback eliminado correctamente' };
  }
}
