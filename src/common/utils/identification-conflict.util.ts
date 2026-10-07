import {
  BadRequestException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Worker } from '../../worker/entities/worker.entity';
import { Client } from '../../client/entities/client.entity';
import { CompanyWorker } from '../../company_worker/entities/company_worker.entity';
import { withoutLegacyIdentityCompanies } from './legacy-identity.util';

/**
 * La cédula/RIF de un cliente no se repite dentro de un mismo salón: dos
 * clientes del mismo negocio con la misma identidad son la misma persona
 * cargada dos veces. Entre salones distintos sí puede repetirse (un cliente va
 * a varios salones y se vincula).
 *
 * La de un trabajador no se repite en todo CLYPS: un trabajador pertenece a un
 * solo salón, así que la misma cédula activa en otro salón es otra ficha de la
 * misma persona.
 *
 * No hay índice único que lo cubra porque el salón de un trabajador vive en
 * `company_worker` (y al eliminarlo la ficha queda con su cédula) y el de un
 * cliente en el JSON `client.companies`; por eso se valida aquí, antes de
 * guardar.
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

/**
 * `companyIds` son los salones de quien se crea o edita: si el repetido está
 * en uno de ellos sale el aviso de siempre ("en este salón"); si está en otro,
 * uno propio que no dice cuál, para no mostrarle a un salón datos de otro.
 *
 * Solo cuentan los trabajadores que siguen en algún salón: eliminar a alguien
 * borra su fila de `company_worker` pero deja la ficha con su cédula, y esa
 * persona tiene que poder entrar a trabajar en otro salón.
 */
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
    .select('cw.company_id', 'companyId')
    .where('worker.identification = :identification', { identification })
    .andWhere('cw.permanently_deleted = 0');
  if (excludeWorkerId) {
    qb.andWhere('worker.id <> :excludeWorkerId', { excludeWorkerId });
  }

  const taken = await qb.getRawMany<{ companyId: number | string }>();
  if (taken.length === 0) return;

  if (taken.some((row) => companyIds.includes(Number(row.companyId)))) {
    throw conflict(identification, 'trabajador');
  }
  throw new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    error: 'Conflict',
    code: 'WORKER_IDENTIFICATION_IN_OTHER_COMPANY',
    message: `La cédula o RIF ${identification} ya está registrada como trabajador en otro salón.`,
  });
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

/**
 * La cédula de un trabajador o cliente se puede cambiar, pero no quitar: es
 * obligatoria al crearlo y lo que lo identifica en el salón (sin correo, lo
 * único). Las fichas de antes que nunca tuvieron una se siguen guardando sin
 * pedirla; solo se frena que una cédula que ya existe quede vacía.
 *
 * `incoming` llega del DTO (`IdentificationField`), donde vacía es `null`.
 */
export function assertIdentificationNotRemoved(
  current: string | null | undefined,
  incoming: string | null | undefined,
): void {
  if (incoming !== null && incoming !== '') return;
  if (!current) return;
  throw new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    code: 'IDENTIFICATION_CANNOT_BE_REMOVED',
    message: 'La cédula o RIF se puede cambiar, pero no quitar.',
  });
}
