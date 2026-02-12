import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IAPromptsService } from './ia_prompts.service';
import { IAPromptsController } from './ia_prompts.controller';
import { IAPrompts } from './entities/ia_prompts.entity';

@Module({
    imports: [TypeOrmModule.forFeature([IAPrompts])],
    controllers: [IAPromptsController],
    providers: [IAPromptsService],
    exports: [IAPromptsService],
})
export class IAPromptsModule { }