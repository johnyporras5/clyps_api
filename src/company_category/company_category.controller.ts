import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CompanyCategoryService } from './company_category.service';
import { CreateCompanyCategoryDto } from './dto/create-company-category.dto';
import { UpdateCompanyCategoryDto } from './dto/update-company-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('company-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('adm')
export class CompanyCategoryController {
  constructor(
    private readonly companyCategoryService: CompanyCategoryService,
  ) {}

  @Get()
  findAll(@Req() req: any) {
    return this.companyCategoryService.findAllByCompany(req.user.sub);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.companyCategoryService.findOne(id, req.user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateCompanyCategoryDto, @Req() req: any) {
    return this.companyCategoryService.create(dto, req.user.sub);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyCategoryDto,
    @Req() req: any,
  ) {
    return this.companyCategoryService.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.companyCategoryService.remove(id, req.user.sub);
  }
}
