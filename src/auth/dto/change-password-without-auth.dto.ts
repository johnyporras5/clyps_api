import {
  IsEmail,
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class ChangePasswordWithoutAuthDto {
  @IsEmail({}, { message: 'Debe ser un email válido' })
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6, {
    message: 'La nueva contraseña debe tener al menos 6 caracteres',
  })
  @MaxLength(100, {
    message: 'La contraseña no puede exceder los 100 caracteres',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      'La nueva contraseña debe contener al menos una letra mayúscula, una minúscula, un número y un carácter especial',
  })
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmNewPassword: string;
}
