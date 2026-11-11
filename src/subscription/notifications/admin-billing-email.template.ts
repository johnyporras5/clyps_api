import {
  emailButton,
  emailCard,
  emailNote,
  emailParagraph,
  escapeHtml,
  renderEmail,
} from '../../email/email-layout';
import { businessDateOf } from '../../common/utils/business-time.util';
import { EXTRA_TRIAL_DAYS } from '../admin-billing.util';

/**
 * Correos al dueño cuando la PLATAFORMA le cambia el cobro desde el panel:
 * hacerlo VIP y regalarle días de prueba.
 *
 * Funciones puras: reciben los datos ya resueltos y devuelven asunto + HTML.
 *
 * El VIP NO promete que sea para siempre ("no vence", "sin fecha de fin"): el
 * VIP se puede quitar, y el correo no debe prometer algo que luego no se cumpla.
 */

const GOLD = '#b8860b';
const GOLD_SOFT = '#fbf7ec';
const FOOTER = 'Recibes este correo porque registraste tu negocio en CLYPS.';
const SIGN_OFF = emailParagraph(
  'Con cariño,<br><strong>El equipo de CLYPS 💛</strong>',
);

const DAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export interface AdminBillingEmailOptions {
  /** A dónde lleva el botón principal (la app web). */
  webUrl: string;
  /** Base pública de imágenes (`ASSETS_BASE_URL`). Sin https, sin logo. */
  assetsBaseUrl: string | null;
  /** WhatsApp de CLYPS. Vacío o inválido = sin ese botón. */
  supportWhatsapp: string | null;
}

export interface AdminBillingEmail {
  subject: string;
  html: string;
}

/**
 * "Jueves, 26 de noviembre de 2026", en la zona del negocio.
 *
 * Se arma a mano y no con `toLocaleDateString('es')`: el servidor puede no
 * traer los datos de idioma (ICU) y saldría en inglés. La zona sí importa: en
 * UTC, una prueba que vence el 25 a las 8 p. m. de Caracas diría "26".
 */
