import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { TokenBlacklistService } from '../auth/services/token_blacklist.service';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from './realtime.service';
import {
  userRoom,
  clientRoom,
  workerRoom,
  companyRoom,
  companyPublicRoom,
} from './rooms';

/** Datos del usuario autenticado que adjuntamos al socket tras el handshake. */
interface SocketUser {
  userId: number;
  email: string;
  userType: 'adm' | 'wrk' | 'cli';
  companyId: number | null;
  companyWorkerId: number | null;
}

type AuthenticatedSocket = Socket & { user?: SocketUser };

@WebSocketGateway({
  cors: { origin: '*' },
  // namespace por defecto '/'
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly authService: AuthService,
    private readonly realtimeService: RealtimeService,
  ) {}

  // ==================== INIT ====================
  afterInit(server: Server): void {
    // El service de emisión necesita el server para poder emitir desde los
    // services de dominio (citas, reseñas, etc.).
    this.realtimeService.setServer(server);
    this.setupRedisAdapter(server);
    this.logger.log('RealtimeGateway inicializado');
  }

  /**
   * Punto de integración de Redis (CLYP-240).
   *
   * Hoy la API es de INSTANCIA ÚNICA → corre en memoria, sin Redis.
   * DEUDA TÉCNICA: cuando se escale a multi-instancia, setear REDIS_URL e
   * instalar `@socket.io/redis-adapter` + `ioredis`, y descomentar el bloque.
   * No requiere reescribir el Gateway, solo activar el adapter aquí.
   *
   *   import { createAdapter } from '@socket.io/redis-adapter';
   *   import { Redis } from 'ioredis';
   *   const pub = new Redis(redisUrl);
   *   const sub = pub.duplicate();
   *   server.adapter(createAdapter(pub, sub));
   */
  private setupRedisAdapter(_server: Server): void {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL no definido: WebSockets en memoria (instancia única). ' +
          'Deuda técnica: requiere @socket.io/redis-adapter para multi-instancia.',
      );
      return;
    }
    // Si algún día se define REDIS_URL sin haber cableado el adapter, avisamos
    // en vez de fallar silenciosamente.
    this.logger.warn(
      'REDIS_URL definido pero el adapter de Redis no está cableado. ' +
        'Instala @socket.io/redis-adapter + ioredis y activa el bloque en setupRedisAdapter().',
    );
  }

  // ==================== CONEXIÓN ====================
  async handleConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      const user = await this.authenticate(socket);
      socket.user = user;
      await this.joinDefaultRooms(socket, user);
      this.logger.log(
        `Socket ${socket.id} conectado (user=${user.userId}, type=${user.userType})`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'desconocido';
      this.logger.warn(`Socket ${socket.id} rechazado: ${reason}`);
      socket.emit('auth_error', { message: reason });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: AuthenticatedSocket): void {
    // socket.io saca al socket de todas sus rooms automáticamente.
    this.logger.log(`Socket ${socket.id} desconectado`);
  }

  // ==================== AUTENTICACIÓN DEL HANDSHAKE ====================
  /**
   * Valida el JWT que viene en `socket.handshake.auth.token` reusando el mismo
   * secret y la blacklist del flujo REST. Token inválido/expirado/blacklisted
   * → lanza, y handleConnection desconecta.
   */
  private async authenticate(socket: Socket): Promise<SocketUser> {
    const token = this.extractToken(socket);
    if (!token) {
      throw new Error('Token no provisto');
    }

    // Verifica firma y expiración (lanza si es inválido/expirado).
    let payload: any;
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET') || 'clypsSecretKey',
      });
    } catch {
      throw new Error('Token inválido o expirado');
    }

    // Token deslogueado / invalidado.
    const isBlacklisted =
      await this.tokenBlacklistService.isTokenBlacklisted(token);
    if (isBlacklisted) {
      throw new Error('Token invalidado (sesión cerrada)');
    }

    const userType = payload.userType as SocketUser['userType'];
    let companyId: number | null = payload.companyId ?? null;
    let companyWorkerId: number | null = payload.companyWorkerId ?? null;

    // Fallback (b) de CLYP-247: token "viejo" sin claims de empresa →
    // los resolvemos una sola vez por BD para admin/worker.
    if (
      (userType === 'adm' || userType === 'wrk') &&
      companyId === null &&
      payload.sub
    ) {
      const claims = await this.authService.buildCompanyClaims({
        id: payload.sub,
        userType,
      });
      companyId = claims.companyId;
      companyWorkerId = claims.companyWorkerId;
    }

    return {
      userId: payload.sub,
      email: payload.email,
      userType,
      companyId,
      companyWorkerId,
    };
  }

  /** Lee el token del handshake (auth.token) o, como respaldo, del header. */
  private extractToken(socket: Socket): string | null {
    const fromAuth = socket.handshake?.auth?.token;
    if (typeof fromAuth === 'string' && fromAuth.length > 0) {
      return fromAuth.replace(/^Bearer\s+/i, '');
    }
    const header = socket.handshake?.headers?.authorization;
    return this.tokenBlacklistService.extractTokenFromHeader(header);
  }

  // ==================== ROOMS ====================
  private async joinDefaultRooms(
    socket: Socket,
    user: SocketUser,
  ): Promise<void> {
    // Todos entran a su room personal.
    await socket.join(userRoom(user.userId));

    if (user.userType === 'cli') {
      await socket.join(clientRoom(user.userId));
    }

    if (user.userType === 'wrk') {
      if (user.companyWorkerId !== null) {
        await socket.join(workerRoom(user.companyWorkerId));
      }
      // Worker es MIEMBRO de la empresa → room privada.
      if (user.companyId !== null) {
        await socket.join(companyRoom(user.companyId));
      }
    }

    if (user.userType === 'adm' && user.companyId !== null) {
      // Admin es MIEMBRO de la empresa → room privada.
      await socket.join(companyRoom(user.companyId));
    }
  }

  // ==================== JOIN/LEAVE DINÁMICO (CANAL PÚBLICO) ====================
  /**
   * Cualquier autenticado puede ver el canal PÚBLICO de una empresa.
   * Los payloads del canal público NUNCA incluyen datos de clientes
   * (se hace cumplir al emitir, en las tareas de dominio 241+).
   */
  /**
   * Extrae el companyId del cuerpo del mensaje de forma tolerante al formato
   * con que lo envíe el cliente (objeto `{companyId}`, JSON serializado como
   * string, número/string crudo, o el primer elemento si llega como array).
   * Herramientas como Postman a veces serializan el payload distinto.
   */
  private extractCompanyId(body: any): number {
    let b: any = body;
    if (Array.isArray(b)) b = b[0];
    if (typeof b === 'string') {
      const trimmed = b.trim();
      try {
        b = JSON.parse(trimmed);
      } catch {
        return Number(trimmed);
      }
    }
    if (typeof b === 'number') return b;
    if (b && typeof b === 'object') return Number(b.companyId);
    return Number(b);
  }

  @SubscribeMessage('joinCompanyPublic')
  async onJoinCompanyPublic(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: any,
  ): Promise<{ ok: boolean; room?: string; error?: string }> {
    if (!socket.user) return { ok: false, error: 'No autenticado' };
    const companyId = this.extractCompanyId(body);
    if (!companyId || Number.isNaN(companyId)) {
      return { ok: false, error: 'companyId requerido' };
    }

    const room = companyPublicRoom(companyId);
    await socket.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage('leaveCompanyPublic')
  async onLeaveCompanyPublic(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: any,
  ): Promise<{ ok: boolean; room?: string; error?: string }> {
    if (!socket.user) return { ok: false, error: 'No autenticado' };
    const companyId = this.extractCompanyId(body);
    if (!companyId || Number.isNaN(companyId)) {
      return { ok: false, error: 'companyId requerido' };
    }

    const room = companyPublicRoom(companyId);
    await socket.leave(room);
    return { ok: true, room };
  }

  /**
   * Join EXPLÍCITO a la room PRIVADA de una empresa.
   * Autorización: un CLIENTE nunca puede entrar; solo admin/worker que sean
   * miembros de ESA empresa (su companyId del token debe coincidir).
   */
  @SubscribeMessage('joinCompanyPrivate')
  async onJoinCompanyPrivate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() body: any,
  ): Promise<{ ok: boolean; room?: string; error?: string }> {
    const user = socket.user;
    if (!user) return { ok: false, error: 'No autenticado' };

    const companyId = this.extractCompanyId(body);
    if (!companyId || Number.isNaN(companyId)) {
      return { ok: false, error: 'companyId requerido' };
    }

    // Cliente NUNCA accede al canal privado.
    if (user.userType === 'cli') {
      return { ok: false, error: 'Acceso denegado al canal privado' };
    }

    // Admin/worker solo a SU empresa.
    if (user.companyId !== companyId) {
      return { ok: false, error: 'No eres miembro de esta empresa' };
    }

    const room = companyRoom(companyId);
    await socket.join(room);
    return { ok: true, room };
  }
}
