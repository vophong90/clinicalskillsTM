// File: app/admin/AdminSurveyInviteManager.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; title: string; status: string };
type Round = { id: string; project_id: string; round_number: number };

export type AppRole = 'admin' | 'secretary' | 'viewer' | 'core_expert' | 'external_expert';

type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  cohort_code: string | null;
};

const ACTIVE_STATUS = 'active';

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'secretary', label: 'Thư ký' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'core_expert', label: 'Chuyên gia nòng cốt' },
  { value: 'external_expert', label: 'Chuyên gia bên ngoài' },
];

const UI = {
  page: 'space-y-6',
  header: 'flex items-start justify-between gap-3',
  h1: 'text-2xl font-bold',
  muted: 'text-sm text-slate-500',
  card: 'border rounded-xl bg-white p-4 shadow-sm',
  titleRow: 'flex items-start justify-between gap-3',
  title: 'text-lg font-semibold',
  badge: 'text-xs px-2 py-1 rounded bg-slate-100 text-slate-700',
  input:
    'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200',
  select:
    'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200 bg-white',
  btn:
    'px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
  btn2:
    'px-4 py-2 rounded-lg font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  danger:
    'px-4 py-2 rounded-lg font-semibold border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50',
  hr: 'border-t',
};

function isAppRole(x: any): x is AppRole {
  return ROLE_OPTIONS.some((o) => o.value === x);
}

/** --- Lightweight CSV parser ---
 * - Commas, quotes, escaped quotes ("")
 * - CRLF/LF
 * - Header row -> objects
 */
