// File: app/admin/AdminSurveyInviteManager.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; title: string; status: string };
type Round = { id: string; project_id: string; round_number: number };
type AppRole = 'admin' | 'secretary' | 'viewer' | 'core_expert' | 'external_expert';

type Profile = {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
  cohort_code: string | null;
};

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

const ACTIVE_STATUS = 'active';

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'secretary', label: 'Thư ký' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'core_expert', label: 'Chuyên gia nòng cốt' },
  { value: 'external_expert', label: 'Chuyên gia bên ngoài' },
];

const UI = {
  input:
    'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200',
  select:
    'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200 bg-white',
  btn:
    'px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50',
  btn2:
    'px-4 py-2 rounded-lg font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-50',
  card: 'border rounded-xl bg-white p-4 shadow-sm',
  title: 'text-lg font-semibold',
  muted: 'text-sm text-slate-500',
};

function isAppRole(x: any): x is AppRole {
  return ROLE_OPTIONS.some((o) => o.value === x);
}

/** --- CSV parser --- */
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

  // Step 2: chọn rounds
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);

  // Step 3: filters
  const [q, setQ] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | AppRole>('all');
  const [filterCohort, setFilterCohort] = useState<string>(''); // '' = all, '__NULL__' = null

  // Lọc theo “độ tuổi” email gửi lần cuối (7 ngày)
  const [filterEmailAge, setFilterEmailAge] = useState<'' | 'never' | 'recent_7' | 'older_7'>('');

  // selection
  const [checkedProfiles, setCheckedProfiles] = useState<Record<string, boolean>>({});

  // Role assignment khi invite
  const [defaultInviteRole, setDefaultInviteRole] = useState<AppRole>('external_expert');
  const [inviteRoleMap, setInviteRoleMap] = useState<Record<string, AppRole>>({}); // per profile override

  // pagination
  const PAGE_SIZE_PROFILES = 100;
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

  // progress
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [emailStats, setEmailStats] = useState<Record<string, string | null>>({});
  const [emailReloadTick, setEmailReloadTick] = useState(0);

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

      const batch = (data as Profile[]) || [];
      if (!batch.length) break;

      all = all.concat(batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return all;
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
      // ép role về AppRole nếu dữ liệu lạ
      const cleaned = allProfiles
        .map((p) => ({ ...p, role: isAppRole(p.role) ? p.role : 'viewer' }))
        .sort((a, b) => a.email.localeCompare(b.email));
      setProfiles(cleaned);
    })();
  }, []);

  // ===== DERIVED =====
  const roundsByProject = useMemo(() => {
    const m: Record<string, Round[]> = {};
    rounds.forEach((r) => ((m[r.project_id] ||= []).push(r)));
    Object.values(m).forEach((list) => list.sort((a, b) => a.round_number - b.round_number));
    return m;
  }, [rounds]);

  const activeProjects = useMemo(() => projects.filter((p) => p.status === ACTIVE_STATUS), [projects]);

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
    () => Math.max(1, Math.ceil(filteredProfiles.length / PAGE_SIZE_PROFILES)),
    [filteredProfiles.length]
  );

  const pageItems = useMemo(() => {
    const p = Math.min(Math.max(page, 1), totalPages);
    const start = (p - 1) * PAGE_SIZE_PROFILES;
    return filteredProfiles.slice(start, start + PAGE_SIZE_PROFILES);
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

  // ===== CSV upload =====
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
      const cleaned = allProfiles
        .map((p) => ({ ...p, role: isAppRole(p.role) ? p.role : 'viewer' }))
        .sort((a, b) => a.email.localeCompare(b.email));
      setProfiles(cleaned);
    } catch (e: any) {
      setMsg('❌ Lỗi CSV: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ===== ACTIONS selection (trang này) =====
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

  // ===== PROGRESS =====
  async function reloadProgress() {
    if (!filterProject && !filterStatus) {
      setProgress([]);
      return;
    }

    const params = new URLSearchParams();
    if (filterProject) params.set('project_id', filterProject);
    if (filterStatus) params.set('status', filterStatus);

    const r = await fetch('/api/surveys/progress?' + params.toString());
    const d = await r.json();
    setProgress(d.items || []);
  }

  useEffect(() => {
    reloadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProject, filterStatus]);

  // ===== PREVIEW email =====
  const previewHtml = useMemo(() => {
    const sampleFullName = 'Nguyễn Văn A';
    const sampleEmail = 'vana@example.com';

    const roundsInfo = selectedRoundIds.map((rid) => {
      const r = rounds.find((x) => x.id === rid);
      const pj = projects.find((p) => p.id === r?.project_id);
      return { project_title: pj?.title || '', round_label: r ? `V${r.round_number}` : '' };
    });

    const ul = `<ul>${roundsInfo
      .map((r) => `<li>${r.project_title} – ${r.round_label}</li>`)
      .join('')}</ul>`;

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
    if (checkedIds.length === 0) return alert('Chọn ít nhất 1 người');
    if (selectedRoundIds.length === 0) return alert('Chọn ít nhất 1 vòng');

    setLoading(true);
    try {
      // build invite_roles only for checked profiles (role override or default)
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

          // ✅ NEW payload: only meaningful for invite
          default_invite_role: defaultInviteRole,
          invite_roles,
        }),
      });

      const d = await r.json();
      if (d.error) throw new Error(d.error);

      const ok = d.results?.filter((x: any) => x.ok).length || 0;
      setMsg(`✅ Đã gửi ${ok}/${d.results?.length || 0} email.`);
      setCheckedProfiles({});
      await reloadProgress();
      setEmailReloadTick((t) => t + 1);
    } catch (e: any) {
      setMsg('❌ Lỗi gửi email: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  // ===== UI helpers =====
  function roleLabel(role: AppRole) {
    return ROLE_OPTIONS.find((x) => x.value === role)?.label || role;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">✉️ Mời khảo sát</h1>
          <div className={UI.muted}>
            Chọn vòng → chọn người → (chọn role khi mời) → soạn email → gửi.
          </div>
        </div>
      </div>

      {msg && <div className="p-3 rounded-lg bg-indigo-50 text-indigo-700">{msg}</div>}

      {/* GRID: left main + right email */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1) CSV */}
          <div className={UI.card}>
            <div className={UI.title}>1) Nạp danh bạ từ CSV</div>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadCsv(f);
                }}
              />
              <div className={UI.muted}>
                Header tối thiểu: <code>full_name,email</code> (có thể kèm <code>org,title,phone,cohort_code</code>)
              </div>
            </div>
          </div>

          {/* 2) Chọn rounds */}
          <div className={UI.card}>
            <div className={UI.title}>2) Chọn vòng khảo sát</div>
            <div className={UI.muted}>Chỉ hiển thị Project đang ở trạng thái “{ACTIVE_STATUS}”.</div>

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

            <div className="mt-3 text-sm text-slate-600">
              Đã chọn <b>{selectedRoundIds.length}</b> vòng.
            </div>
          </div>

          {/* 3) Chọn người + Role khi mời */}
          <div className={UI.card}>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <div className={UI.title}>3) Chọn người tham gia</div>
                <div className={UI.muted}>
                  Bạn có thể lọc theo role/đối tượng, và chọn role để gán khi mời.
                </div>
              </div>

              {/* Default invite role */}
              <div className="w-full md:w-72">
                <label className="block text-sm font-semibold mb-1">Role sẽ gán khi mời (mặc định)</label>
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

            {/* Filters */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-1">Tìm theo tên/email</label>
                <input className={UI.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhập từ khoá..." />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Lọc role (hiện có)</label>
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
                <label className="block text-sm font-semibold mb-1">Lọc theo lần gửi email (cho các vòng đã chọn)</label>
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
              </div>

              <div className="md:col-span-2 flex items-end justify-between gap-2">
                <div className="flex gap-2 flex-wrap">
                  <button className={UI.btn2} onClick={selectAllPage} type="button">
                    Chọn tất cả (trang)
                  </button>
                  <button className={UI.btn2} onClick={invertPage} type="button">
                    Đảo chọn (trang)
                  </button>
                  <button className={UI.btn2} onClick={clearPage} type="button">
                    Bỏ chọn (trang)
                  </button>
                </div>
                <div className="text-sm text-slate-600">
                  Đã chọn: <b>{checkedIds.length}</b> / {filteredProfiles.length}
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
                const inviteRole = inviteRoleMap[u.id] || defaultInviteRole;

                return (
                  <div key={u.id} className="flex flex-col md:flex-row md:items-center gap-3 px-3 py-3 border-b last:border-b-0">
                    <div className="flex items-start gap-3 flex-1">
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

                      <div className="min-w-0">
                        <div className="text-sm">
                          <b>{u.name || u.email}</b>{' '}
                          <span className="text-slate-500">
                            ({u.email}) · role hiện tại: <i>{u.role}</i>
                            {u.cohort_code ? <> · đối tượng: <b>{u.cohort_code}</b></> : null}
                          </span>
                        </div>

                        <div className="mt-1 text-xs">
                          {selectedRoundIds.length === 0 ? (
                            <span className="text-slate-400">Chọn vòng ở bước 2 để xem trạng thái email.</span>
                          ) : lastSent ? (
                            <span className="text-emerald-700">
                              Đã gửi email lần cuối: {new Date(lastSent).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-500">Chưa gửi email cho các vòng đã chọn.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Role to assign when inviting */}
                    <div className="w-full md:w-72">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Role sẽ gán khi mời (người này)
                      </label>
                      <select
                        className={UI.select}
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRoleMap((prev) => ({
                            ...prev,
                            [u.id]: e.target.value as AppRole,
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
                        (Mặc định: {roleLabel(defaultInviteRole)} · override: {roleLabel(inviteRole)})
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredProfiles.length === 0 && (
                <div className="p-3 text-slate-500 text-sm">Không có người phù hợp bộ lọc.</div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-4 flex items-center gap-3">
              <button className={UI.btn} disabled={loading} onClick={() => act('invite')} type="button">
                Mời (add + gửi)
              </button>
              <button className={UI.btn2} disabled={loading} onClick={() => act('remind')} type="button">
                Nhắc (chỉ gửi)
              </button>
              <div className="text-sm text-slate-500">
                Khi <b>mời</b> sẽ gán role theo lựa chọn; khi <b>nhắc</b> sẽ không đổi role.
              </div>
            </div>
          </div>

          {/* 7) Progress */}
          <div className={UI.card}>
            <div className={UI.title}>4) Tiến độ tham gia</div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold mb-1">Lọc theo Project</label>
                <select className={UI.select} value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
                  <option value="">— Chọn —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">Trạng thái</label>
                <select className={UI.select} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">— Tất cả —</option>
                  <option value="submitted">Đã nộp</option>
                  <option value="invited">Chưa nộp</option>
                </select>
              </div>

              <div className="flex items-end">
                <button className={UI.btn2} onClick={reloadProgress} type="button">
                  Làm mới
                </button>
              </div>
            </div>

            <div className="mt-3 border rounded-lg overflow-auto max-h-96">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Người tham gia</th>
                    <th className="p-2 text-center">Project</th>
                    <th className="p-2 text-center">Vòng</th>
                    <th className="p-2 text-center">Trạng thái</th>
                    <th className="p-2 text-center">Mời lúc</th>
                    <th className="p-2 text-center">Đã nộp</th>
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
                        {!filterProject && !filterStatus
                          ? 'Chọn Project hoặc Trạng thái để xem tiến độ.'
                          : 'Không có dữ liệu cho bộ lọc hiện tại.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT: email */}
        <div className="space-y-6">
          <div className={UI.card}>
            <div className={UI.title}>Email</div>

            <div className="mt-3 space-y-2">
              <label className="block text-sm font-semibold">Tiêu đề</label>
              <input className={UI.input} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />

              <label className="block text-sm font-semibold">
                Nội dung HTML{' '}
                <span className="text-xs font-normal text-slate-500">
                  (biến: <code>{'{{full_name}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{project_list}}'}</code>,{' '}
                  <code>{'{{open_button}}'}</code>)
                </span>
              </label>
              <textarea className={UI.input + ' h-56 font-mono text-sm'} value={emailHtml} onChange={(e) => setEmailHtml(e.target.value)} />
            </div>
          </div>

          <div className={UI.card}>
            <div className={UI.title}>Preview</div>
            <div className="mt-3 border rounded-lg p-3">
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
