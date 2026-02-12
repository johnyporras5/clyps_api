import { PartialType } from '@nestjs/mapped-types';
import { CreateIAPromptDto } from './create-ia_prompt.dto';

export class UpdateIAPromptDto extends PartialType(CreateIAPromptDto) {}