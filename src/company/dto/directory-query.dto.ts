import {
  IsOptional,
  IsString,
  IsArray,
  IsInt,
  ArrayMaxSize,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Normaliza un valor de query (string único, lista repetida o lista separada
 * por comas) en un array de números, descartando los no numéricos.
 */
const toNumberArray = ({ value }: { value: unknown }): number[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const nums = raw
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
  return nums.length ? nums : undefined;
};

/** Normaliza un valor de query en un array de strings no vacíos. */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : [value];
  const arr = raw.map((v) => String(v).trim()).filter((v) => v !== '');
  return arr.length ? arr : undefined;
};

const SLOT_REGEX = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export class DirectoryQueryDto extends PaginationDto {
  /** Ciudad: coincide con company.location (case-insensitive, contains). */
  @IsOptional()
  @IsString()
  city?: string;

  /**
   * Categorías por id. Acepta repetición (`categoryId=1&categoryId=2`).
   * El match es por nombre de categoría (las categorías son por compañía,
   * por lo que un mismo nombre tiene ids distintos en cada compañía).
   */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @IsInt({ each: true })
  categoryId?: number[];

  /** Categorías por id en formato CSV (`categoryIds=1,2,3`). */
  @IsOptional()
  @Transform(toNumberArray)
  @IsArray()
  @IsInt({ each: true })
  categoryIds?: number[];

  /** Fecha a evaluar para disponibilidad (YYYY-MM-DD). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe tener formato YYYY-MM-DD',
  })
  date?: string;

  /**
   * Franjas horarias 24h `HH:mm-HH:mm` (hasta 2). Acepta repetición
   * (`slot=07:00-08:00&slot=14:00-15:00`).
   */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @ArrayMaxSize(2)
  @Matches(SLOT_REGEX, {
    each: true,
    message: 'slot debe tener formato HH:mm-HH:mm',
  })
  slot?: string[];
}
