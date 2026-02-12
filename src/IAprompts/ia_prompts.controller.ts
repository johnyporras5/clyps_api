import { Controller, Get, Post, Body, Param, Put, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { IAPromptsService } from './ia_prompts.service';
import { IAPrompts } from './entities/ia_prompts.entity';
import { CreateIAPromptDto } from './dto/create-ia_prompt.dto';
import { UpdateIAPromptDto } from './dto/update-ia_prompt.dto';
import { paginate, PaginationResult } from '../common/utils/pagination.util';
import { QueryIAPromptDto } from './dto/query-ia_prompt.dto';

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
}