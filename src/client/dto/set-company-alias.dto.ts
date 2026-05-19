import { IsInt, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class SetCompanyAliasDto {
  /** Compañía (del admin) a la que pertenece este alias */
  @Type(() => Number)
  @IsInt()
  companyId: number;

  /**
   * Alias a asignar. Enviar cadena vacía para eliminar el alias
   * que esa compañía tenía guardado para el cliente.
   */
  @IsString()
  @Length(0, 100)
  alias: string;
}
