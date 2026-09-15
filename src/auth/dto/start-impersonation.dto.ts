import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

/** Lo único que el panel manda para entrar a un salón: cuál. */
export class StartImpersonationDto {
  /**
   * El salón, NO el usuario. Se pide así a propósito: un dueño puede llegar a
   * tener más de una company, y "entrar como el dueño" sin decir a cuál dejaría
   * que el backend eligiera por su cuenta — el operador acabaría mirando los
   * datos de un salón distinto del que pulsó.
   */
  @Type(() => Number)
  @IsInt({ message: 'companyId debe ser un número entero' })
  @IsPositive({ message: 'companyId debe ser mayor que cero' })
  companyId: number;
}
