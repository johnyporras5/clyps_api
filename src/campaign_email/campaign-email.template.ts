import {
  emailButton,
  emailCard,
  emailNote,
  emailParagraph,
  escapeHtml,
  renderEmail,
} from '../email/email-layout';
import { OFFERS } from '../subscription/config/offers.config';
import { formatLongDate } from '../subscription/notifications/admin-billing-email.template';

/**
 * Los dos correos de la promo Black Friday:
 *   - `bf2026_teaser`: intriga, unos días antes. NO revela precios.
 *   - `bf2026_launch`: la promo, el día que abre.
 *
 * Puros: reciben los datos ya resueltos y devuelven asunto + HTML.
 */

export type CampaignId = 'bf2026_teaser' | 'bf2026_launch';
export const CAMPAIGN_IDS: CampaignId[] = ['bf2026_teaser', 'bf2026_launch'];

export function isCampaignId(value: unknown): value is CampaignId {
  return (
    typeof value === 'string' && (CAMPAIGN_IDS as string[]).includes(value)
  );
}

const GOLD = '#b8860b';
const GOLD_SOFT = '#fbf7ec';
const DARK = '#0b1f3a';
const SIGN_OFF = emailParagraph(
  'Con cariño,<br><strong>El equipo de CLYPS 💛</strong>',
);

export interface CampaignEmailInput {
  companyName: string;
  /** A dónde lleva el botón (la pantalla de pago / la app). */
  payUrl: string;
  /** Enlace firmado para darse de baja de las promociones. */
  unsubscribeUrl: string;
  assetsBaseUrl: string | null;
  /** Fin de la promo (exclusivo), para "hasta el jueves 3 de diciembre". */
  windowEnd: Date;
}

export interface CampaignEmail {
  subject: string;
  html: string;
}

function logoUrl(base: string | null): string | undefined {
  const clean = (base ?? '').trim().replace(/\/+$/, '');
  return clean.startsWith('https://')
    ? `${clean}/email/clyps-logo.png`
    : undefined;
}

