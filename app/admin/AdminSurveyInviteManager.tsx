// File: app/admin/AdminSurveyInviteManager.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; title: string; status: string };
type Round = { id: string; project_id: string; round_number: number };
type Profile = { id: string; email: string; name: string | null; role: string };

type ProgressRow = {
  user_id: string;
  user_name: string;
  email: string;
  project_id: string;
  project_title: string;
  round_id: string;
  round_label: string;
  status: 'submitted' | 'invited';
  responded_at?: string | null;
  invited_at?: string | null;
};

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN =
  'px-3 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN2 =
  'px-3 py-2 rounded-lg font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-50';

// Đổi giá trị này nếu enum hoạt động của bạn có tên khác ('published', 'open', ...).
const ACTIVE_STATUS = 'active';

/** --- Lightweight CSV parser (no dependency) ---
 *  - Supports commas, quotes, escaped quotes ("")
 *  - Supports CRLF/LF newlines
 *  - Returns array of objects using header row
 */
function parseCsvToObjects(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  let i = 0,
    field = '',
    row: string[] = [],
    inQuotes = false;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        const next = s[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += c;
        i++;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
        i++;
      } else if (c === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else {
        field += c;
        i++;
      }
    }
  }
  row.push(field);
  rows.push(row);
  while (rows.length && rows[rows.length - 1].every((v) => v.trim() === '')) rows.pop();
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    const rowVals = rows[r];
    header.forEach((h, idx) => {
      obj[h] = (rowVals[idx] ?? '').trim();
    });
    if (Object.values(obj).some((v) => v !== '')) out.push(obj);
  }
  return out;
}

