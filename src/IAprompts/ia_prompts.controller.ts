import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, Query, UseGuards,Request, Sse } from '@nestjs/common';
import { IAPromptsService } from './ia_prompts.service';
import { IAPrompts } from './entities/ia_prompts.entity';
import { CreateIAPromptDto } from './dto/create-ia_prompt.dto';
import { UpdateIAPromptDto } from './dto/update-ia_prompt.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { QueryIAPromptDto } from './dto/query-ia_prompt.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ProcessPromptDto } from './dto/process-prompt.dto';
import { Observable } from 'rxjs';

@Controller('ia-prompts')
export class IAPromptsController {
    constructor(private readonly iaPromptsService: IAPromptsService) { }

    @Get()
    async findAll(
        @Query() queryDto: QueryIAPromptDto,
    ): Promise<PaginationResult<IAPrompts>> {
        return this.iaPromptsService.findAllPaginatedWithQueryBuilder(queryDto);
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
    @Post('process')
    @UseGuards(JwtAuthGuard) 
    async processPrompt(
        @Body() dto: ProcessPromptDto,
        @Request() req 
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
@Sse()  // 👈 Convierte el endpoint en SSE
async processPromptStream(
    @Body() dto: ProcessPromptDto,
    @Request() req,
): Promise<Observable<MessageEvent>> {
    const userType = req.user.userType;
    return this.iaPromptsService.processPromptStream(dto, userType);
}
}

