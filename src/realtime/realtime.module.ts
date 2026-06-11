import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [
    // AuthModule exporta AuthService (buildCompanyClaims) y TokenBlacklistService.
    // forwardRef: AuthModule también importa RealtimeModule (AuthService emite
    // worker.added/client.added en CLYP-246) → dependencia circular resuelta.
    forwardRef(() => AuthModule),
    // JwtService para verificar el token del handshake con el mismo secret.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET') || 'clypsSecretKey',
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN') || '24h',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RealtimeGateway, RealtimeService],
  // RealtimeService se exporta para que los services de dominio lo inyecten.
  exports: [RealtimeService],
})
export class RealtimeModule {}
