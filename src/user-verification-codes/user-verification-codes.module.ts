import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserVerificationCodesService } from './user-verification-codes.service';
import { UserVerificationCodes } from './entities/user-verification-codes.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserVerificationCodes])],
  providers: [UserVerificationCodesService],
  exports: [UserVerificationCodesService],
})
export class UserVerificationCodesModule {}