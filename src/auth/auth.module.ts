import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../user/entities/user.entity';
import { Worker } from '../worker/entities/worker.entity';
import { Client } from 'src/client/entities/client.entity';
import { EmailModule } from '../email/email.module';
import { VerificationModule } from '../verification/verification.module';
import { BlacklistedToken } from './entities/blacklisted_token.entity';
import { TokenBlacklistService } from './services/token_blacklist.service';
import { Company } from 'src/company/entities/company.entity';
import { CompanyService } from 'src/company/company.service';
import { CompanyWorker } from 'src/company_worker/entities/company_worker.entity';
import { CommonModule } from '../common/common.module';
import { CalendarCompany } from 'src/calendar_company/entities/calendar-company.entity';
import { CompanyCategoryModule } from 'src/company_category/company_category.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([User, Worker, Client, BlacklistedToken, Company, CompanyWorker, CalendarCompany]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'clypsSecretKey',
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '24h'
        },
      }),
      inject: [ConfigService],
    }),

    EmailModule,
    VerificationModule,
    CommonModule,
    CompanyCategoryModule
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenBlacklistService, CompanyService],
  exports: [AuthService, JwtStrategy, PassportModule, TokenBlacklistService],
})
export class AuthModule { }