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

export default function AdminResultAnalysisManager() {
  const [loading, setLoading] = useState(false);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');
  const [roundStatusFilter, setRoundStatusFilter] = useState<'all' | 'active' | 'closed'>('all');

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

  // load dự án + vòng cho admin (giống cách anh làm ở manager khác)
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      setError(null);

      // Giả định admin được phép xem tất cả project, nếu anh dùng RLS khác thì có thể cần RPC riêng
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('id, title, status');

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
      (projectsData || []).forEach((p) => {
        projMap[p.id] = { id: p.id, title: p.title, rounds: [] };
      });

      (roundsData || []).forEach((r) => {
        if (projMap[r.project_id]) {
          projMap[r.project_id].rounds.push({
            id: r.id,
            project_id: r.project_id,
            round_number: r.round_number,
            status: r.status,
          });
        }
      });

      setProjects(Object.values(projMap));
      setLoading(false);
    };

    loadProjects();
  }, []);

  // danh sách project sau khi áp bộ lọc
  const filteredProjects = useMemo(() => {
    let result = projects;
    if (projectFilter !== 'all') {
      result = result.filter((p) => p.id === projectFilter);
    }
    if (roundStatusFilter !== 'all') {
      result = result.map((p) => ({
        ...p,
        rounds: p.rounds.filter((r) =>
          roundStatusFilter === 'active'
            ? r.status === 'active'
            : r.status !== 'active'
        ),
      }));
    }
    return result;
  }, [projects, projectFilter, roundStatusFilter]);

  // danh sách tất cả round được hiển thị (sau filter)
  const allVisibleRoundIds = useMemo(
    () =>
      filteredProjects.flatMap((p) =>
        p.rounds.map((r) => r.id)
      ),
    [filteredProjects]
  );

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
    const hasAll = projectRoundIds.every((id) => selectedRoundIds.has(id));

    setSelectedRoundIds((prev) => {
      const next = new Set(prev);
      if (hasAll) {
        // bỏ chọn tất cả vòng của project
        projectRoundIds.forEach((id) => next.delete(id));
      } else {
        // chọn tất cả vòng của project
        projectRoundIds.forEach((id) => next.add(id));
      }
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

  // Tập tất cả option_label xuất hiện trong kết quả (dùng để làm header động)
  const allOptionLabels = useMemo(() => {
    const labels = new Set<string>();
    analysisRows.forEach((row) => {
      row.options.forEach((opt) => labels.add(opt.option_label));
    });
    return Array.from(labels);
  }, [analysisRows]);

  // Phân trang
  const totalPages = Math.max(1, Math.ceil(analysisRows.length / PAGE_SIZE));
  const paginatedRows = useMemo(
    () =>
      analysisRows.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [analysisRows, currentPage]
  );

  const handleRunAnalysis = async () => {
    setError(null);

    const roundIdsToAnalyze = Array.from(selectedRoundIds).filter((id) =>
      allVisibleRoundIds.includes(id)
    );
    if (roundIdsToAnalyze.length === 0) {
      setError('Vui lòng chọn ít nhất 1 vòng để phân tích.');
      return;
    }

    setLoadingAnalysis(true);
    setCurrentPage(1);

    try {
      // NOTE: Anh chỉnh URL / body cho đúng với API thực tế
      const res = await fetch('/api/admin/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_ids: roundIdsToAnalyze,
          cut_off: cutOffConsensus,
          cut_off_nonessential: cutOffNonEssential,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }

      const data = (await res.json()) as { rows: AnalysisRow[] };
      setAnalysisRows(data.rows || []);
    } catch (e: any) {
      console.error(e);
      setError('Lỗi khi phân tích: ' + (e.message || String(e)));
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const handleCutOffChange = (value: string, setter: (v: number) => void) => {
    const num = Number(value);
    if (Number.isNaN(num)) {
      setter(0);
    } else {
      setter(Math.max(0, Math.min(100, num)));
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold mb-2">📊 Phân tích kết quả</h1>

      {/* Bộ lọc */}
      <section className="border rounded-lg p-4 space-y-3 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Project
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={projectFilter}
              onChange={(e) =>
                setProjectFilter(
                  e.target.value === 'all' ? 'all' : e.target.value
                )
              }
            >
              <option value="all">Tất cả project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Trạng thái vòng
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={roundStatusFilter}
              onChange={(e) =>
                setRoundStatusFilter(e.target.value as 'all' | 'active' | 'closed')
              }
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hoạt động</option>
              <option value="closed">Đã đóng / khác</option>
            </select>
          </div>

          {/* Thông tin chọn vòng */}
          <div className="flex flex-col justify-end text-sm text-gray-600">
            <span>
              Đang chọn: <b>{selectedRoundIds.size}</b> vòng
            </span>
            <span>
              Tổng vòng hiển thị: <b>{allVisibleRoundIds.length}</b>
            </span>
          </div>
        </div>

        {loading && <div className="text-sm text-gray-500">Đang tải project & vòng...</div>}
      </section>

      {/* Bảng tick chọn project & vòng */}
      <section className="border rounded-lg p-4 bg-white">
        <h2 className="font-semibold mb-2">Chọn vòng đưa vào phân tích</h2>
        {filteredProjects.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Không có project / vòng sau khi áp bộ lọc.
          </div>
        ) : (
          <div className="space-y-3 max-h-72 overflow-auto pr-1">
            {filteredProjects.map((p) => {
              const projectRoundIds = p.rounds.map((r) => r.id);
              const allChecked =
                projectRoundIds.length > 0 &&
                projectRoundIds.every((id) => selectedRoundIds.has(id));
              const someChecked =
                !allChecked &&
                projectRoundIds.some((id) => selectedRoundIds.has(id));

              return (
                <div
                  key={p.id}
                  className="border rounded-lg p-3 bg-gray-50"
                >
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
                    </div>
                    <span className="text-xs text-gray-500">
                      {p.rounds.length} vòng
                    </span>
                  </div>
                  {p.rounds.length === 0 ? (
                    <div className="text-xs text-gray-400 italic">
                      Project này chưa có vòng khảo sát.
                    </div>
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
                            <span className="text-xs text-gray-500">
                              ({r.status})
                            </span>
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
      <section className="border rounded-lg p-4 bg-gray-50 flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Cut-off đồng thuận (%)
            </label>
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
              onChange={(e) =>
                handleCutOffChange(e.target.value, setCutOffNonEssential)
              }
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
            {loadingAnalysis ? 'Đang phân tích…' : 'Phân tích'}
          </button>
        </div>
      </section>

      {/* Bảng kết quả */}
      <section className="border rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">
            Kết quả phân tích ({analysisRows.length} câu hỏi)
          </h2>
          {analysisRows.length > 0 && (
            <div className="text-sm text-gray-500">
              Trang {currentPage}/{totalPages} · {PAGE_SIZE} câu/trang
            </div>
          )}
        </div>

        {analysisRows.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Chưa có dữ liệu. Vui lòng chọn vòng và bấm &quot;Phân tích&quot;.
          </div>
        ) : (
          <>
            <div className="border rounded overflow-auto max-h-[600px]">
              <table className="min-w-[900px] text-sm">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="border px-2 py-1 text-left">Project</th>
                    <th className="border px-2 py-1 text-left">Vòng</th>
                    <th className="border px-2 py-1 text-left w-[280px]">
                      Câu hỏi
                    </th>
                    <th className="border px-2 py-1 text-center">N</th>
                    {allOptionLabels.map((label) => (
                      <th
                        key={label}
                        className="border px-2 py-1 text-center whitespace-nowrap"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row) => {
                    const isRowHighNonEssential =
                      (row.nonEssentialPercent ?? 0) >= cutOffNonEssential;

                    const rowClass = isRowHighNonEssential
                      ? 'bg-red-50'
                      : '';

                    const isExpanded = expandedItemIds.has(row.item_id);
                    const displayText = isExpanded
                      ? row.full_prompt
                      : truncatePrompt(row.full_prompt, 6);

                    return (
                      <tr key={row.round_id + '-' + row.item_id} className={rowClass}>
                        <td className="border px-2 py-1 align-top">
                          {row.project_title}
                        </td>
                        <td className="border px-2 py-1 align-top">
                          {row.round_label}
                        </td>
                        <td className="border px-2 py-1 align-top">
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
                        <td className="border px-2 py-1 text-center align-top">
                          {row.N}
                        </td>
                        {allOptionLabels.map((label) => {
                          const opt = row.options.find(
                            (o) => o.option_label === label
                          );
                          const val = opt ? opt.percent : null;

                          const isNonEssentialCell =
                            label.toLowerCase().includes('không thiết yếu');

                          let cellClass = 'border px-2 py-1 text-center align-top';

                          // tô đỏ ô nếu dưới cut-off đồng thuận (và không phải cột Không thiết yếu)
                          if (
                            val !== null &&
                            val < cutOffConsensus &&
                            !isNonEssentialCell
                          ) {
                            cellClass += ' bg-red-100';
                          }

                          // nếu cột "Không thiết yếu" và hàng này vượt ngưỡng, cho đỏ đậm hơn
                          if (
                            isNonEssentialCell &&
                            isRowHighNonEssential &&
                            val !== null
                          ) {
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

            {/* phân trang */}
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
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
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
