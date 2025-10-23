// File: lib/email.ts
// Dùng ở server (API routes). Không import file này trong client components.

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (typeof window !== 'undefined') {
    throw new Error('sendEmail() must only be called on the server');
  }

  const EMAIL_FROM = process.env.EMAIL_FROM;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';
  const UNSUB_LINK =
    process.env.EMAIL_UNSUBSCRIBE_URL || (BASE_URL ? `${BASE_URL}/unsubscribe` : '');

  if (!EMAIL_FROM) throw new Error('Missing EMAIL_FROM (env)');
  if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY (env)');

  const body: any = { from: EMAIL_FROM, to: [to], subject, html };
  if (UNSUB_LINK) {
    body.headers = { 'List-Unsubscribe': `<${UNSUB_LINK}>` };
  }

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend error ${res.status}: ${data?.message || res.statusText}`);
  }
  return data; // thường { id: 'email_...' }
}

export function renderEmailFromTemplate({
  rawHtml,
  fullName,
  email,
  rounds, // [{ project_title, round_label }]
}: {
  rawHtml: string;
  fullName: string;
  email: string;
  rounds: { project_title: string; round_label: string }[];
}) {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || '';
  const projectList =
    `<ul>` +
    rounds.map((r) => `<li>${r.project_title} – ${r.round_label}</li>`).join('') +
    `</ul>`;
  const openBtn = `<a href="${BASE_URL}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a>`;
  const footer =
    `<hr style="margin:24px 0"/>` +
    `<div style="font-size:12px;color:#6b7280">Khoa Y học cổ truyền - Đại học Y Dược Thành phố Hồ Chí Minh.</div>`;

  let html = rawHtml
    .replace(/{{\s*full_name\s*}}/gi, escapeHtml(fullName))
    .replace(/{{\s*email\s*}}/gi, escapeHtml(email))
    .replace(/{{\s*project_list\s*}}/gi, projectList)
    .replace(/{{\s*open_button\s*}}/gi, openBtn);

  if (!/{{\s*open_button\s*}}/i.test(rawHtml)) html += `<div style="margin-top:12px">${openBtn}</div>`;
  if (!/{{\s*project_list\s*}}/i.test(rawHtml)) html += `<div style="margin-top:12px">${projectList}</div>`;
  html += footer;
  return html;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>\"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}