/** El nombre del salón lo escribe el dueño: sin saltos de línea en el asunto. */
function plainName(name: string): string {
  return name
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El pie con la baja. Es obligatorio en un correo de promoción. */
function footer(unsubscribeUrl: string): string {
  return (
    'Recibes este correo porque tu negocio está registrado en CLYPS.<br>' +
    `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b;text-decoration:underline;">No quiero recibir promociones</a>`
  );
}

/** Último día INCLUIDO de la promo (el fin guardado es exclusivo). */
function lastDay(windowEnd: Date): string {
  return formatLongDate(new Date(windowEnd.getTime() - 1)).toLowerCase();
}

function money(minor: number): string {
  return `$${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}`;
}

function offerBox(): string {
  const box = (title: string, price: number, regular: number, perks: string) =>
    `<td valign="top" style="width:50%;padding:6px;">
       <div style="background:#ffffff;border:2px solid ${GOLD};border-radius:12px;padding:18px 12px;text-align:center;">
         <div style="font-size:13px;font-weight:700;color:${GOLD};letter-spacing:1px;text-transform:uppercase;">${title}</div>
         <div style="font-size:13px;color:#94a3b8;text-decoration:line-through;margin:8px 0 0 0;">${money(regular)}</div>
         <div style="font-size:34px;font-weight:800;color:${DARK};line-height:1.1;">${money(price)}</div>
         <div style="font-size:13px;color:#475569;margin:2px 0 8px 0;">3 meses</div>
         <div style="display:inline-block;background:${GOLD_SOFT};color:${GOLD};font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px;">Ahorras ${money(regular - price)}</div>
         <div style="font-size:12px;color:#64748b;margin:10px 0 0 0;line-height:1.5;">${perks}</div>
       </div>
     </td>`;
  const b = OFFERS.bf2026_basico;
  const f = OFFERS.bf2026_full;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
            <tr>
              ${box('Básico', b.priceUsdMinor, b.regularUsdMinor, 'Agenda, clientes y caja.<br>Hasta 2 trabajadores.')}
              ${box('Full', f.priceUsdMinor, f.regularUsdMinor, 'Todo, con nómina y análisis.<br>Hasta 20 trabajadores.')}
            </tr>
          </table>`;
}

export function buildTeaserEmail(input: CampaignEmailInput): CampaignEmail {
  const plain = plainName(input.companyName);
  const name = escapeHtml(plain);
  return {
    subject: `👀 ${plain}, se acerca el Black Friday… y tenemos una sorpresa`,
    html: renderEmail({
      title: 'Se acerca el Black Friday 🖤',
      accent: GOLD,
      logoUrl: logoUrl(input.assetsBaseUrl),
      preheader: 'Algo especial llega este viernes 27. Atento a tu correo.',
      greeting: `¡Hola, ${name}! 👀`,
      message:
        'Se acerca el <strong>Black Friday</strong> y estamos preparando algo especial para los salones de CLYPS.<br><br>No te podemos contar mucho todavía… solo que <strong>vale la pena esperarlo</strong>.',
      blocks: [
        emailCard({
          title: '🎁 Tenemos una sorpresa para ti',
          accent: GOLD,
          accentSoft: GOLD_SOFT,
          rows: [
            {
              label: 'Cuándo',
              value:
                'Este viernes 27 de noviembre<div style="font-size:14px;font-weight:400;color:#64748b;margin:6px 0 0 0;">Te escribimos ese día con todos los detalles.</div>',
            },
          ],
        }),
        emailNote({
          title: 'Un consejo',
          body: 'Agrega este correo a tus contactos para que la sorpresa no se pierda en promociones o spam.',
          accent: GOLD,
          background: GOLD_SOFT,
        }),
        SIGN_OFF,
      ],
      footerNote: footer(input.unsubscribeUrl),
    }),
  };
}

export function buildLaunchEmail(input: CampaignEmailInput): CampaignEmail {
  const plain = plainName(input.companyName);
  const name = escapeHtml(plain);
  const until = lastDay(input.windowEnd);
  return {
    subject: `🖤 Black Friday: 3 meses de CLYPS desde $30, ${plain}`,
    html: renderEmail({
      title: 'Black Friday en CLYPS 🖤',
      accent: GOLD,
      logoUrl: logoUrl(input.assetsBaseUrl),
      preheader: `Solo hasta el ${until}: Básico 3 meses $30 · Full 3 meses $60.`,
      greeting: `¡Hola, ${name}! 🖤`,
      message: `Llegó la sorpresa: por el <strong>Black Friday</strong> puedes pagar <strong>3 meses de CLYPS</strong> por mucho menos.<br><br>Válido hasta el <strong>${until}</strong>.`,
      blocks: [
        offerBox(),
        emailButton(input.payUrl, 'Aprovechar la promoción'),
        emailNote({
          title: 'Cómo funciona',
          body: [
            '✅ Pagas una vez y tienes <strong>3 meses</strong> de tu plan.',
            '✅ Si estás en tu prueba gratis, los 3 meses empiezan <strong>cuando termina</strong>: no pierdes ni un día.',
            '✅ Si ya pagas, se suman a lo que te queda.',
            '✅ ¿Elegiste Básico y luego necesitas más? Pásate a Full pagando solo la diferencia.',
            '⚠️ Una sola vez por salón.',
          ].join('<br>'),
          accent: GOLD,
          background: GOLD_SOFT,
        }),
        SIGN_OFF,
      ],
      footerNote: footer(input.unsubscribeUrl),
    }),
  };
}

export function buildCampaignEmail(
  campaign: CampaignId,
  input: CampaignEmailInput,
): CampaignEmail {
  return campaign === 'bf2026_teaser'
    ? buildTeaserEmail(input)
    : buildLaunchEmail(input);
}

/** Asunto de ejemplo para la vista previa del panel. */
export function campaignSubjectSample(campaign: CampaignId): string {
  return buildCampaignEmail(campaign, {
    companyName: 'Tu salón',
    payUrl: 'https://example.com',
    unsubscribeUrl: 'https://example.com',
    assetsBaseUrl: null,
    windowEnd: new Date(),
  }).subject;
}
