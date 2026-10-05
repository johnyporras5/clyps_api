import { ConflictException, HttpStatus } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Client } from '../../client/entities/client.entity';
import { CompanyWorker } from '../../company_worker/entities/company_worker.entity';
import { withoutLegacyIdentityCompanies } from './legacy-identity.util';

/**
 * La cédula/RIF no se repite dentro de un mismo salón: dos trabajadores o dos
 * clientes del mismo negocio con la misma identidad son la misma persona
 * cargada dos veces. Entre salones distintos sí puede repetirse.
 *
 * No hay índice único que lo cubra porque el salón de un trabajador vive en
 * `company_worker` y el de un cliente en el JSON `client.companies`; por eso se
 * valida aquí, antes de guardar.
 *
 * `identification` llega ya normalizada por el DTO (`IdentificationField`).
 * Vacía o `null` no choca con nada. Los salones excluidos del cambio
 * (legacy-identity.util.ts) no cuentan: allí la cédula no se usa.
 */
function conflict(
  identification: string,
  who: 'trabajador' | 'cliente',
): ConflictException {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    code: 'IDENTIFICATION_ALREADY_IN_COMPANY',
    message: `Ya hay un ${who} con la cédula o RIF ${identification} en este salón.`,
  });
}

export async function assertWorkerIdentificationFree(
  workers: Repository<Worker>,
  identification: string | null | undefined,
  companyIds: number[],
  excludeWorkerId?: number,
): Promise<void> {
  companyIds = withoutLegacyIdentityCompanies(companyIds);
  if (!identification || companyIds.length === 0) return;

  const qb = workers
    .createQueryBuilder('worker')
    .innerJoin(CompanyWorker, 'cw', 'cw.worker_id = worker.id')
    .where('worker.identification = :identification', { identification })
    .andWhere('cw.company_id IN (:...companyIds)', { companyIds });
  if (excludeWorkerId) {
    qb.andWhere('worker.id <> :excludeWorkerId', { excludeWorkerId });
  }

  if (await qb.getExists()) throw conflict(identification, 'trabajador');
}

/**
 * Cuenta también a los clientes que el salón eliminó: siguen en `companies`
 * (eliminar solo los marca en `inactive_companies`) y se pueden reactivar, así
 * que crear otro con la misma cédula sería duplicarlo.
 */
export async function assertClientIdentificationFree(
  clients: Repository<Client>,
  identification: string | null | undefined,
  companyIds: number[],
  excludeClientId?: number,
): Promise<void> {
  companyIds = withoutLegacyIdentityCompanies(companyIds);
  if (!identification || companyIds.length === 0) return;

  const inAnyCompany = companyIds
    .map(
      (_, i) =>
        `JSON_CONTAINS(COALESCE(client.companies, JSON_ARRAY()), :idCid${i})`,
    )
    .join(' OR ');

  const qb = clients
    .createQueryBuilder('client')
    .where('client.identification = :identification', { identification })
    .andWhere('client.permanently_deleted = 0')
    .andWhere(`(${inAnyCompany})`);
  companyIds.forEach((companyId, i) => {
    qb.setParameter(`idCid${i}`, JSON.stringify(companyId));
  });
  if (excludeClientId) {
    qb.andWhere('client.id <> :excludeClientId', { excludeClientId });
  }

  if (await qb.getExists()) throw conflict(identification, 'cliente');
}
