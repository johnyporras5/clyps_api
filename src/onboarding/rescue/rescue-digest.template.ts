import type { OnboardingStepKey } from '../types/onboarding.types';
import { ONBOARDING_STEP_KEYS } from '../types/onboarding.types';
import type { RescueThresholds, StuckTenant } from '../types/rescue.types';
import {
  emailCard,
  emailParagraph,
  escapeHtml,
  renderEmail,
} from '../../email/email-layout';

export const STEP_LABELS: Record<OnboardingStepKey, string> = {
  create_profile: 'Completar el perfil',
  add_team: 'Agregar el equipo',
  confirm_services: 'Confirmar los servicios',
  configure_payroll: 'Configurar la nómina',
  first_appointment: 'Agendar la primera cita',
  first_charge: 'Cobrar la primera cita',
};

function waLink(phone: string | null): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}

function tenantValue(tenant: StuckTenant): string {
  const wa = waLink(tenant.phone);
  const phone = wa
    ? `<a href="${wa}" style="color:#0a6b5e;text-decoration:none;">📞 ${escapeHtml(tenant.phone)}</a>`
    : tenant.phone
      ? `📞 ${escapeHtml(tenant.phone)}`
      : '<span style="color:#94a3b8;">sin teléfono</span>';
  const mail = tenant.ownerEmail
    ? `<a href="mailto:${escapeHtml(tenant.ownerEmail)}" style="color:#0a6b5e;text-decoration:none;word-break:break-all;">✉️ ${escapeHtml(tenant.ownerEmail)}</a>`
    : '<span style="color:#94a3b8;">sin correo</span>';
  const detail = `font-size:14px;font-weight:400;color:#64748b;margin:4px 0 0 0;line-height:1.6;`;
  return `${escapeHtml(tenant.companyName)} <span style="display:inline-block;font-size:12px;font-weight:700;color:#1e293b;background-color:#f1f5f9;border-radius:999px;padding:2px 9px;white-space:nowrap;">${tenant.daysStalled} d</span>
                          <div style="${detail}">${tenant.completedSteps} de ${ONBOARDING_STEP_KEYS.length} completos</div>
                          <div style="${detail}">${phone}</div>
                          <div style="${detail}">${mail}</div>`;
}

function levelCard(
  title: string,
  subtitle: string,
  accent: string,
  accentSoft: string,
  tenants: StuckTenant[],
): string {
  if (tenants.length === 0) return '';
  const ordered = ONBOARDING_STEP_KEYS.flatMap((key) =>
    tenants.filter((t) => t.step === key),
  );
  return emailCard({
    title: `${title} · ${tenants.length}`,
    subtitle: escapeHtml(subtitle),
    accent,
    accentSoft,
    rows: ordered.map((tenant) => ({
      label: escapeHtml(STEP_LABELS[tenant.step]),
      value: tenantValue(tenant),
    })),
  });
}

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

  return renderEmail({
    title: 'Cola de rescate',
    accent: risk.length ? '#dc2626' : '#d97706',
    greeting: escapeHtml(intro),
    message:
      'Negocios que llevan días sin avanzar en su configuración. Se ordenan por urgencia y por el paso donde se trabaron.',
    blocks: [
      levelCard(
        '🔴 En riesgo',
        `${thresholds.risk}+ días sin avanzar. Prioridad máxima.`,
        '#dc2626',
        '#fef2f2',
        risk,
      ),
      levelCard(
        '🟠 Para rescatar',
        `${thresholds.alert}+ días sin avanzar. Contacto humano.`,
        '#d97706',
        '#fffbeb',
        alert,
      ),
      emailParagraph(
        'Cada negocio aparece una sola vez por paso y nivel. Vuelve a salir solo si escala: porque avanzó a otro paso y se trabó ahí, o porque cruzó a un umbral mayor.',
        true,
      ),
    ],
    footerNote: 'Resumen interno para el equipo de onboarding de CLYPS.',
  });
}
