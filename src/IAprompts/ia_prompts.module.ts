// ia_prompts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { IAPromptsService } from './ia_prompts.service';
import { IAPromptsController } from './ia_prompts.controller';
import { IAPrompts } from './entities/ia_prompts.entity';
import { ChatGPTService } from '../chatgpt/chatgpt.service';

@Module({
  imports: [TypeOrmModule.forFeature([IAPrompts]), ConfigModule],
  controllers: [IAPromptsController],
  providers: [IAPromptsService, ChatGPTService],
  exports: [IAPromptsService],
})
export class IAPromptsModule {}
