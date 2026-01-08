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
  Req 
} from '@nestjs/common';
import { WorkerService } from './worker.service';
import { Worker } from './entities/worker.entity';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { UpdateWorkerDto } from './dto/update-worker.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('workers')
export class WorkerController {
  constructor(private readonly workerService: WorkerService) {}

  // Obtener todos los workers (solo admin)
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('adm')
  async findAll(): Promise<Worker[]> {
    return this.workerService.findAll();
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