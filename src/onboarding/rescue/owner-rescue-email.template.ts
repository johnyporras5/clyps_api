import type { OnboardingStepKey } from '../types/onboarding.types';
import { ONBOARDING_STEP_KEYS } from '../types/onboarding.types';
import type { StuckTenant } from '../types/rescue.types';
import { STEP_LABELS } from './rescue-digest.template';
import {
  emailButton,
  emailCard,
  emailNote,
  emailParagraph,
  escapeHtml,
  renderEmail,
} from '../../email/email-layout';

const GOLD = '#b8860b';
const GOLD_SOFT = '#fbf7ec';
const BAR_DONE = '#d2af39';
const BAR_TRACK = '#ece6d3';

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
  webUrl: string;
  assetsBaseUrl: string;
  supportWhatsapp: string | null;
}

export interface OwnerRescueEmail {
  subject: string;
  html: string;
}

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

function progress(done: number, total: number): string {
  const cells = Array.from(
    { length: total },
    (_, i) =>
      `<td style="width:${(100 / total).toFixed(2)}%;padding:0 3px;"><div style="height:10px;border-radius:999px;background-color:${i < done ? BAR_DONE : BAR_TRACK};"></div></td>`,
  ).join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 8px 0;">
                <tr>${cells}</tr>
              </table>
              <div style="font-size:14px;color:#64748b;text-align:center;margin:0 0 20px 0;"><strong style="color:#1e293b;">${done} de ${total}</strong> pasos listos</div>`;
}

const SIGN_OFF = emailParagraph(
  'Con cariño,<br><strong>El equipo de CLYPS 💛</strong>',
);
const FOOTER = 'Recibes este correo porque registraste tu negocio en CLYPS.';
const CENTERED = (html: string) =>
  `<div style="font-size:15px;line-height:1.6;color:#475569;text-align:center;margin:0 0 14px 0;">${html}</div>`;

function welcomeBack(
  tenant: StuckTenant,
  opts: OwnerRescueEmailOptions,
  logoUrl: string,
): OwnerRescueEmail {
  const name = escapeHtml(tenant.companyName);
  const label = STEP_LABELS[tenant.step];
  const wa = whatsappLink(opts.supportWhatsapp, tenant.companyName, label);

  return {
    subject: `¡Gracias por elegirnos, ${tenant.companyName}! Ya casi estás listo 🎉`,
    html: renderEmail({
      title: '¡Gracias por elegir CLYPS! 🎉',
      accent: GOLD,
      logoUrl,
      preheader:
        'Vas muy bien: solo te faltan unos pasos para que tu negocio brille.',
      greeting: `Hola ${name},`,
      message:
        'Que confíes tu negocio en nosotros nos hace muy felices, y queremos que esta experiencia sea tan buena como el trabajo que haces todos los días.<br><br>Ya diste los primeros pasos y <strong>vas muy bien</strong>:',
      blocks: [
        progress(tenant.completedSteps, ONBOARDING_STEP_KEYS.length),
        emailCard({
          title: '✨ Lo que sigue',
          accent: GOLD,
          accentSoft: GOLD_SOFT,
          rows: [
            {
              label: 'Próximo paso',
              value: `${escapeHtml(label)}<div style="font-size:14px;font-weight:400;color:#64748b;margin:6px 0 0 0;line-height:1.6;">${escapeHtml(STEP_PITCH[tenant.step])}</div>`,
            },
          ],
        }),
        emailButton(opts.webUrl, 'Seguir con mi configuración'),
        emailNote({
          title: 'Cuando termines, vas a poder:',
          body: [
            '📅 Recibir citas de tus clientes sin estar todo el día en el teléfono',
            '💵 Llevar tu caja del día en orden',
            '👥 Saber cuánto le toca a cada persona de tu equipo, sin hacer cuentas',
          ].join('<br>'),
          accent: GOLD,
          background: GOLD_SOFT,
        }),
        wa
          ? emailParagraph(
              '<strong>¿Algo no quedó claro? Estamos para ti.</strong> Escríbenos cuando quieras y con gusto lo resolvemos contigo.',
            ) + emailButton(wa, 'Hablar con nosotros por WhatsApp', false)
          : emailParagraph(
              '<strong>¿Algo no quedó claro? Estamos para ti.</strong> Con gusto te ayudamos a terminarlo.',
            ),
        SIGN_OFF,
      ],
      footerNote: FOOTER,
    }),
  };
}

function lendAHand(
  tenant: StuckTenant,
  opts: OwnerRescueEmailOptions,
  logoUrl: string,
): OwnerRescueEmail {
  const name = escapeHtml(tenant.companyName);
  const label = STEP_LABELS[tenant.step];
  const wa = whatsappLink(opts.supportWhatsapp, tenant.companyName, label);

  const action = wa
    ? [
        emailCard({
          title: '💬 ¿Lo hacemos juntos?',
          accent: GOLD,
          accentSoft: GOLD_SOFT,
          rows: [],
          extra:
            CENTERED(
              'Escríbenos por WhatsApp y te acompañamos paso a paso. En <strong>10 minutos</strong> tu negocio queda listo para recibir citas.',
            ) + emailButton(wa, 'Escribir por WhatsApp'),
        }),
        CENTERED(
          '¿Prefieres hacerlo por tu cuenta? Te dejamos todo donde lo dejaste:',
        ),
        emailButton(opts.webUrl, 'Continuar por mi cuenta', false),
        emailParagraph(
          'Y si algo no te convenció, cuéntanos por WhatsApp. Leemos cada mensaje y tu opinión nos ayuda a mejorar.',
        ),
      ]
    : [
        CENTERED('Te dejamos todo donde lo dejaste:'),
        emailButton(opts.webUrl, 'Seguir con mi configuración'),
      ];

  return {
    subject: `${tenant.companyName}, ¿te echamos una mano? 🤝`,
    html: renderEmail({
      title: '¿Te echamos una mano? 🤝',
      accent: GOLD,
      logoUrl,
      preheader: 'Lo hacemos juntos en unos minutos, sin complicaciones.',
      greeting: `Hola ${name},`,
      message: `Queremos agradecerte otra vez por elegir CLYPS. Sabemos que manejar un negocio no deja mucho tiempo libre, y <strong>nos encantaría ayudarte a dejarlo todo listo</strong>.<br><br>Vimos que te quedaste en <strong>${escapeHtml(label)}</strong>. ¡No te preocupes! Es uno de los pasos donde más dueños nos piden una mano, y se resuelve rápido.`,
      blocks: [...action, SIGN_OFF],
      footerNote: FOOTER,
    }),
  };
}

export function buildOwnerRescueEmail(
  tenant: StuckTenant,
  opts: OwnerRescueEmailOptions,
): OwnerRescueEmail | null {
  const logoUrl = `${opts.assetsBaseUrl.replace(/\/+$/, '')}/email/clyps-logo.png`;
  if (tenant.level === 'alert') return welcomeBack(tenant, opts, logoUrl);
  if (tenant.level === 'risk') return lendAHand(tenant, opts, logoUrl);
  return null;
}
