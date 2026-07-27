import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IAPrompts } from './entities/ia_prompts.entity';
import { CreateIAPromptDto } from './dto/create-ia_prompt.dto';
import { UpdateIAPromptDto } from './dto/update-ia_prompt.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { QueryIAPromptDto } from './dto/query-ia_prompt.dto';
import { ChatGPTService } from '../chatgpt/chatgpt.service';
import { ProcessPromptDto } from './dto/process-prompt.dto';
import { SuggestionsDto } from './dto/suggestions.dto';
import { SUGGESTIONS_SYSTEM_PROMPT } from './prompts/suggestions-system.prompt';
import { SUGGESTIONS_GENERAL_SYSTEM_PROMPT } from './prompts/suggestions-general-system.prompt';
import { Observable } from 'rxjs';

export interface SuggestionsResponse {
  needsBetterPhoto: boolean;
  suggestions: Array<{ title: string; reason: string }>;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class IAPromptsService {
  constructor(
    @InjectRepository(IAPrompts)
    private iaPromptsRepository: Repository<IAPrompts>,
    private chatGPTService: ChatGPTService, // Inyectar servicio
  ) {}

  async findAllPaginatedWithQueryBuilder(
    queryDto: QueryIAPromptDto,
  ): Promise<PaginationResult<IAPrompts>> {
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
      cli: 'c', // Cliente → Prompt de cliente
      wrk: 'p', // Trabajador → Prompt profesional
      adm: 'p', // Admin → Prompt profesional (puede ver info técnica)
    };

    return mapping[userType] || 'c'; // Por defecto cliente
  }

