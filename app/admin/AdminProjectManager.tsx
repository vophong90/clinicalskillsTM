'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Project = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_by: string;
  created_at: string;
};

const INPUT =
  'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN_PRIMARY =
  'inline-flex items-center px-4 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN_SECONDARY =
  'inline-flex items-center px-3 py-1.5 rounded-lg font-semibold bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50';
const BTN_DANGER =
  'inline-flex items-center px-3 py-1.5 rounded-lg font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50';

// ✅ 10 project / trang
const PAGE_SIZE = 10;

/** Map status DB -> UI tiếng Việt */
const PROJECT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Bản nháp' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'completed', label: 'Kết thúc' },
] as const;

function viProjectStatus(value: string) {
  return PROJECT_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

// CSV parser đơn giản: xử lý tốt CSV “phẳng” (không xử lý ngoặc kép phức tạp).
function parseSimpleCSV(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cols[idx] ?? '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

function toStartOfDayISO(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}
function toNextDayStartISO(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// ✅ Normalize + escape cho ilike/or filter
function normalizeQuery(s: string) {
  return (s ?? '').trim().normalize('NFC');
}
function escapeForIlike(s: string) {
  // PostgREST ilike không có ESCAPE clause rõ ràng, nhưng vẫn nên tránh %/_ phá pattern
  // (đa số trường hợp thực tế không nhập %/_ nên cũng ổn)
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export default function AdminProjectManager() {
  // ====== CREATE SINGLE ======
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<(typeof PROJECT_STATUS_OPTIONS)[number]['value']>('active');

  // ====== CSV BULK CREATE ======
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreviewCount, setCsvPreviewCount] = useState<number>(0);
  const [bulkCreating, setBulkCreating] = useState(false);

  // ====== LIST + PAGINATION ======
  const [projects, setProjects] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  // ====== FILTERS ======
  const [filterTitle, setFilterTitle] = useState<string>(''); // ✅ tìm theo tên
  const [filterStatus, setFilterStatus] = useState<string>(''); // '' = all
  const [dateFrom, setDateFrom] = useState<string>(''); // YYYY-MM-DD
  const [dateTo, setDateTo] = useState<string>(''); // YYYY-MM-DD

  // ====== INLINE EDIT ======
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string; status: string }>>({});
  const [savingId, setSavingId] = useState<string>('');

  // ====== UI ======
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // khi đổi filter => về trang 1
  useEffect(() => {
    loadProjects(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterTitle, filterStatus, dateFrom, dateTo]);

  async function loadProjects(nextPage: number) {
    setLoading(true);
    setMessage('');

    const from = (nextPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from('projects')
      .select('id, title, description, status, created_by, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filterStatus) q = q.eq('status', filterStatus);

    // ✅ FIX CHẮC CHẮN: dùng contains-substring bằng ILIKE + OR pattern
    // - gõ "nội" phải match "(nội bộ)"
    // - không phụ thuộc dấu "("
    const raw = normalizeQuery(filterTitle);
    if (raw) {
      const kw = escapeForIlike(raw);
      // PostgREST .or() nhận chuỗi điều kiện phân tách bằng dấu phẩy
      // Lưu ý: pattern phải viết dạng title.ilike.%...%
      q = q.or(
        [
          `title.ilike.%${kw}%`,
          `title.ilike.%(${kw}%`,
          `title.ilike.%（${kw}%`, // ngoặc fullwidth (hay gặp trong dữ liệu copy/paste)
        ].join(',')
      );
    }

    if (dateFrom) q = q.gte('created_at', toStartOfDayISO(dateFrom));
    if (dateTo) q = q.lt('created_at', toNextDayStartISO(dateTo));

    const { data, error, count } = await q.range(from, to);

    if (error) {
      setProjects([]);
      setTotal(0);
      setMessage('❌ Lỗi tải projects: ' + error.message);
      setLoading(false);
      return;
    }

    const rows = (data as Project[]) ?? [];
    setProjects(rows);
    setTotal(count ?? 0);
    setPage(nextPage);

    setDrafts((prev) => {
      const next = { ...prev };
      rows.forEach((p) => {
        if (!next[p.id]) {
          next[p.id] = {
            title: p.title,
            description: p.description ?? '',
            status: p.status,
          };
        }
      });
      return next;
    });

    setLoading(false);
  }

  async function createProject() {
    setMessage('');
    if (!title.trim()) return;

    const { data: ures, error: uerr } = await supabase.auth.getUser();
    if (uerr || !ures.user) {
      setMessage('❌ Bạn chưa đăng nhập!');
      return;
    }

    const created_by = ures.user.id;

    const { error } = await supabase.from('projects').insert({
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      status,
      created_by,
    });

    if (error) setMessage('❌ Lỗi tạo project: ' + error.message);
    else setMessage('✅ Đã tạo Project mới!');

    setTitle('');
    setDescription('');
    setStatus('active');

    await loadProjects(1);
  }

  async function updateProject(id: string) {
    setMessage('');
    const d = drafts[id];
    if (!d) return;

    setSavingId(id);
    const { error } = await supabase
      .from('projects')
      .update({
        title: d.title.trim(),
        description: d.description.trim() ? d.description.trim() : null,
        status: d.status,
      })
      .eq('id', id);

    if (error) setMessage('❌ Lỗi cập nhật: ' + error.message);
    else setMessage('✅ Đã cập nhật Project!');

    setSavingId('');
    await loadProjects(page);
  }

  async function deleteProject(id: string) {
    const ok = window.confirm('Bạn chắc chắn muốn xóa Project này? Hành động không thể hoàn tác.');
    if (!ok) return;

    setMessage('');
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) setMessage('❌ Lỗi xóa: ' + error.message);
    else setMessage('🗑️ Đã xóa Project!');

    const nextPage = page > 1 && projects.length === 1 ? page - 1 : page;
    await loadProjects(nextPage);
  }

  // ====== CSV: preview + bulk create ======
  async function previewCSV(file: File) {
    setMessage('');
    setCsvPreviewCount(0);

    const text = await file.text();
    const rows = parseSimpleCSV(text);

    const valid = rows
      .map((r) => ({
        title: (r.title ?? '').trim(),
        description: (r.description ?? '').trim(),
      }))
      .filter((r) => r.title.length > 0);

    setCsvPreviewCount(valid.length);
  }

  async function bulkCreateFromCSV() {
    setMessage('');
    if (!csvFile) {
      setMessage('❌ Vui lòng chọn file CSV trước.');
      return;
    }

    const { data: ures, error: uerr } = await supabase.auth.getUser();
    if (uerr || !ures.user) {
      setMessage('❌ Bạn chưa đăng nhập!');
      return;
    }
    const created_by = ures.user.id;

    setBulkCreating(true);
    try {
      const text = await csvFile.text();
      const rows = parseSimpleCSV(text);

      const items = rows
        .map((r) => ({
          title: (r.title ?? '').trim(),
          description: (r.description ?? '').trim(),
        }))
        .filter((r) => r.title.length > 0)
        .map((r) => ({
          title: r.title,
          description: r.description ? r.description : null,
          status: 'active',
          created_by,
        }));

      if (items.length === 0) {
        setMessage('❌ CSV không có dòng hợp lệ (cần có cột title).');
        return;
      }

      const ok = window.confirm(`Tạo ${items.length} project từ CSV?`);
      if (!ok) return;

      const BATCH = 200;
      let success = 0;
      let failed = 0;

      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        const { error } = await supabase.from('projects').insert(chunk);
        if (error) {
          console.error(error);
          failed += chunk.length;
        } else {
          success += chunk.length;
        }
      }

      setMessage(`✅ Đã tạo ${success} project. Thất bại: ${failed}.`);
      setCsvFile(null);
      setCsvPreviewCount(0);

      await loadProjects(1);
    } catch (e: any) {
      setMessage('❌ Lỗi xử lý CSV: ' + (e?.message ?? String(e)));
    } finally {
      setBulkCreating(false);
    }
  }

  const COMPACT_INPUT =
    'w-full border rounded-md px-2 py-1 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';

  return (
    <div className="w-full mx-auto py-8 space-y-6">
      <h2 className="text-2xl font-bold">📁 Quản lý Project</h2>

      {message && <div className="rounded-lg border bg-green-50 text-green-700 px-3 py-2">{message}</div>}

      {/* ===== CREATE SINGLE ===== */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">➕ Tạo Project</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className={INPUT}
            placeholder="Tên Project (title)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value as any)}>
            {PROJECT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <textarea
          className={INPUT}
          placeholder="Mô tả (description)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <button type="button" onClick={createProject} className={BTN_PRIMARY} disabled={!title.trim()}>
          ➕ Tạo Project
        </button>
      </section>

      {/* ===== CSV BULK CREATE ===== */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">⬆️ Upload CSV để tạo nhiều Project</h3>
        <p className="text-sm text-gray-600">
          CSV cần header:{' '}
          <code className="px-1 py-0.5 bg-gray-100 rounded text-xs">title,description</code>
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0] ?? null;
              setCsvFile(f);
              if (f) await previewCSV(f);
            }}
          />

          {csvPreviewCount > 0 && (
            <span className="text-sm text-gray-700">
              Preview: <b>{csvPreviewCount}</b> dòng hợp lệ
            </span>
          )}

          <button type="button" className={BTN_PRIMARY} disabled={!csvFile || bulkCreating} onClick={bulkCreateFromCSV}>
            {bulkCreating ? 'Đang tạo…' : 'Tạo từ CSV'}
          </button>

          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={!csvFile || bulkCreating}
            onClick={() => {
              setCsvFile(null);
              setCsvPreviewCount(0);
            }}
          >
            Hủy file
          </button>
        </div>
      </section>

      {/* ===== FILTERS (1 ROW, gọn) ===== */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">🔎 Bộ lọc</h3>

        <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-1">
          <div className="min-w-[280px]">
            <label className="text-sm text-gray-600">Tìm theo tên Project</label>
            <input
              className={INPUT}
              placeholder="Gõ một phần tên project…"
              value={filterTitle}
              onChange={(e) => setFilterTitle(e.target.value)}
            />
          </div>

          <div className="min-w-[220px]">
            <label className="text-sm text-gray-600">Trạng thái</label>
            <select className={INPUT} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">— Tất cả —</option>
              {PROJECT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[190px]">
            <label className="text-sm text-gray-600">Ngày tạo từ</label>
            <input className={INPUT} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>

          <div className="min-w-[190px]">
            <label className="text-sm text-gray-600">Ngày tạo đến</label>
            <input className={INPUT} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          <div className="min-w-[120px]">
            <button
              className={BTN_SECONDARY + ' w-full justify-center'}
              type="button"
              onClick={() => {
                setFilterTitle('');
                setFilterStatus('');
                setDateFrom('');
                setDateTo('');
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </section>

      {/* ===== LIST (COMPACT 1-ROW CARDS) ===== */}
      <section className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-semibold">📋 Danh sách Project</h3>
          <div className="text-sm text-gray-600">
            {loading ? 'Đang tải…' : `Tổng: ${total} | Trang ${page}/${totalPages}`}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className={BTN_SECONDARY} disabled={page <= 1 || loading} onClick={() => loadProjects(page - 1)}>
            ◀ Trang trước
          </button>
          <button className={BTN_SECONDARY} disabled={page >= totalPages || loading} onClick={() => loadProjects(page + 1)}>
            Trang sau ▶
          </button>
        </div>

        {loading ? (
          <div>Đang tải...</div>
        ) : (
          <div className="space-y-2">
            {projects.map((p) => {
              const d = drafts[p.id] ?? { title: p.title, description: p.description ?? '', status: p.status };
              const dirty =
                d.title !== p.title ||
                (d.description ?? '') !== (p.description ?? '') ||
                d.status !== p.status;

              return (
                <div
                  key={p.id}
                  className="border rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-gray-500 shrink-0">Title</div>
                      <input
                        className={COMPACT_INPUT}
                        value={d.title}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...d, title: e.target.value },
                          }))
                        }
                      />
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="text-xs text-gray-500 shrink-0">Desc</div>
                      <input
                        className={COMPACT_INPUT}
                        value={d.description}
                        placeholder="(trống)"
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [p.id]: { ...d, description: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="w-[220px] shrink-0">
                    <div className="text-xs text-gray-500">
                      Hiện tại: <span className="font-semibold text-gray-900">{viProjectStatus(p.status)}</span>
                    </div>
                    <select
                      className={COMPACT_INPUT + ' mt-1'}
                      value={d.status}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [p.id]: { ...d, status: e.target.value },
                        }))
                      }
                    >
                      {PROJECT_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>

                    <div className="mt-1 text-xs text-gray-600 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      className={BTN_PRIMARY}
                      disabled={!dirty || savingId === p.id}
                      onClick={() => updateProject(p.id)}
                      type="button"
                    >
                      {savingId === p.id ? 'Đang…' : 'Lưu'}
                    </button>

                    <button className={BTN_DANGER} onClick={() => deleteProject(p.id)} type="button">
                      🗑️
                    </button>
                  </div>

                  {dirty && <div className="hidden xl:block text-xs text-amber-700">* Chưa lưu</div>}
                </div>
              );
            })}

            {projects.length === 0 && (
              <div className="p-4 text-center text-gray-500 border rounded-xl bg-gray-50">
                Không có project phù hợp bộ lọc.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
