import type { OnboardingStepKey } from '../types/onboarding.types';
import { ONBOARDING_STEP_KEYS } from '../types/onboarding.types';
import type { StuckTenant } from '../types/rescue.types';
import { STEP_LABELS } from './rescue-digest.template';

/**
 * ONB-4: correos de acompañamiento al DUEÑO atascado.
 *
 * - `alert` (4 días): agradece que nos eligió, muestra lo que ya avanzó y le
 *   dice qué sigue.
 * - `risk` (7 días): le ofrece hacerlo juntos por WhatsApp.
 *
 * El tono es de bienvenida, no de cobro: primero el agradecimiento, después lo
 * que falta. El nivel `reminder` no tiene correo (es la notificación in-app).
 */

/** Colores de la marca (los mismos del logo y del ícono de la web). */
const NAVY = '#091E39';
const GOLD = '#D2AF39';
const CREAM = '#F3EFE3';
const SOFT = '#F8F5EC';
const TRACK = '#ECE6D3';
const MUTED = '#6b6b6b';

/** Qué gana el dueño al terminar cada paso. Va debajo del nombre del paso. */
const STEP_PITCH: Record<OnboardingStepKey, string> = {
  create_profile:
    'Ponle cara a tu negocio: nombre, foto y horario. Es lo primero que verán tus clientes, ¡que se enamoren a primera vista!',
  add_team:
    'Suma a tu equipo. Cada uno tendrá su propia agenda y podrá ver sus citas desde el celular.',
  confirm_services:
    'Revisa tus servicios y precios. Así tus clientes saben exactamente qué ofreces al reservar.',
  configure_payroll:
    'Dinos cómo le pagas a tu equipo y CLYPS hace las cuentas por ti. Adiós a la calculadora de fin de semana.',
  first_appointment:
    '¡Llegó el momento emocionante! Agenda tu primera cita (aunque sea de prueba) y mira lo fácil que es.',
  first_charge:
    'Registra tu primer cobro y estrena tu caja del día. ¡Este es el último paso!',
};

export interface OwnerRescueEmailOptions {
  /** A dónde lleva "Seguir con mi configuración": la web, donde inicia sesión. */
  webUrl: string;
  /** Base pública de los assets (`ASSETS_BASE_URL`); de ahí sale el logo. */
  assetsBaseUrl: string;
  /** WhatsApp de CLYPS. Sin número, los correos salen sin botón de WhatsApp. */
  supportWhatsapp: string | null;
}

export interface OwnerRescueEmail {
  subject: string;
  html: string;
}

/** Escapa el texto que viene de la base antes de meterlo en el HTML. */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Enlace al chat de CLYPS con el mensaje ya escrito: el dueño solo toca
 * "enviar", y quien atiende sabe de entrada qué negocio es y dónde se trabó.
 */
