import {
  IsOptional,
  IsString,
  IsDate,
  Length,
  IsNotEmpty,
  IsEmail,
  IsNumber,
  IsIn,
  IsArray,
  IsInt,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Normaliza `preferences` que llega en multipart como string JSON ("[1,3,4]"),
 * CSV ("1,3,4") o array, a un number[] de ids únicos enteros.
 */
const toIntArray = ({ value }: { value: unknown }): number[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  let raw: unknown = value;
  if (typeof value === 'string') {
    const s = value.trim();
    try {
      raw = JSON.parse(s);
    } catch {
      raw = s.split(',');
    }
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  const nums = arr
    .map((v) => Number(String(v).trim()))
    .filter((n) => Number.isInteger(n));
  return [...new Set(nums)];
};

export class RegisterClientDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  @Length(8, 100)
  password?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  phone?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthdate?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsIn([0, 1])
  isActive?: number = 1;

  @IsOptional()
  @IsString()
  location?: string;

  /**
   * Categorías de interés (ids del catálogo global `site_category`).
   * En multipart llega como string JSON: preferences="[1,3,4]".
   */
  @IsOptional()
  @Transform(toIntArray)
  @IsArray()
  @IsInt({ each: true })
  preferences?: number[];
}
