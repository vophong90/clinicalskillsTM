// app/admin/AdminCommentSummaryManager.tsx
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

export default function AdminCommentSummaryManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<string>(''); // 1 project
  const [selectedRoundId, setSelectedRoundId] = useState<string>(''); // 1 round

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('impact');
  const [customPrompt, setCustomPrompt] = useState('');
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load projects + rounds
  useEffect(() => {
    const loadProjects = async () => {
      setLoadingProjects(true);
      setError(null);

      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('id, title, status');

      if (projErr) {
        setError('Lỗi truy vấn projects: ' + projErr.message);
        setLoadingProjects(false);
        return;
      }

      const projectIds = (projectsData || []).map((p) => p.id);

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
      (projectsData || []).forEach((p) => {
        projMap[p.id] = {
          id: p.id,
          title: p.title,
          rounds: [],
        };
      });

      (roundsData || []).forEach((r) => {
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

      // Nếu chưa chọn project, auto chọn project đầu tiên
      if (!selectedProjectId && projList.length > 0) {
        setSelectedProjectId(projList[0].id);
      }

      setLoadingProjects(false);
    };

    loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const roundsOfProject = useMemo(
    () =>
      selectedProject
        ? selectedProject.rounds.sort(
            (a, b) => a.round_number - b.round_number
          )
        : [],
    [selectedProject]
  );

  // Reset round & data khi đổi project
  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    setSelectedRoundId('');
    setComments([]);
    setSummary('');
    setCurrentPage(1);
  };

  const handleRoundChange = (id: string) => {
    setSelectedRoundId(id);
    setComments([]);
    setSummary('');
    setCurrentPage(1);
  };

  const totalPages = Math.max(
    1,
    Math.ceil(comments.length / PAGE_SIZE)
  );
  const paginatedComments = useMemo(
    () =>
      comments.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [comments, currentPage]
  );

  const handleLoadComments = async () => {
    setError(null);
    setSummary('');
    setComments([]);
    setCurrentPage(1);

    if (!selectedRoundId) {
      setError('Vui lòng chọn Project và Vòng.');
      return;
    }

    setLoadingComments(true);
    try {
      const res = await fetch('/api/admin/comments/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_id: selectedRoundId }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }

      const data = (await res.json()) as { comments: CommentRow[] };
      setComments(data.comments || []);
      if (!data.comments || data.comments.length === 0) {
        setError('Không tìm thấy ý kiến nào (có thể câu hỏi không có ô comment).');
      }
    } catch (e: any) {
      console.error(e);
      setError('Lỗi khi tải ý kiến: ' + (e.message || String(e)));
    } finally {
      setLoadingComments(false);
    }
  };

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
    const roundObj = roundsOfProject.find((r) => r.id === selectedRoundId);
    const round_label = roundObj
      ? `Vòng ${roundObj.round_number}`
      : '';

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
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }

      const data = (await res.json()) as { summary?: string; error?: string };
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

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <h1 className="text-xl font-bold mb-2">💬 Tổng hợp ý kiến</h1>

      {/* Chọn project & vòng */}
      <section className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Project
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
            >
              <option value="">-- Chọn Project --</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Vòng
            </label>
            <select
              className="w-full border rounded px-2 py-1 text-sm"
              value={selectedRoundId}
              onChange={(e) => handleRoundChange(e.target.value)}
            >
              <option value="">-- Chọn vòng --</option>
              {roundsOfProject.map((r) => (
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
              disabled={!selectedRoundId || loadingComments || loadingProjects}
              onClick={handleLoadComments}
            >
              {loadingComments ? 'Đang tải ý kiến…' : 'Tải ý kiến'}
            </button>
          </div>
        </div>
        {loadingProjects && (
          <div className="text-sm text-gray-500">
            Đang tải project & vòng...
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600">
            {error}
          </div>
        )}
      </section>

      {/* Bảng ý kiến thô */}
      <section className="border rounded-lg p-4 bg-white overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">
            Ý kiến thô ({comments.length})
          </h2>
          {comments.length > 0 && (
            <div className="text-sm text-gray-500">
              Trang {currentPage}/{totalPages} · {PAGE_SIZE} ý kiến/trang
            </div>
          )}
        </div>

        {comments.length === 0 ? (
          <div className="text-sm text-gray-500 italic">
            Chưa có ý kiến. Hãy chọn Project, Vòng và bấm "Tải ý kiến".
          </div>
        ) : (
          <>
            <div className="border rounded w-full max-w-full overflow-x-auto max-h-[400px]">
              <table className="text-sm border-collapse w-full">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="border px-2 py-1 text-center w-12">
                      #
                    </th>
                    <th className="border px-2 py-1 text-left w-[260px]">
                      Câu hỏi
                    </th>
                    <th className="border px-2 py-1 text-left">
                      Ý kiến
                    </th>
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
                      <td className="border px-2 py-1 align-top">
                        {c.comment}
                      </td>
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
                  onClick={() =>
                    setCurrentPage((p) => Math.max(1, p - 1))
                  }
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

      {/* Khu vực GPT tóm tắt */}
      <section className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <h2 className="font-semibold mb-1">
          GPT tổng hợp ý kiến
        </h2>

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
            <p className="mt-2 text-xs text-gray-600">
              {selectedTemplate.text}
            </p>
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
              Chưa có kết quả. Hãy tải ý kiến và bấm &quot;GPT tổng hợp
              ý kiến&quot;.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