function whatsappLink(
  number: string | null,
  companyName: string,
  stepLabel: string,
): string | null {
  const digits = (number || '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  const text = `Hola CLYPS 👋 Soy de ${companyName} y necesito ayuda con el paso "${stepLabel}" de mi configuración.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Botón en tabla: es lo único que respetan todos los clientes de correo. */
function button(href: string, label: string, primary = true): string {
  const bg = primary ? NAVY : '#ffffff';
  const fg = primary ? CREAM : NAVY;
  const border = primary ? '' : `border:2px solid ${NAVY};`;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 auto;">
    <tr>
      <td align="center" style="border-radius:999px;background:${bg};${border}">
        <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:${fg};text-decoration:none;border-radius:999px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

/** Barra de pasos: lo que ya hizo motiva más que lo que le falta. */
function progress(done: number, total: number): string {
  const cells = Array.from(
    { length: total },
    (_, i) =>
      `<td style="width:${(100 / total).toFixed(2)}%;padding:0 3px;"><div style="height:10px;border-radius:999px;background:${i < done ? GOLD : TRACK};"></div></td>`,
  ).join('');
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:6px 0 8px;">
    <tr>${cells}</tr>
  </table>
  <div style="font-size:14px;color:${MUTED};text-align:center;"><strong style="color:#1a1a1a;">${done} de ${total}</strong> pasos listos</div>`;
}

/** Marco común: logo arriba, tarjeta blanca, pie con el porqué del correo. */
function shell(preheader: string, logoUrl: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>CLYPS</title>
<style>
  body { margin:0; padding:0; width:100% !important; }
  img { border:0; line-height:100%; }
  @media only screen and (max-width:480px) {
    .card { padding:24px 18px !important; }
    .h1   { font-size:23px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${CREAM};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;background:${CREAM};">
    <tr>
      <td align="center" style="padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:560px;border-collapse:collapse;">
          <tr>
            <td align="center" style="padding-bottom:20px;">
              <img src="${esc(logoUrl)}" alt="CLYPS" width="150" height="62" style="display:block;width:150px;height:auto;border:0;">
            </td>
          </tr>
          <tr>
            <td class="card" style="background:#ffffff;border-radius:18px;padding:32px 28px;font-size:16px;line-height:1.6;">
              ${body}
              <p style="margin:28px 0 0;">Con cariño,<br><strong>El equipo de CLYPS 💛</strong></p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 8px;font-size:12px;color:#9a9a9a;line-height:1.5;">
              Recibes este correo porque registraste tu negocio en CLYPS.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Correo de los 4 días: gracias por elegirnos, vas muy bien, esto sigue. */
function welcomeBack(
  tenant: StuckTenant,
  opts: OwnerRescueEmailOptions,
  logoUrl: string,
): OwnerRescueEmail {
  const name = esc(tenant.companyName);
  const label = STEP_LABELS[tenant.step];
  const wa = whatsappLink(opts.supportWhatsapp, tenant.companyName, label);

  const help = wa
    ? `<p style="margin:0 0 16px;"><strong>¿Algo no quedó claro? Estamos para ti.</strong> Escríbenos cuando quieras y con gusto lo resolvemos contigo.</p>
    ${button(wa, 'Hablar con nosotros por WhatsApp', false)}`
    : `<p style="margin:0;"><strong>¿Algo no quedó claro? Estamos para ti.</strong> Con gusto te ayudamos a terminarlo.</p>`;

  const body = `
    <p style="margin:0 0 16px;">Hola, <strong>${name}</strong>:</p>
    <h1 class="h1" style="margin:0 0 12px;font-size:26px;line-height:1.25;color:${NAVY};">¡Gracias por elegir CLYPS! 🎉</h1>
    <p style="margin:0 0 22px;">Que confíes tu negocio en nosotros nos hace muy felices, y queremos que esta experiencia sea tan buena como el trabajo que haces todos los días.</p>
    <p style="margin:0 0 6px;">Ya diste los primeros pasos y <strong>vas muy bien</strong>:</p>
    ${progress(tenant.completedSteps, ONBOARDING_STEP_KEYS.length)}
    <div style="margin:24px 0;padding:18px 20px;background:${SOFT};border-radius:14px;">
      <div style="font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9A7B1C;margin-bottom:4px;">Lo que sigue</div>
      <div style="font-size:18px;font-weight:700;color:${NAVY};margin-bottom:6px;">${esc(label)}</div>
      <div style="color:#3a3a3a;">${esc(STEP_PITCH[tenant.step])}</div>
    </div>
    ${button(opts.webUrl, 'Seguir con mi configuración')}
    <p style="margin:28px 0 8px;">Cuando termines, vas a poder:</p>
    <p style="margin:0 0 6px;">📅 Recibir citas de tus clientes sin estar todo el día en el teléfono</p>
    <p style="margin:0 0 6px;">💵 Llevar tu caja del día en orden</p>
    <p style="margin:0 0 22px;">👥 Saber cuánto le toca a cada persona de tu equipo, sin hacer cuentas</p>
    ${help}`;

  return {
    subject: `¡Gracias por elegirnos, ${tenant.companyName}! Ya casi estás listo 🎉`,
    html: shell(
      'Vas muy bien: solo te faltan unos pasos para que tu negocio brille.',
      logoUrl,
      body,
    ),
  };
}

/** Correo de los 7 días: ¿lo hacemos juntos? Sin regaños, sin culpa. */
function lendAHand(
  tenant: StuckTenant,
  opts: OwnerRescueEmailOptions,
  logoUrl: string,
): OwnerRescueEmail {
  const name = esc(tenant.companyName);
  const label = STEP_LABELS[tenant.step];
  const wa = whatsappLink(opts.supportWhatsapp, tenant.companyName, label);

  // Sin número de WhatsApp el recuadro de "hagámoslo juntos" no tiene a dónde
  // llevar: el botón principal pasa a ser seguir en la web.
  const action = wa
    ? `<div style="margin:0 0 22px;padding:20px;background:${SOFT};border-radius:14px;text-align:center;">
      <div style="font-size:19px;font-weight:700;color:${NAVY};margin-bottom:6px;">💬 ¿Lo hacemos juntos?</div>
      <div style="color:#3a3a3a;margin-bottom:18px;">Escríbenos por WhatsApp y te acompañamos paso a paso. En <strong>10 minutos</strong> tu negocio queda listo para recibir citas.</div>
      ${button(wa, 'Escribir por WhatsApp')}
    </div>
    <p style="margin:0 0 14px;text-align:center;">¿Prefieres hacerlo por tu cuenta? Te dejamos todo donde lo dejaste:</p>
    ${button(opts.webUrl, 'Continuar por mi cuenta', false)}
    <p style="margin:26px 0 0;">Y si algo no te convenció, cuéntanos por WhatsApp. Leemos cada mensaje y tu opinión nos ayuda a mejorar.</p>`
    : `<p style="margin:0 0 18px;text-align:center;">Te dejamos todo donde lo dejaste:</p>
    ${button(opts.webUrl, 'Seguir con mi configuración')}`;

  const body = `
    <p style="margin:0 0 16px;">Hola, <strong>${name}</strong>:</p>
    <h1 class="h1" style="margin:0 0 12px;font-size:26px;line-height:1.25;color:${NAVY};">¿Te echamos una mano? 🤝</h1>
    <p style="margin:0 0 16px;">Queremos agradecerte otra vez por elegir CLYPS. Sabemos que manejar un negocio no deja mucho tiempo libre, y <strong>nos encantaría ayudarte a dejarlo todo listo</strong>.</p>
    <p style="margin:0 0 22px;">Vimos que te quedaste en <strong>${esc(label)}</strong>. ¡No te preocupes! Es uno de los pasos donde más dueños nos piden una mano, y se resuelve rápido.</p>
    ${action}`;

  return {
    subject: `${tenant.companyName}, ¿te echamos una mano? 🤝`,
    html: shell(
      'Lo hacemos juntos en unos minutos, sin complicaciones.',
      logoUrl,
      body,
    ),
  };
}

/**
 * El correo que le toca al dueño según su nivel, o null si su nivel no lleva
 * correo (`reminder` se avisa solo por la app).
 */
export function buildOwnerRescueEmail(
  tenant: StuckTenant,
  opts: OwnerRescueEmailOptions,
): OwnerRescueEmail | null {
  const logoUrl = `${opts.assetsBaseUrl.replace(/\/+$/, '')}/email/clyps-logo.png`;
  if (tenant.level === 'alert') return welcomeBack(tenant, opts, logoUrl);
  if (tenant.level === 'risk') return lendAHand(tenant, opts, logoUrl);
  return null;
}
