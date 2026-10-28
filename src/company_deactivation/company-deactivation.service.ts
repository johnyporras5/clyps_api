import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Company } from '../company/entities/company.entity';
import { Session } from '../session/entities/session.entity';
import { SessionDetail } from '../session_detail/entities/session_detail.entity';
import { Service } from '../service/entities/service.entity';
import { ImpersonationService } from '../auth/services/impersonation.service';
import { RealtimeService } from '../realtime/realtime.service';
import { companyRoom } from '../realtime/rooms';
import { CobrixInvoiceService } from '../subscription/cobrix/cobrix-invoice.service';
import { DeactivatedCompaniesService } from './deactivated-companies.service';
import {
  CANCELLABLE_SESSION_STATUSES,
  COMPANY_DEACTIVATED_MESSAGE,
  COMPANY_DEACTIVATED_REASON,
  DEACTIVATION_CANCEL_REASON,
} from './company-deactivation.util';

/** Lo que el panel recibe al desactivar o reactivar. */
export interface CompanyDeactivationResponse {
  companyId: number;
  companyName: string | null;
  active: boolean;
  deactivatedAt: Date | null;
  deactivatedBy: number | null;
  deactivationReason: string | null;
  /** Citas canceladas en ESTA llamada (0 si ya estaba desactivado). */
  cancelledSessions: number;
  /** Cobros de Cobrix anulados en esta llamada (referencias). */
  cancelledInvoices: string[];
  /**
   * Cobros de Cobrix que siguen vivos y hay que mirar a mano: o Cobrix no
   * confirmó la anulación, o tenían un pago en revisión y no se tocaron.
   */
  invoicesToReview: string[];
  message: string;
}

/**
 * Desactivar y reactivar un salón (el botón del panel `padm`).
 *
 * Desactivar NO borra nada. Hace tres cosas:
 *   1. Marca `company.deactivated_at`. Desde ahí, las puertas que consultan
 *      `DeactivatedCompaniesService` (login, cada petición, tiempo real,
 *      correos, push, reserva pública, directorio) quedan cerradas.
 *   2. Cancela en silencio las citas que todavía no empezaron
 *      (`CANCELLABLE_SESSION_STATUSES`). Sin correo ni push a nadie: se hace
 *      con UPDATE directo, que no pasa por los avisos de cancelación.
 *   3. Anula sus cobros abiertos en Cobrix. Cobrix manda sus propios correos
 *      (el recibo al pagar) por fuera de nuestro servidor; sin factura que
 *      pagar, no hay recibo que mandar.
 *   4. Saca a quien estaba dentro: cierra los accesos de suplantación abiertos
 *      y desconecta los WebSockets del salón.
 *
 * 1 y 2 van en la misma transacción: o queda desactivado con sus citas
 * canceladas, o no queda nada a medias. 3 y 4 van después y son de mejor
 * esfuerzo: si Cobrix no responde, el salón queda desactivado igual y la
 * factura se devuelve en `invoicesToReview` para anularla a mano.
 */
@Injectable()
export class CompanyDeactivationService {
  private readonly logger = new Logger(CompanyDeactivationService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly impersonation: ImpersonationService,
    private readonly realtime: RealtimeService,
    private readonly deactivated: DeactivatedCompaniesService,
    private readonly cobrixInvoices: CobrixInvoiceService,
  ) {}

  async deactivate(
    companyId: number,
    actorUserId: number,
    reason?: string | null,
  ): Promise<CompanyDeactivationResponse> {
    await this.findOrFail(companyId);
    const cleanReason = reason?.trim() || null;

    const cancelled = await this.dataSource.transaction(async (manager) => {
      // UPDATE condicional: dos clics seguidos (o dos operadores a la vez) no
      // pisan la fecha ni el autor de la primera desactivación, ni cancelan
      // dos veces.
      const claimed = await manager
        .createQueryBuilder()
        .update(Company)
        .set({
          deactivatedAt: new Date(),
          deactivatedBy: actorUserId,
          deactivationReason: cleanReason,
        })
        .where('id = :id AND deactivated_at IS NULL', { id: companyId })
        .execute();
      if (!claimed.affected) return null;

      return this.cancelPendingSessions(manager, companyId);
    });

    // Se relee la lista YA: sin esto, el dueño seguiría entrando hasta que
    // venciera la memoria de DeactivatedCompaniesService.
    await this.deactivated.refresh();

    if (cancelled === null) {
      const company = await this.findOrFail(companyId);
      return this.toResponse(company, {}, 'El salón ya estaba desactivado.');
    }

    const charges = await this.cancelOpenCharges(companyId);
    await this.kickOut(companyId);

    const company = await this.findOrFail(companyId);
    this.logger.warn(
      `Salón ${companyId} desactivado por el usuario ${actorUserId}` +
        ` (${cancelled} citas canceladas, ${charges.cancelledInvoices.length} cobros anulados).` +
        ` Motivo: ${cleanReason ?? '—'}`,
    );

    const parts = [
      cancelled > 0
        ? `Salón desactivado. Se cancelaron ${cancelled} citas pendientes sin avisar a nadie.`
        : 'Salón desactivado. No tenía citas pendientes.',
    ];
    if (charges.cancelledInvoices.length > 0)
      parts.push('Se anuló su cobro pendiente en Cobrix.');
    if (charges.invoicesToReview.length > 0)
      parts.push(
        `Revisa a mano en Cobrix: ${charges.invoicesToReview.join(', ')}.`,
      );

    return this.toResponse(
      company,
      { cancelledSessions: cancelled, ...charges },
      parts.join(' '),
    );
  }

