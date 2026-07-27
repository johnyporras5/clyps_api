import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  ParseIntPipe,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Sse,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IAPromptsService } from './ia_prompts.service';
import { IAPrompts } from './entities/ia_prompts.entity';
import { CreateIAPromptDto } from './dto/create-ia_prompt.dto';
import { UpdateIAPromptDto } from './dto/update-ia_prompt.dto';
import { PaginationResult } from '../common/utils/pagination.util';
import { QueryIAPromptDto } from './dto/query-ia_prompt.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { ProcessPromptDto } from './dto/process-prompt.dto';
import { SuggestionsDto } from './dto/suggestions.dto';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { Observable } from 'rxjs';

@Controller('ia-prompts')
export class IAPromptsController {
  constructor(private readonly iaPromptsService: IAPromptsService) {}

  @Get()
  async findAll(
    @Query() queryDto: QueryIAPromptDto,
  ): Promise<PaginationResult<IAPrompts>> {
    return this.iaPromptsService.findAllPaginatedWithQueryBuilder(queryDto);
  }

  @Get('suggestion-options')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('cli')
  getSuggestionOptions() {
    return this.iaPromptsService.getSuggestionOptions();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<IAPrompts> {
    return this.iaPromptsService.findOne(id);
  }

  @Post()
  async create(@Body() createDto: CreateIAPromptDto): Promise<IAPrompts> {
    return this.iaPromptsService.create(createDto);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateIAPromptDto,
  ): Promise<IAPrompts> {
    return this.iaPromptsService.update(id, updateDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.iaPromptsService.remove(id);
  }

  /**
   * POST /ia-prompts/process
   * Endpoint UNIFICADO que acepta:
   * - { "id": 1 } → Usa el prompt de la BD
   * - { "text": "tu pregunta" } → Pregunta directa
   *
   * El tipo de prompt (cliente/profesional) se determina automáticamente
   * según el userType del usuario autenticado
   */

  @Post('suggestions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('cli')
  @UseInterceptors(FileInterceptor('image'))
  async suggestions(
    @Body() dto: SuggestionsDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.iaPromptsService.getSuggestions(dto, image);
  }

  @Post('process')
  @UseGuards(JwtAuthGuard)
  async processPrompt(
    @Body() dto: ProcessPromptDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // Extraer el userType del usuario autenticado
    const userType = req.user.userType;

    return this.iaPromptsService.processPrompt(dto, userType);
  }

  /**
   * POST /ia-prompts/process/stream
   * Responde letra a letra via Server-Sent Events (SSE)
   *
   * El cliente recibe eventos continuos hasta que llega '[DONE]'
   */
  @Post('process/stream')
  @UseGuards(JwtAuthGuard)
  @Sse()
  async processPromptStream(
    @Body() dto: ProcessPromptDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    const userType = req.user.userType;
    return this.iaPromptsService.processPromptStream(dto, userType);
  }
}
