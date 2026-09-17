import {
  Controller,
  ForbiddenException,
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
import { SubscriptionAccessGuard } from '../subscription/guards/subscription-access.guard';
import { RequiresFeature } from '../subscription/guards/requires-feature.decorator';
import { EntitlementsService } from '../subscription/entitlements.service';
import { Observable } from 'rxjs';

@Controller('ia-prompts')
export class IAPromptsController {
  constructor(
    private readonly iaPromptsService: IAPromptsService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * La IA del cliente final, según el plan del salón (SUB-14).
   *
   * No lo puede hacer el guard: al cliente lo deja pasar siempre, y con razón
   * —su token no pertenece a un solo salón—. Así que la pregunta se hace aquí,
   * donde sí se sabe desde dónde está consultando.
   *
   * Con salón manda el plan de ESE salón: el cliente está agendando ahí, y si
   * ese salón no compró la IA no se la damos aunque otro suyo sí la tenga. Sin
   * salón vale cualquiera de los suyos.
   *
   * El 403 es una red, no una pantalla: la app esconde el botón antes: el
   * catálogo dice expreso que al cliente final no se le pinta candado.
   */
  private async assertClientMayUseAi(
    userId: number,
    companyId?: number,
  ): Promise<void> {
    const permitido =
      companyId != null
        ? (await this.entitlements.getPublicFeatures(companyId)).aiSuggestions
        : await this.entitlements.clientHasAiSuggestions(userId);

    if (!permitido)
      throw new ForbiddenException({
        message: 'La sugerencia con IA no está disponible.',
        reason: 'plan_upgrade_required',
        feature: 'aiSuggestions',
      });
  }

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
    @Request() req: AuthenticatedRequest,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    // Antes de subir la foto a ningún lado y antes de gastar una llamada paga.
    await this.assertClientMayUseAi(req.user.sub, dto.companyId);
    return this.iaPromptsService.getSuggestions(dto, image);
  }

  /**
   * SUB-14: la IA es del plan Full.
   *
   * El guard solo puede cortar a quien pertenece a UN salón —dueño y
   * trabajador—. El cliente final pasa de largo: su token no trae salón y el
   * catálogo lo dice expreso, a él no se le pinta candado. Lo suyo se apaga en
   * la app, con `GET /subscription/company/:id/features`.
   */
  @Post('process')
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresFeature('aiSuggestions')
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
  @UseGuards(JwtAuthGuard, SubscriptionAccessGuard)
  @RequiresFeature('aiSuggestions')
  @Sse()
  async processPromptStream(
    @Body() dto: ProcessPromptDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    const userType = req.user.userType;
    return this.iaPromptsService.processPromptStream(dto, userType);
  }
}