  /**
   * Obtiene el system prompt según el tipo
   */
  private getSystemPrompt(type: string): string {
    const systemPrompts = {
      c: `Eres un asistente virtual especializado en atención al cliente para peluquerías y barberías.

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

      p: `Eres un asistente virtual para barberos y estilistas profesionales.

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

Siempre responde con información precisa, técnica cuando sea necesario, y mantén un tono de colega profesional.`,

      pg: `Eres un asesor de negocio para barberos, estilistas y profesionales de belleza que trabajan por su cuenta dentro de la plataforma.

Tu objetivo es ayudarlos a CONSEGUIR MÁS CITAS y HACER CRECER SU NEGOCIO.

Temas en los que asesoras:
- Conseguir más reservas y llenar la agenda (incluyendo huecos y horas valle)
- Atraer nuevos clientes y reactivar clientes inactivos
- Qué servicios promocionar y cómo armar promociones u ofertas que funcionen
- Mejorar el perfil profesional para destacar frente a la competencia
- Fidelización y aumento de la frecuencia de visita
- Marketing, redes sociales y tendencias del sector
- Conseguir reseñas positivas y mejorar la reputación

IMPORTANTE - ESTILO DE RESPUESTA:
- Da consejos ACCIONABLES: pasos concretos que pueda aplicar hoy
- Sé CONCISO y directo, máximo 4-5 puntos
- Usa bullets con acciones, no teoría
- Evita introducciones largas; ve directo a las acciones
- Usa emojis con moderación (máximo 2 por respuesta)

Mantén un tono motivador y práctico, como un mentor de negocio que conoce el sector de la belleza.`,
    };

    return systemPrompts[type] || systemPrompts['c'];
  }

  /**
   * Procesa un prompt (desde BD o directo) enviándolo a la IA
   * Usa el userType del usuario autenticado para determinar el tipo de prompt
   */
  async processPrompt(
    dto: ProcessPromptDto,
    userType: string, // 👈 Nuevo parámetro
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
        'Debes proporcionar "id" (para usar un prompt guardado) o "text" (para preguntar directamente)',
      );
    }

    // Validar que no envíen ambos
    if (dto.id && dto.text) {
      throw new BadRequestException(
        'No puedes enviar "id" y "text" al mismo tiempo. Usa uno u otro.',
      );
    }

    let promptText: string;
    let promptType: string;
    let promptEntity: IAPrompts | undefined;
    let source: 'database' | 'direct';

    // OPCIÓN 1: Usar prompt de la base de datos
    if (dto.id) {
      promptEntity = await this.findOne(dto.id);
      promptText = promptEntity.text;
      promptType = promptEntity.type;
      source = 'database';
    }
    // OPCIÓN 2: Usar texto directo
    else {
      promptText = dto.text!;
      // Tipo: el override del DTO (p.ej. 'pg' del home del worker) o, si no
      // viene, el derivado del userType del usuario autenticado.
      promptType = dto.type ?? this.mapUserTypeToPromptType(userType);
      source = 'direct';
    }

    // Obtener el system prompt apropiado
    const systemPrompt = this.getSystemPrompt(promptType);

    // Enviar a ChatGPT
    const response = await this.chatGPTService.sendPrompt(
      promptText,
      systemPrompt,
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
    userType: string,
  ): Promise<Observable<MessageEvent>> {
    if (!dto.id && !dto.text) {
      throw new BadRequestException('Debes proporcionar "id" o "text"');
    }
    if (dto.id && dto.text) {
      throw new BadRequestException(
        'No puedes enviar "id" y "text" al mismo tiempo.',
      );
    }

    let promptText: string;
    let promptType: string;

    if (dto.id) {
      const promptEntity = await this.findOne(dto.id);
      promptText = promptEntity.text;
      promptType = promptEntity.type;
    } else {
      promptText = dto.text!;
      promptType = dto.type ?? this.mapUserTypeToPromptType(userType);
    }

    const systemPrompt = this.getSystemPrompt(promptType);

    // Retorna el Observable directamente para que el controlador lo pipe a SSE
    return this.chatGPTService.sendPromptStream(promptText, systemPrompt);
  }

  async getSuggestions(
    dto: SuggestionsDto,
    image?: Express.Multer.File,
  ): Promise<SuggestionsResponse> {
    if (image) {
      if (!ALLOWED_IMAGE_TYPES.includes(image.mimetype)) {
        throw new BadRequestException(
          'Formato de imagen no válido. Solo se aceptan JPG o PNG.',
        );
      }
      if (image.size > MAX_IMAGE_BYTES) {
        throw new BadRequestException(
          'La imagen supera el tamaño máximo permitido (5 MB).',
        );
      }
    }

    const isGeneral = !dto.serviceName?.trim();
    if (isGeneral && !image) {
      throw new BadRequestException(
        'Debes enviar una foto para la consulta general.',
      );
    }

    const systemPrompt = isGeneral
      ? SUGGESTIONS_GENERAL_SYSTEM_PROMPT
      : SUGGESTIONS_SYSTEM_PROMPT;

    const userText = isGeneral
      ? [
          'Consulta general: el cliente no eligió un servicio, solo subió una foto.',
          'Analiza lo que se vea y sugiere ideas que pueda ir a hacerse en un negocio de la app.',
          'Devuelve el JSON con 3 a 5 sugerencias.',
        ].join('\n')
      : [
          `Servicio reservado: ${dto.serviceName}`,
          `Descripción del servicio: ${dto.serviceDescription?.trim() || 'No especificada'}`,
          `Categoría del servicio: ${dto.serviceCategory?.trim() || 'No especificada'}`,
          image
            ? 'El cliente adjuntó una foto.'
            : 'El cliente no adjuntó foto.',
          'Devuelve el JSON con 2 a 4 sugerencias dentro del alcance de este servicio.',
        ].join('\n');

    const imageDataUrl = image
      ? `data:${image.mimetype};base64,${image.buffer.toString('base64')}`
      : undefined;

    let raw: string;
    try {
      raw = await this.chatGPTService.sendVisionJson(
        systemPrompt,
        userText,
        imageDataUrl,
      );
    } catch {
      throw new InternalServerErrorException(
        'No pudimos generar sugerencias en este momento. Intenta de nuevo.',
      );
    }

    return this.parseSuggestions(raw);
  }

  private parseSuggestions(raw: string): SuggestionsResponse {
    let text = (raw || '').trim();

    if (text.startsWith('```')) {
      text = text
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
    }

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new InternalServerErrorException(
        'La IA devolvió una respuesta con formato inesperado. Intenta de nuevo.',
      );
    }

    const obj = data as {
      needsBetterPhoto?: unknown;
      suggestions?: unknown;
    };

    if (obj.needsBetterPhoto === true) {
      return { needsBetterPhoto: true, suggestions: [] };
    }

    const rawList = Array.isArray(obj.suggestions) ? obj.suggestions : [];
    const suggestions = rawList
      .filter(
        (s): s is { title: string; reason: string } =>
          !!s &&
          typeof (s as { title?: unknown }).title === 'string' &&
          typeof (s as { reason?: unknown }).reason === 'string',
      )
      .map((s) => ({ title: s.title.trim(), reason: s.reason.trim() }))
      .slice(0, 5);

    if (suggestions.length < 2) {
      throw new InternalServerErrorException(
        'No pudimos generar suficientes sugerencias. Intenta de nuevo.',
      );
    }

    return { needsBetterPhoto: false, suggestions };
  }
}
