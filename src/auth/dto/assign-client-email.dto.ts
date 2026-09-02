import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * Correo con el que se le da acceso a un cliente que el salón dio de alta sin
 * correo. No es una edición del perfil: es la dirección a la que se le mandan
 * sus credenciales para que entre y se haga cargo de su cuenta.
 */
export class AssignClientEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
