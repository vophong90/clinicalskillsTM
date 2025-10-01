'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Protected from '@/components/Protected';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

type Item = {
  id: string;
  prompt: string;
  type: 'single' | 'multi' | 'scale' | 'text';
  options_json: { choices?: string[]; scale_min?: number; scale_max?: number; };
  item_order: number;
};

type ResponseRow = {
  item_id: string;
  answer_json: any;
  is_submitted: boolean;
  user_id: string;
};

type UserRole = "admin" | "secretary" | "viewer" | "core_expert" | "external_expert";

async function fetchAllResponsesPaginated(roundId: string): Promise<ResponseRow[]> {
  const PAGE = 1000;
  let from = 0;
  const all: ResponseRow[] = [];

  while (true) {
    const to = from + PAGE - 1;
    const { data, error } = await supabase
      .from('responses')
      .select('item_id, answer_json, is_submitted, user_id')
      .eq('round_id', roundId)
      .order('user_id', { ascending: true })  // sắp xếp ổn định
      .order('item_id', { ascending: true })  // sắp xếp ổn định
      .range(from, to);

    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break; // hết trang
    from += PAGE;
  }
  return all;
}

export default function StatsPage() {
  const params = useParams();
  const roundId = params?.roundId as string;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [role, setRole] = useState<UserRole | null>(null);
  const [canView, setCanView] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // 1. Lấy thông tin user & role
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      let userRole: UserRole | null = null;
      if (userId) {
        // Lấy permission role ở project hiện tại
        const { data: rinfo } = await supabase
          .from('rounds')
          .select('project_id')
          .eq('id', roundId)
          .maybeSingle();

        if (rinfo?.project_id) {
          const { data: per } = await supabase
            .from('permissions')
            .select('role')
            .eq('user_id', userId)
            .eq('project_id', rinfo.project_id)
            .maybeSingle();
          userRole = per?.role ?? null;
          setRole(userRole);
          setCanView(userRole === "secretary" || userRole === "viewer" || userRole === "admin");
        }
      }

      // 2. Lấy items của vòng này
      const { data: its } = await supabase
        .from('items')
        .select('id, prompt, type, options_json, item_order')
        .eq('round_id', roundId)
        .order('item_order', { ascending: true });
      setItems(its ?? []);

      // 3. Lấy tất cả responses
      const resps = await fetchAllResponsesPaginated(r.id);
      setResponses(resps ?? []);
      
      setLoading(false);
    };
    load();
  }, [roundId]);

  // 4. Tổng hợp dữ liệu
  function summarize(item: Item) {
    const filtered = responses.filter(r => r.item_id === item.id && r.is_submitted);
    if (item.type === "single" || item.type === "multi") {
      const allChoices = item.options_json?.choices || [];
      const counts: Record<string, number> = {};
      allChoices.forEach(choice => counts[choice] = 0);

      filtered.forEach(r => {
        const v = r.answer_json?.value;
        const arr = Array.isArray(r.answer_json?.choices) ? r.answer_json.choices : v ? [v] : [];
        arr.forEach((choice: string) => {
          if (counts[choice] !== undefined) counts[choice]++;
        });
      });
      return counts;
    }
    if (item.type === "scale") {
      let total = 0, count = 0, min = Infinity, max = -Infinity;
      filtered.forEach(r => {
        const v = Number(r.answer_json?.value ?? 0);
        if (!isNaN(v)) {
          total += v; count++;
          if (v > max) max = v;
          if (v < min) min = v;
        }
      });
      return { avg: count > 0 ? (total / count).toFixed(2) : "-", min, max, count };
    }
    return null;
  }

  // 5. Nhận xét mở
  function getComments(item: Item) {
    const filtered = responses.filter(r => r.item_id === item.id && r.is_submitted);
    return filtered.map(r => r.answer_json?.comment).filter((c: string) => !!c);
  }

  // Đếm người nộp
  const submittedUsers = new Set(responses.filter(r => r.is_submitted).map(r => r.user_id));
  const draftUsers = new Set(responses.filter(r => !r.is_submitted).map(r => r.user_id));

  // ---- Xuất Excel ----
  const handleExportExcel = () => {
    // 1 sheet cho thống kê định lượng
    const ws1: any[] = [];
    items.forEach((it, idx) => {
      const stats = summarize(it);
      if (it.type === "single" || it.type === "multi") {
        ws1.push({
          "STT": idx + 1,
          "Câu hỏi": it.prompt,
          ...stats
        });
      } else if (it.type === "scale") {
        ws1.push({
          "STT": idx + 1,
          "Câu hỏi": it.prompt,
          "Trung bình": stats?.avg,
          "Min": stats?.min,
          "Max": stats?.max,
          "N": stats?.count,
        });
      }
    });

    // 1 sheet cho nhận xét mở
    const ws2: any[] = [];
    items.forEach((it, idx) => {
      const comments = getComments(it);
      comments.forEach((cmt, i) => {
        ws2.push({
          "STT": idx + 1,
          "Câu hỏi": it.prompt,
          "Ý kiến": cmt
        });
      });
    });

    const wb = XLSX.utils.book_new();
    wb.SheetNames.push("Thống kê");
    wb.SheetNames.push("Ý kiến mở");
    wb.Sheets["Thống kê"] = XLSX.utils.json_to_sheet(ws1);
    wb.Sheets["Ý kiến mở"] = XLSX.utils.json_to_sheet(ws2);

    XLSX.writeFile(wb, `thong_ke_vong_${roundId}.xlsx`);
  };

  // --- Render ---
  if (loading) return <Protected><div>Đang tải thống kê...</div></Protected>;
  if (!canView) return <Protected><div>Bạn không có quyền xem thống kê.</div></Protected>;

  return (
    <Protected>
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <h1 className="text-2xl font-bold text-indigo-800 mb-2">Thống kê khảo sát</h1>
        <div className="mb-4 text-gray-600">
          Tổng số chuyên gia đã gửi: <b>{submittedUsers.size}</b> — Nháp: <b>{draftUsers.size}</b>
        </div>
        <button
          className="mb-6 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold shadow"
          onClick={handleExportExcel}
        >
          ⬇️ Xuất Excel
        </button>

        <div className="space-y-10">
          {items.map((it, idx) => {
            const stats = summarize(it);
            const comments = getComments(it);

            // Dữ liệu chart cho single/multi
            let chartData: { name: string; value: number }[] = [];
            if ((it.type === "single" || it.type === "multi") && stats) {
              chartData = Object.entries(stats).map(([k, v]) => ({ name: k, value: v as number }));
            }

            return (
              <div key={it.id} className="bg-white p-6 rounded-2xl shadow-md max-w-2xl mx-auto">
                <div className="mb-2 font-semibold text-indigo-700">Kỹ năng {idx + 1}: {it.prompt}</div>
                {/* Chart (single/multi) */}
                {(it.type === "single" || it.type === "multi") && chartData.length > 0 && (
                  <div className="w-full h-56 mb-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#6366f1">
                          <LabelList dataKey="value" position="top" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {/* Thống kê số liệu hoặc thang điểm */}
                <div className="mb-2">
                  {it.type === "single" || it.type === "multi" ? (
                    <table className="min-w-[300px] text-sm">
                      <thead>
                        <tr>
                          {Object.keys(stats || {}).map(opt => (
                            <th key={opt} className="px-3 py-1">{opt}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {Object.values(stats || {}).map((count, j) => (
                            <td key={j} className="px-3 py-1 text-center">{count}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  ) : it.type === "scale" ? (
                    <div>
                      <span>Trung bình: <b>{stats?.avg}</b></span>
                      <span className="mx-2">|</span>
                      <span>Min: <b>{stats?.min}</b></span>
                      <span className="mx-2">|</span>
                      <span>Max: <b>{stats?.max}</b></span>
                      <span className="mx-2">|</span>
                      <span>N: <b>{stats?.count}</b></span>
                    </div>
                  ) : null}
                </div>
                {/* Ý kiến mở */}
                {comments.length > 0 && (
                  <details className="bg-blue-50 rounded p-3 mt-2">
                    <summary className="cursor-pointer font-semibold mb-2 text-blue-700">Ý kiến nhận xét của chuyên gia ({comments.length})</summary>
                    <ul className="mt-2 list-disc ml-7">
                      {comments.map((cmt, j) => <li key={j} className="mb-1">{cmt}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Protected>
  );
}
