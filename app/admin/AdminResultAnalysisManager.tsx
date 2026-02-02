// app/admin/AdminResultAnalysisManager.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Round = {
  id: string;
  project_id: string;
  round_number: number;
  status: string;
};

type Project = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  rounds: Round[];
};

type AnalysisOption = {
  option_label: string;
  percent: number; // 0–100
};

type AnalysisRow = {
  project_id: string;
  project_title: string;
  round_id: string;
  round_label: string; // "Vòng 1"
  item_id: string;
  full_prompt: string;
  N: number;
  options: AnalysisOption[];
  nonEssentialPercent?: number;
};

const PAGE_SIZE = 25;

function truncatePrompt(text: string, maxWords = 6): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

// Helper: build CSV
function buildAnalysisCsv(rows: AnalysisRow[], allOptionLabels: string[]): string {
  const escape = (val: any) => {
    const s = String(val ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = ['Project', 'Vòng', 'Câu hỏi', 'N', ...allOptionLabels];
  const lines: string[] = [header.map(escape).join(',')];

  for (const row of rows) {
    const baseCols = [row.project_title, row.round_label, row.full_prompt, row.N];

    const optionCols = allOptionLabels.map((label) => {
      const opt = row.options.find((o) => o.option_label === label);
      return opt ? opt.percent.toFixed(1) : '';
    });

    lines.push([...baseCols, ...optionCols].map(escape).join(','));
  }

  return lines.join('\r\n');
}

type Agg = {
  project_id: string;
  project_title: string;
  round_id: string;
  round_label: string;
  item_id: string;
  full_prompt: string;

  // gộp cohort: sum N (tổng số người của từng cohort)
  sumN: number;

  // label -> sumCount (tổng số người chọn label qua các cohort)
  sumCounts: Record<string, number>;

  // lưu danh sách optionLabel xuất hiện (để giữ thứ tự ổn định)
  optionLabels: string[];
};

function approxCount(N: number, percent: number) {
  // không round sớm; để merge xong mới toFixed
  return (N * percent) / 100;
}

export default function AdminResultAnalysisManager() {
  const [loading, setLoading] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);

  // ===== FILTER: tìm project theo tên + trạng thái project + ngày tạo =====
  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | string>('all');

  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  // ===== ĐỐI TƯỢNG: chọn nhiều cohort + gộp =====
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]); // multi
  const [mergeCohorts, setMergeCohorts] = useState(true); // gộp thành 1 kết quả chung

  // ===== chọn round để phân tích =====
  const [selectedRoundIds, setSelectedRoundIds] = useState<Set<string>>(new Set());

  // cut-off (UI)
  const [cutOffConsensus, setCutOffConsensus] = useState<number>(70);
  const [cutOffNonEssential, setCutOffNonEssential] = useState<number>(30);

  // kết quả
  const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  // ===== load projects + rounds + cohort list =====
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('id, title, status, created_at');

      if (projErr) {
        setError('Lỗi truy vấn projects: ' + projErr.message);
        setLoading(false);
        return;
      }

      const projectIds = projectsData?.map((p) => p.id) || [];

      const { data: roundsData, error: roundErr } = await supabase
        .from('rounds')
        .select('id, project_id, round_number, status')
        .in('project_id', projectIds);

      if (roundErr) {
        setError('Lỗi truy vấn rounds: ' + roundErr.message);
        setLoading(false);
        return;
      }

      const projMap: Record<string, Project> = {};
      (projectsData || []).forEach((p: any) => {
        projMap[p.id] = {
          id: p.id,
          title: p.title,
          status: p.status,
          created_at: p.created_at,
          rounds: [],
        };
      });

      (roundsData || []).forEach((r: any) => {
        if (projMap[r.project_id]) {
          projMap[r.project_id].rounds.push({
            id: r.id,
            project_id: r.project_id,
            round_number: r.round_number,
            status: r.status,
          });
        }
      });

      // sort rounds per project
      const projList = Object.values(projMap).map((p) => ({
        ...p,
        rounds: [...p.rounds].sort((a, b) => a.round_number - b.round_number),
      }));

      // sort projects by created_at desc
      projList.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setProjects(projList);

      // cohorts
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('cohort_code')
        .not('cohort_code', 'is', null);

      if (profileErr) {
        console.error('Lỗi load cohort_code từ profiles:', profileErr);
      } else {
        const distinct = Array.from(
          new Set((profileData || []).map((p: any) => p.cohort_code as string))
        ).sort();
        setCohortOptions(distinct);

        // default select all? (không)
        setSelectedCohorts([]);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  // ===== status options =====
  const projectStatusOptions = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.status))).sort();
  }, [projects]);

  // ===== filtered projects =====
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // search by name
    const k = projectSearch.trim().toLowerCase();
    if (k) result = result.filter((p) => p.title.toLowerCase().includes(k));

    // status of project
    if (projectStatusFilter !== 'all') {
      result = result.filter((p) => p.status === projectStatusFilter);
    }

    // created date
    if (createdFrom) {
      const fromDate = new Date(createdFrom);
      result = result.filter((p) => new Date(p.created_at) >= fromDate);
    }
    if (createdTo) {
      const toDate = new Date(createdTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((p) => new Date(p.created_at) <= toDate);
    }

    return result;
  }, [projects, projectSearch, projectStatusFilter, createdFrom, createdTo]);

  // all visible round ids
  const allVisibleRoundIds = useMemo(
    () => filteredProjects.flatMap((p) => p.rounds.map((r) => r.id)),
    [filteredProjects]
  );

  // prune selectedRoundIds when filters change
  useEffect(() => {
    setSelectedRoundIds((prev) => {
      const visibleSet = new Set(allVisibleRoundIds);
      const next = new Set<string>();
      prev.forEach((id) => {
        if (visibleSet.has(id)) next.add(id);
      });
      return next;
    });
  }, [allVisibleRoundIds]);

  // ===== round selection handlers =====
  const toggleRoundSelection = (roundId: string) => {
    setSelectedRoundIds((prev) => {
      const next = new Set(prev);
      if (next.has(roundId)) next.delete(roundId);
      else next.add(roundId);
      return next;
    });
  };

  const toggleProjectRounds = (project: Project) => {
    const projectRoundIds = project.rounds.map((r) => r.id);
    const hasAll = projectRoundIds.length > 0 && projectRoundIds.every((id) => selectedRoundIds.has(id));

    setSelectedRoundIds((prev) => {
      const next = new Set(prev);
      if (hasAll) projectRoundIds.forEach((id) => next.delete(id));
      else projectRoundIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleExpandItem = (itemId: string) => {
    setExpandedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // option labels from result
  const allOptionLabels = useMemo(() => {
    const labels = new Set<string>();
    analysisRows.forEach((row) => row.options.forEach((opt) => labels.add(opt.option_label)));
    return Array.from(labels);
  }, [analysisRows]);

  // paging
  const totalPages = Math.max(1, Math.ceil(analysisRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () => analysisRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [analysisRows, currentPage]
  );

  const handleCutOffChange = (value: string, setter: (v: number) => void) => {
    const num = Number(value);
    if (Number.isNaN(num)) setter(0);
    else setter(Math.max(0, Math.min(100, num)));
  };

  // ===== cohort multi-select helpers =====
  const toggleCohort = (code: string) => {
    setSelectedCohorts((prev) => {
      const has = prev.includes(code);
      const next = has ? prev.filter((x) => x !== code) : [...prev, code];
      next.sort();
      return next;
    });
  };

  const selectAllCohorts = () => setSelectedCohorts([...cohortOptions]);
  const clearCohorts = () => setSelectedCohorts([]);

  // ===== run analysis =====
  const handleRunAnalysis = async () => {
    setError(null);

    const visibleSet = new Set(allVisibleRoundIds);
    const roundIdsToAnalyze = Array.from(selectedRoundIds).filter((id) => visibleSet.has(id));

    if (roundIdsToAnalyze.length === 0) {
      setError('Vui lòng chọn ít nhất 1 vòng để phân tích.');
      return;
    }

    setLoadingAnalysis(true);
    setCurrentPage(1);

    try {
      // nếu không chọn cohort nào => coi như "tất cả"
      const cohortList = selectedCohorts.length ? selectedCohorts : [];

      // CASE A: không chọn cohort => gọi 1 lần với cohort_code = null
      if (cohortList.length === 0) {
        const res = await fetch('/api/admin/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            round_ids: roundIdsToAnalyze,
            cut_off: cutOffConsensus,
            cut_off_nonessential: cutOffNonEssential,
            cohort_code: null,
          }),
        });

        if (!res.ok) throw new Error((await res.text()) || 'Request failed');

        const data = (await res.json()) as { rows: AnalysisRow[] };
        setAnalysisRows(data.rows || []);
        return;
      }

      // CASE B: chọn 1 cohort => gọi 1 lần
      if (cohortList.length === 1) {
        const res = await fetch('/api/admin/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            round_ids: roundIdsToAnalyze,
            cut_off: cutOffConsensus,
            cut_off_nonessential: cutOffNonEssential,
            cohort_code: cohortList[0],
          }),
        });

        if (!res.ok) throw new Error((await res.text()) || 'Request failed');

        const data = (await res.json()) as { rows: AnalysisRow[] };
        setAnalysisRows(data.rows || []);
        return;
      }

      // CASE C: nhiều cohort
      // - nếu mergeCohorts=true => gộp thành 1 kết quả chung (weighted by N)
      // - nếu mergeCohorts=false => vẫn gộp chung list nhưng không cần tách, thực tế UI này hiển thị chung 1 bảng,
      //   nên mergeCohorts=false ở đây chỉ có ý nghĩa là "không gộp": sẽ append rows của từng cohort (có thể trùng item)
      if (!mergeCohorts) {
        const all: AnalysisRow[] = [];
        for (const code of cohortList) {
          const res = await fetch('/api/admin/analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              round_ids: roundIdsToAnalyze,
              cut_off: cutOffConsensus,
              cut_off_nonessential: cutOffNonEssential,
              cohort_code: code,
            }),
          });
          if (!res.ok) throw new Error((await res.text()) || 'Request failed');
          const data = (await res.json()) as { rows: AnalysisRow[] };
          all.push(...(data.rows || []));
        }
        setAnalysisRows(all);
        return;
      }

      // mergeCohorts = true: call per cohort, then merge
      const map = new Map<string, Agg>();

      for (const code of cohortList) {
        const res = await fetch('/api/admin/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            round_ids: roundIdsToAnalyze,
            cut_off: cutOffConsensus,
            cut_off_nonessential: cutOffNonEssential,
            cohort_code: code,
          }),
        });

        if (!res.ok) throw new Error((await res.text()) || 'Request failed');

        const data = (await res.json()) as { rows: AnalysisRow[] };
        const rows = data.rows || [];

        for (const r of rows) {
          const key = `${r.round_id}:${r.item_id}`;

          let agg = map.get(key);
          if (!agg) {
            agg = {
              project_id: r.project_id,
              project_title: r.project_title,
              round_id: r.round_id,
              round_label: r.round_label,
              item_id: r.item_id,
              full_prompt: r.full_prompt,
              sumN: 0,
              sumCounts: {},
              optionLabels: r.options.map((o) => o.option_label),
            };
            map.set(key, agg);
          }

          agg.sumN += r.N;

          // cộng "count" xấp xỉ từ percent
          for (const opt of r.options) {
            const label = opt.option_label;
            if (agg.sumCounts[label] == null) agg.sumCounts[label] = 0;
            agg.sumCounts[label] += approxCount(r.N, opt.percent);
          }

          // union labels
          for (const opt of r.options) {
            if (!agg.optionLabels.includes(opt.option_label)) {
              agg.optionLabels.push(opt.option_label);
            }
          }
        }
      }

      const merged: AnalysisRow[] = [];

      // ✅ FIX lỗi MapIterator: bọc Array.from(...)
      for (const agg of Array.from(map.values())) {
        const N = agg.sumN;
        if (N <= 0) continue;

        const options: AnalysisOption[] = agg.optionLabels.map((label) => {
          const c = agg.sumCounts[label] ?? 0;
          const percent = (c / N) * 100;
          return { option_label: label, percent };
        });

        const nonEssentialLabel =
          agg.optionLabels.find((l) => l.toLowerCase().includes('không thiết yếu')) ?? null;

        let nonEssentialPercent = 0;
        if (nonEssentialLabel) {
          const opt = options.find((o) => o.option_label === nonEssentialLabel);
          nonEssentialPercent = opt ? opt.percent : 0;
        }

        merged.push({
          project_id: agg.project_id,
          project_title: agg.project_title,
          round_id: agg.round_id,
          round_label: agg.round_label,
          item_id: agg.item_id,
          full_prompt: agg.full_prompt,
          N,
          options,
          nonEssentialPercent,
        });
      }

      merged.sort((a, b) => {
        if (a.project_title !== b.project_title) return a.project_title.localeCompare(b.project_title);
        // round number from label "Vòng x"
        const ra = Number(a.round_label.replace(/[^\d]/g, '')) || 0;
        const rb = Number(b.round_label.replace(/[^\d]/g, '')) || 0;
        if (ra !== rb) return ra - rb;
        return a.full_prompt.localeCompare(b.full_prompt);
      });

      setAnalysisRows(merged);
    } catch (e: any) {
      console.error(e);
      setError('Lỗi khi phân tích: ' + (e.message || String(e)));
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleExportExcel = () => {
    if (!analysisRows.length) {
      setError('Không có dữ liệu để xuất.');
      return;
    }

    try {
      const csv = buildAnalysisCsv(analysisRows, allOptionLabels);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'phan_tich_ket_qua_' + new Date().toISOString().slice(0, 10) + '.csv';

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError('Lỗi khi xuất Excel.');
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <h1 className="text-xl font-bold mb-2">📊 Phân tích kết quả</h1>

      {/* Bộ lọc */}
      <section className="border rounded-lg p-4 space-y-3 bg-gray-50 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search project by name */}
          <div>
            <label className="block text-sm font-semibold mb-1">Tìm Project theo tên</label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Nhập một phần tên Project..."
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
            />
          </div>

          {/* Project status */}
          <div>
            <label className="block text-sm font-semibold mb-1">Trạng thái Project</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={projectStatusFilter}
              onChange={(e) => setProjectStatusFilter(e.target.value as any)}
            >
              <option value="all">Tất cả</option>
              {projectStatusOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* created from/to */}
          <div>
            <label className="block text-sm font-semibold mb-1">Ngày tạo từ</label>
            <input
              type="date"
              className="w-full border rounded px-2 py-1 text-sm"
              value={createdFrom}
              onChange={(e) => setCreatedFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Ngày tạo đến</label>
            <input
              type="date"
              className="w-full border rounded px-2 py-1 text-sm"
              value={createdTo}
              onChange={(e) => setCreatedTo(e.target.value)}
            />
          </div>
        </div>

        {/* Cohort multi-select */}
        <div className="border rounded bg-white p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <div className="text-sm font-semibold">Đối tượng (cohort) — chọn nhiều</div>
              <div className="text-xs text-gray-500">
                Không chọn gì = tính trên tất cả đối tượng.
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                onClick={selectAllCohorts}
                disabled={cohortOptions.length === 0}
              >
                Chọn tất cả
              </button>
              <button
                type="button"
                className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                onClick={clearCohorts}
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {cohortOptions.length === 0 ? (
              <span className="text-xs text-gray-400 italic">Chưa có cohort_code.</span>
            ) : (
              cohortOptions.map((c) => {
                const checked = selectedCohorts.includes(c);
                return (
                  <label
                    key={c}
                    className={
                      'inline-flex items-center gap-1 px-2 py-1 border rounded cursor-pointer text-sm ' +
                      (checked ? 'bg-emerald-50 border-emerald-300' : 'bg-white')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCohort(c)}
                    />
                    <span>{c}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="mt-2 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Đang chọn: <b>{selectedCohorts.length || 0}</b> đối tượng
            </div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mergeCohorts}
                onChange={(e) => setMergeCohorts(e.target.checked)}
              />
              <span className="font-semibold">
                Gộp kết quả chung cho nhiều đối tượng
              </span>
            </label>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">Đang tải project & vòng...</div>}
      </section>

      {/* Bảng tick chọn project & vòng */}
      <section className="border rounded-lg p-4 bg-white overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Chọn vòng đưa vào phân tích</h2>
          <div className="text-sm text-gray-600">
            Đang chọn: <b>{selectedRoundIds.size}</b> vòng · Vòng hiển thị:{' '}
            <b>{allVisibleRoundIds.length}</b>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="text-sm text-gray-500 italic">Không có project / vòng sau khi áp bộ lọc.</div>
        ) : (
          <div className="space-y-3 max-h-72 overflow-auto pr-1">
            {filteredProjects.map((p) => {
              const projectRoundIds = p.rounds.map((r) => r.id);
              const allChecked =
                projectRoundIds.length > 0 && projectRoundIds.every((id) => selectedRoundIds.has(id));
              const someChecked =
                !allChecked && projectRoundIds.some((id) => selectedRoundIds.has(id));

              return (
                <div key={p.id} className="border rounded-lg p-3 bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => {
                          if (el) el.indeterminate = someChecked;
                        }}
                        onChange={() => toggleProjectRounds(p)}
                      />
                      <span className="font-semibold">{p.title}</span>
                      <span className="text-xs text-gray-500">({p.status})</span>
                    </div>
                    <span className="text-xs text-gray-500">{p.rounds.length} vòng</span>
                  </div>

                  {p.rounds.length === 0 ? (
                    <div className="text-xs text-gray-400 italic">Project này chưa có vòng khảo sát.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2 text-sm">
                      {p.rounds.map((r) => (
                        <label
                          key={r.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-white border rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="mr-1"
                            checked={selectedRoundIds.has(r.id)}
                            onChange={() => toggleRoundSelection(r.id)}
                          />
                          <span>
                            Vòng {r.round_number}{' '}
                            <span className="text-xs text-gray-500">({r.status})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Cut-off & nút phân tích */}
      <section className="border rounded-lg p-4 bg-gray-50 flex flex-col md:flex-row gap-3 md:items-end md:justify-between overflow-hidden">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Cut-off đồng thuận (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-28 border rounded px-2 py-1 text-sm"
              value={cutOffConsensus}
              onChange={(e) => handleCutOffChange(e.target.value, setCutOffConsensus)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Cut-off &quot;Không thiết yếu&quot; (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-28 border rounded px-2 py-1 text-sm"
              value={cutOffNonEssential}
              onChange={(e) => handleCutOffChange(e.target.value, setCutOffNonEssential)}
            />
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {error && <div className="text-sm text-red-600 mr-2">{error}</div>}
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
            disabled={loadingAnalysis || selectedRoundIds.size === 0}
            onClick={handleRunAnalysis}
          >
            {loadingAnalysis ? 'Đang phân tích…' : 'Phân tích'}
          </button>
        </div>
      </section>

      {/* Bảng kết quả */}
      <section className="border rounded-lg p-4 bg-white overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Kết quả phân tích ({analysisRows.length} câu hỏi)</h2>

          {analysisRows.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span>
                Trang {currentPage}/{totalPages} · {PAGE_SIZE} câu/trang
              </span>
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-1 border rounded bg-green-600 text-white hover:bg-green-700"
              >
                ⬇️ Xuất Excel
              </button>
            </div>
          )}
        </div>

        {analysisRows.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Chưa có dữ liệu. Vui lòng chọn vòng và bấm &quot;Phân tích&quot;.
          </div>
        ) : (
          <>
            <div className="border rounded w-full max-w-full overflow-x-auto overflow-y-auto max-h-[600px]">
              <table className="text-sm border-collapse w-full table-fixed">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="border px-2 py-1 text-left text-sm w-[150px]">Project</th>
                    <th className="border px-2 py-1 text-left text-sm w-[70px]">Vòng</th>
                    <th className="border px-2 py-1 text-left text-sm w-[260px]">Câu hỏi</th>
                    <th className="border px-1 py-1 text-center text-sm w-[48px]">N</th>
                    {allOptionLabels.map((label) => (
                      <th key={label} className="border px-1 py-1 text-center text-xs align-top">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {paginatedRows.map((row) => {
                    const isRowHighNonEssential = (row.nonEssentialPercent ?? 0) >= cutOffNonEssential;
                    const rowClass = isRowHighNonEssential ? 'bg-red-50' : '';

                    const isExpanded = expandedItemIds.has(row.item_id);
                    const displayText = isExpanded ? row.full_prompt : truncatePrompt(row.full_prompt, 6);

                    return (
                      <tr key={row.round_id + '-' + row.item_id} className={rowClass}>
                        <td className="border px-2 py-1 align-top text-sm">{row.project_title}</td>
                        <td className="border px-2 py-1 align-top text-sm">{row.round_label}</td>
                        <td className="border px-2 py-1 align-top text-sm">
                          <div className="flex flex-col gap-1">
                            <span>{displayText}</span>
                            {row.full_prompt !== displayText && (
                              <button
                                type="button"
                                className="text-xs text-blue-600 underline self-start"
                                onClick={() => toggleExpandItem(row.item_id)}
                              >
                                {isExpanded ? 'Thu gọn' : 'Xem đầy đủ'}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="border px-1 py-1 text-center align-top text-sm">{row.N}</td>

                        {allOptionLabels.map((label) => {
                          const opt = row.options.find((o) => o.option_label === label);
                          const val = opt ? opt.percent : null;

                          const isNonEssentialCell = label.toLowerCase().includes('không thiết yếu');

                          let cellClass = 'border px-1 py-1 text-center align-top text-xs';

                          if (val !== null && val < cutOffConsensus && !isNonEssentialCell) {
                            cellClass += ' bg-red-100';
                          }

                          if (isNonEssentialCell && isRowHighNonEssential && val !== null) {
                            cellClass += ' bg-red-200 font-semibold';
                          }

                          return (
                            <td key={label} className={cellClass}>
                              {val !== null ? `${val.toFixed(1)}%` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3 text-sm">
              <div>
                Trang {currentPage}/{totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ← Trước
                </button>
                <button
                  className="px-3 py-1 border rounded disabled:opacity-50"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau →
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