export function formatLongDate(instant: Date): string {
  const [y, m, d] = businessDateOf(instant).split('-').map(Number);
  const weekday = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const text = `${weekday}, ${d} de ${MONTHS[m - 1]} de ${y}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "26 de noviembre de 2026", sin día de la semana. */
function formatShortDate(instant: Date): string {
  const [y, m, d] = businessDateOf(instant).split('-').map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

function logoUrl(base: string | null): string | undefined {
  const clean = (base ?? '').trim().replace(/\/+$/, '');
  // Gmail y compañía no cargan imágenes de localhost ni de http: mejor sin
  // logo (sale el encabezado de texto) que con una imagen rota.
  return clean.startsWith('https://')
    ? `${clean}/email/clyps-logo.png`
    : undefined;
}

function whatsappLink(
  number: string | null,
  companyName: string,
): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  const text = `Hola CLYPS 👋 Soy de ${companyName}.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * El nombre del salón lo escribe el dueño: va escapado en el HTML, y en el
 * asunto sin saltos de línea ni espacios de más (el asunto es texto plano,
 * pero un salto de línea ahí podría colar cabeceras en algunos proveedores).
 */
function plainName(companyName: string): string {
  return companyName
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildVipGrantedEmail(
  input: { companyName: string; since: Date },
  opts: AdminBillingEmailOptions,
): AdminBillingEmail {
  const plain = plainName(input.companyName);
  const name = escapeHtml(plain);
  const wa = whatsappLink(opts.supportWhatsapp, plain);

  return {
    subject: `👑 ${plain}, ahora eres VIP en CLYPS`,
    html: renderEmail({
      title: 'Bienvenido al círculo VIP 👑',
      accent: GOLD,
      logoUrl: logoUrl(opts.assetsBaseUrl),
      preheader: 'Tu salón tiene acceso completo a CLYPS, sin pagar nada.',
      greeting: `¡Hola, ${name}! 👑`,
      message: `Tenemos una noticia que nos hace mucha ilusión darte: <strong>${name} ahora es VIP en CLYPS.</strong>`,
      blocks: [
        emailCard({
          title: '✨ Como salón VIP tienes',
          subtitle: `Miembro VIP desde el ${formatShortDate(input.since)}`,
          accent: GOLD,
          accentSoft: GOLD_SOFT,
          rows: [
            {
              label: 'Todo CLYPS abierto',
              value:
                '✨ Todas las funciones<div style="font-size:14px;font-weight:400;color:#64748b;margin:6px 0 0 0;">Sin límites de plan.</div>',
            },
            {
              label: 'Sin pagos',
              value: '💛 Mientras seas VIP, no te cobramos nada',
            },
            {
              label: 'Atención cercana',
              value: '🤝 Nos escribes y te ayudamos directo',
            },
          ],
        }),
        emailParagraph(
          'No te elegimos por casualidad. Creemos en lo que estás construyendo y queremos acompañarte a crecer.',
        ),
        emailButton(opts.webUrl, 'Entrar a mi salón'),
        emailParagraph(
          'Y si se te ocurre algo para mejorar CLYPS, cuéntanos. Nos encanta escuchar a los salones VIP.',
        ),
        wa ? emailButton(wa, 'Escríbenos por WhatsApp', false) : '',
        SIGN_OFF,
      ],
      footerNote: FOOTER,
    }),
  };
}

/**
 * +15 días de prueba.
 *
 * `opened`: el salón no tenía suscripción y se le ABRIÓ la prueba (no se le
 * sumaron días a nada). Ahí decir "15 días más" sería mentira.
 */
export function buildTrialExtendedEmail(
  input: { companyName: string; trialEndsAt: Date; opened: boolean },
  opts: AdminBillingEmailOptions,
): AdminBillingEmail {
  const plain = plainName(input.companyName);
  const name = escapeHtml(plain);
  const wa = whatsappLink(opts.supportWhatsapp, plain);
  const end = formatLongDate(input.trialEndsAt);
  const days = EXTRA_TRIAL_DAYS;

  const subject = input.opened
    ? `🎁 ${plain}, te activamos ${days} días de prueba`
    : `🎁 ${plain}, te regalamos ${days} días más`;
  const intro = input.opened
    ? `Queremos que conozcas CLYPS con calma. Por eso le activamos a ${name} <strong>${days} días de prueba</strong>.`
    : `Sabemos que arrancar con una herramienta nueva lleva su tiempo. Por eso le sumamos <strong>${days} días más de prueba</strong> a ${name}.`;
  const help =
    '<strong>¿Te trabaste en algo?</strong> Escríbenos y te ayudamos a dejarlo listo.';

  return {
    subject,
    html: renderEmail({
      title: input.opened
        ? `${days} días para ti 🎁`
        : `${days} días más para ti 🎁`,
      accent: GOLD,
      logoUrl: logoUrl(opts.assetsBaseUrl),
      preheader: `Sigue usando todo CLYPS hasta el ${end.toLowerCase()}, sin pagar nada.`,
      greeting: `¡Hola, ${name}! 🎁`,
      message: intro,
      blocks: [
        emailCard({
          title: '📅 Tu prueba ahora termina el',
          accent: GOLD,
          accentSoft: GOLD_SOFT,
          rows: [{ label: 'Último día de prueba', value: end }],
        }),
        emailNote({
          title: 'Te sugerimos aprovecharlos así:',
          body: [
            '📅 <strong>Agenda las citas de la semana</strong> en CLYPS en vez de en la libreta.',
            '👥 <strong>Invita a tu equipo</strong> para que cada uno vea su agenda en el celular.',
            '💰 <strong>Registra los cobros del día</strong> y mira cómo la caja se cuadra sola.',
          ].join('<br>'),
          accent: GOLD,
          background: GOLD_SOFT,
        }),
        emailButton(opts.webUrl, 'Seguir con mi salón'),
        emailParagraph(help),
        wa ? emailButton(wa, 'Hablar con nosotros por WhatsApp', false) : '',
        SIGN_OFF,
      ],
      footerNote: FOOTER,
    }),
  };
}
