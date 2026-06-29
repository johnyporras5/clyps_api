import {
  IsOptional,
  IsString,
  IsInt,
  ValidateIf,
  Length,
} from 'class-validator';

export class ProcessPromptDto {
  @IsOptional()
  @IsInt()
  @ValidateIf((o) => !o.text)
  id?: number;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => !o.id)
  text?: string;

  /**
   * Tipo de contexto para texto directo ('c', 'p', 'pg'). Opcional: si no se
   * envía, se deriva del userType. Útil para el chat del home del worker, que
   * envía texto libre pero quiere consejos de crecimiento ('pg'). Se ignora
   * cuando se usa un prompt por `id` (ahí el tipo lo define el prompt guardado).
   */
  @IsOptional()
  @IsString()
  @Length(1, 5)
  type?: string;
}
