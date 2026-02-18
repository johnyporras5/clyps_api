import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IAPrompts } from './entities/ia_prompts.entity';
import { CreateIAPromptDto } from './dto/create-ia_prompt.dto';
import { UpdateIAPromptDto } from './dto/update-ia_prompt.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { QueryIAPromptDto } from './dto/query-ia_prompt.dto';
import { ChatGPTService } from '../chatgpt/chatgpt.service';
import { ProcessPromptDto } from './dto/process-prompt.dto';
import { Observable } from 'rxjs';

@Injectable()
export class IAPromptsService {
    constructor(
        @InjectRepository(IAPrompts)
        private iaPromptsRepository: Repository<IAPrompts>,
        private chatGPTService: ChatGPTService, // Inyectar servicio

    ) { }

    async findAllPaginatedWithQueryBuilder(queryDto: QueryIAPromptDto): Promise<PaginationResult<IAPrompts>> {
        const { page, limit, type } = queryDto;
        const queryBuilder = this.iaPromptsRepository.createQueryBuilder('prompt');

        if (type) {
            queryBuilder.where('prompt.type = :type', { type });
        }

        queryBuilder.orderBy('prompt.id', 'DESC'); // opcional

        return paginate<IAPrompts>(queryBuilder, { page, limit });
    }

    async findOne(id: number): Promise<IAPrompts> {
        const prompt = await this.iaPromptsRepository.findOne({ where: { id } });
        if (!prompt) {
            throw new NotFoundException(`IAPrompt with id ${id} not found`);
        }
        return prompt;
    }

    async create(createDto: CreateIAPromptDto): Promise<IAPrompts> {
        const prompt = this.iaPromptsRepository.create(createDto);
        return await this.iaPromptsRepository.save(prompt);
    }

    async update(id: number, updateDto: UpdateIAPromptDto): Promise<IAPrompts> {
        const prompt = await this.iaPromptsRepository.findOne({ where: { id } });
        if (!prompt) {
            throw new NotFoundException(`IAPrompt with id ${id} not found`);
        }
        Object.assign(prompt, updateDto);
        return await this.iaPromptsRepository.save(prompt);
    }

