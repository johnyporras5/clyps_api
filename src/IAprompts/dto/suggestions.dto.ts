import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class SuggestionsDto {
  /**
   * El salón desde el que se consulta (SUB-14).
   *
   * Va opcional porque la IA tiene DOS entradas: dentro del agendamiento, que
   * sí sabe en qué salón está —y entonces manda el plan de ESE salón—, y la
   * suelta del menú, que no cuelga de ninguno y se resuelve con los salones
   * del cliente.
   *
   * Llega por multipart junto con la foto, así que viaja como texto: de ahí
   * el `Type(() => Number)`.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @IsString()
  serviceName?: string;

  @IsOptional()
  @IsString()
  serviceDescription?: string;

  @IsOptional()
  @IsString()
  serviceCategory?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  style?: string;
}
