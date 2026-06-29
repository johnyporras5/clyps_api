import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateClientNoteDto {
  /** Cliente al que se le agrega la nota. */
  @IsInt()
  clientId: number;

  /** Texto de la nota. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note: string;
}
