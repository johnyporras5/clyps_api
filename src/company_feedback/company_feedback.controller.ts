import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, ParseUUIDPipe } from '@nestjs/common';
import { CompanyFeedbackService } from './company_feedback.service';
import { CompanyFeedback } from './entities/company_feedback.entity';
import { CreateCompanyFeedbackDto } from './dto/create-company_feedback.dto';
import { UpdateCompanyFeedbackDto } from './dto/update-company_feedback.dto';

@Controller('companyfeedbacks')
export class CompanyFeedbackController {
  constructor(private readonly CompanyFeedbackService: CompanyFeedbackService) {}

  @Get()
  async findAll(): Promise<CompanyFeedback[]> {
    return this.CompanyFeedbackService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<CompanyFeedback> {
    return this.CompanyFeedbackService.findOne(id);
  }

  @Post()
  async create(@Body() createCompanyFeedbackDto: CreateCompanyFeedbackDto): Promise<CompanyFeedback> {
    return this.CompanyFeedbackService.create(createCompanyFeedbackDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCompanyFeedbackDto: UpdateCompanyFeedbackDto,
  ): Promise<CompanyFeedback> {
    return this.CompanyFeedbackService.update(id, updateCompanyFeedbackDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.CompanyFeedbackService.remove(id);
  }
}
