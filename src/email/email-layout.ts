export const EMAIL_FONT =
  "font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;";

const NAVY = '#0b1f3a';
const GOLD_TEXT = '#e8d5a3';

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmail(p: {
  title: string;
  accent: string;
  greeting: string;
  message: string;
  blocks: string[];
  footerNote?: string;
  preheader?: string;
  logoUrl?: string;
}): string {
  const font = EMAIL_FONT;
  const preheader = p.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${p.preheader}</div>`
    : '';
  const header = p.logoUrl
    ? `<tr>
            <td align="center" style="background-color:#ffffff;padding:24px 24px 18px 24px;${font}">
              <img src="${escapeHtml(p.logoUrl)}" alt="CLYPS" width="150" style="display:block;width:150px;height:auto;border:0;outline:none;">
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:${NAVY};padding:16px 24px;${font}">
              <div style="font-size:15px;color:${GOLD_TEXT};">${p.title}</div>
            </td>
          </tr>`
    : `<tr>
            <td align="center" style="background-color:${NAVY};padding:32px 24px;${font}">
              <div style="font-size:34px;font-weight:700;letter-spacing:2px;color:#ffffff;margin:0 0 6px 0;">CLYPS</div>
              <div style="font-size:15px;color:${GOLD_TEXT};">${p.title}</div>
            </td>
          </tr>`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${p.title} - CLYPS</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;${font}color:#334155;">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;">
    <tr>
      <td align="center" style="padding:30px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          ${header}
          <tr>
            <td style="height:4px;background-color:${p.accent};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:32px 28px;${font}">
              <div style="font-size:21px;font-weight:600;color:#1e293b;padding:0 0 14px 0;margin:0 0 18px 0;border-bottom:2px solid #f1f5f9;">${p.greeting}</div>
              <div style="font-size:15px;line-height:1.7;color:#475569;margin:0 0 24px 0;">${p.message}</div>
              ${p.blocks.filter(Boolean).join('\n              ')}
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 24px;font-size:12px;line-height:1.6;color:#64748b;${font}">
              ${p.footerNote ?? 'Este es un mensaje automático, por favor no respondas a este correo.'}<br>
              © ${new Date().getFullYear()} CLYPS. Todos los derechos reservados.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function emailCard(p: {
  title: string;
  subtitle?: string;
  accent: string;
  accentSoft: string;
  rows: { label: string; value: string }[];
  extra?: string;
}): string {
  const font = EMAIL_FONT;
  const rows = p.rows
    .map(
      (r) => `
                <tr>
                  <td style="padding:0 0 12px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
                      <tr>
                        <td style="padding:14px 18px;${font}">
                          <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 0 6px 0;">${r.label}</div>
                          <div style="font-size:17px;font-weight:600;color:#1e293b;">${r.value}</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`,
    )
    .join('');
  const subtitle = p.subtitle
    ? `<div style="font-size:13px;color:#64748b;text-align:center;margin:-10px 0 18px 0;">${p.subtitle}</div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${p.accentSoft};border:1px solid #e2e8f0;border-radius:10px;margin:0 0 20px 0;">
                <tr>
                  <td style="padding:22px 20px 10px 20px;${font}">
                    <div style="font-size:18px;font-weight:600;color:${p.accent};text-align:center;margin:0 0 18px 0;">${p.title}</div>
                    ${subtitle}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
                    </table>
                    ${p.extra ?? ''}
                  </td>
                </tr>
              </table>`;
}

export function emailNote(p: {
  title: string;
  body: string;
  accent: string;
  background?: string;
}): string {
  const font = EMAIL_FONT;
  const body = p.body
    ? `<div style="font-size:14px;line-height:1.6;color:#475569;margin:8px 0 0 0;">${p.body}</div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${p.background ?? '#f8fafc'};border-left:4px solid ${p.accent};border-radius:6px;margin:0 0 20px 0;">
                <tr>
                  <td style="padding:16px 18px;${font}">
                    <div style="font-size:14px;font-weight:700;color:#1e293b;">${p.title}</div>
                    ${body}
                  </td>
                </tr>
              </table>`;
}

export function emailList(items: string[], ordered = false): string {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} style="margin:0;padding:0 0 0 20px;">${items
    .map((i) => `<li style="margin:0 0 6px 0;">${i}</li>`)
    .join('')}</${tag}>`;
}

export function emailCode(p: {
  label: string;
  code: string;
  accent: string;
}): string {
  const font = EMAIL_FONT;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin:0 0 20px 0;">
                <tr>
                  <td align="center" style="padding:24px 16px;${font}">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 0 14px 0;">${p.label}</div>
                    <div style="display:inline-block;font-size:36px;font-weight:700;letter-spacing:8px;color:${p.accent};background-color:#ffffff;border:2px solid ${p.accent};border-radius:8px;padding:16px 24px;font-family:'Courier New',monospace;">${escapeHtml(p.code)}</div>
                  </td>
                </tr>
              </table>`;
}

export function emailParagraph(html: string, muted = false): string {
  return `<div style="font-size:${muted ? 13 : 15}px;line-height:1.6;color:${muted ? '#94a3b8' : '#475569'};margin:0 0 20px 0;${muted ? 'text-align:center;font-style:italic;' : ''}">${html}</div>`;
}

export function emailButton(
  href: string,
  label: string,
  primary = true,
): string {
  const font = EMAIL_FONT;
  const style = primary
    ? `background-color:${NAVY};color:#ffffff;border:2px solid ${NAVY};`
    : `background-color:#ffffff;color:${NAVY};border:2px solid ${NAVY};`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 20px auto;">
                <tr>
                  <td align="center" style="border-radius:8px;">
                    <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;${style}padding:13px 28px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;${font}">${label}</a>
                  </td>
                </tr>
              </table>`;
}

export function emailApp(p: {
  title: string;
  text: string;
  badges: string;
  showWebLink?: boolean;
}): string {
  const font = EMAIL_FONT;
  const web = p.showWebLink
    ? `<div style="font-size:13px;color:#64748b;margin:6px 0 0 0;">También puedes acceder desde <a href="https://sistemaclyps.com" style="color:${NAVY};font-weight:600;text-decoration:none;">sistemaclyps.com</a></div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fbf7ec;border:1px solid #e8d5a3;border-radius:10px;margin:0 0 20px 0;">
                <tr>
                  <td align="center" style="padding:22px 18px;${font}">
                    <div style="font-size:17px;font-weight:600;color:${NAVY};margin:0 0 10px 0;">${p.title}</div>
                    <div style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 16px 0;">${p.text}</div>
                    ${p.badges}
                    ${web}
                  </td>
                </tr>
              </table>`;
}

export function emailContact(info: {
  name?: string;
  email?: string;
  address?: string;
}): string {
  const name = info.name ? escapeHtml(info.name) : '';
  return [
    name
      ? `<div style="font-size:15px;line-height:1.6;color:#475569;margin:0 0 8px 0;">Si tienes dudas, contacta a <strong>${name}</strong>.</div>`
      : '',
    info.email
      ? `<div style="font-size:14px;color:#475569;margin:0 0 4px 0;">✉️ ${escapeHtml(info.email)}</div>`
      : '',
    info.address
      ? `<div style="font-size:14px;color:#475569;">📍 ${escapeHtml(info.address)}</div>`
      : '',
  ].join('');
}

export function emailSub(parts: string[]): string {
  const text = parts.filter(Boolean).join(' · ');
  return text
    ? `<div style="font-size:14px;font-weight:400;color:#64748b;margin:4px 0 0 0;">${text}</div>`
    : '';
}
