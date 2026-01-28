import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { SessionService } from './session.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { CreateSessionWithDetailDto } from './dto/create-session-with-detail.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetSessionsDto } from './dto/get-sessions.dto';
import { UpdateSessionDto } from './dto/update-session-and-detail.dto';
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) { }

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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.sessionService.findOneWithDetails(+id);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query() getSessionsDto: GetSessionsDto
  ) {
    const adminId = req.user.sub;
    return this.sessionService.findAllSessionsSimple(adminId, getSessionsDto);
  }

  @Patch(':id')
  @Roles('adm')
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateSessionDto: UpdateSessionDto
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.sessionService.updateSessionWithDetail(+id, updateSessionDto, adminId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionService.removeSessionWithDetails(+id);
  }


}