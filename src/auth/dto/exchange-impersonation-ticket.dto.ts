import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** El vale de un solo uso que la app del salón canjea por un token. */
export class ExchangeImpersonationTicketDto {
  /**
   * `MaxLength` no es cosmético: sin tope, cualquiera puede mandar un cuerpo de
   * megas que se acaba hasheando en cada intento. El vale real son 43
   * caracteres (32 bytes en base64url); 128 deja margen de sobra.
   */
  @IsString()
  @IsNotEmpty({ message: 'Falta el ticket de acceso' })
  @MaxLength(128)
  ticket: string;
}
