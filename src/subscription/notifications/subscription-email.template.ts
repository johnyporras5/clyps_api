/**
 * La plantilla de los correos de suscripción (SUB-8 / SUB-9).
 *
 * Los avisos de cobro salían como una tira de `<p>` pelados, sin encabezado, sin
 * logo y sin pie: al lado de la confirmación de una cita parecían de otra
 * empresa. Peor todavía en un correo de dinero, donde lo primero que hace quien
 * lo recibe es preguntarse si es de verdad.
 *
 * Esto reproduce el mismo armazón que usan los demás correos del producto
 * —contenedor de 580 px, encabezado con degradado y el logo CLYPS, tarjeta de
 * contenido y pie gris—, con tablas y estilos en línea porque los clientes de
 * correo ignoran las hojas de estilo y a veces hasta los `div` con `flex`.
 */

/** Escapa lo que va dentro del HTML: el motivo del rechazo lo escribe una persona. */
function esc(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** El tono de la tarjeta de aviso. Los mismos colores que el resto del producto. */
const TONOS = {
  info: { bg: '#f0f9ff', border: '#0ea5e9', text: '#075985' },
  ok: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
  warn: { bg: '#fff7ed', border: '#f59e0b', text: '#92400e' },
} as const;

export interface SubscriptionEmailNotice {
  tone: keyof typeof TONOS;
  /** Un emoji. Va como texto, no como imagen: las imágenes se bloquean. */
  icon: string;
  text: string;
}

export interface SubscriptionEmailContent {
  /** Título del documento y encabezado del contenido. */
  title: string;
  /** "Hola, Salón Bella" — sin la coma final, la pone la plantilla. */
  greeting: string;
  /** Párrafos del cuerpo, en orden. */
  intro: string[];
  /** La tarjeta de color, si el aviso la necesita. */
  notice?: SubscriptionEmailNotice;
  /**
   * Los datos para pagar. En el correo SÍ van: se lee fuera de la app, así que
   * la regla de las tiendas no aplica —lo que no puede mostrarlos es la
   * notificación dentro del teléfono—.
   */
  payment?: { title: string; lines: string[] };
  cta?: { label: string; url: string };
  footerNote?: string;
}

const ACENTO = '#4f46e5';

function renderNotice(notice: SubscriptionEmailNotice): string {
  const tono = TONOS[notice.tone] ?? TONOS.info;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:25px 0;">
      <tr>
        <td style="background-color:${tono.bg};border-left:4px solid ${tono.border};border-radius:8px;padding:18px;font-size:14.5px;color:${tono.text};line-height:1.6;">
          <span style="margin-right:8px;">${esc(notice.icon)}</span>${esc(notice.text)}
        </td>
      </tr>
    </table>`;
}

function renderPayment(payment: { title: string; lines: string[] }): string {
  if (!payment.lines.length) return '';
  const filas = payment.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;font-size:15px;color:#1e293b;line-height:1.5;">${esc(line)}</td></tr>`,
    )
    .join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:30px 0;">
      <tr>
        <td style="background:linear-gradient(135deg,#f8fafc 0%,#f1f5f9 100%);border:1px solid #e2e8f0;border-radius:10px;padding:25px 30px;">
          <div style="font-size:13px;color:#64748b;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">${esc(payment.title)}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
            ${filas}
          </table>
        </td>
      </tr>
    </table>`;
}

function renderCta(cta: { label: string; url: string }): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:30px 0;">
      <tr>
        <td align="center">
          <a href="${esc(cta.url)}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;">${esc(cta.label)}</a>
        </td>
      </tr>
    </table>`;
}

/** El correo completo, listo para mandar. */
export function renderSubscriptionEmail(
  content: SubscriptionEmailContent,
): string {
  const parrafos = content.intro
    .map(
      (line) =>
        `<p style="color:#475569;margin:0 0 18px 0;font-size:15.5px;line-height:1.7;">${esc(line)}</p>`,
    )
    .join('');

  const nota =
    content.footerNote ??
    'Este es un mensaje automático, por favor no responder a este correo.';

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${esc(content.title)} - CLYPS</title>
    <style type="text/css">
        body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse !important; }
        @media screen and (max-width: 630px) {
            .container { width: 94% !important; margin: 15px auto !important; }
            .header { padding: 25px 20px !important; }
            .content { padding: 25px 20px !important; }
            .footer { padding: 20px !important; }
        }
    </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
    <div class="container" style="max-width:580px;margin:30px auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">

        <div class="header" style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#ffffff;padding:35px 40px;text-align:center;">
            <h1 style="font-size:36px;font-weight:700;letter-spacing:0.5px;margin:0 0 8px 0;font-family:'Arial Black','Segoe UI',sans-serif;">CLYPS</h1>
            <p style="font-size:15px;font-weight:300;opacity:0.9;margin:0;">Gestión Profesional de Citas</p>
        </div>

        <div class="content" style="padding:40px;">
            <h2 style="font-size:22px;font-weight:600;color:#1e293b;margin:0 0 20px 0;border-bottom:2px solid #f1f5f9;padding-bottom:15px;">${esc(content.title)}</h2>

            <p style="color:#1e293b;margin:0 0 18px 0;font-size:15.5px;line-height:1.7;font-weight:600;">Hola, ${esc(content.greeting)}.</p>

            ${parrafos}
            ${content.notice ? renderNotice(content.notice) : ''}
            ${content.payment ? renderPayment(content.payment) : ''}
            ${content.cta ? renderCta(content.cta) : ''}

            <div style="height:1px;background:linear-gradient(to right,transparent,#e2e8f0,transparent);margin:30px 0;"></div>

            <p style="text-align:center;font-size:13px;color:#94a3b8;padding:10px;font-style:italic;margin:0;">
                ¿Tienes dudas con tu suscripción? Responde a este correo y te ayudamos.
            </p>
        </div>

        <div class="footer" style="background-color:#f8fafc;padding:25px 40px;text-align:center;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;">
            <p style="margin:5px 0;">© ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.</p>
            <p style="margin:5px 0;">Sistema de Gestión de Citas Profesional</p>
            <p style="font-size:12px;margin-top:8px;opacity:0.8;">${esc(nota)}</p>
        </div>

    </div>
</body>
</html>`;
}

/** El color de acento, por si algún llamador necesita hacer juego. */
export const SUBSCRIPTION_EMAIL_ACCENT = ACENTO;
