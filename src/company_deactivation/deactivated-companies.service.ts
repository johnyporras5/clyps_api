import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { CompanyWorker } from '../company_worker/entities/company_worker.entity';
import { User } from '../user/entities/user.entity';
import { isSilencedByMemberships } from './company-deactivation.util';

/**
 * Cada cuánto se vuelve a leer la lista de salones desactivados. El botón del
 * panel la refresca al instante en este proceso; el plazo solo cubre los
 * cambios hechos por fuera (un UPDATE a mano en la base) y una segunda
 * instancia del API si algún día la hay.
 */
const CACHE_TTL_MS = 30_000;

/** Si la lectura falla, se reintenta pronto en vez de esperar el plazo entero. */
const RETRY_AFTER_ERROR_MS = 5_000;

/** Quien pregunta por una sesión: lo justo del token. */
export interface SessionOwner {
  sub: number;
  userType?: string | null;
  companyId?: number | null;
}

/**
 * La ÚNICA respuesta a "¿este salón / esta persona está desactivada?".
 *
 * La consultan el login, cada petición autenticada (JwtStrategy), el tiempo
 * real, los correos y los push. Por eso no pregunta a la base cada vez: guarda
 * en memoria el conjunto de ids desactivados, que son pocos, y lo relee cada
 * 30 s. Cuando ese conjunto está vacío —lo normal— todo lo demás sale sin tocar
 * la base.
 *
 * Es de solo lectura y no depende de ningún otro módulo del dominio a
 * propósito: AuthModule, EmailModule y NotificationModule lo inyectan, y si
 * importara cualquiera de ellos se formaría un ciclo.
 */
@Injectable()
export class DeactivatedCompaniesService {
  private readonly logger = new Logger(DeactivatedCompaniesService.name);

  private ids: Set<number> = new Set();
  private expiresAt = 0;
  private pending: Promise<Set<number>> | null = null;
  /**
   * Número de la última lectura lanzada. Una lectura vieja que termina tarde
   * no pisa a una más nueva: si el panel desactiva un salón mientras había una
   * lectura en curso, esa lectura no sabe nada del cambio.
   */
  private launched = 0;
  private applied = 0;

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(CompanyWorker)
    private readonly companyWorkers: Repository<CompanyWorker>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Ids de los salones desactivados, desde la memoria si está al día. */
  async deactivatedIds(): Promise<ReadonlySet<number>> {
    if (Date.now() < this.expiresAt) return this.ids;
    // Muchas peticiones a la vez con la memoria vencida comparten UNA lectura.
    this.pending ??= this.load().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Relee ya, sin esperar el plazo. La llama el botón del panel. */
  async refresh(): Promise<ReadonlySet<number>> {
    return this.load();
  }

  async isCompanyDeactivated(
    companyId: number | null | undefined,
  ): Promise<boolean> {
    if (companyId === null || companyId === undefined) return false;
    return (await this.deactivatedIds()).has(Number(companyId));
  }

  /**
   * ¿Esta persona se quedó sin ningún salón activo? (ver
   * `isSilencedByMemberships`). Clientes y cuentas sin salón: nunca.
   */
  async isUserSilenced(userId: number | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const ids = await this.deactivatedIds();
    if (ids.size === 0) return false;
    return isSilencedByMemberships(await this.membershipsOf(userId), ids);
  }

  /**
   * ¿Este correo es de alguien silenciado? Primero se busca la cuenta con ese
   * correo; si no hay ninguna, el correo del propio salón (`company.email`,
   * que es el de facturación y puede no coincidir con el del dueño).
   */
  async isEmailSilenced(email: string | null | undefined): Promise<boolean> {
    const address = email?.trim();
    if (!address) return false;
    const ids = await this.deactivatedIds();
    if (ids.size === 0) return false;

    const owners = await this.users.find({
      where: { email: address },
      select: { id: true },
    });
    if (owners.length > 0) {
      for (const owner of owners) {
        if (!(await this.isUserSilenced(owner.id))) return false;
      }
      return true;
    }

    const companies = await this.companies.find({
      where: { email: address },
      select: { id: true },
    });
    return isSilencedByMemberships(
      companies.map((c) => c.id),
      ids,
    );
  }

  /**
   * ¿Hay que cortar esta sesión? Solo afecta a dueños y trabajadores: el
   * cliente no pertenece a un salón y el `padm` los cruza todos.
   *
   * Si el token trae el salón, manda ese salón: el trabajador de dos salones
   * con un token del desactivado tiene que volver a entrar, y al hacerlo el
   * login le da el otro. Un token viejo sin salón se decide por la persona.
   */
  async isSessionBlocked(owner: SessionOwner): Promise<boolean> {
    if (owner.userType !== 'adm' && owner.userType !== 'wrk') return false;
    if (owner.companyId !== null && owner.companyId !== undefined) {
      return this.isCompanyDeactivated(owner.companyId);
    }
    return this.isUserSilenced(owner.sub);
  }

  /** Salones de esta persona: los que tiene como dueño y donde trabaja activa. */
  private async membershipsOf(userId: number): Promise<number[]> {
    const [owned, worked] = await Promise.all([
      this.companies.find({ where: { userId }, select: { id: true } }),
      this.companyWorkers.find({
        where: { userId, isActive: 1 },
        select: { id: true, companyId: true },
      }),
    ]);
    return [
      ...new Set([
        ...owned.map((c) => c.id),
        ...worked.map((w) => w.companyId),
      ]),
    ];
  }

  private async load(): Promise<Set<number>> {
    const seq = ++this.launched;
    try {
      const rows = await this.companies.find({
        where: { deactivatedAt: Not(IsNull()) },
        select: { id: true },
      });
      if (seq > this.applied) {
        this.applied = seq;
        this.ids = new Set(rows.map((r) => r.id));
        this.expiresAt = Date.now() + CACHE_TTL_MS;
      }
    } catch (error) {
      // Se sigue con la última lista conocida. Tumbar todas las peticiones
      // porque esta lectura falló sería peor que dejar pasar unos segundos a
      // alguien desactivado.
      this.logger.warn(
        `No se pudo leer la lista de salones desactivados: ${(error as Error).message}`,
      );
      this.expiresAt = Date.now() + RETRY_AFTER_ERROR_MS;
    }
    return this.ids;
  }
}
