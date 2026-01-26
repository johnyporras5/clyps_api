import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { VerificationService } from './verification.service';
import { UserVerificationCodesModule } from '../user-verification-codes/user-verification-codes.module';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ConfigModule,
    UserVerificationCodesModule,
  ],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}