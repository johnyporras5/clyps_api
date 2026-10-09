/**
 * Salones que quedan FUERA del cambio de identidad: cédula/RIF en los tres
 * roles y "sin correo no hay cuenta". Siguen trabajando como antes: no se les
 * pide la cédula, no la ven en ninguna respuesta (HideIdentificationInterceptor)
 * y sus trabajadores y clientes sin correo conservan su fila en `user`.
 *
 * Los ids van en `LEGACY_IDENTITY_COMPANY_IDS` (`12,34`) porque no coinciden
 * entre dev y producción: cada ambiente pone los suyos. Vacía = nadie queda
 * fuera.
 *
 * Se lee de `process.env` en cada llamada, no de ConfigService: la usan
 * funciones sueltas (la regla de cédula repetida, el interceptor) y partir una
 * lista de dos números no cuesta nada.
 */
export function legacyIdentityCompanyIds(): number[] {
  const raw = process.env.LEGACY_IDENTITY_COMPANY_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function isLegacyIdentityCompany(
  companyId: number | null | undefined,
): boolean {
  if (!companyId) return false;
  return legacyIdentityCompanyIds().includes(companyId);
}

/** Los salones de la lista que SÍ siguen la regla de la cédula. */
export function withoutLegacyIdentityCompanies(companyIds: number[]): number[] {
  const legacy = legacyIdentityCompanyIds();
  return companyIds.filter((id) => !legacy.includes(id));
}
