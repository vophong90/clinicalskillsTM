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

type CommentRow = {
  project_id: string;
  project_title: string;
  round_id: string;
  round_label: string;
  item_id: string;
  item_prompt: string;
  user_id: string | null;
  comment: string;
};

const PAGE_SIZE = 50;

const PROMPT_TEMPLATES: { id: string; label: string; text: string }[] = [
  {
    id: 'impact',
    label: 'Mặc định: chỉ giữ ý có impact giữ/bỏ/bổ sung vấn đề thiết yếu',
    text:
      'Chỉ tập trung vào những ý kiến tác động đến quyết định giữ lại, bỏ đi hoặc bổ sung thêm vấn đề lâm sàng thiết yếu cho bác sĩ YHCT khi tốt nghiệp, liên quan trực tiếp đến hành nghề.',
  },
  {
    id: 'merge',
    label: 'Gợi ý gộp/bỏ bớt các vấn đề trùng lặp',
    text:
      'Tập trung vào các nhận xét cho rằng vấn đề lâm sàng đang bị trùng lặp, chồng lấp, hoặc có thể gộp lại. Đề xuất rõ ràng: vấn đề nào nên gộp, vấn đề nào có thể bỏ.',
  },
  {
    id: 'add-new',
    label: 'Gợi ý bổ sung vấn đề lâm sàng mới',
    text:
      'Tập trung vào các ý kiến đề xuất bổ sung thêm vấn đề lâm sàng thiết yếu mới cho bác sĩ YHCT. Liệt kê các đề xuất theo nhóm chủ đề.',
  },
];

function truncate(text: string, maxWords = 10): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

