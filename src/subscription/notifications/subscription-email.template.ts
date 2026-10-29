import {
  emailButton,
  emailCard,
  emailNote,
  emailParagraph,
  escapeHtml,
  renderEmail,
} from '../../email/email-layout';

const TONOS = {
  info: { accent: '#1d4ed8', bg: '#eff6ff' },
  ok: { accent: '#059669', bg: '#ecfdf5' },
  warn: { accent: '#d97706', bg: '#fffbeb' },
} as const;

export interface SubscriptionEmailNotice {
  tone: keyof typeof TONOS;
  icon: string;
  text: string;
}

export interface SubscriptionEmailContent {
  title: string;
  greeting: string;
  intro: string[];
  notice?: SubscriptionEmailNotice;
  payment?: { title: string; lines: string[] };
  cta?: { label: string; url: string };
  footerNote?: string;
}

const ACENTO = '#1d4ed8';

function paymentRow(line: string): { label: string; value: string } {
  const at = line.indexOf(':');
  if (at <= 0) return { label: '', value: escapeHtml(line) };
  return {
    label: escapeHtml(line.slice(0, at).trim()),
    value: escapeHtml(line.slice(at + 1).trim()),
  };
}

export function renderSubscriptionEmail(
  content: SubscriptionEmailContent,
): string {
  const tono = content.notice
    ? (TONOS[content.notice.tone] ?? TONOS.info)
    : TONOS.info;

  return renderEmail({
    title: escapeHtml(content.title),
    accent: content.notice ? tono.accent : ACENTO,
    greeting: `Hola ${escapeHtml(content.greeting)},`,
    message: content.intro.map(escapeHtml).join('<br><br>'),
    blocks: [
      content.notice
        ? emailNote({
            title: `${escapeHtml(content.notice.icon)} ${escapeHtml(content.notice.text)}`,
            body: '',
            accent: tono.accent,
            background: tono.bg,
          })
        : '',
      content.payment?.lines.length
        ? emailCard({
            title: `💳 ${escapeHtml(content.payment.title)}`,
            accent: ACENTO,
            accentSoft: '#eff6ff',
            rows: content.payment.lines.map(paymentRow),
          })
        : '',
      content.cta
        ? emailButton(content.cta.url, escapeHtml(content.cta.label))
        : '',
      emailParagraph(
        '¿Tienes dudas con tu suscripción? Responde a este correo y te ayudamos.',
        true,
      ),
    ],
    footerNote: content.footerNote ? escapeHtml(content.footerNote) : undefined,
  });
}

export const SUBSCRIPTION_EMAIL_ACCENT = ACENTO;
