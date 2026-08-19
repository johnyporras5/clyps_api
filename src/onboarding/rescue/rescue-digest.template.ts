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

function tenantRow(tenant: StuckTenant): string {
  const wa = waLink(tenant.phone);
  const contact = wa
    ? `<a href="${wa}" style="color:#0a6b5e;text-decoration:none">${esc(tenant.phone)}</a>`
    : esc(tenant.phone) || '<span style="color:#8b8b8b">sin teléfono</span>';

  return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e7e7e7;">
        <div style="font-weight:600;color:#1a1a1a;">${esc(tenant.companyName)}</div>
        <div style="font-size:12px;color:#6b6b6b;">${esc(tenant.ownerEmail) || 'sin correo'} &middot; ${contact}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e7e7e7;font-size:13px;color:#3a3a3a;white-space:nowrap;">
        ${esc(STEP_LABELS[tenant.step])}
        <div style="font-size:12px;color:#6b6b6b;">${tenant.completedSteps} de 5 completos</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #e7e7e7;text-align:right;white-space:nowrap;">
        <span style="font-weight:600;color:#1a1a1a;">${tenant.daysStalled} días</span>
        <div style="font-size:12px;color:#6b6b6b;">sin avanzar</div>
      </td>
    </tr>`;
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
  const byStep = ONBOARDING_STEP_KEYS.map((key) => ({
    key,
    list: tenants.filter((t) => t.step === key),
  })).filter((g) => g.list.length > 0);

  const groups = byStep
    .map(
      (group) => `
      <tr>
        <td colspan="3" style="padding:14px 12px 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b6b6b;">
          ${esc(STEP_LABELS[group.key])} &middot; ${group.list.length}
        </td>
      </tr>
      ${group.list.map(tenantRow).join('')}`,
    )
    .join('');

  return `
    <div style="margin:0 0 28px;">
      <div style="border-left:4px solid ${accent};padding:2px 0 2px 12px;margin-bottom:10px;">
        <div style="font-size:17px;font-weight:700;color:#1a1a1a;">${esc(title)} &middot; ${tenants.length}</div>
        <div style="font-size:13px;color:#6b6b6b;">${esc(subtitle)}</div>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#ffffff;border:1px solid #e7e7e7;border-radius:6px;">
        ${groups}
      </table>
    </div>`;
}

/**
 * Digest diario del consultor: UN correo con todos los rescates del día,
 * agrupados por urgencia (7+ días primero) y por paso. No un correo por dueño —
 * esos se pierden.
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
<body style="margin:0;padding:24px 12px;background:#f5f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;">
    <tr>
      <td>
        <div style="font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#6b6b6b;margin-bottom:6px;">
          CLYPS &middot; Cola de rescate
        </div>
        <h1 style="margin:0 0 6px;font-size:24px;line-height:1.2;color:#1a1a1a;">${esc(intro)}</h1>
        <p style="margin:0 0 24px;font-size:14px;color:#4a4a4a;">
          Negocios que llevan días sin avanzar en su configuración. Se ordenan por
          urgencia y por el paso donde se trabaron.
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

        <p style="margin:24px 0 0;font-size:12px;color:#8b8b8b;line-height:1.6;">
          Cada negocio aparece una sola vez por paso y nivel. Vuelve a salir solo si
          escala: porque avanzó a otro paso y se trabó ahí, o porque cruzó a un
          umbral mayor.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