export default function AdminSurveyInviteManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Bộ lọc & chọn
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole, setFilterRole] = useState<'' | 'core_expert' | 'external_expert'>('');
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);
  const [checkedProfiles, setCheckedProfiles] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');

  // Email
  const [emailSubject, setEmailSubject] = useState('Lời mời tham gia khảo sát');
  const [emailHtml, setEmailHtml] = useState(
    `
    <p>Chào {{full_name}},</p>
    <p>Anh/Chị được mời tham gia khảo sát cho các nội dung sau:</p>
    {{project_list}}
    <p>{{open_button}}</p>
  `.trim()
  );

  // Tiến độ
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [emailStats, setEmailStats] = useState<Record<string, string | null>>({});

  // ===== LOAD DATA =====
  useEffect(() => {
    (async () => {
      const [pr, rd, pf] = await Promise.all([
        supabase.from('projects').select('id,title,status').order('title'),
        supabase.from('rounds').select('id,project_id,round_number').order('round_number'),
        supabase.from('profiles').select('id,email,name,role').order('email'),
      ]);
      setProjects((pr.data as Project[]) || []);
      setRounds((rd.data as Round[]) || []);
      setProfiles((pf.data as Profile[]) || []);
    })();
  }, []);

  // ===== PROGRESS =====
  async function reloadProgress() {
    const params = new URLSearchParams();
    if (filterProject) params.set('project_id', filterProject);
    if (filterStatus) params.set('status', filterStatus);
    const r = await fetch('/api/surveys/progress?' + params.toString());
    const d = await r.json();
    setProgress(d.items || []);
  }
  useEffect(() => {
    reloadProgress();
  }, [filterProject, filterStatus]);

  // ===== DERIVED =====
  const roundsByProject = useMemo(() => {
    const m: Record<string, Round[]> = {};
    rounds.forEach((r) => {
      (m[r.project_id] ||= []).push(r);
    });
    Object.values(m).forEach((list) => list.sort((a, b) => a.round_number - b.round_number));
    return m;
  }, [rounds]);

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === ACTIVE_STATUS),
    [projects]
  );

  function toggleRound(id: string) {
    setSelectedRoundIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const filteredProfiles = useMemo(() => {
    const k = q.trim().toLowerCase();
    return profiles.filter((p) => {
      if (filterRole && p.role !== filterRole) return false;
      const hit = !k || p.email.toLowerCase().includes(k) || (p.name || '').toLowerCase().includes(k);
      return hit;
    });
  }, [profiles, q, filterRole]);

  const checkedIds = useMemo(
    () => Object.keys(checkedProfiles).filter((id) => checkedProfiles[id]),
    [checkedProfiles]
  );

    // ===== EMAIL STATS (đã gửi email chưa cho các vòng đang chọn) =====
  useEffect(() => {
    // Nếu chưa chọn vòng hoặc không có profile nào đang hiển thị thì clear
    if (selectedRoundIds.length === 0 || filteredProfiles.length === 0) {
      setEmailStats({});
      return;
    }

    (async () => {
      try {
        const profileIds = filteredProfiles.map((p) => p.id);

        const { data, error } = await supabase
          .from('email_log')
          .select('profile_id, round_ids, sent_at, status')
          .eq('status', 'sent') // chỉ tính email gửi thành công
          .in('profile_id', profileIds)
          .overlaps('round_ids', selectedRoundIds);

        if (error) {
          console.error('Lỗi load email_log:', error);
          setEmailStats({});
          return;
        }

        const map: Record<string, string> = {};
        (data || []).forEach((row: any) => {
          const pid = row.profile_id as string | null;
          const sentAt = row.sent_at as string | null;
          if (!pid || !sentAt) return;

          const prev = map[pid];
          if (!prev || new Date(sentAt).getTime() > new Date(prev).getTime()) {
            map[pid] = sentAt; // lưu lần gửi mới nhất
          }
        });

        setEmailStats(map);
      } catch (err) {
        console.error('Lỗi xử lý emailStats:', err);
        setEmailStats({});
      }
    })();
  }, [filteredProfiles, selectedRoundIds]);
  
  // ===== CSV upload → server bulk-upsert =====
  async function onUploadCsv(file: File) {
    setLoading(true);
    setMsg('Đang xử lý CSV...');
    try {
      const csvText = await file.text();
      const parsedRows = parseCsvToObjects(csvText);
      const rows = parsedRows
        .map((r) => {
          const full_name = String(r['full_name'] ?? r['name'] ?? '').trim();
          const email = String(r['email'] ?? '').trim().toLowerCase();
          const org = (r['org'] ?? '').trim();
          const title = (r['title'] ?? '').trim();
          const phone = (r['phone'] ?? '').trim();
          return {
            full_name,
            email,
            org: org || null,
            title: title || null,
            phone: phone || null,
          };
        })
        .filter((r) => r.full_name && r.email);

      if (rows.length === 0) {
        throw new Error(
          'Không tìm thấy dòng hợp lệ. Yêu cầu header: full_name,email (có thể kèm org,title,phone).'
        );
      }

      const res = await fetch('/api/experts/bulk-upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ experts: rows }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);

      setMsg(
        `✅ Đã cập nhật danh bạ: ${d.upserted} email. Tự tạo profiles cho ${
          d.details?.filter((x: any) => x.created_profile).length || 0
        } người.`
      );

      // refresh profiles
      const pf = await supabase.from('profiles').select('id,email,name,role').order('email');
      setProfiles(pf.data || []);
    } catch (e: any) {
      setMsg('❌ Lỗi CSV: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ===== ACTIONS =====
  function selectAllFiltered() {
    const next: Record<string, boolean> = { ...checkedProfiles };
    filteredProfiles.forEach((u) => {
      next[u.id] = true;
    });
    setCheckedProfiles(next);
  }
  function clearSelection() {
    setCheckedProfiles({});
  }
  function invertSelection() {
    const next: Record<string, boolean> = { ...checkedProfiles };
    filteredProfiles.forEach((u) => {
      next[u.id] = !next[u.id];
    });
    setCheckedProfiles(next);
  }

  async function act(mode: 'invite' | 'remind') {
    if (checkedIds.length === 0) {
      alert('Chọn ít nhất 1 người');
      return;
    }
    if (selectedRoundIds.length === 0) {
      alert('Chọn ít nhất 1 vòng');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_ids: checkedIds,
          round_ids: selectedRoundIds,
          mode,
          email: { subject: emailSubject, html: emailHtml },
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const ok = d.results?.filter((x: any) => x.ok).length || 0;
      setMsg(`Đã gửi ${ok}/${d.results?.length || 0} email.`);
      // giữ nguyên selection hoặc reset tuỳ bạn — ở đây reset
      setCheckedProfiles({});
      await reloadProgress();
    } catch (e: any) {
      setMsg('❌ Lỗi gửi email: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ===== PREVIEW =====
  const previewHtml = useMemo(() => {
    const sample = {
      raw: emailHtml,
      fullName: 'Nguyễn Văn A',
      email: 'vana@example.com',
      rounds: selectedRoundIds.map((rid) => {
        const r = rounds.find((x) => x.id === rid);
        const pj = projects.find((p) => p.id === r?.project_id);
        return { project_title: pj?.title || '', round_label: r ? `V${r.round_number}` : '' };
      }),
    };
    const ul =
      `<ul>` +
      sample.rounds.map((r) => `<li>${r.project_title} – ${r.round_label}</li>`).join('') +
      `</ul>`;
    let html = sample.raw
      .replace(/{{\s*full_name\s*}}/gi, sample.fullName)
      .replace(/{{\s*email\s*}}/gi, sample.email)
      .replace(/{{\s*project_list\s*}}/gi, ul)
      .replace(
        /{{\s*open_button\s*}}/gi,
        `<a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a>`
      );
    if (!/{{\s*open_button\s*}}/i.test(sample.raw))
      html += `<div style="margin-top:12px"><a href="${
        process.env.NEXT_PUBLIC_BASE_URL || ''
      }" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a></div>`;
    if (!/{{\s*project_list\s*}}/i.test(sample.raw)) html += `<div style="margin-top:12px">${ul}</div>`;
    html += `<hr style="margin:24px 0"/><div style="font-size:12px;color:#6b7280">Khoa Y học cổ truyền - Đại học Y Dược Thành phố Hồ Chí Minh.</div>`;
    return html;
  }, [emailHtml, selectedRoundIds, rounds, projects]);

  // ===== RENDER =====
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">✉️ Mời khảo sát</h1>
      {msg && <div className="p-3 rounded bg-indigo-50 text-indigo-700">{msg}</div>}

      {/* 1) CSV */}
      <div className="space-y-2">
        <div className="font-semibold">1) Nạp danh bạ từ CSV</div>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadCsv(f);
          }}
        />
        <div className="text-xs text-slate-600">
          CSV header tối thiểu: <code>full_name,email</code> (có thể kèm <code>org,title,phone</code>).
        </div>
      </div>

      {/* 2) Chọn rounds: chỉ project đang hoạt động */}
      <div className="space-y-2">
        <div className="font-semibold">2) Chọn vòng khảo sát (chỉ Project đang hoạt động)</div>
        <div className="grid md:grid-cols-2 gap-4">
          {activeProjects.map((p) => (
            <div key={p.id} className="border rounded-lg p-3">
              <div className="font-semibold mb-2">{p.title}</div>
              <div className="flex flex-wrap gap-2">
                {(roundsByProject[p.id] || []).map((r) => (
                  <label
                    key={r.id}
                    className={`inline-flex items-center gap-2 px-2 py-1 rounded border cursor-pointer ${
                      selectedRoundIds.includes(r.id) ? 'bg-blue-50 border-blue-300' : 'bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoundIds.includes(r.id)}
                      onChange={() => toggleRound(r.id)}
                    />{' '}
                    V{r.round_number}
                  </label>
                ))}
                {(roundsByProject[p.id] || []).length === 0 && (
                  <div className="text-slate-400 text-sm">(Chưa có vòng)</div>
                )}
              </div>
            </div>
          ))}
          {activeProjects.length === 0 && (
            <div className="text-slate-500">Không có project đang hoạt động.</div>
          )}
        </div>
      </div>

      {/* 3) Chọn người tham gia */}
      <div className="space-y-3">
        <div className="font-semibold">3) Chọn người tham gia khảo sát</div>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            className={INPUT + ' md:w-64'}
            placeholder="Tìm theo tên/email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className={INPUT + ' md:w-56'}
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as any)}
          >
            <option value="">— Tất cả vai trò —</option>
            <option value="core_expert">Chuyên gia nòng cốt</option>
            <option value="external_expert">Chuyên gia bên ngoài</option>
          </select>
          <div className="flex items-center gap-2">
            <button className={BTN2} onClick={selectAllFiltered}>
              Chọn tất cả (theo bộ lọc)
            </button>
            <button className={BTN2} onClick={invertSelection}>
              Đảo chọn
            </button>
            <button className={BTN2} onClick={clearSelection}>
              Bỏ chọn hết
            </button>
            <span className="text-sm text-slate-600">
              Đã chọn: <b>{checkedIds.length}</b> / {filteredProfiles.length}
            </span>
          </div>
        </div>

                <div className="border rounded max-h-80 overflow-auto">
          {filteredProfiles.map((u) => {
            const lastSent = selectedRoundIds.length ? emailStats[u.id] : null;

            return (
              <label
                key={u.id}
                className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={!!checkedProfiles[u.id]}
                  onChange={(e) =>
                    setCheckedProfiles((prev) => ({
                      ...prev,
                      [u.id]: e.target.checked,
                    }))
                  }
                />
                <div className="flex flex-col text-sm">
                  <span>
                    <b>{u.name || u.email}</b>{' '}
                    <span className="text-slate-500">
                      ({u.email}) – <i>{u.role}</i>
                    </span>
                  </span>

                  {/* Dòng hiển thị trạng thái email */}
                  {selectedRoundIds.length === 0 ? (
                    <span className="text-xs text-slate-400">
                      Chọn vòng ở bước 2 để xem trạng thái email.
                    </span>
                  ) : lastSent ? (
                    <span className="text-xs text-emerald-700">
                      Đã gửi email (cho ít nhất 1 vòng đã chọn) lần cuối:{' '}
                      {new Date(lastSent).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Chưa gửi email cho các vòng đã chọn.
                    </span>
                  )}
                </div>
              </label>
            );
          })}
          {filteredProfiles.length === 0 && (
            <div className="p-3 text-slate-500 text-sm">Không có người phù hợp bộ lọc.</div>
          )}
        </div>
      </div>

      {/* 4) Soạn email */}
      <div className="space-y-2">
        <div className="font-semibold">4) Soạn email</div>
        <label className="block text-sm">Tiêu đề</label>
        <input className={INPUT} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
        <label className="block text-sm">
          Nội dung HTML (hỗ trợ biến: <code>{'{{full_name}}'}</code>, <code>{'{{email}}'}</code>,{' '}
          <code>{'{{project_list}}'}</code>, <code>{'{{open_button}}'}</code>)
        </label>
        <textarea
          className={INPUT + ' h-48 font-mono'}
          value={emailHtml}
          onChange={(e) => setEmailHtml(e.target.value)}
        />
      </div>

      {/* 5) Preview */}
      <div className="space-y-2">
        <div className="font-semibold">5) Preview email</div>
        <div className="border rounded p-3">
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      </div>

      {/* 6) Hành động */}
      <div className="flex items-center gap-3">
        <button className={BTN} disabled={loading} onClick={() => act('invite')}>
          Mời (add + gửi)
        </button>
        <button className={BTN2} disabled={loading} onClick={() => act('remind')}>
          Nhắc (chỉ gửi)
        </button>
      </div>

      {/* 7) Tiến độ */}
      <div className="space-y-2">
        <div className="font-semibold">7) Tiến độ tham gia</div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={INPUT + ' md:w-64'}
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="">— Lọc theo Project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <select
            className={INPUT + ' md:w-48'}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">— Tất cả trạng thái —</option>
            <option value="submitted">Đã nộp</option>
            <option value="invited">Chưa nộp</option>
          </select>
          <button className={BTN2} onClick={reloadProgress}>
            Làm mới
          </button>
        </div>
        <div className="border rounded overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-left">Người tham gia</th>
                <th className="p-2">Project</th>
                <th className="p-2">Vòng</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2">Mời lúc</th>
                <th className="p-2">Đã nộp</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2 text-left">
                    {r.user_name} <span className="text-slate-500">({r.email})</span>
                  </td>
                  <td className="p-2 text-center">{r.project_title}</td>
                  <td className="p-2 text-center">{r.round_label}</td>
                  <td className="p-2 text-center">
                    {r.status === 'submitted' ? (
                      <span className="px-2 py-1 rounded bg-green-100 text-green-700">Đã nộp</span>
                    ) : (
                      <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">Chưa nộp</span>
                    )}
                  </td>
                  <td className="p-2 text-center">{r.invited_at ? new Date(r.invited_at).toLocaleString() : '—'}</td>
                  <td className="p-2 text-center">{r.responded_at ? new Date(r.responded_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {progress.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
