import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, MaxLength, IsArray, ArrayMaxSize, ArrayUnique } from 'class-validator';

export class RegisterAdminDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;

    // Si ya es un array, devolverlo directamente
    if (Array.isArray(value)) return value;

    // Si es un string, procesarlo
    if (typeof value === 'string') {
      const trimmed = value.trim();

      // Caso 1: Es un JSON array (empieza con [ y termina con ])
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed;
        } catch {
          // Si falla el parseo, continuar con el siguiente método
        }
      }

      return trimmed.split(',').map(item =>
        item.trim().replace(/^["']|["']$/g, '')
      );
    }

    return value;
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique({ message: 'Las categorías no pueden duplicarse' })
  @IsString({ each: true })
  @MaxLength(145, { each: true })
  categories?: string[];

}