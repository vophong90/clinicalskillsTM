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
  round_label: string; // ví dụ: "Vòng 1"
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

// Helper: build CSV từ kết quả phân tích
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

    const line = [...baseCols, ...optionCols].map(escape).join(',');
    lines.push(line);
  }

  return lines.join('\r\n');
}

function clampPercent(x: number) {
  if (Number.isNaN(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function safeRound(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * Gộp nhiều kết quả phân tích (mỗi cohort chạy 1 lần) thành 1 bảng chung:
 * - Key theo (round_id, item_id)
 * - Convert percent -> count = N * percent / 100
 * - Sum counts theo option_label
 * - Sum N
 * - Recompute percent
 * - nonEssentialPercent gộp bằng weighted average theo N
 */
function mergeAnalysisRowsByCounts(allRuns: AnalysisRow[][]): AnalysisRow[] {
  type Agg = {
    base: Omit<AnalysisRow, 'N' | 'options' | 'nonEssentialPercent'>;
    sumN: number;
    optionCount: Record<string, number>; // label -> count
    nonEssentialWeightedSum: number; // sum(N * nonEssentialPercent)
    hasNonEssential: boolean;
  };

  const map = new Map<string, Agg>();

  for (const rows of allRuns) {
    for (const row of rows) {
      const key = `${row.round_id}__${row.item_id}`;

      const N = Math.max(0, safeRound(row.N || 0));
      if (N === 0) continue;

      let agg = map.get(key);
      if (!agg) {
        agg = {
          base: {
            project_id: row.project_id,
            project_title: row.project_title,
            round_id: row.round_id,
            round_label: row.round_label,
            item_id: row.item_id,
            full_prompt: row.full_prompt,
          },
          sumN: 0,
          optionCount: {},
          nonEssentialWeightedSum: 0,
          hasNonEssential: typeof row.nonEssentialPercent === 'number',
        };
        map.set(key, agg);
      }

      agg.sumN += N;

      // options -> counts
      for (const opt of row.options || []) {
        const label = String(opt.option_label ?? '').trim();
        if (!label) continue;
        const pct = clampPercent(Number(opt.percent ?? 0));
        const count = (N * pct) / 100;
        agg.optionCount[label] = (agg.optionCount[label] || 0) + count;
      }

      // nonEssential (weighted)
      if (typeof row.nonEssentialPercent === 'number') {
        agg.hasNonEssential = true;
        const nep = clampPercent(Number(row.nonEssentialPercent));
        agg.nonEssentialWeightedSum += N * nep;
      }
    }
  }

  const merged: AnalysisRow[] = [];

  for (const agg of map.values()) {
    const N = agg.sumN;
    if (N <= 0) continue;

    const options: AnalysisOption[] = Object.entries(agg.optionCount).map(
      ([label, count]) => ({
        option_label: label,
        percent: (count / N) * 100,
      })
    );

    // sort option labels for stable display
    options.sort((a, b) => a.option_label.localeCompare(b.option_label));

    const row: AnalysisRow = {
      ...agg.base,
      N,
      options,
    };

    if (agg.hasNonEssential) {
      row.nonEssentialPercent = agg.nonEssentialWeightedSum / N;
    }

    merged.push(row);
  }

  // sort: project_title -> round_label -> full_prompt
  merged.sort((a, b) => {
    if (a.project_title !== b.project_title) {
      return a.project_title.localeCompare(b.project_title);
    }
    if (a.round_label !== b.round_label) {
      return a.round_label.localeCompare(b.round_label);
    }
    return a.full_prompt.localeCompare(b.full_prompt);
  });

  return merged;
}

export default function AdminResultAnalysisManager() {
  const [loading, setLoading] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);

  // ====== Filters (project) ======
  // Ô project là tìm theo tên (text)
  const [projectNameQuery, setProjectNameQuery] = useState<string>('');
  // Bộ lọc là trạng thái PROJECT (không phải trạng thái vòng)
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | string>('all');

  // lọc theo ngày tạo project
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');

  // ====== Cohort multi-select ======
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);
  const [selectedCohorts, setSelectedCohorts] = useState<Set<string>>(new Set());
  const [showCohortBox, setShowCohortBox] = useState(false);

  // set các round_id được chọn để phân tích
  const [selectedRoundIds, setSelectedRoundIds] = useState<Set<string>>(new Set());

  // cut-off
  const [cutOffConsensus, setCutOffConsensus] = useState<number>(70);
  const [cutOffNonEssential, setCutOffNonEssential] = useState<number>(30);

  // kết quả phân tích
  const [analysisRows, setAnalysisRows] = useState<AnalysisRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  // lưu các câu đang được "mở rộng" câu hỏi đầy đủ
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  // load dự án + vòng + cohort list
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // 1) Projects
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('id, title, status, created_at');

      if (projErr) {
        setError('Lỗi truy vấn projects: ' + projErr.message);
        setLoading(false);
        return;
      }

      const projectIds = projectsData?.map((p: any) => p.id) || [];

      // 2) Rounds
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

      // sort rounds inside each project
      const projList = Object.values(projMap).map((p) => ({
        ...p,
        rounds: [...p.rounds].sort((a, b) => a.round_number - b.round_number),
      }));
      // sort projects by created_at desc
      projList.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setProjects(projList);

      // 3) Cohort options (profiles)
      // NOTE: nếu profiles có RLS chặn, dropdown cohort sẽ trống.
      // (Khi đó nên chuyển sang dùng API admin để lấy cohortOptions.)
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('cohort_code')
        .not('cohort_code', 'is', null);

      if (profileErr) {
        console.error('Lỗi load cohort_code từ profiles:', profileErr);
      } else {
        const distinct = Array.from(
          new Set((profileData || []).map((p: any) => String(p.cohort_code)))
        )
          .filter(Boolean)
          .sort();
        setCohortOptions(distinct);
      }

      setLoading(false);
    };

    loadData();
  }, []);

  // ===== Derived: project status options =====
  const projectStatusOptions = useMemo(() => {
    return Array.from(new Set(projects.map((p) => p.status))).sort();
  }, [projects]);

  // ===== Filtered Projects =====
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    // 1) Filter by project status
    if (projectStatusFilter !== 'all') {
      result = result.filter((p) => p.status === projectStatusFilter);
    }

    // 2) Filter by project name query
    const q = projectNameQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((p) => p.title.toLowerCase().includes(q));
    }

    // 3) Filter by created date
    if (createdFrom) {
      const fromDate = new Date(createdFrom);
      result = result.filter((p) => {
        const created = new Date(p.created_at);
        return !Number.isNaN(created.getTime()) && created >= fromDate;
      });
    }

    if (createdTo) {
      const toDate = new Date(createdTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((p) => {
        const created = new Date(p.created_at);
        return !Number.isNaN(created.getTime()) && created <= toDate;
      });
    }

    return result;
  }, [projects, projectStatusFilter, projectNameQuery, createdFrom, createdTo]);

  // ===== Visible round ids =====
  const allVisibleRoundIds = useMemo(
    () => filteredProjects.flatMap((p) => p.rounds.map((r) => r.id)),
    [filteredProjects]
  );

  // remove selected rounds if no longer visible
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

  // ===== Cohort multi-select handlers =====
  const toggleCohort = (cohort: string) => {
    setSelectedCohorts((prev) => {
      const next = new Set(prev);
      if (next.has(cohort)) next.delete(cohort);
      else next.add(cohort);
      return next;
    });
  };

  const clearCohorts = () => setSelectedCohorts(new Set());

  const selectAllCohorts = () => setSelectedCohorts(new Set(cohortOptions));

  const cohortLabel = useMemo(() => {
    if (selectedCohorts.size === 0) return 'Tất cả';
    const arr = Array.from(selectedCohorts);
    if (arr.length <= 2) return arr.join(', ');
    return `${arr.slice(0, 2).join(', ')} +${arr.length - 2}`;
  }, [selectedCohorts]);

  // ===== All option labels for dynamic table header =====
  const allOptionLabels = useMemo(() => {
    const labels = new Set<string>();
    analysisRows.forEach((row) => row.options.forEach((opt) => labels.add(opt.option_label)));
    return Array.from(labels).sort();
  }, [analysisRows]);

  // ===== Pagination =====
  const totalPages = Math.max(1, Math.ceil(analysisRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () => analysisRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [analysisRows, currentPage]
  );

  async function runAnalysisOnce(roundIds: string[], cohort_code: string | null) {
    const res = await fetch('/api/admin/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        round_ids: roundIds,
        cut_off: cutOffConsensus,
        cut_off_nonessential: cutOffNonEssential,
        cohort_code,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Request failed');
    }

    const data = (await res.json()) as { rows: AnalysisRow[] };
    return data.rows || [];
  }

  const handleRunAnalysis = async () => {
    setError(null);

    // chỉ phân tích các round đang tick + còn hiển thị
    const visibleSet = new Set(allVisibleRoundIds);
    const roundIdsToAnalyze = Array.from(selectedRoundIds).filter((id) => visibleSet.has(id));

    if (roundIdsToAnalyze.length === 0) {
      setError('Vui lòng chọn ít nhất 1 vòng để phân tích.');
      return;
    }

    setLoadingAnalysis(true);
    setCurrentPage(1);

    try {
      // Nếu không chọn cohort nào => tất cả (null)
      if (selectedCohorts.size === 0) {
        const rows = await runAnalysisOnce(roundIdsToAnalyze, null);
        setAnalysisRows(rows);
        return;
      }

      // Nếu chọn 1 cohort => chạy 1 lần
      const cohorts = Array.from(selectedCohorts);
      if (cohorts.length === 1) {
        const rows = await runAnalysisOnce(roundIdsToAnalyze, cohorts[0]);
        setAnalysisRows(rows);
        return;
      }

      // Nếu chọn nhiều cohort => chạy nhiều lần rồi gộp
      const runs: AnalysisRow[][] = [];
      for (const c of cohorts) {
        const rows = await runAnalysisOnce(roundIdsToAnalyze, c);
        runs.push(rows);
      }

      const merged = mergeAnalysisRowsByCounts(runs);
      setAnalysisRows(merged);
    } catch (e: any) {
      console.error(e);
      setError('Lỗi khi phân tích: ' + (e.message || String(e)));
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleCutOffChange = (value: string, setter: (v: number) => void) => {
    const num = Number(value);
    if (Number.isNaN(num)) setter(0);
    else setter(Math.max(0, Math.min(100, num)));
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

  // ===== RENDER =====
  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <h1 className="text-xl font-bold mb-2">📊 Phân tích kết quả</h1>

      {/* Bộ lọc */}
      <section className="border rounded-lg p-4 space-y-3 bg-gray-50 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Project search by name */}
          <div>
            <label className="block text-sm font-semibold mb-1">Tìm Project theo tên</label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Nhập một phần tên project..."
              value={projectNameQuery}
              onChange={(e) => setProjectNameQuery(e.target.value)}
            />
          </div>

          {/* Project status filter */}
          <div>
            <label className="block text-sm font-semibold mb-1">Trạng thái Project</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={projectStatusFilter}
              onChange={(e) => setProjectStatusFilter(e.target.value as 'all' | string)}
            >
              <option value="all">Tất cả</option>
              {projectStatusOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Selected rounds info */}
          <div className="flex flex-col justify-end text-sm text-gray-600">
            <span>
              Đang chọn: <b>{selectedRoundIds.size}</b> vòng
            </span>
            <span>
              Tổng vòng hiển thị: <b>{allVisibleRoundIds.length}</b>
            </span>
          </div>
        </div>

        {/* Hàng filter thứ 2: ngày tạo & đối tượng (multi) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
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

          {/* Cohort multi-select */}
          <div className="relative">
            <label className="block text-sm font-semibold mb-1">Đối tượng (cohort) — chọn nhiều</label>

            <button
              type="button"
              className="w-full border rounded px-2 py-1 text-sm bg-white text-left"
              onClick={() => setShowCohortBox((v) => !v)}
            >
              {cohortLabel}
              <span className="float-right text-gray-500">▾</span>
            </button>

            {showCohortBox && (
              <div className="absolute z-20 mt-1 w-full border rounded bg-white shadow max-h-64 overflow-auto p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-gray-600">
                    Đã chọn: <b>{selectedCohorts.size}</b>
                    {selectedCohorts.size > 1 && (
                      <span className="ml-2 text-amber-600">(sẽ gộp kết quả chung)</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={selectAllCohorts}
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      onClick={clearCohorts}
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>

                {cohortOptions.length === 0 ? (
                  <div className="text-xs text-gray-500 italic">
                    Không có cohort để chọn (có thể RLS profiles đang chặn). Nếu cần, ta sẽ chuyển sang load cohortOptions bằng API admin.
                  </div>
                ) : (
                  <div className="space-y-1">
                    {cohortOptions.map((c) => (
                      <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCohorts.has(c)}
                          onChange={() => toggleCohort(c)}
                        />
                        <span>{c}</span>
                      </label>
                    ))}
                  </div>
                )}

                <div className="mt-2">
                  <button
                    type="button"
                    className="w-full text-sm px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    onClick={() => setShowCohortBox(false)}
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">Đang tải project & vòng...</div>}
      </section>

      {/* Bảng tick chọn project & vòng */}
      <section className="border rounded-lg p-4 bg-white overflow-hidden">
        <h2 className="font-semibold mb-2">Chọn vòng đưa vào phân tích</h2>

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

        <div className="flex gap-2">
          {error && (
            <div className="text-sm text-red-600 mr-4 self-center">
              {error}
            </div>
          )}
          <button
            className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
            disabled={loadingAnalysis || selectedRoundIds.size === 0}
            onClick={handleRunAnalysis}
          >
            {loadingAnalysis ? 'Đang phân tích…' : selectedCohorts.size > 1 ? 'Phân tích (gộp đối tượng)' : 'Phân tích'}
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
                      <th
                        key={label}
                        className="border px-1 py-1 text-center text-xs align-top"
                      >
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
                              {val !== null ? `${clampPercent(val).toFixed(1)}%` : '-'}
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
              <div>Trang {currentPage}/{totalPages}</div>
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
