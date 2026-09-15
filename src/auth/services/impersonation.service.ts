import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { User } from '../../user/entities/user.entity';
import { Company } from '../../company/entities/company.entity';
import { TokenBlacklistService } from './token_blacklist.service';
import {
  ImpersonationSession,
  type ImpersonationEndReason,
} from '../entities/impersonation_session.entity';
import type {
  AuthenticatedUser,
  JwtPayload,
} from '../types/authenticated-request';

/** Lo que el panel recibe al pulsar "Acceder". */
export interface StartImpersonationResult {
  sessionId: number;
  /** El vale. Viaja UNA vez, hasta la pestaña nueva, y se quema. */
  ticket: string;
  /** A dónde abrir la pestaña, ya montada. La arma el backend, no el panel. */
  redirectUrl: string;
  ticketExpiresInSeconds: number;
  sessionExpiresInMinutes: number;
  company: { id: number; name: string | null };
  targetUser: { id: number; email: string | null; username: string | null };
}

/** Lo que la app del salón recibe al canjear el vale. */
export interface ExchangeImpersonationResult {
  access_token: string;
  user: Partial<User>;
  company: { id: number; name: string | null };
  impersonation: {
    sessionId: number;
    /** Correo del operador real, para pintarlo en el aviso de la app. */
    actorEmail: string | null;
    expiresAt: string;
  };
}

/** Una fila de la lista de sesiones vivas del panel. */
export interface ActiveImpersonationSession {
  id: number;
  actorUserId: number;
  actorEmail: string | null;
  targetUserId: number;
  companyId: number;
  companyName: string | null;
  startedAt: string | null;
  expiresAt: string | null;
}

/** Ventana del vale. Corta de verdad: solo tiene que sobrevivir a un redirect. */
const DEFAULT_TICKET_TTL_SECONDS = 120;
/** Duración de la sesión suplantada. Sin refresco: cuando caduca, caducó. */
const DEFAULT_SESSION_TTL_MINUTES = 30;

/**
 * Acceso del administrador de la PLATAFORMA (`padm`) a un salón ajeno sin
 * conocer ni cambiar la contraseña del dueño (CLYP-IMP).
 *
 * La pieza central es que NO se reutiliza el token del dueño: se firma uno
 * NUEVO cuyo `sub` es el dueño —para que los módulos de negocio respondan
 * exactamente lo mismo que le responderían a él— pero que lleva además el
 * claim `act` con la identidad real del operador. Un token del dueño y un
 * token de suplantación son distinguibles siempre, en cualquier petición.
 *
 * El acceso se concede sin re-autenticar y con permisos completos de
 * escritura, por decisión de producto. Eso desplaza todo el peso a las dos
 * cosas que sí quedan: la fila de auditoría —que se escribe ANTES de entregar
 * nada— y la revocación, que funciona porque se archivó el hash del token.
 */
@Injectable()
export class ImpersonationService {
  constructor(
    @InjectRepository(ImpersonationSession)
    private readonly sessions: Repository<ImpersonationSession>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklist: TokenBlacklistService,
    private readonly config: ConfigService,
  ) {}

  private ticketTtlSeconds(): number {
    const raw = Number(this.config.get('IMPERSONATION_TICKET_TTL_SECONDS'));
    // Number('') es 0 y Number(undefined) es NaN: ambos tienen que caer al
    // valor por defecto, no dejar un vale que nace caducado.
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TICKET_TTL_SECONDS;
  }

