import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Put, 
  Delete, 
  ParseIntPipe, 
  UseGuards,
  UnauthorizedException,
  Req,
  Query
} from '@nestjs/common';
import { WorkerService } from './worker.service';
import { Worker } from './entities/worker.entity';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FindAllWorkersDto } from './dto/find-all-workers.dto';
import { PaginationResult } from '../common/utils/pagination.util';



@Controller('workers')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  // Obtener todos los workers (solo admin) con filtros y paginación
@Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm') // Ahora también permite a administradores de compañía
  async findAll(
    @Query() query: FindAllWorkersDto,
    @Req() req: any
  ): Promise<PaginationResult<Worker>> {
    const userType = req.user.userType;
    const userId = req.user.sub;
    
    // Si es administrador de compañía, solo puede ver los workers de su compañía
    if (userType === 'com') {
      return this.workerService.findAllWithCompanyFilter(query, userId);
    }
    
    // Si es admin, puede ver todos con los filtros que quiera
    return this.workerService.findAll(query);
  }

  // Obtener un worker por ID (cualquier usuario autenticado)
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any
  ): Promise<Worker> {
    // El usuario solo puede ver su propio perfil, a menos que sea admin
    const userId = req.user.sub;
    const userType = req.user.userType;
    
    return this.workerService.findOne(id, userId, userType);
  }

  // Actualizar worker (solo el dueño del perfil)
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateWorkerDto: UpdateWorkerDto,
    @Req() req: any
  ): Promise<Worker> {
    const userId = req.user.sub;
    return this.workerService.update(id, updateWorkerDto, userId);
  }

  // Eliminar worker (solo admin)
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.workerService.remove(id);
  }

  // Obtener el perfil del worker autenticado
  @Get('profile/my-profile')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@Req() req: any): Promise<Worker> {
    const userId = req.user.sub;
    const userType = req.user.userType;
    
    // Asegurarse que el usuario es de tipo 'wrk' (trabajador)
    if (userType !== 'wrk') {
      throw new UnauthorizedException('Solo los trabajadores pueden acceder a este perfil');
    }
    
    return this.workerService.findByUserId(userId);
  }

  // Actualizar el perfil del worker autenticado
  @Put('profile/update')
  @UseGuards(JwtAuthGuard)
  async updateMyProfile(
    @Body() updateWorkerDto: UpdateWorkerDto,
    @Req() req: any
  ): Promise<Worker> {
    const userId = req.user.sub;
    const userType = req.user.userType;
    
    // Asegurarse que el usuario es de tipo 'wrk'
    if (userType !== 'wrk') {
      throw new UnauthorizedException('Solo los trabajadores pueden actualizar este perfil');
    }
    
    return this.workerService.updateByUserId(userId, updateWorkerDto);
  }
}