import type { OnboardingStepKey } from '../types/onboarding.types';
import { ONBOARDING_STEP_KEYS } from '../types/onboarding.types';
import type { RescueThresholds, StuckTenant } from '../types/rescue.types';

/** Nombre legible de cada paso, para el correo y la notificación al dueño. */
export const STEP_LABELS: Record<OnboardingStepKey, string> = {
  create_profile: 'Completar el perfil',
  add_team: 'Agregar el equipo',
  confirm_services: 'Confirmar los servicios',
  first_appointment: 'Agendar la primera cita',
  first_charge: 'Cobrar la primera cita',
};

/** Escapa el texto que viene de la base antes de meterlo en el HTML. */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Deja el teléfono como lo espera un enlace de WhatsApp: solo dígitos. */
function waLink(phone: string | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

const MUTED = '#6b6b6b';
const FAINT = '#9a9a9a';

/**
 * Ficha de un negocio. Todo apilado: el ancho no se reparte entre columnas, así
 * que en un teléfono angosto nada se parte en tres líneas. Lo único que comparte
 * fila con el nombre es la píldora de días, que es corta y va con `nowrap`.
 */
function tenantCard(tenant: StuckTenant): string {
  const wa = waLink(tenant.phone);
  const phone = wa
    ? `<a href="${wa}" style="color:#0a6b5e;text-decoration:none;">${esc(tenant.phone)}</a>`
    : tenant.phone
      ? esc(tenant.phone)
      : `<span style="color:${FAINT};">sin teléfono</span>`;
  const mail = tenant.ownerEmail
    ? `<a href="mailto:${esc(tenant.ownerEmail)}" style="color:#0a6b5e;text-decoration:none;word-break:break-all;">${esc(tenant.ownerEmail)}</a>`
    : `<span style="color:${FAINT};">sin correo</span>`;

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;border-top:1px solid #ececec;">
    <tr>
      <td class="pad" style="padding:12px 14px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:15px;font-weight:700;color:#1a1a1a;line-height:1.35;padding-right:8px;">
              ${esc(tenant.companyName)}
            </td>
            <td align="right" valign="top" style="white-space:nowrap;">
              <span style="display:inline-block;font-size:12px;font-weight:700;color:#1a1a1a;background:#f0f0ef;border-radius:999px;padding:3px 9px;white-space:nowrap;">
                ${tenant.daysStalled} d
              </span>
            </td>
          </tr>
        </table>

        <div style="font-size:13px;color:#3a3a3a;line-height:1.5;padding-top:4px;">
          ${esc(STEP_LABELS[tenant.step])}
          <span style="color:${MUTED};">&middot; ${tenant.completedSteps} de 5 completos</span>
        </div>

        <div style="font-size:13px;color:${MUTED};line-height:1.6;padding-top:2px;">
          ${phone}
        </div>
        <div style="font-size:13px;color:${MUTED};line-height:1.6;">
          ${mail}
        </div>

      </td>
    </tr>
  </table>`;
}

/** Bloque de una urgencia, agrupado por dentro según el paso donde se trabaron. */
function levelBlock(
  title: string,
  subtitle: string,
  accent: string,
  tenants: StuckTenant[],
): string {
  if (tenants.length === 0) return '';

  // Dentro de cada urgencia, se agrupa por paso: trabarse justo antes de cobrar
  // la primera cita es el rescate más valioso.
  const groups = ONBOARDING_STEP_KEYS.map((key) => ({
    key,
    list: tenants.filter((t) => t.step === key),
  }))
    .filter((g) => g.list.length > 0)
    .map(
      (group) => `
      <div class="pad" style="padding:14px 14px 4px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${MUTED};line-height:1.4;">
        ${esc(STEP_LABELS[group.key])} &middot; ${group.list.length}
      </div>
      ${group.list.map(tenantCard).join('')}`,
    )
    .join('');

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 26px;">
    <tr>
      <td style="border-left:4px solid ${accent};padding:2px 0 2px 12px;">
        <div style="font-size:17px;font-weight:700;color:#1a1a1a;line-height:1.3;">${esc(title)} &middot; ${tenants.length}</div>
        <div style="font-size:13px;color:${MUTED};line-height:1.5;">${esc(subtitle)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding-top:10px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e7e7e7;border-radius:6px;">
          <tr><td>${groups}</td></tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/**
 * Digest diario del consultor: UN correo con todos los rescates del día,
 * agrupados por urgencia (7+ días primero) y por paso. No un correo por dueño —
 * esos se pierden.
 *
 * Se lee sobre todo desde el teléfono, así que la maqueta es de tablas apiladas
 * al 100% de ancho, sin columnas que compitan. La media query solo aprieta los
 * márgenes; si el cliente de correo la ignora, el correo se ve igual de bien.
 */
export function buildRescueDigestHtml(
  tenants: StuckTenant[],
  thresholds: RescueThresholds,
): string {
  const risk = tenants.filter((t) => t.level === 'risk');
  const alert = tenants.filter((t) => t.level === 'alert');

  const intro =
    tenants.length === 1
      ? 'Hoy tienes 1 rescate.'
      : `Hoy tienes ${tenants.length} rescates.`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Cola de rescate</title>
<style>
  body { margin:0; padding:0; width:100% !important; }
  img { border:0; line-height:100%; }
  a { color:#0a6b5e; }
  @media only screen and (max-width:480px) {
    .wrap { padding:16px 10px !important; }
    .pad  { padding-left:12px !important; padding-right:12px !important; }
    .h1   { font-size:21px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f5f6f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:#f5f6f5;">
    <tr>
      <td class="wrap" align="center" style="padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:640px;border-collapse:collapse;text-align:left;">
          <tr>
            <td>
              <div style="font-size:11px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:${MUTED};margin-bottom:6px;">
                CLYPS &middot; Cola de rescate
              </div>
              <h1 class="h1" style="margin:0 0 6px;font-size:24px;line-height:1.25;color:#1a1a1a;font-weight:700;">${esc(intro)}</h1>
              <p style="margin:0 0 22px;font-size:14px;line-height:1.55;color:#4a4a4a;">
                Negocios que llevan días sin avanzar en su configuración. Se ordenan
                por urgencia y por el paso donde se trabaron.
              </p>

              ${levelBlock(
                'En riesgo',
                `${thresholds.risk}+ días sin avanzar. Prioridad máxima.`,
                '#9c3625',
                risk,
              )}

              ${levelBlock(
                'Para rescatar',
                `${thresholds.alert}+ días sin avanzar. Contacto humano.`,
                '#8f5a04',
                alert,
              )}

              <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:${FAINT};">
                Cada negocio aparece una sola vez por paso y nivel. Vuelve a salir solo
                si escala: porque avanzó a otro paso y se trabó ahí, o porque cruzó a un
                umbral mayor.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
