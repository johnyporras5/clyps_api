import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { TokenBlacklistService } from '../services/token_blacklist.service';
import type { JwtPayload } from '../types/authenticated-request';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true, // Necesario para acceder al request
    });
  }

  async validate(request: Request, payload: JwtPayload) {
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

    // OJO: lo que se devuelve aquí es EXACTAMENTE lo que verá `req.user`, y es
    // una lista cerrada. Un claim que esté firmado dentro del token pero no
    // aparezca en este objeto se pierde sin avisar: ni error ni log, solo un
    // `undefined` en el guard que lo esperaba. Al añadir un claim nuevo al
    // payload hay que añadirlo TAMBIÉN aquí.
    return {
      sub: payload.sub,
      email: payload.email,
      userType: payload.userType,
      // Claims de empresa para tiempo real (CLYP-247). Pueden venir null en
      // tokens "viejos" emitidos antes de este cambio; el Gateway (CLYP-240)
      // resuelve ese caso con el fallback a BD.
      companyId: payload.companyId ?? null,
      companyWorkerId: payload.companyWorkerId ?? null,
      // Suplantación (CLYP-IMP): presentes SOLO en un token emitido por
      // ImpersonationService. `act` dice qué persona real está detrás de una
      // sesión que, por lo demás, es la del dueño del salón. Si se cayeran
      // aquí, la app no podría pintar el aviso y el "salir de la suplantación"
      // se quedaría sin saber qué sesión cerrar.
      ...(payload.act ? { act: payload.act } : {}),
      ...(payload.imp ? { imp: payload.imp } : {}),
    };
  }
}
