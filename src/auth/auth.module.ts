import { Module, forwardRef } from '@nestjs/common';
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
import { SiteCategoryModule } from 'src/site_category/site_category.module';
import { OnboardingModule } from 'src/onboarding/onboarding.module';
import { Service } from 'src/service/entities/service.entity';
import { ServiceCategory } from 'src/service_category/entities/service_category.entity';
import { CompanyCategory } from 'src/company_category/entities/company_category.entity';
import { CompanyFeedback } from 'src/company_feedback/entities/company_feedback.entity';
import { WorkerFeedback } from 'src/worker_feedback/entities/worker_feedback.entity';
import { ServiceFeedback } from 'src/service_feedback/entities/service_feedback.entity';
import { Session } from 'src/session/entities/session.entity';
import { SessionDetail } from 'src/session_detail/entities/session_detail.entity';
import { SiteCategory } from 'src/site_category/entities/site_category.entity';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Worker,
      Client,
      BlacklistedToken,
      Company,
      CompanyWorker,
      CalendarCompany,
      Service,
      ServiceCategory,
      CompanyCategory,
      CompanyFeedback,
      WorkerFeedback,
      ServiceFeedback,
      Session,
      SessionDetail,
      SiteCategory,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        // Sin fallback: si falta JWT_SECRET la app debe fallar al arrancar,
        // nunca arrancar con un secreto predecible.
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // Acepta JWT_EXPIRATION (.env.example) o JWT_EXPIRES_IN (.env actual).
          expiresIn:
            configService.get('JWT_EXPIRATION') ??
            configService.get('JWT_EXPIRES_IN') ??
            '24h',
        },
      }),
      inject: [ConfigService],
    }),

    EmailModule,
    VerificationModule,
    CommonModule,
    CompanyCategoryModule,
    SiteCategoryModule,
    OnboardingModule,
    // forwardRef: RealtimeModule importa AuthModule (Gateway usa AuthService).
    forwardRef(() => RealtimeModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, TokenBlacklistService, CompanyService],
  exports: [AuthService, JwtStrategy, PassportModule, TokenBlacklistService],
})
export class AuthModule {}
