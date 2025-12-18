import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { SessionDetailService } from './session_detail.service';
import { SessionDetail } from './entities/session_detail.entity';
import { CreateSessionDetailDto } from './dto/create-session_detail.dto';
import { UpdateSessionDetailDto } from './dto/update-session_detail.dto';

@Controller('sessiondetails')
export class SessionDetailController {
  constructor(private readonly SessionDetailService: SessionDetailService) {}

  @Get()
  async findAll(): Promise<SessionDetail[]> {
    return this.SessionDetailService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<SessionDetail> {
    return this.SessionDetailService.findOne(id);
  }

  @Post()
  async create(@Body() createSessionDetailDto: CreateSessionDetailDto): Promise<SessionDetail> {
    return this.SessionDetailService.create(createSessionDetailDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSessionDetailDto: UpdateSessionDetailDto,
  ): Promise<SessionDetail> {
    return this.SessionDetailService.update(id, updateSessionDetailDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.SessionDetailService.remove(id);
  }
}
