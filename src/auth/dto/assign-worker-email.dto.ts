import { IsEmail, IsNotEmpty } from 'class-validator';

export class AssignWorkerEmailDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
