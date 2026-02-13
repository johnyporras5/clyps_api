// src/chatgpt/chatgpt.service.ts
import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatGPTService {
    private chatModel: ChatOpenAI;

    constructor(private configService: ConfigService) {
        this.chatModel = new ChatOpenAI({
            modelName: 'gpt-4',
            temperature: 0.7,
            openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
        });
    }

    /**
     * Envía un prompt a ChatGPT y retorna la respuesta
     */
    async sendPrompt(promptText: string, systemPrompt?: string): Promise<string> {
        try {
            // ✅ SOLUCIÓN: Tipar el array como BaseMessage[]
            const messages: BaseMessage[] = [];

            if (systemPrompt) {
                messages.push(new SystemMessage(systemPrompt));
            }

            messages.push(new HumanMessage(promptText));

            const response = await this.chatModel.invoke(messages);

            return response.content.toString();
        } catch (error) {
            throw new Error(`Error al comunicarse con ChatGPT: ${error.message}`);
        }
    }
}