  private sessionTtlMinutes(): number {
    const raw = Number(this.config.get('IMPERSONATION_TTL_MINUTES'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL_MINUTES;
  }

  private hashTicket(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }

  /**
   * A dónde mandar la pestaña nueva. Lo decide el BACKEND y no el panel: si lo
   * eligiera el navegador, bastaría con cambiar una variable del front para
   * enviar vales válidos a un dominio ajeno.
   */
  private redirectUrl(ticket: string): string {
    const base = String(this.config.get('IMPERSONATION_APP_URL') ?? '').trim();
    if (!base) {
      throw new ConflictException(
        'Falta configurar IMPERSONATION_APP_URL: el servidor no sabe a qué ' +
          'dirección de la app debe abrir la sesión del salón.',
      );
    }
    // encodeURIComponent aunque el vale sea base64url y hoy no tenga caracteres
    // raros: si mañana cambia el alfabeto, esto sigue generando una URL válida.
    const path = `/impersonate?t=${encodeURIComponent(ticket)}`;
    return `${base.replace(/\/+$/, '')}${path}`;
  }

  /**
   * Paso 1: el operador pulsa "Acceder". Se deja la fila de auditoría escrita y
   * se devuelve un vale de un solo uso. Aquí NO se emite ningún JWT todavía:
   * lo que viaja por la URL nunca puede ser el token bueno.
   */
  async start(
    actor: AuthenticatedUser,
    companyId: number,
    ip: string | null,
    userAgent: string | null,
  ): Promise<StartImpersonationResult> {
    // Sin encadenado: una sesión suplantada no abre otra. Hoy ya es imposible
    // por otro camino (el token suplantado lleva userType 'adm' y el RolesGuard
    // exige 'padm'), pero esa protección es indirecta: depende de un guard que
    // vive en otro archivo. Esta comprobación dice el "no" en voz alta y
    // aguanta aunque mañana cambie el rol que se firma en el token.
    if (actor.act) {
      throw new ForbiddenException(
        'No se puede abrir un acceso desde una sesión que ya es un acceso.',
      );
    }

    const company = await this.companies.findOne({
      where: { id: companyId },
      select: { id: true, name: true, userId: true },
    });
    if (!company) {
      throw new NotFoundException('El salón no existe.');
    }
    if (!company.userId) {
      throw new ConflictException(
        'Ese salón no tiene dueño asignado, así que no hay ninguna cuenta a la que entrar.',
      );
    }

    const target = await this.users.findOne({ where: { id: company.userId } });
    if (!target) {
      throw new ConflictException(
        'El salón apunta a un usuario que ya no existe.',
      );
    }
    // Un operador de la plataforma NUNCA se suplanta: sería escalar a los
    // permisos de otro `padm` sin su contraseña, y de ahí a todos los salones.
    if (target.userType === 'padm') {
      throw new ForbiddenException(
        'No se puede entrar como otro administrador de la plataforma.',
      );
    }
    if (target.userType !== 'adm') {
      throw new ConflictException(
        `El dueño del salón figura como "${target.userType ?? 'sin tipo'}" y no ` +
          'como administrador; revisa la cuenta antes de entrar.',
      );
    }

    const ticket = randomBytes(32).toString('base64url');
    const ttl = this.ticketTtlSeconds();

    // La URL se arma ANTES de guardar. `redirectUrl()` revienta si falta
    // IMPERSONATION_APP_URL, y hacerlo después dejaría una fila de acceso
    // con su vale vivo que nadie va a canjear nunca: basura en la bitácora
    // y, peor, un secreto válido flotando durante dos minutos.
    const redirectUrl = this.redirectUrl(ticket);

    // La fila se guarda ANTES de devolver el vale. Si el guardado falla, el
    // operador recibe un error y no entra: nunca hay acceso sin registro.
    const session = await this.sessions.save(
      this.sessions.create({
        actorUserId: actor.sub,
        actorEmail: actor.email ?? null,
        targetUserId: target.id,
        companyId: company.id,
        ticketHash: this.hashTicket(ticket),
        ticketExpiresAt: new Date(Date.now() + ttl * 1000),
        ip,
        // La columna son 255: un User-Agent largo reventaría el INSERT entero
        // y tumbaría el acceso por un dato que solo sirve de pista.
        userAgent: userAgent ? userAgent.slice(0, 255) : null,
      }),
    );

    return {
      sessionId: session.id,
      ticket,
      redirectUrl,
      ticketExpiresInSeconds: ttl,
      sessionExpiresInMinutes: this.sessionTtlMinutes(),
      company: { id: company.id, name: company.name ?? null },
      targetUser: {
        id: target.id,
        email: target.email ?? null,
        username: target.username ?? null,
      },
    };
  }

  /**
   * Paso 2: la app del salón cambia el vale por el token. El vale se quema
   * pase lo que pase — también si llega caducado o a una sesión ya revocada.
   */
  async exchange(ticket: string): Promise<ExchangeImpersonationResult> {
    const hash = this.hashTicket(ticket);

    // Todos los caminos de fallo dicen lo mismo. Distinguir "no existe" de "ya
    // se usó" de "caducado" le regala a quien pruebe vales al azar una señal
    // de cuáles llegaron a existir.
    const invalid = () =>
      new UnauthorizedException(
        'El enlace de acceso no es válido, ya se usó o ha caducado.',
      );

    const row = await this.sessions.findOne({ where: { ticketHash: hash } });
    if (!row) throw invalid();

    // El UPDATE condicional es lo que hace el vale de UN SOLO uso de verdad.
    // Dos pestañas que canjeen a la vez pasan las dos el findOne de arriba; es
    // aquí donde solo una se lleva `affected: 1`. Comprobarlo en memoria
    // (`if (row.ticketUsedAt)`) no serviría: esa ES la carrera.
    const consumed = await this.sessions
      .createQueryBuilder()
      .update(ImpersonationSession)
      .set({
        ticketHash: null,
        ticketUsedAt: new Date(),
        startedAt: new Date(),
      })
      .where('id = :id AND ticket_used_at IS NULL', { id: row.id })
      .execute();
    if (!consumed.affected) throw invalid();

    // Ya está quemado. A partir de aquí, cualquier motivo de rechazo deja el
    // vale inservible, que es justo lo que queremos.
    if (row.endedAt) throw invalid();
    if (row.ticketExpiresAt.getTime() < Date.now()) {
      await this.sessions.update(row.id, {
        endedAt: new Date(),
        endedReason: 'expired',
      });
      throw invalid();
    }

    // Se vuelve a leer el estado del salón y del dueño. Entre el "Acceder" y el
    // canje pasan segundos, pero en esos segundos la cuenta pudo cambiar de
    // tipo o el salón de dueño: el vale no es un cheque en blanco sobre una
    // foto vieja.
    const company = await this.companies.findOne({
      where: { id: row.companyId },
      select: { id: true, name: true, userId: true },
    });
    const target = await this.users.findOne({
      where: { id: row.targetUserId },
    });

    if (!company || !target || company.userId !== target.id) {
      await this.sessions.update(row.id, {
        endedAt: new Date(),
        endedReason: 'revoked',
      });
      throw new ConflictException(
        'El salón o su dueño cambiaron mientras se abría el acceso. Vuelve a intentarlo.',
      );
    }
    if (target.userType !== 'adm') {
      await this.sessions.update(row.id, {
        endedAt: new Date(),
        endedReason: 'revoked',
      });
      throw new ForbiddenException(
        'La cuenta dueña del salón ya no es un administrador.',
      );
    }

    const payload: JwtPayload = {
      // `sub` es el DUEÑO: así ningún endpoint de negocio necesita enterarse de
      // que esto es una suplantación para devolver los datos correctos.
      sub: target.id,
      email: target.email,
      userType: 'adm',
      // Fijado al salón que se pulsó, no deducido del dueño.
      companyId: company.id,
      companyWorkerId: null,
      // La persona real. Lo que convierte esto en una sesión delegada y no en
      // una suplantación anónima.
      act: { sub: row.actorUserId, email: row.actorEmail },
      imp: row.id,
    };

    const access_token = this.jwtService.sign(payload, {
      expiresIn: `${this.sessionTtlMinutes()}m`,
    });

    // `exp` se lee del token ya firmado en vez de recalcularlo a mano: si algún
    // día `expiresIn` cambia de sitio, la fecha guardada sigue siendo la real.
    const decoded: { exp?: number } | null =
      this.jwtService.decode(access_token);
    const expiresAt = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(Date.now() + this.sessionTtlMinutes() * 60 * 1000);

    await this.sessions.update(row.id, {
      tokenHash: this.tokenBlacklist.hashOf(access_token),
      tokenExpiresAt: expiresAt,
    });

    // OJO: aquí NO se toca `lastLogin`, al revés que en el login normal
    // (auth.service → login). Si se tocara, la columna "Último acceso" del
    // panel diría que entró el dueño cuando quien entró fue el operador.
    const { password: _password, ...userWithoutPassword } = target;

    return {
      access_token,
      user: userWithoutPassword,
      company: { id: company.id, name: company.name ?? null },
      impersonation: {
        sessionId: row.id,
        actorEmail: row.actorEmail,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  /**
   * Cerrar una sesión: invalida el token de verdad, no solo marca la fila.
   *
   * Idempotente: primero se "reclama" la fila con un UPDATE condicional y solo
   * quien se la lleva apunta en la blacklist. Dos clics seguidos en "Terminar"
   * no dejan dos filas basura.
   */
  private async finish(
    session: ImpersonationSession,
    reason: ImpersonationEndReason,
  ): Promise<{ message: string }> {
    const claimed = await this.sessions
      .createQueryBuilder()
      .update(ImpersonationSession)
      .set({ ticketHash: null, endedAt: new Date(), endedReason: reason })
      .where('id = :id AND ended_at IS NULL', { id: session.id })
      .execute();

    if (!claimed.affected) {
      return { message: 'La sesión ya estaba cerrada.' };
    }

    if (session.tokenHash && session.tokenExpiresAt) {
      // El token se apunta a nombre del OPERADOR, no del dueño. Si fuera a
      // nombre del dueño, un `forceLogoutUser(dueño)` posterior marcaría esta
      // fila como `clearedAt` y resucitaría el token suplantado.
      await this.tokenBlacklist.addHashToBlacklist(
        session.tokenHash,
        session.tokenExpiresAt.getTime(),
        session.actorUserId,
        `impersonation_${reason}`,
      );
    }

    return { message: 'Acceso cerrado.' };
  }

  /** El operador pulsa "Salir" dentro de la app del salón. */
  async endOwn(sessionId: number): Promise<{ message: string }> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Esa sesión no existe.');
    return this.finish(session, 'manual');
  }

  /** El operador corta una sesión desde el panel (la suya o la de otro). */
  async revoke(sessionId: number): Promise<{ message: string }> {
    const session = await this.sessions.findOne({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Esa sesión no existe.');
    return this.finish(session, 'revoked');
  }

  /**
   * Sesiones vivas ahora mismo. De paso cierra las que caducaron solas, para
   * que la lista no las arrastre y el historial diga por qué murió cada una
   * sin necesidad de un cron aparte.
   */
  async listActive(): Promise<ActiveImpersonationSession[]> {
    const now = new Date();

    await this.sessions
      .createQueryBuilder()
      .update(ImpersonationSession)
      .set({ endedAt: now, endedReason: 'expired', ticketHash: null })
      .where(
        'ended_at IS NULL AND token_expires_at IS NOT NULL AND token_expires_at <= :now',
        { now },
      )
      .execute();

    // `ticketUsedAt: Not(IsNull())` deja fuera los vales pedidos y nunca
    // canjeados: existen en la tabla pero no son una sesión abierta, y
    // ofrecerle al operador un botón "Terminar" para ellos solo confunde.
    const rows = await this.sessions.find({
      where: { endedAt: IsNull(), ticketUsedAt: Not(IsNull()) },
      order: { startedAt: 'DESC' },
      take: 200,
    });
    if (rows.length === 0) return [];

    // Una consulta para todos los nombres, no una por fila.
    const companies = await this.companies.find({
      where: { id: In([...new Set(rows.map((r) => r.companyId))]) },
      select: { id: true, name: true },
    });
    const nameById = new Map(companies.map((c) => [c.id, c.name ?? null]));

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorEmail: row.actorEmail,
      targetUserId: row.targetUserId,
      companyId: row.companyId,
      companyName: nameById.get(row.companyId) ?? null,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      expiresAt: row.tokenExpiresAt ? row.tokenExpiresAt.toISOString() : null,
    }));
  }
}
