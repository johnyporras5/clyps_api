import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { PortfolioPicturesService } from './portfolio_pictures.service';
import { PortfolioPictures } from './entities/portfolio_pictures.entity';
import { CreatePortfolioPicturesDto } from './dto/create-portfolio_pictures.dto';
import { UpdatePortfolioPicturesDto } from './dto/update-portfolio_pictures.dto';

@Controller('portfoliopicturess')
export class PortfolioPicturesController {
  constructor(private readonly PortfolioPicturesService: PortfolioPicturesService) {}

  @Get()
  async findAll(): Promise<PortfolioPictures[]> {
    return this.PortfolioPicturesService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<PortfolioPictures> {
    return this.PortfolioPicturesService.findOne(id);
  }

  @Post()
  async create(@Body() createPortfolioPicturesDto: CreatePortfolioPicturesDto): Promise<PortfolioPictures> {
    return this.PortfolioPicturesService.create(createPortfolioPicturesDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePortfolioPicturesDto: UpdatePortfolioPicturesDto,
  ): Promise<PortfolioPictures> {
    return this.PortfolioPicturesService.update(id, updatePortfolioPicturesDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.PortfolioPicturesService.remove(id);
  }
}
