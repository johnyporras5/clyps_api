/**
 * Eliminación lógica de clientes POR COMPAÑÍA.
 *
 * `client.is_active` es una sola columna global, así que cuando un salón
 * quitaba a un cliente lo dejaba fuera también en los demás salones donde ese
 * mismo cliente estaba. Para que sea de cada compañía se usa
 * `client.inactive_companies`: la lista de compañías que eliminaron a ESE
 * cliente.
 *
 * Esa columna nació para el toggle "Activo" y hoy significa ELIMINADO: el
 * salón deja de ver al cliente en su lista y el cliente deja de ver al salón.
 * No se renombró porque el comportamiento —ocultar la relación en ambos
 * sentidos sin borrar la fila— es exactamente el mismo; lo que cambió es el
 * nombre que se le da en la interfaz. `companies` NO se toca: es el historial
 * de con quién tuvo relación, y es lo que permite reconocer al cliente si el
 * salón lo vuelve a dar de alta para ofrecerle reactivarlo.
 *
 * La columna global `is_active` se conserva para los casos que no tienen
 * compañía de por medio (clientes creados por un usuario que aún no pertenecen
 * a ningún salón).
 */

/** Lo mínimo que hace falta de un cliente para resolver su estado. */
export interface ClientActivationState {
  isActive?: number | null;
  companies?: number[] | null;
  inactiveCompanies?: number[] | null;
}

/**
 * Normaliza la columna JSON a `number[]`. Puede llegar null (clientes previos a
 * la migración) o con ids en string según cómo se haya guardado el JSON.
 */
export function normalizeCompanyIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
    ),
  ];
}

/**
 * Negocios que este cliente ve: los suyos (`companies`, que se llena cuando un
 * negocio lo registra y cuando agenda una cita) menos los salones que lo
 * eliminaron. Es la MISMA regla en la búsqueda y en las ofertas: para él solo
 * existen los negocios con los que tiene relación viva.
 */
export function resolveVisibleCompanyIds(
  client: ClientActivationState,
): number[] {
  const inactive = normalizeCompanyIds(client.inactiveCompanies);
  return normalizeCompanyIds(client.companies).filter(
    (id) => !inactive.includes(id),
  );
}

/** ¿Este cliente está eliminado en esta compañía en concreto? */
export function isClientInactiveForCompany(
  client: ClientActivationState,
  companyId: number,
): boolean {
  return normalizeCompanyIds(client.inactiveCompanies).includes(
    Number(companyId),
  );
}

/**
 * Compañías que el cliente comparte con quien lo consulta. Es el conjunto sobre
 * el que se resuelve el estado que ve un admin/worker.
 */
export function sharedCompanyIds(
  client: ClientActivationState,
  callerCompanyIds: number[],
): number[] {
  const clientCompanies = normalizeCompanyIds(client.companies);
  return callerCompanyIds
    .map(Number)
    .filter((id) => clientCompanies.includes(id));
}

/**
 * Estado que ve un admin/worker: vivo si lo está en al menos una de las
 * compañías que comparte con el cliente. Sin compañías compartidas manda la
 * bandera global (cliente propio que todavía no está en ningún salón).
 */
export function resolveIsActiveForCompanies(
  client: ClientActivationState,
  companyIds: number[],
): number {
  if (client.isActive === 0) return 0;
  if (companyIds.length === 0) return 1;

  const inactive = normalizeCompanyIds(client.inactiveCompanies);
  return companyIds.map(Number).some((id) => !inactive.includes(id)) ? 1 : 0;
}

/**
 * Aplica el cambio sobre un conjunto de compañías y devuelve la lista
 * `inactiveCompanies` resultante (no muta el cliente).
 */
export function applyCompanyActivation(
  client: ClientActivationState,
  companyIds: number[],
  isActive: boolean,
): number[] {
  const current = normalizeCompanyIds(client.inactiveCompanies);
  const targets = companyIds.map(Number);

  return isActive
    ? current.filter((id) => !targets.includes(id))
    : [...new Set([...current, ...targets])];
}

/**
 * Marca al cliente como eliminado para ESA compañía. Devuelve la lista
 * `inactiveCompanies` resultante; no muta el cliente ni toca `companies`.
 */
export function markClientDeletedForCompany(
  client: ClientActivationState,
  companyId: number,
): number[] {
  return applyCompanyActivation(client, [companyId], false);
}

/**
 * Deshace la eliminación para ESA compañía (reactivar). El cliente vuelve con
 * su alias, sus notas y su historial porque nunca se borró nada.
 */
export function unmarkClientDeletedForCompany(
  client: ClientActivationState,
  companyId: number,
): number[] {
  return applyCompanyActivation(client, [companyId], true);
}
