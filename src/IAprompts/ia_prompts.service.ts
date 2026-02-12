import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IAPrompts } from './entities/ia_prompts.entity';
import { CreateIAPromptDto } from './dto/create-ia_prompt.dto';
import { UpdateIAPromptDto } from './dto/update-ia_prompt.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { QueryIAPromptDto } from './dto/query-ia_prompt.dto';
@Injectable()
export class IAPromptsService {
    constructor(
        @InjectRepository(IAPrompts)
        private iaPromptsRepository: Repository<IAPrompts>,
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
}