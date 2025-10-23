// File: lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);
const EMAIL_FROM = process.env.EMAIL_FROM!;
const UNSUB_LINK = process.env.EMAIL_UNSUBSCRIBE_URL || `${process.env.NEXT_PUBLIC_BASE_URL}/unsubscribe`;

export async function sendEmail({ to, subject, html }:{ to:string; subject:string; html:string; }) {
  const headers: Record<string,string> = {
    'List-Unsubscribe': `<${UNSUB_LINK}>`,
  };
  const r = await resend.emails.send({ from: EMAIL_FROM, to: [to], subject, html, headers });
  return r;
}

export function renderEmailFromTemplate({
  rawHtml,
  fullName,
  email,
  rounds, // [{project_title:string, round_label:string}]
}:{
  rawHtml: string;
  fullName: string;
  email: string;
  rounds: { project_title: string; round_label: string }[];
}) {
  const projectList = `<ul>` + rounds.map(r=>`<li>${r.project_title} – ${r.round_label}</li>`).join('') + `</ul>`;
  const openBtn = `<a href="${process.env.NEXT_PUBLIC_BASE_URL}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a>`;
  const footer = `<hr style="margin:24px 0"/><div style="font-size:12px;color:#6b7280">Khoa Y học cổ truyền - Đại học Y Dược Thành phố Hồ Chí Minh.</div>`;

  let html = rawHtml
    .replace(/{{\s*full_name\s*}}/gi, escapeHtml(fullName))
    .replace(/{{\s*email\s*}}/gi, escapeHtml(email))
    .replace(/{{\s*project_list\s*}}/gi, projectList)
    .replace(/{{\s*open_button\s*}}/gi, openBtn);

  // Nếu template không có open_button, tự chèn cuối
  if (!/{{\s*open_button\s*}}/i.test(rawHtml)) html += `<div style="margin-top:12px">${openBtn}</div>`;
  // Nếu template không có project_list, tự chèn
  if (!/{{\s*project_list\s*}}/i.test(rawHtml)) html += `<div style="margin-top:12px">${projectList}</div>`;
  html += footer;
  return html;
}

function escapeHtml(s:string){
  return s.replace(/[&<>"']/g, c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'
  } as Record<string,string>)[c] || c);
}