async function fetchRoundMeta(roundId: string) {
  const res = await fetch('/api/admin/comments/raw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ round_id: roundId, mode: 'meta' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }

  return (await res.json()) as {
    meta?: {
      cohort_options?: string[];
      cohort_count_in_project?: number;
      cohort_count_in_round?: number;
      participant_count_in_round?: number;
    };
  };
}

export default function AdminCommentSummaryManager() {
  // ===== STATE CHUNG =====
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map project_id -> tập cohort_code (đối tượng) có tham gia bất kỳ vòng nào
  const [projectCohortMap, setProjectCohortMap] = useState<
    Record<string, Set<string>>
  >({});

  // Filter bar
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | string>(
    'all'
  );
  const [cohortFilter, setCohortFilter] = useState<'all' | string>('all');
  const [createdFrom, setCreatedFrom] = useState<string>('');
  const [createdTo, setCreatedTo] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  // Options cho filter
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);

  // Lựa chọn Project / Round hiện tại để load comment
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedRoundId, setSelectedRoundId] = useState<string>('');

  // Comment & phân trang comment
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // GPT summary
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('impact');
  const [customPrompt, setCustomPrompt] = useState('');
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);

  // ===== LOAD PROJECTS + ROUNDS + COHORT MAP =====
  useEffect(() => {
    const loadProjects = async () => {
      setLoadingProjects(true);
      setError(null);

      // 1) Projects
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('id, title, status, created_at');

      if (projErr) {
        setError('Lỗi truy vấn projects: ' + projErr.message);
        setLoadingProjects(false);
        return;
      }

      const projectIds = (projectsData || []).map((p) => p.id);

      // 2) Rounds
      const { data: roundsData, error: roundErr } = await supabase
        .from('rounds')
        .select('id, project_id, round_number, status')
        .in('project_id', projectIds);

      if (roundErr) {
        setError('Lỗi truy vấn rounds: ' + roundErr.message);
        setLoadingProjects(false);
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
        const p = projMap[r.project_id];
        if (p) {
          p.rounds.push({
            id: r.id,
            project_id: r.project_id,
            round_number: r.round_number,
            status: r.status,
          });
        }
      });

      const projList = Object.values(projMap).sort((a, b) =>
        a.title.localeCompare(b.title)
      );
      setProjects(projList);

      // 3) Build project ↔ cohort map bằng API admin (tránh RLS)
      try {
        // chọn 1 round đại diện cho mỗi project (ưu tiên round_number lớn nhất)
        const repRoundByProject = new Map<string, Round>();

        (roundsData || []).forEach((r: any) => {
          const cur = repRoundByProject.get(r.project_id);
          if (!cur || (r.round_number ?? 0) > (cur.round_number ?? 0)) {
            repRoundByProject.set(r.project_id, {
              id: r.id,
              project_id: r.project_id,
              round_number: r.round_number,
              status: r.status,
            });
          }
        });

        const reps = Array.from(repRoundByProject.values());

        const results = await Promise.allSettled(
          reps.map(async (rr) => {
            const data = await fetchRoundMeta(rr.id);
            return { project_id: rr.project_id, meta: data.meta };
          })
        );

        const map: Record<string, Set<string>> = {};
        const cohortSet = new Set<string>();

        results.forEach((r) => {
          if (r.status !== 'fulfilled') return;
          const { project_id, meta } = r.value;
          const opts = meta?.cohort_options || [];

          if (!map[project_id]) map[project_id] = new Set<string>();
          opts.forEach((c) => {
            if (!c) return;
            map[project_id].add(c);
            cohortSet.add(c);
          });
        });

        setProjectCohortMap(map);
        setCohortOptions(Array.from(cohortSet).sort());
      } catch (e) {
        console.error('Lỗi khi build projectCohortMap qua API:', e);
      }

      // Nếu chưa chọn project, auto chọn project đầu tiên
      if (!selectedProjectId && projList.length > 0) {
        setSelectedProjectId(projList[0].id);
      }

      setLoadingProjects(false);
    };

    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== DERIVED: STATUS OPTIONS, PROJECT FILTERED LIST =====
  const projectStatusOptions = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))).sort(),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    let list = [...projects];

    // 1) Trạng thái project
    if (projectStatusFilter !== 'all') {
      list = list.filter((p) => p.status === projectStatusFilter);
    }

    // 2) Đối tượng (cohort) – chỉ giữ các project có cohort đó trong map
    if (cohortFilter !== 'all') {
      list = list.filter((p) => {
        const cohorts = projectCohortMap[p.id];
        return cohorts ? cohorts.has(cohortFilter) : false;
      });
    }

    // 3) Ngày tạo (from / to)
    if (createdFrom) {
      const fromDate = new Date(createdFrom);
      list = list.filter((p) => {
        const d = new Date(p.created_at);
        return !Number.isNaN(d.getTime()) && d >= fromDate;
      });
    }

    if (createdTo) {
      const toDate = new Date(createdTo);
      const toDateEnd = new Date(toDate);
      toDateEnd.setDate(toDateEnd.getDate() + 1);

      list = list.filter((p) => {
        const d = new Date(p.created_at);
        return !Number.isNaN(d.getTime()) && d < toDateEnd;
      });
    }

    // 4) Search theo tên
    const k = searchText.trim().toLowerCase();
    if (k) {
      list = list.filter((p) => p.title.toLowerCase().includes(k));
    }

    // Ưu tiên project mới tạo gần đây
    list.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return list;
  }, [
    projects,
    projectStatusFilter,
    cohortFilter,
    projectCohortMap,
    createdFrom,
    createdTo,
    searchText,
  ]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const roundsOfSelectedProject = useMemo(
    () =>
      selectedProject
        ? [...selectedProject.rounds].sort(
            (a, b) => a.round_number - b.round_number
          )
        : [],
    [selectedProject]
  );

  // ===== HANDLERS CHỌN PROJECT / VÒNG =====
  const handleProjectRowClick = (id: string) => {
    setSelectedProjectId(id);
    setSelectedRoundId('');
    setComments([]);
    setSummary('');
    setCurrentPage(1);
    setError(null);
  };

  const handleRoundChange = (id: string) => {
    setSelectedRoundId(id);
    setComments([]);
    setSummary('');
    setCurrentPage(1);
    setError(null);
  };

  // ===== COMMENT & PHÂN TRANG COMMENT =====
  const totalPages = Math.max(1, Math.ceil(comments.length / PAGE_SIZE));

  const paginatedComments = useMemo(
    () => comments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [comments, currentPage]
  );

  const handleLoadComments = async () => {
    setError(null);
    setSummary('');
    setComments([]);
    setCurrentPage(1);

    if (!selectedProjectId || !selectedRoundId) {
      setError('Vui lòng chọn Project và Vòng.');
      return;
    }

    setLoadingComments(true);
    try {
      const res = await fetch('/api/admin/comments/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: selectedRoundId,
          cohort_code: cohortFilter === 'all' ? null : cohortFilter,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }

      const data = (await res.json()) as { comments: CommentRow[] };
      setComments(data.comments || []);
      if (!data.comments || data.comments.length === 0) {
        setError(
          'Không tìm thấy ý kiến nào (có thể câu hỏi không có ô comment hoặc không có người tham gia thuộc đối tượng này).'
        );
      }
    } catch (e: any) {
      console.error(e);
      setError('Lỗi khi tải ý kiến: ' + (e.message || String(e)));
    } finally {
      setLoadingComments(false);
    }
  };

  // ===== GPT SUMMARY =====
  const handleSummarize = async () => {
    setError(null);
    setSummary('');

    if (!comments.length) {
      setError('Không có ý kiến để tổng hợp. Hãy bấm "Tải ý kiến" trước.');
      return;
    }

    const template =
      PROMPT_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
      PROMPT_TEMPLATES[0];

    const project_title = selectedProject?.title || '';
    const roundObj = roundsOfSelectedProject.find((r) => r.id === selectedRoundId);
    const round_label = roundObj ? `Vòng ${roundObj.round_number}` : '';

    const commentTexts = comments.map((c) => c.comment);

    setLoadingSummary(true);
    try {
      const res = await fetch('/api/admin/comments/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_title,
          round_label,
          comments: commentTexts,
          base_prompt: template.text,
          custom_prompt: customPrompt,
          cohort_label: cohortFilter === 'all' ? null : `Đối tượng: ${cohortFilter}`,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }

      const data = (await res.json()) as {
        summary?: string;
        error?: string;
      };

      if (data.error) {
        setError('GPT báo lỗi: ' + data.error);
      } else {
        setSummary(data.summary || '');
      }
    } catch (e: any) {
      console.error(e);
      setError('Lỗi khi gọi GPT: ' + (e.message || String(e)));
    } finally {
      setLoadingSummary(false);
    }
  };

  const selectedTemplate =
    PROMPT_TEMPLATES.find((t) => t.id === selectedTemplateId) ||
    PROMPT_TEMPLATES[0];

  // ===== RENDER =====
  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <h1 className="text-xl font-bold mb-2">💬 Tổng hợp ý kiến</h1>

      {/* 1) BỘ LỌC PROJECT */}
      <section className="border rounded-lg p-4 bg-gray-50 space-y-3 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Tìm theo tên Project */}
          <div>
            <label className="block text-sm font-semibold mb-1">
              Tìm theo tên Project
            </label>
            <input
              type="text"
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Nhập một phần tên Project..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          {/* Trạng thái Project */}
          <div>
            <label className="block text-sm font-semibold mb-1">
              Trạng thái Project
            </label>
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

          {/* Đối tượng (cohort) */}
          <div>
            <label className="block text-sm font-semibold mb-1">
              Đối tượng (cohort)
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={cohortFilter}
              onChange={(e) => setCohortFilter(e.target.value as 'all' | string)}
            >
              <option value="all">Tất cả</option>
              {cohortOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {cohortOptions.length === 0 && (
              <div className="mt-1 text-xs text-gray-500 italic">
                (Chưa có đối tượng — kiểm tra lại API / RLS / dữ liệu cohort_code)
              </div>
            )}
          </div>

          {/* Ngày tạo */}
          <div className="flex flex-col gap-1">
            <label className="block text-sm font-semibold">
              Ngày tạo Project
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs w-1/2"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
              />
              <input
                type="date"
                className="border rounded px-2 py-1 text-xs w-1/2"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-gray-600 mt-1">
          <span>
            Tổng Project: <b>{projects.length}</b> · Sau lọc: <b>{filteredProjects.length}</b>
          </span>
          {loadingProjects && (
            <span className="text-gray-500">Đang tải project / vòng / đối tượng...</span>
          )}
          {error && <span className="text-red-600">{error}</span>}
        </div>
      </section>

      {/* 2) BẢNG PROJECT SAU LỌC + CHỌN VÒNG + TẢI Ý KIẾN */}
      <section className="border rounded-lg p-4 bg-white space-y-3 overflow-hidden">
        <h2 className="font-semibold mb-2">Chọn Project & Vòng để xem ý kiến</h2>

        {/* Bảng Project */}
        {filteredProjects.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Không có Project nào phù hợp bộ lọc.
          </div>
        ) : (
          <div className="border rounded max-h-72 overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="border px-2 py-1 text-center w-10">#</th>
                  <th className="border px-2 py-1 text-left">Tên Project</th>
                  <th className="border px-2 py-1 text-center w-24">Trạng thái</th>
                  <th className="border px-2 py-1 text-center w-32">Ngày tạo</th>
                  <th className="border px-2 py-1 text-center w-24">Số vòng</th>
                  <th className="border px-2 py-1 text-center w-32">Số đối tượng</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p, idx) => {
                  const cohorts = projectCohortMap[p.id];
                  const cohortCount = cohorts ? cohorts.size : 0;
                  const isSelected = p.id === selectedProjectId;

                  return (
                    <tr
                      key={p.id}
                      className={'cursor-pointer hover:bg-blue-50 ' + (isSelected ? 'bg-blue-50' : '')}
                      onClick={() => handleProjectRowClick(p.id)}
                    >
                      <td className="border px-2 py-1 text-center align-top">{idx + 1}</td>
                      <td className="border px-2 py-1 align-top">
                        <div className="font-semibold">{p.title}</div>
                      </td>
                      <td className="border px-2 py-1 text-center align-top">{p.status}</td>
                      <td className="border px-2 py-1 text-center align-top">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="border px-2 py-1 text-center align-top">{p.rounds.length}</td>
                      <td className="border px-2 py-1 text-center align-top">{cohortCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Chọn vòng & tải ý kiến */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Project đang chọn
            </label>
            <div className="text-sm">
              {selectedProject ? selectedProject.title : 'Chưa chọn. Hãy click một Project trong bảng.'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Vòng</label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={selectedRoundId}
              onChange={(e) => handleRoundChange(e.target.value)}
              disabled={!selectedProject}
            >
              <option value="">-- Chọn vòng --</option>
              {roundsOfSelectedProject.map((r) => (
                <option key={r.id} value={r.id}>
                  Vòng {r.round_number} ({r.status})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={!selectedProjectId || !selectedRoundId || loadingComments || loadingProjects}
              onClick={handleLoadComments}
            >
              {loadingComments ? 'Đang tải ý kiến…' : 'Tải ý kiến'}
            </button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
      </section>

      {/* 3) BẢNG Ý KIẾN THÔ */}
      <section className="border rounded-lg p-4 bg-white overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Ý kiến thô ({comments.length})</h2>
          {comments.length > 0 && (
            <div className="text-sm text-gray-500">
              Trang {currentPage}/{totalPages} · {PAGE_SIZE} ý kiến/trang
            </div>
          )}
        </div>

        {comments.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Chưa có ý kiến. Hãy chọn Project, Vòng, Đối tượng và bấm &quot;Tải ý kiến&quot;.
          </div>
        ) : (
          <>
            <div className="border rounded w-full max-w-full overflow-x-auto max-h-[400px]">
              <table className="text-sm border-collapse w-full">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="border px-2 py-1 text-center w-12">#</th>
                    <th className="border px-2 py-1 text-left w-[260px]">Câu hỏi</th>
                    <th className="border px-2 py-1 text-left">Ý kiến</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedComments.map((c, idx) => (
                    <tr key={c.item_id + '-' + idx}>
                      <td className="border px-2 py-1 text-center align-top">
                        {(currentPage - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="border px-2 py-1 align-top">
                        {truncate(c.item_prompt, 14)}
                      </td>
                      <td className="border px-2 py-1 align-top">{c.comment}</td>
                    </tr>
                  ))}
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

      {/* 4) KHU VỰC GPT TÓM TẮT */}
      <section className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <h2 className="font-semibold mb-1">GPT tổng hợp ý kiến</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-sm font-semibold mb-1">
              Chọn mẫu prompt
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              {PROMPT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-600">{selectedTemplate.text}</p>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-semibold mb-1">
              Prompt bổ sung (tuỳ chọn)
            </label>
            <textarea
              className="w-full border rounded px-2 py-1 text-sm min-h-[80px]"
              placeholder="Thêm hướng dẫn chi tiết hơn cho GPT (nếu cần)..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50"
            disabled={loadingSummary || comments.length === 0}
            onClick={handleSummarize}
          >
            {loadingSummary ? 'Đang tổng hợp…' : 'GPT tổng hợp ý kiến'}
          </button>
        </div>

        <div className="mt-3">
          <label className="block text-sm font-semibold mb-1">
            Kết quả tóm tắt
          </label>
          {summary ? (
            <div className="border rounded bg-white p-3 whitespace-pre-wrap text-sm">
              {summary}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              Chưa có kết quả. Hãy tải ý kiến và bấm &quot;GPT tổng hợp ý kiến&quot;.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