function parseCsvToObjects(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  const s = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '');
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

  // Step 1: chọn rounds
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);

  // Step 2: filters + selection
  const [q, setQ] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | AppRole>('all');
  const [filterCohort, setFilterCohort] = useState<string>(''); // '' = all, '__NULL__' = null
  const [filterEmailAge, setFilterEmailAge] = useState<'' | 'never' | 'recent_7' | 'older_7'>('');
  const [checkedProfiles, setCheckedProfiles] = useState<Record<string, boolean>>({});

  // Step 3: role assignment (khi invite)
  const [assignMode, setAssignMode] = useState<'all' | 'per_user'>('all');
  const [defaultInviteRole, setDefaultInviteRole] = useState<AppRole>('external_expert');
  const [inviteRoleMap, setInviteRoleMap] = useState<Record<string, AppRole>>({});
  const [openRoleModal, setOpenRoleModal] = useState(false);

  // pagination
  const PAGE_SIZE = 100;
  const [page, setPage] = useState(1);

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
  const [emailTab, setEmailTab] = useState<'edit' | 'preview'>('edit');

  // Global msg/loading
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Email stats (đã gửi lần cuối theo rounds đang chọn)
  const [emailStats, setEmailStats] = useState<Record<string, string | null>>({});
  const [emailReloadTick, setEmailReloadTick] = useState(0);

  // CSV modal
  const [openCsvModal, setOpenCsvModal] = useState(false);

  // ===== Helper: load profiles =====
  async function fetchAllProfiles(): Promise<Profile[]> {
    const PAGE = 1000;
    let from = 0;
    let all: Profile[] = [];
    while (true) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,name,role,cohort_code')
        .order('email')
        .range(from, from + PAGE - 1);

      if (error) {
        console.error('Lỗi load profiles:', error);
        break;
      }

      const batch = (data as any[]) || [];
      if (!batch.length) break;

      all = all.concat(
        batch.map((p) => ({
          ...p,
          role: isAppRole(p.role) ? p.role : 'viewer',
        }))
      );
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    return all.sort((a, b) => a.email.localeCompare(b.email));
  }

  // ===== LOAD BASE DATA =====
  useEffect(() => {
    (async () => {
      const [pr, rd] = await Promise.all([
        supabase.from('projects').select('id,title,status').order('title'),
        supabase.from('rounds').select('id,project_id,round_number').order('round_number'),
      ]);
      setProjects((pr.data as Project[]) || []);
      setRounds((rd.data as Round[]) || []);
      const allProfiles = await fetchAllProfiles();
      setProfiles(allProfiles);
    })();
  }, []);

  // ===== DERIVED =====
  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === ACTIVE_STATUS),
    [projects]
  );

  const roundsByProject = useMemo(() => {
    const m: Record<string, Round[]> = {};
    rounds.forEach((r) => ((m[r.project_id] ||= []).push(r)));
    Object.values(m).forEach((list) => list.sort((a, b) => a.round_number - b.round_number));
    return m;
  }, [rounds]);

  const cohortOptions = useMemo(() => {
    const set = new Set<string>();
    profiles.forEach((p) => {
      const v = (p.cohort_code || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  function toggleRound(id: string) {
    setSelectedRoundIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const baseProfiles = useMemo(() => {
    const k = q.trim().toLowerCase();
    return profiles.filter((p) => {
      if (filterRole !== 'all' && p.role !== filterRole) return false;

      if (filterCohort) {
        const cc = (p.cohort_code || '').trim();
        if (filterCohort === '__NULL__') {
          if (cc) return false;
        } else {
          if (cc !== filterCohort) return false;
        }
      }

      const hit =
        !k ||
        p.email.toLowerCase().includes(k) ||
        (p.name || '').toLowerCase().includes(k);
      return hit;
    });
  }, [profiles, q, filterRole, filterCohort]);

  const filteredProfiles = useMemo(() => {
    if (!filterEmailAge || selectedRoundIds.length === 0) return baseProfiles;

    const now = new Date();
    return baseProfiles.filter((p) => {
      const last = emailStats[p.id]; // string | null | undefined
      if (filterEmailAge === 'never') return !last;
      if (!last) return false;

      const lastDate = new Date(last);
      if (Number.isNaN(lastDate.getTime())) return false;

      const diffDays = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
      if (filterEmailAge === 'recent_7') return diffDays <= 7;
      if (filterEmailAge === 'older_7') return diffDays > 7;
      return true;
    });
  }, [baseProfiles, filterEmailAge, selectedRoundIds, emailStats]);

  // Reset page when filters change
  useEffect(() => setPage(1), [q, filterRole, filterEmailAge, filterCohort, selectedRoundIds]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredProfiles.length / PAGE_SIZE)),
    [filteredProfiles.length]
  );

  const pageItems = useMemo(() => {
    const p = Math.min(Math.max(page, 1), totalPages);
    const start = (p - 1) * PAGE_SIZE;
    return filteredProfiles.slice(start, start + PAGE_SIZE);
  }, [filteredProfiles, page, totalPages]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const checkedIds = useMemo(
    () => Object.keys(checkedProfiles).filter((id) => checkedProfiles[id]),
    [checkedProfiles]
  );

  // ===== Email stats =====
  useEffect(() => {
    if (selectedRoundIds.length === 0 || baseProfiles.length === 0) {
      setEmailStats({});
      return;
    }

    (async () => {
      try {
        const profileIds = baseProfiles.map((u) => u.id);
        const res = await fetch('/api/email/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_ids: profileIds, round_ids: selectedRoundIds }),
        });
        const d = await res.json();
        if (d.error) {
          console.error('Lỗi load email stats:', d.error);
          setEmailStats({});
          return;
        }
        setEmailStats(d.stats || {});
      } catch (e) {
        console.error('Lỗi gọi /api/email/stats:', e);
        setEmailStats({});
      }
    })();
  }, [baseProfiles, selectedRoundIds, emailReloadTick]);

  // ===== CSV upload (modal) =====
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
          const cohort_code = String(r['cohort_code'] ?? '').trim();
          return {
            full_name,
            email,
            org: org || null,
            title: title || null,
            phone: phone || null,
            cohort_code: cohort_code || null,
          };
        })
        .filter((r) => r.full_name && r.email);

      if (rows.length === 0) {
        throw new Error('Không tìm thấy dòng hợp lệ. Header tối thiểu: full_name,email');
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

      const allProfiles = await fetchAllProfiles();
      setProfiles(allProfiles);
      setOpenCsvModal(false);
    } catch (e: any) {
      setMsg('❌ Lỗi CSV: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ===== selection helpers =====
  function selectAllPage() {
    const next: Record<string, boolean> = { ...checkedProfiles };
    pageItems.forEach((u) => (next[u.id] = true));
    setCheckedProfiles(next);
  }
  function clearPage() {
    const next: Record<string, boolean> = { ...checkedProfiles };
    pageItems.forEach((u) => delete next[u.id]);
    setCheckedProfiles(next);
  }
  function invertPage() {
    const next: Record<string, boolean> = { ...checkedProfiles };
    pageItems.forEach((u) => (next[u.id] = !next[u.id]));
    setCheckedProfiles(next);
  }

  function roleLabel(role: AppRole) {
    return ROLE_OPTIONS.find((x) => x.value === role)?.label || role;
  }

  // ===== PREVIEW email =====
  const previewHtml = useMemo(() => {
    const sampleFullName = 'Nguyễn Văn A';
    const sampleEmail = 'vana@example.com';

    const roundsInfo = selectedRoundIds.map((rid) => {
      const r = rounds.find((x) => x.id === rid);
      const pj = projects.find((p) => p.id === r?.project_id);
      return { project_title: pj?.title || '', round_label: r ? `V${r.round_number}` : '' };
    });

    const ul = `<ul>${roundsInfo.map((r) => `<li>${r.project_title} – ${r.round_label}</li>`).join('')}</ul>`;

    let html = emailHtml
      .replace(/{{\s*full_name\s*}}/gi, sampleFullName)
      .replace(/{{\s*email\s*}}/gi, sampleEmail)
      .replace(/{{\s*project_list\s*}}/gi, ul)
      .replace(
        /{{\s*open_button\s*}}/gi,
        `<a href="${process.env.NEXT_PUBLIC_BASE_URL || ''}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a>`
      );

    if (!/{{\s*open_button\s*}}/i.test(emailHtml)) {
      html += `<div style="margin-top:12px"><a href="${
        process.env.NEXT_PUBLIC_BASE_URL || ''
      }" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a></div>`;
    }
    if (!/{{\s*project_list\s*}}/i.test(emailHtml)) {
      html += `<div style="margin-top:12px">${ul}</div>`;
    }

    html += `<hr style="margin:24px 0"/><div style="font-size:12px;color:#6b7280">Khoa Y học cổ truyền - Đại học Y Dược Thành phố Hồ Chí Minh.</div>`;
    return html;
  }, [emailHtml, selectedRoundIds, rounds, projects]);

  // ===== ACT: invite/remind =====
  async function act(mode: 'invite' | 'remind') {
    if (selectedRoundIds.length === 0) return alert('Chọn ít nhất 1 vòng');
    if (checkedIds.length === 0) return alert('Chọn ít nhất 1 người');

    setLoading(true);
    try {
      // build invite_roles only for checked profiles
      const invite_roles: Record<string, AppRole> = {};
      for (const pid of checkedIds) {
        invite_roles[pid] = inviteRoleMap[pid] || defaultInviteRole;
      }

      const r = await fetch('/api/invitations/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_ids: checkedIds,
          round_ids: selectedRoundIds,
          mode,
          email: { subject: emailSubject, html: emailHtml },

          // payload for role assignment
          default_invite_role: defaultInviteRole,
          invite_roles,
        }),
      });

      const d = await r.json();
      if (d.error) throw new Error(d.error);

      const ok = d.results?.filter((x: any) => x.ok).length || 0;
      setMsg(`✅ Đã gửi ${ok}/${d.results?.length || 0} email.`);
      setCheckedProfiles({});
      setEmailReloadTick((t) => t + 1);
    } catch (e: any) {
      setMsg('❌ Lỗi gửi email: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ===== Step summaries =====
  const selectedRoundCount = selectedRoundIds.length;
  const selectedPeopleCount = checkedIds.length;

  // If assignMode == all, clear per-user overrides for cleanliness (optional)
  useEffect(() => {
    if (assignMode === 'all') {
      // giữ map vẫn được, nhưng để UX gọn: khi chuyển về "all" thì đóng modal
      setOpenRoleModal(false);
    }
  }, [assignMode]);

  // ===== Render =====
  return (
    <div className={UI.page}>
      <div className={UI.header}>
        <div>
          <h1 className={UI.h1}>✉️ Mời khảo sát</h1>
          <div className={UI.muted}>
            Luồng: Chọn vòng → Chọn người → Gán role → Soạn email → Gửi.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className={UI.btn2} type="button" onClick={() => setOpenCsvModal(true)}>
            Import CSV
          </button>
          <a href="/admin/surveys/progress" className={UI.btn2}>
            Theo dõi khảo sát
          </a>
        </div>
      </div>

      {msg && <div className="p-3 rounded-lg bg-indigo-50 text-indigo-700">{msg}</div>}

      {/* STEP 1: Rounds */}
      <div className={UI.card}>
        <div className={UI.titleRow}>
          <div>
            <div className={UI.title}>1) Chọn vòng khảo sát</div>
            <div className={UI.muted}>Chỉ hiển thị Project trạng thái “{ACTIVE_STATUS}”.</div>
          </div>
          <div className={UI.badge}>Đã chọn: {selectedRoundCount} vòng</div>
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-4">
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
                    />
                    V{r.round_number}
                  </label>
                ))}
                {(roundsByProject[p.id] || []).length === 0 && (
                  <div className="text-slate-400 text-sm">(Chưa có vòng)</div>
                )}
              </div>
            </div>
          ))}
          {activeProjects.length === 0 && <div className="text-slate-500">Không có project đang hoạt động.</div>}
        </div>

        {selectedRoundIds.length > 0 && (
          <div className="mt-3">
            <button className={UI.btn2} type="button" onClick={() => setSelectedRoundIds([])}>
              Bỏ chọn tất cả
            </button>
          </div>
        )}
      </div>

      {/* STEP 2: Select people */}
      <div className={UI.card}>
        <div className={UI.titleRow}>
          <div>
            <div className={UI.title}>2) Chọn người tham gia</div>
            <div className={UI.muted}>Lọc theo role/đối tượng + trạng thái email (theo vòng đã chọn).</div>
          </div>
          <div className={UI.badge}>Đã chọn: {selectedPeopleCount} người</div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">Tìm theo tên/email</label>
            <input className={UI.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhập từ khoá..." />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Role hiện tại</label>
            <select className={UI.select} value={filterRole} onChange={(e) => setFilterRole(e.target.value as any)}>
              <option value="all">— Tất cả —</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} ({r.value})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Đối tượng (cohort)</label>
            <select className={UI.select} value={filterCohort} onChange={(e) => setFilterCohort(e.target.value)}>
              <option value="">— Tất cả —</option>
              <option value="__NULL__">(Chưa gán đối tượng)</option>
              {cohortOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">Lần gửi email (theo vòng đã chọn)</label>
            <select
              className={UI.select}
              value={filterEmailAge}
              onChange={(e) => setFilterEmailAge(e.target.value as any)}
              disabled={selectedRoundIds.length === 0}
            >
              <option value="">— Không lọc —</option>
              <option value="never">Chưa từng gửi</option>
              <option value="recent_7">Đã gửi trong 7 ngày</option>
              <option value="older_7">Đã gửi &gt; 7 ngày</option>
            </select>
            {selectedRoundIds.length === 0 && (
              <div className="text-xs text-slate-400 mt-1">Chọn vòng trước để dùng bộ lọc này.</div>
            )}
          </div>

          <div className="md:col-span-2 flex items-end justify-between gap-2">
            <div className="flex gap-2 flex-wrap">
              <button className={UI.btn2} onClick={selectAllPage} type="button">
                Chọn trang
              </button>
              <button className={UI.btn2} onClick={invertPage} type="button">
                Đảo trang
              </button>
              <button className={UI.btn2} onClick={clearPage} type="button">
                Bỏ chọn trang
              </button>
            </div>
            <div className="text-sm text-slate-600">
              Tổng: <b>{filteredProfiles.length}</b> · Đã chọn: <b>{checkedIds.length}</b>
            </div>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center gap-2">
          <button className={UI.btn2} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} type="button">
            ← Trước
          </button>
          <div className="text-sm text-slate-600">
            Trang <b>{page}</b> / {totalPages}
          </div>
          <button
            className={UI.btn2}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            type="button"
          >
            Sau →
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-slate-500">Đi tới:</span>
            <input
              className={UI.input + ' w-24'}
              type="number"
              min={1}
              max={totalPages}
              value={page}
              onChange={(e) => setPage(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* List */}
        <div className="mt-3 border rounded-lg overflow-auto max-h-[520px]">
          {pageItems.map((u) => {
            const checked = !!checkedProfiles[u.id];
            const lastSent = selectedRoundIds.length ? emailStats[u.id] : null;

            return (
              <label key={u.id} className="flex items-start gap-3 px-3 py-3 border-b last:border-b-0">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={(e) =>
                    setCheckedProfiles((prev) => ({
                      ...prev,
                      [u.id]: e.target.checked,
                    }))
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <b>{u.name || u.email}</b>{' '}
                    <span className="text-slate-500">
                      ({u.email}) · role: <i>{u.role}</i>
                      {u.cohort_code ? <> · đối tượng: <b>{u.cohort_code}</b></> : null}
                    </span>
                  </div>
                  <div className="mt-1 text-xs">
                    {selectedRoundIds.length === 0 ? (
                      <span className="text-slate-400">Chọn vòng để xem trạng thái gửi email.</span>
                    ) : lastSent ? (
                      <span className="text-emerald-700">
                        Đã gửi email lần cuối: {new Date(lastSent).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-500">Chưa gửi email cho các vòng đã chọn.</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}

          {filteredProfiles.length === 0 && (
            <div className="p-3 text-slate-500 text-sm">Không có người phù hợp bộ lọc.</div>
          )}
        </div>
      </div>

      {/* STEP 3: Role assignment */}
      <div className={UI.card}>
        <div className={UI.titleRow}>
          <div>
            <div className={UI.title}>3) Gán role khi mời</div>
            <div className={UI.muted}>
              Khi bấm <b>Mời</b>: hệ thống sẽ upsert <code>permissions.role</code> theo role bạn chọn.
              Khi bấm <b>Nhắc</b>: chỉ gửi email, không đổi role.
            </div>
          </div>
          <div className={UI.badge}>
            Mặc định: {defaultInviteRole} · Override: {Object.keys(inviteRoleMap).length}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer">
            <input
              type="radio"
              name="assignMode"
              checked={assignMode === 'all'}
              onChange={() => setAssignMode('all')}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="font-semibold">Gán 1 role cho tất cả người đã chọn</div>
              <div className="text-sm text-slate-500">Nhanh, gọn — phù hợp đa số trường hợp.</div>
              <div className="mt-2">
                <select
                  className={UI.select}
                  value={defaultInviteRole}
                  onChange={(e) => setDefaultInviteRole(e.target.value as AppRole)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} ({r.value})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer">
            <input
              type="radio"
              name="assignMode"
              checked={assignMode === 'per_user'}
              onChange={() => setAssignMode('per_user')}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="font-semibold">Gán role riêng cho từng người</div>
              <div className="text-sm text-slate-500">
                Mở bảng gán role cho <b>những người đã tick</b>.
              </div>
              <div className="mt-2 flex gap-2 flex-wrap">
                <button
                  className={UI.btn2}
                  type="button"
                  onClick={() => setOpenRoleModal(true)}
                  disabled={checkedIds.length === 0}
                  title={checkedIds.length === 0 ? 'Chọn người trước' : ''}
                >
                  Mở bảng gán role ({checkedIds.length})
                </button>

                <button
                  className={UI.btn2}
                  type="button"
                  onClick={() => setInviteRoleMap({})}
                  disabled={Object.keys(inviteRoleMap).length === 0}
                >
                  Xoá override
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Nếu một người không có override → dùng role mặc định: <b>{roleLabel(defaultInviteRole)}</b>.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* STEP 4: Email + send */}
      <div className={UI.card}>
        <div className={UI.titleRow}>
          <div>
            <div className={UI.title}>4) Email & gửi</div>
            <div className={UI.muted}>
              Checklist: chọn vòng ({selectedRoundCount}) · chọn người ({selectedPeopleCount}) · có subject/body.
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className={emailTab === 'edit' ? UI.btn2 : UI.btn2}
              type="button"
              onClick={() => setEmailTab('edit')}
            >
              Soạn
            </button>
            <button
              className={emailTab === 'preview' ? UI.btn2 : UI.btn2}
              type="button"
              onClick={() => setEmailTab('preview')}
            >
              Preview
            </button>
          </div>
        </div>

        <div className="mt-4">
          {emailTab === 'edit' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold mb-1">Tiêu đề</label>
                <input className={UI.input} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">
                  Nội dung HTML{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (biến: <code>{'{{full_name}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{project_list}}'}</code>,{' '}
                    <code>{'{{open_button}}'}</code>)
                  </span>
                </label>
                <textarea
                  className={UI.input + ' h-56 font-mono text-sm'}
                  value={emailHtml}
                  onChange={(e) => setEmailHtml(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="border rounded-lg p-3">
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button className={UI.btn} disabled={loading} onClick={() => act('invite')} type="button">
            Mời (add + gán role + gửi)
          </button>
          <button className={UI.btn2} disabled={loading} onClick={() => act('remind')} type="button">
            Nhắc (chỉ gửi)
          </button>
          <div className="text-sm text-slate-500">
            Role sẽ gán theo: {assignMode === 'all' ? 'mặc định cho tất cả' : 'override theo từng người (nếu có)'}.
          </div>
        </div>
      </div>

      {/* ===== CSV MODAL ===== */}
      {openCsvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-lg">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Import danh bạ từ CSV</div>
                <div className="text-sm text-slate-500">
                  Header tối thiểu: <code>full_name,email</code> (có thể kèm <code>org,title,phone,cohort_code</code>)
                </div>
              </div>
              <button className={UI.btn2} onClick={() => setOpenCsvModal(false)} type="button">
                Đóng
              </button>
            </div>

            <div className="p-4 space-y-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadCsv(f);
                }}
              />

              <div className="text-xs text-slate-500">
                Gợi ý: nếu CSV có cột <code>cohort_code</code> thì sẽ gán đối tượng ngay.
              </div>

              <div className="flex justify-end gap-2">
                <button className={UI.btn2} onClick={() => setOpenCsvModal(false)} type="button">
                  Hủy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ROLE MODAL (per-user) ===== */}
      {openRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg">
            <div className="p-4 border-b flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Gán role cho từng người đã chọn</div>
                <div className="text-sm text-slate-500">
                  Nếu không chọn override → dùng role mặc định: <b>{defaultInviteRole}</b>
                </div>
              </div>
              <div className="flex gap-2">
                <button className={UI.btn2} onClick={() => setOpenRoleModal(false)} type="button">
                  Đóng
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-600">Apply to all:</span>
                <select
                  className={UI.select + ' w-64'}
                  value={defaultInviteRole}
                  onChange={(e) => setDefaultInviteRole(e.target.value as AppRole)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} ({r.value})
                    </option>
                  ))}
                </select>

                <button
                  className={UI.btn2}
                  type="button"
                  onClick={() => {
                    const next = { ...inviteRoleMap };
                    checkedIds.forEach((pid) => (next[pid] = defaultInviteRole));
                    setInviteRoleMap(next);
                  }}
                  disabled={checkedIds.length === 0}
                >
                  Set role này cho tất cả ({checkedIds.length})
                </button>

                <button className={UI.btn2} type="button" onClick={() => setInviteRoleMap({})}>
                  Xoá toàn bộ override
                </button>
              </div>

              <div className="border rounded-lg overflow-auto max-h-[60vh]">
                {checkedIds.map((pid) => {
                  const u = profiles.find((x) => x.id === pid);
                  if (!u) return null;
                  const override = inviteRoleMap[pid] || '';

                  return (
                    <div key={pid} className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <b>{u.name || u.email}</b> <span className="text-slate-500">({u.email})</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          role hiện tại: <i>{u.role}</i>
                          {u.cohort_code ? <> · đối tượng: <b>{u.cohort_code}</b></> : null}
                        </div>
                      </div>

                      <div className="w-72">
                        <select
                          className={UI.select}
                          value={override || defaultInviteRole}
                          onChange={(e) =>
                            setInviteRoleMap((prev) => ({
                              ...prev,
                              [pid]: e.target.value as AppRole,
                            }))
                          }
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label} ({r.value})
                            </option>
                          ))}
                        </select>
                        <div className="text-xs text-slate-500 mt-1">
                          Override: <b>{override ? override : '(chưa)'}</b>
                        </div>
                      </div>

                      <button
                        className={UI.danger}
                        type="button"
                        onClick={() =>
                          setInviteRoleMap((prev) => {
                            const next = { ...prev };
                            delete next[pid];
                            return next;
                          })
                        }
                        disabled={!inviteRoleMap[pid]}
                      >
                        Bỏ override
                      </button>
                    </div>
                  );
                })}

                {checkedIds.length === 0 && (
                  <div className="p-3 text-sm text-slate-500">Chưa chọn người nào.</div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button className={UI.btn2} onClick={() => setOpenRoleModal(false)} type="button">
                  Xong
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
