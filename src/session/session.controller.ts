import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { SessionService } from './session.service';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@Controller('sessions')
export class SessionController {
  constructor(private readonly SessionService: SessionService) {}

  @Get()
  async findAll(): Promise<Session[]> {
    return this.SessionService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Session> {
    return this.SessionService.findOne(id);
  }

  @Post()
  async create(@Body() createSessionDto: CreateSessionDto): Promise<Session> {
    return this.SessionService.create(createSessionDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSessionDto: UpdateSessionDto,
  ): Promise<Session> {
    return this.SessionService.update(id, updateSessionDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.SessionService.remove(id);
  }
}
