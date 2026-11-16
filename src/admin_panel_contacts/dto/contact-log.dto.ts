import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import {
  CONTACT_CHANNELS,
  CONTACT_OUTCOMES,
  type ContactChannel,
  type ContactOutcome,
} from '../entities/panel-contact-log.entity';

/** Quita espacios; una nota vacía se guarda como null, no como ''. */
const trimNote = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** null o ausente = no validar (null significa "quitar la fecha"). */
const present = (_: unknown, value: unknown) =>
  value !== null && value !== undefined;

/** Lo que llega al anotar un contacto nuevo. */
export class CreateContactLogDto {
  @IsIn(CONTACT_CHANNELS, { message: 'Canal no válido.' })
  channel: ContactChannel;

  /** Si no viene: 'no_reply' (se acaba de escribir y aún no contesta). */
  @IsOptional()
  @IsIn(CONTACT_OUTCOMES, { message: 'Resultado no válido.' })
  outcome?: ContactOutcome;

  @Transform(trimNote)
  @ValidateIf(present)
  @IsString()
  @MaxLength(1000, { message: 'La nota no puede pasar de 1000 caracteres.' })
  note?: string | null;

  /** 'YYYY-MM-DD'. Solo el día: el panel lo compara con el día local. */
  @ValidateIf(present)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de seguimiento debe ser AAAA-MM-DD.',
  })
  @IsISO8601({ strict: true }, { message: 'Fecha de seguimiento no válida.' })
  followUpOn?: string | null;

  /** Cuándo se le escribió, si no fue ahora (ISO 8601 con zona). */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Fecha de contacto no válida.' })
  contactedAt?: string;
}

/**
 * Corregir un contacto ya anotado: casi siempre, cambiar el resultado cuando
 * el salón contesta o quitar la fecha de seguimiento. `null` en `note` o en
 * `followUpOn` los borra; ausente, no los toca.
 */
export class UpdateContactLogDto {
  @IsOptional()
  @IsIn(CONTACT_CHANNELS, { message: 'Canal no válido.' })
  channel?: ContactChannel;

  @IsOptional()
  @IsIn(CONTACT_OUTCOMES, { message: 'Resultado no válido.' })
  outcome?: ContactOutcome;

  @Transform(trimNote)
  @ValidateIf(present)
  @IsString()
  @MaxLength(1000, { message: 'La nota no puede pasar de 1000 caracteres.' })
  note?: string | null;

  @ValidateIf(present)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de seguimiento debe ser AAAA-MM-DD.',
  })
  @IsISO8601({ strict: true }, { message: 'Fecha de seguimiento no válida.' })
  followUpOn?: string | null;
}
