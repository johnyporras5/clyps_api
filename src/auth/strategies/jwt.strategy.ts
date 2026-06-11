import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from '../services/token_blacklist.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET') || 'clypsSecretKey',
      passReqToCallback: true, // Necesario para acceder al request
    });
  }

  async validate(request: Request, payload: any) {
    // Verificar si el token está en la blacklist
    const authHeader = request.headers['authorization'];
    const token = this.tokenBlacklistService.extractTokenFromHeader(authHeader);

    if (token) {
      const isBlacklisted =
        await this.tokenBlacklistService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token inválido o sesión expirada');
      }
    }

    return {
      sub: payload.sub,
      email: payload.email,
      userType: payload.userType,
      // Claims de empresa para tiempo real (CLYP-247). Pueden venir null en
      // tokens "viejos" emitidos antes de este cambio; el Gateway (CLYP-240)
      // resuelve ese caso con el fallback a BD.
      companyId: payload.companyId ?? null,
      companyWorkerId: payload.companyWorkerId ?? null,
    };
  }
}