  /**
   * Anula en Cobrix los cobros abiertos del salón (ver
   * `CobrixInvoiceService.releaseAllForCompany`). Si Cobrix falla, el salón
   * queda desactivado igual: lo que no se pudo anular vuelve en
   * `invoicesToReview` y queda un ERROR en el log.
   */
  private async cancelOpenCharges(companyId: number): Promise<{
    cancelledInvoices: string[];
    invoicesToReview: string[];
  }> {
    try {
      const result = await this.cobrixInvoices.releaseAllForCompany(
        companyId,
        'salón desactivado desde el panel',
      );
      return {
        cancelledInvoices: result.released,
        invoicesToReview: [...result.unconfirmed, ...result.skippedWithPayment],
      };
    } catch (error) {
      this.logger.error(
        `No se pudieron anular los cobros de Cobrix del salón ${companyId}: ${(error as Error).message}`,
      );
      return {
        cancelledInvoices: [],
        invoicesToReview: [
          'no se pudo consultar; revisa sus facturas abiertas',
        ],
      };
    }
  }

  /**
   * Vuelve a abrir todas las puertas. Las citas que se cancelaron al
   * desactivar se quedan canceladas: no se sabe si el cliente sigue contando
   * con ellas, y revivirlas sin avisarle sería peor.
   */
  async reactivate(companyId: number): Promise<CompanyDeactivationResponse> {
    await this.findOrFail(companyId);

    const result = await this.companies
      .createQueryBuilder()
      .update(Company)
      .set({
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      })
      .where('id = :id AND deactivated_at IS NOT NULL', { id: companyId })
      .execute();

    await this.deactivated.refresh();

    const company = await this.findOrFail(companyId);
    if (result.affected) {
      this.logger.warn(`Salón ${companyId} reactivado`);
    }
    return this.toResponse(
      company,
      {},
      result.affected
        ? 'Salón reactivado. El dueño y sus trabajadores ya pueden entrar.'
        : 'El salón ya estaba activo.',
    );
  }

  /**
   * Cancela las citas del salón que todavía no empezaron. El salón de una cita
   * sale de sus servicios (`session_detail → service.company_id`): la cita no
   * guarda el salón, y el trabajador puede faltar (estado 8, sin asignar).
   * Devuelve cuántas citas canceló.
   */
  private async cancelPendingSessions(
    manager: EntityManager,
    companyId: number,
  ): Promise<number> {
    const rows = await manager
      .createQueryBuilder(Session, 's')
      .select('s.id', 'id')
      .distinct(true)
      .innerJoin(SessionDetail, 'sd', 'sd.session_id = s.id')
      .innerJoin(Service, 'se', 'se.id = sd.service_id')
      .where('se.company_id = :companyId', { companyId })
      .andWhere('s.session_status IN (:...statuses)', {
        statuses: [...CANCELLABLE_SESSION_STATUSES],
      })
      .getRawMany<{ id: number | string }>();

    const sessionIds = rows.map((r) => Number(r.id));
    if (sessionIds.length === 0) return 0;

    await manager
      .createQueryBuilder()
      .update(Session)
      .set({
        sessionStatus: 5,
        cancelledBy: 'system',
        cancellationReason: DEACTIVATION_CANCEL_REASON,
      })
      .whereInIds(sessionIds)
      .execute();

    // Solo los servicios que seguían vivos: uno que el cliente ya había
    // cancelado conserva su motivo y quién lo canceló.
    await manager
      .createQueryBuilder()
      .update(SessionDetail)
      .set({
        status: 5,
        cancelledBy: 'system',
        cancelReason: DEACTIVATION_CANCEL_REASON,
      })
      .where('sessionId IN (:...sessionIds)', { sessionIds })
      .andWhere('(status IS NULL OR status <> 5)')
      .execute();

    return sessionIds.length;
  }

  /** Saca a quien estaba dentro del salón en este momento. */
  private async kickOut(companyId: number): Promise<void> {
    try {
      const closed = await this.impersonation.revokeForCompany(companyId);
      if (closed > 0) {
        this.logger.log(
          `Salón ${companyId}: ${closed} accesos de soporte cerrados`,
        );
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron cerrar los accesos de soporte del salón ${companyId}: ${(error as Error).message}`,
      );
    }

    try {
      // El aviso va antes de cortar, para que la app pueda salir a la pantalla
      // de inicio con el mensaje en vez de quedarse "reconectando".
      const room = companyRoom(companyId);
      this.realtime.emitToRooms(room, 'company.deactivated', {
        companyId,
        reason: COMPANY_DEACTIVATED_REASON,
        message: COMPANY_DEACTIVATED_MESSAGE,
      });
      this.realtime.disconnectRoom(room);
    } catch (error) {
      this.logger.error(
        `No se pudo desconectar el tiempo real del salón ${companyId}: ${(error as Error).message}`,
      );
    }
  }

  private async findOrFail(companyId: number): Promise<Company> {
    const company = await this.companies.findOne({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        deactivatedAt: true,
        deactivatedBy: true,
        deactivationReason: true,
      },
    });
    if (!company) throw new NotFoundException('El salón no existe.');
    return company;
  }

  private toResponse(
    company: Company,
    {
      cancelledSessions = 0,
      cancelledInvoices = [],
      invoicesToReview = [],
    }: {
      cancelledSessions?: number;
      cancelledInvoices?: string[];
      invoicesToReview?: string[];
    },
    message: string,
  ): CompanyDeactivationResponse {
    return {
      companyId: company.id,
      companyName: company.name ?? null,
      active: !company.deactivatedAt,
      deactivatedAt: company.deactivatedAt ?? null,
      deactivatedBy: company.deactivatedBy ?? null,
      deactivationReason: company.deactivationReason ?? null,
      cancelledSessions,
      cancelledInvoices,
      invoicesToReview,
      message,
    };
  }
}
