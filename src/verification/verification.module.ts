import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationService } from './verification.service';
import { UserVerificationCodes } from '../user-verification-codes/entities/user-verification-codes.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserVerificationCodes, User])],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
