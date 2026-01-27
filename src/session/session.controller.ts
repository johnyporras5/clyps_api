import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto } from './dto/create-session-with-detail.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  @Roles('adm')
  create(@Request() req, @Body() createSessionDto: CreateSessionDto) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.create(createSessionDto, adminId);
  }


  @Post('create-with-detail')
  @Roles('adm')
  async createSessionWithDetail(
    @Request() req,
    @Body() createSessionWithDetailDto: CreateSessionWithDetailDto
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.createSessionWithDetail(
      createSessionWithDetailDto,
      adminId
    );
  }

  @Get()
  findAll() {
    return this.sessionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateSessionDto: UpdateSessionDto) {
    return this.sessionService.update(+id, updateSessionDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionService.remove(+id);
  }
}