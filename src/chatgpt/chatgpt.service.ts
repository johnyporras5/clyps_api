// src/chatgpt/chatgpt.service.ts
import { Injectable } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

@Injectable()
export class ChatGPTService {
  private chatModel: ChatOpenAI;
  private visionModel: ChatOpenAI;

  constructor(private configService: ConfigService) {
    this.chatModel = new ChatOpenAI({
      modelName: 'gpt-4',
      temperature: 0.7,
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
      streaming: true,
    });

    this.visionModel = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.7,
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
      maxTokens: 800,
      timeout: 30000,
      maxRetries: 1,
      modelKwargs: { response_format: { type: 'json_object' } },
    });
  }

  /**
   * Envía un prompt multimodal (texto + imagen opcional) y devuelve la
   * respuesta como texto, forzando que el modelo responda en JSON.
   *
   * @param imageDataUrl
   */
  async sendVisionJson(
    systemPrompt: string,
    userText: string,
    imageDataUrl?: string,
  ): Promise<string> {
    const content: Array<Record<string, unknown>> = [
      { type: 'text', text: userText },
    ];
    if (imageDataUrl) {
      content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
    }

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage({ content: content as never }),
    ];

    const response = await this.visionModel.invoke(messages);

    return response.content.toString();
  }

  async sendPrompt(promptText: string, systemPrompt?: string): Promise<string> {
    const messages: BaseMessage[] = [];
    if (systemPrompt) messages.push(new SystemMessage(systemPrompt));
    messages.push(new HumanMessage(promptText));

    const response = await this.chatModel.invoke(messages);
    return response.content.toString();
  }

  /**
   * Streaming: emite tokens uno a uno como Observable de SSE
   */
  sendPromptStream(
    promptText: string,
    systemPrompt?: string,
  ): Observable<MessageEvent> {
    const messages: BaseMessage[] = [];
    if (systemPrompt) messages.push(new SystemMessage(systemPrompt));
    messages.push(new HumanMessage(promptText));

    return new Observable((subscriber) => {
      this.chatModel
        .stream(messages)
        .then(async (stream) => {
          for await (const chunk of stream) {
            const token = chunk.content?.toString() ?? '';
            if (token) {
              // Formato SSE que NestJS espera
              subscriber.next({ data: token } as MessageEvent);
            }
          }
          // Señal de fin
          subscriber.next({ data: '[DONE]' } as MessageEvent);
          subscriber.complete();
        })
        .catch((error) => {
          subscriber.error(error);
        });
    });
  }
}