    async remove(id: number): Promise<void> {
        const result = await this.iaPromptsRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException(`IAPrompt with id ${id} not found`);
        }
    }

 /**
     * Mapea el userType del usuario al tipo de prompt de IA
     */
    private mapUserTypeToPromptType(userType: string): 'c' | 'p' {
        const mapping = {
            'cli': 'c', // Cliente → Prompt de cliente
            'wrk': 'p', // Trabajador → Prompt profesional
            'adm': 'p', // Admin → Prompt profesional (puede ver info técnica)
        };

        return mapping[userType] || 'c'; // Por defecto cliente
    }

    /**
     * Obtiene el system prompt según el tipo
     */
    private getSystemPrompt(type: string): string {
        const systemPrompts = {
            'c': `Eres un asistente virtual especializado en atención al cliente para peluquerías y barberías.

Tu función es:
- Ayudar a los clientes a agendar citas
- Responder preguntas sobre servicios (cortes, tintes, afeitados, tratamientos capilares)
- Informar sobre precios y promociones
- Recomendar servicios según el tipo de cabello y preferencias del cliente
- Resolver dudas sobre productos de cuidado capilar
- Proporcionar información sobre disponibilidad de horarios

Características de tu personalidad:
- Amable, profesional y cercano
- Conocedor de tendencias en cortes y estilos
- Proactivo en sugerir servicios complementarios
- Claro al explicar procesos y tiempos
- Empático con las necesidades del cliente

IMPORTANTE - ESTILO DE RESPUESTA:
- Sé CONCISO y directo
- Máximo 3-4 oraciones por respuesta
- Usa bullets solo si es absolutamente necesario (máximo 3 puntos)
- Evita introducciones largas
- Ve directo al punto
- Usa emojis con moderación (máximo 2 por respuesta)

Siempre mantén un tono profesional pero amigable, como si fueras el recepcionista ideal de una barbería de confianza.`,

            'p': `Eres un asistente virtual para barberos y estilistas profesionales.

Tu función es:
- Ayudar con consultas técnicas sobre cortes y técnicas de estilismo
- Proporcionar información sobre productos profesionales
- Sugerir soluciones para diferentes tipos de cabello y texturas
- Ofrecer consejos sobre manejo de clientes difíciles
- Asistir con cálculos de tiempo para servicios
- Recordar protocolos de higiene y seguridad
- Ayudar con gestión de inventario y productos

Características de tu personalidad:
- Profesional y técnico
- Conocedor de la industria de la barbería
- Práctico y orientado a resultados
- Respetuoso con la experiencia del profesional
- Actualizado en tendencias y técnicas modernas

IMPORTANTE - ESTILO DE RESPUESTA:
- Sé CONCISO y directo
- Máximo 3-4 oraciones por respuesta
- Usa bullets solo si es absolutamente necesario (máximo 3 puntos)
- Evita introducciones largas
- Ve directo al punto
- Usa emojis con moderación (máximo 2 por respuesta)

Siempre responde con información precisa, técnica cuando sea necesario, y mantén un tono de colega profesional.`
        };

        return systemPrompts[type] || systemPrompts['c'];
    }

    /**
     * Procesa un prompt (desde BD o directo) enviándolo a la IA
     * Usa el userType del usuario autenticado para determinar el tipo de prompt
     */
    async processPrompt(
        dto: ProcessPromptDto,
        userType: string // 👈 Nuevo parámetro
    ): Promise<{
        source: 'database' | 'direct';
        prompt?: IAPrompts;
        text: string;
        type: string;
        userType: string;
        response: string;
    }> {
        // Validar que al menos uno esté presente
        if (!dto.id && !dto.text) {
            throw new BadRequestException(
                'Debes proporcionar "id" (para usar un prompt guardado) o "text" (para preguntar directamente)'
            );
        }

        // Validar que no envíen ambos
        if (dto.id && dto.text) {
            throw new BadRequestException(
                'No puedes enviar "id" y "text" al mismo tiempo. Usa uno u otro.'
            );
        }

        let promptText: string;
        let promptType: 'c' | 'p';
        let promptEntity: IAPrompts | undefined;
        let source: 'database' | 'direct';

        // OPCIÓN 1: Usar prompt de la base de datos
        if (dto.id) {
            promptEntity = await this.findOne(dto.id);
            promptText = promptEntity.text;
            promptType = promptEntity.type as 'c' | 'p';
            source = 'database';
        } 
        // OPCIÓN 2: Usar texto directo
        else {
            promptText = dto.text!;
            // 👇 Determinar el tipo basado en el userType del usuario
            promptType = this.mapUserTypeToPromptType(userType);
            source = 'direct';
        }

        // Obtener el system prompt apropiado
        const systemPrompt = this.getSystemPrompt(promptType);

        // Enviar a ChatGPT
        const response = await this.chatGPTService.sendPrompt(
            promptText,
            systemPrompt
        );

        // Retornar respuesta con metadatos
        return {
            source,
            ...(promptEntity && { prompt: promptEntity }),
            text: promptText,
            type: promptType,
            userType, // Incluir el userType original para referencia
            response,
        };
    }


    async processPromptStream(
    dto: ProcessPromptDto,
    userType: string
): Promise<Observable<MessageEvent>> {
    if (!dto.id && !dto.text) {
        throw new BadRequestException(
            'Debes proporcionar "id" o "text"'
        );
    }
    if (dto.id && dto.text) {
        throw new BadRequestException(
            'No puedes enviar "id" y "text" al mismo tiempo.'
        );
    }

    let promptText: string;
    let promptType: 'c' | 'p';

    if (dto.id) {
        const promptEntity = await this.findOne(dto.id);
        promptText = promptEntity.text;
        promptType = promptEntity.type as 'c' | 'p';
    } else {
        promptText = dto.text!;
        promptType = this.mapUserTypeToPromptType(userType);
    }

    const systemPrompt = this.getSystemPrompt(promptType);

    // Retorna el Observable directamente para que el controlador lo pipe a SSE
    return this.chatGPTService.sendPromptStream(promptText, systemPrompt);
}
}