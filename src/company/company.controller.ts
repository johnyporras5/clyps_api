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
  Req,
  Query
} from '@nestjs/common';
import { CompanyService } from './company.service';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyWithLogoUrl } from './types/company-with-logo-url.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginationResult } from '../common/utils/pagination.util';

@Controller('companys')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  async findAll(
    @Query() paginationDto: PaginationDto
  ): Promise<PaginationResult<CompanyWithLogoUrl>> {
    return this.companyService.findAll({
      page: paginationDto.page,
      limit: paginationDto.limit
    });
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number
  ): Promise<CompanyWithLogoUrl> {
    return this.companyService.findOne(id);
  }

  @Get('admin/profile')
  @UseGuards(JwtAuthGuard)
  async getAdminProfile(
    @Req() req
  ): Promise<CompanyWithLogoUrl> {
    const userId = req.user.sub;
    return this.companyService.findByUserId(userId);
  }

  @Post()
  async create(
    @Body() createCompanyDto: CreateCompanyDto
  ): Promise<Company> {
    return this.companyService.create(createCompanyDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ): Promise<CompanyWithLogoUrl> {
    return this.companyService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number
  ): Promise<void> {
    return this.companyService.remove(id);
  }
}