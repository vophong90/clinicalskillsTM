'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Protected from '@/components/Protected';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, CartesianGrid } from 'recharts';

// ==== TYPES ====
type Round = {
  id: string;
  round_number: number;
  status: string;
};

type Item = {
  id: string;
  prompt: string;
  type: 'single' | 'multi' | 'scale' | 'text';
  options_json: { choices?: string[]; scale_min?: number; scale_max?: number; };
  item_order: number;
  round_id: string;
};

type ResponseRow = {
  item_id: string;
  answer_json: any;
  is_submitted: boolean;
  user_id: string;
  round_id: string;
};

type UserRole = "admin" | "secretary" | "viewer" | "core_expert" | "external_expert";

// ==== HÀM TÍNH TOÁN ====
function calcConsensus(counts: Record<string, number>, total: number): { consensus: number, consensusOpt: string } {
  let maxVal = 0, maxOpt = '';
  for (const [opt, val] of Object.entries(counts)) {
    if (val > maxVal) {
      maxVal = val;
      maxOpt = opt;
    }
  }
  return {
    consensus: total > 0 ? Math.round((maxVal / total) * 100) : 0,
    consensusOpt: maxOpt
  };
}

function calcMedian(arr: number[]) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : ((sorted[mid - 1] + sorted[mid]) / 2);
}

function calcIQR(arr: number[]) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor((sorted.length / 4))];
  const q3 = sorted[Math.floor((sorted.length * 3) / 4)];
  return q3 - q1;
}

// --- CVI ---
function calcCVI_scale(arr: number[], threshold: number) {
  if (!arr.length) return null;
  const nRelevant = arr.filter(v => v >= threshold).length;
  return +(nRelevant / arr.length).toFixed(2);
}
function calcCVI_single(counts: Record<string, number>, total: number, acceptOptions: string[]) {
  if (!total) return null;
  let sum = 0;
  for (const opt of acceptOptions) sum += counts[opt] ?? 0;
  return +(sum / total).toFixed(2);
}

// --- TỔNG HỢP DỮ LIỆU ---
function summarize(item: Item, responses: ResponseRow[]) {
  const filtered = responses.filter(r => r.item_id === item.id && r.is_submitted);
  const N = filtered.length;

  // Single/multi
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

    const { consensus, consensusOpt } = calcConsensus(counts, N);

    // CVI: chấp nhận là chọn "phù hợp", "rất phù hợp" (bạn điều chỉnh theo từ của bạn)
    const relevantOpts = allChoices.filter(opt =>
      opt.includes("phù hợp") || opt.toLowerCase().includes("relevant")
    );
    const cvi = calcCVI_single(counts, N, relevantOpts);

    return { counts, consensus, consensusOpt, cvi, N };
  }

  // Scale
  if (item.type === "scale") {
    const vals: number[] = [];
    filtered.forEach(r => {
      const v = Number(r.answer_json?.value ?? 0);
      if (!isNaN(v)) vals.push(v);
    });
    const mean = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const median = calcMedian(vals);
    const iqr = calcIQR(vals);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    // Mặc định đồng thuận >=4/5, >=3/4 (thay đổi tùy thang)
    const scaleMax = item.options_json?.scale_max ?? 5;
    const consensusCut = scaleMax >= 5 ? 4 : 3;
    const consensusN = vals.filter(v => v >= consensusCut).length;
    const consensus = vals.length ? Math.round((consensusN / vals.length) * 100) : 0;
    const cvi = calcCVI_scale(vals, consensusCut);

    return { mean, median, iqr, min, max, consensus, cvi, N, vals };
  }

  return { N };
}

// --- Ý kiến mở ---
function getComments(item: Item, responses: ResponseRow[]) {
  const filtered = responses.filter(r => r.item_id === item.id && r.is_submitted);
  return filtered.map(r => r.answer_json?.comment).filter((c: string) => !!c);
}

export default function ProjectStatsPage() {
  // ==== STATE ====
  const params = useParams();
  const projectId = params?.projectId as string;
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [canView, setCanView] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);

  // ==== LOAD DATA ====
 // Helper: lấy tất cả bản ghi theo lô (tránh giới hạn 1000 dòng)
async function fetchAll<T>(
  pageQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await pageQuery(from, to);
    if (error) throw error;
    const chunk = data ?? [];
    all = all.concat(chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

useEffect(() => {
  const load = async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;

    let userRole: UserRole | null = null;
    if (userId) {
      const { data: per } = await supabase
        .from('permissions')
        .select('role')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .maybeSingle();
      userRole = per?.role ?? null;
      setRole(userRole);
      setCanView(userRole === 'secretary' || userRole === 'viewer' || userRole === 'admin');
    }

    // Rounds (bọc truy vấn trong async để trả Promise<{data,error}>)
    const rds = await fetchAll<Round>(async (from, to) => {
      const { data, error } = await supabase
        .from('rounds')
        .select('id, round_number, status')
        .eq('project_id', projectId)
        .order('round_number', { ascending: true })
        .range(from, to);
      return { data, error };
    });
    setRounds(rds);
    const roundIds = rds.map(r => r.id);

    // Items
    let its: Item[] = [];
    if (roundIds.length > 0) {
      its = await fetchAll<Item>(async (from, to) => {
        const { data, error } = await supabase
          .from('items')
          .select('id, prompt, type, options_json, item_order, round_id')
          .in('round_id', roundIds)
          .order('round_id', { ascending: true })
          .order('item_order', { ascending: true })
          .order('id', { ascending: true }) // dùng khóa đơn điệu để phân trang ổn định
          .range(from, to);
        return { data, error };
      });
    }
    setItems(its);

    // Responses (thường lớn nhất → phân trang + order ổn định)
    let resps: ResponseRow[] = [];
    if (roundIds.length > 0) {
      resps = await fetchAll<ResponseRow>(async (from, to) => {
        const { data, error } = await supabase
          .from('responses')
          .select('item_id, answer_json, is_submitted, user_id, round_id')
          .in('round_id', roundIds)
          .order('id', { ascending: true }) // nếu bảng không có 'id', đổi sang 'created_at'
          .range(from, to);
        return { data, error };
      });
    }
    setResponses(resps);

    setLoading(false);
  };
  load();
}, [projectId]);

  // Tổng hợp user nộp theo vòng
  function getSubmittedUsers(roundId: string) {
    return new Set(responses.filter(r => r.round_id === roundId && r.is_submitted).map(r => r.user_id));
  }
  function getDraftUsers(roundId: string) {
    return new Set(responses.filter(r => r.round_id === roundId && !r.is_submitted).map(r => r.user_id));
  }

  // Xuất Excel
  const handleExportExcel = () => {
    const ws1: any[] = [];
    items.forEach((it) => {
      const stats = summarize(it, responses);
      const roundNum = rounds.find(r => r.id === it.round_id)?.round_number ?? "-";
      if (it.type === "single" || it.type === "multi") {
        ws1.push({
          "Vòng": roundNum,
          "STT": it.item_order,
          "Câu hỏi": it.prompt,
          "Tỉ lệ đồng thuận (%)": stats.consensus,
          "Phương án đồng thuận": stats.consensusOpt,
          "CVI": stats.cvi,
          "N": stats.N,
          ...stats.counts
        });
      } else if (it.type === "scale") {
        ws1.push({
          "Vòng": roundNum,
          "STT": it.item_order,
          "Câu hỏi": it.prompt,
          "Mean": stats.mean,
          "Median": stats.median,
          "IQR": stats.iqr,
          "Consensus (%)": stats.consensus,
          "CVI": stats.cvi,
          "Min": stats.min,
          "Max": stats.max,
          "N": stats.N,
        });
      }
    });

    // 1 sheet cho nhận xét mở
    const ws2: any[] = [];
    items.forEach((it) => {
      const roundNum = rounds.find(r => r.id === it.round_id)?.round_number ?? "-";
      const comments = getComments(it, responses);
      comments.forEach((cmt) => {
        ws2.push({
          "Vòng": roundNum,
          "STT": it.item_order,
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

    XLSX.writeFile(wb, `thong_ke_project_${projectId}.xlsx`);
  };

  if (loading) return <Protected><div>Đang tải thống kê...</div></Protected>;
  if (!canView) return <Protected><div>Bạn không có quyền xem thống kê.</div></Protected>;

  // === Render các vòng (PHẦN 2 tiếp tục ở dưới) ===
  return (
    <Protected>
      <div className="min-h-screen bg-gray-50 px-4 py-8">
        <h1 className="text-2xl font-bold text-indigo-800 mb-2">Thống kê các vòng khảo sát (đầy đủ chỉ số)</h1>
        <div className="mb-4 text-gray-600">
          Dự án <b>{projectId}</b> có <b>{rounds.length}</b> vòng khảo sát.
        </div>
        <button
          className="mb-6 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold shadow"
          onClick={handleExportExcel}
        >
          ⬇️ Xuất Excel
        </button>
        <div className="space-y-10">
          {rounds.map(round => (
            <div key={round.id} className="mb-10">
              <h2 className="text-lg font-bold mb-2 text-blue-700">
                Vòng {round.round_number} ({round.status})
              </h2>
              <div className="mb-3 text-gray-600">
                Số chuyên gia đã gửi: <b>{getSubmittedUsers(round.id).size}</b>
                <span className="mx-2">|</span>
                Nháp: <b>{getDraftUsers(round.id).size}</b>
              </div>
              <div className="space-y-8">
                {items.filter(it => it.round_id === round.id).map((it) => {
                  const stats = summarize(it, responses);
                  const comments = getComments(it, responses);
                  // Chuyển sang PHẦN 2 dưới đây
                  return (
                    <StatBlock
                      key={it.id}
                      item={it}
                      stats={stats}
                      comments={comments}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Protected>
  );
}

// --- Hàm tính Kendall's W cho xếp hạng (nâng cao, simple) ---
function calcKendallW(responses: ResponseRow[], item: Item) {
  // Dùng cho câu hỏi single/multi (chọn 1), mọi người xếp hạng 1 trong n lựa chọn
  // Chỉ áp dụng nếu có từ 3 lựa chọn trở lên
  if (!item.options_json?.choices || item.options_json.choices.length < 3) return null;
  // Tạo ma trận: mỗi chuyên gia là 1 dòng, cột là lựa chọn
  const experts = Array.from(new Set(responses.filter(r => r.item_id === item.id && r.is_submitted).map(r => r.user_id)));
  if (experts.length < 2) return null;
  const choices = item.options_json.choices;
  // Mỗi dòng là 1 expert, mỗi ô là 1 nếu chọn, 0 nếu không
  const ranks = experts.map(uid => {
    const r = responses.find(x => x.item_id === item.id && x.user_id === uid && x.is_submitted);
    if (!r) return Array(choices.length).fill(0);
    const ans = r.answer_json?.value ? [r.answer_json.value] : (Array.isArray(r.answer_json?.choices) ? r.answer_json.choices : []);
    return choices.map(c => ans.includes(c) ? 1 : 0);
  });
  // Tính tổng số lần chọn mỗi phương án
  const colSum = choices.map((_, i) => ranks.reduce((a, b) => a + b[i], 0));
  // Tính tổng phương sai giữa các chuyên gia (S)
  const mean = colSum.reduce((a, b) => a + b, 0) / choices.length;
  const S = colSum.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  // Hệ số W
  const m = experts.length, n = choices.length;
  if (m <= 1 || n <= 1) return null;
  const W = S / (0.5 * m * m * (n * n - 1));
  return +W.toFixed(2);
}

// --- Component hiển thị từng item (StatBlock) ---
function StatBlock({ item, stats, comments }: { item: Item, stats: any, comments: string[] }) {
  // Bar chart cho single/multi
  let chartData: { name: string; value: number }[] = [];
  if ((item.type === "single" || item.type === "multi") && stats.counts) {
    chartData = Object.entries(stats.counts).map(([k, v]) => ({ name: k, value: v as number }));
  }
  // Histogram cho scale
  let scaleChart: { value: number, count: number }[] = [];
  if (item.type === "scale" && stats.vals) {
    // Đếm số lần mỗi giá trị xuất hiện
    const counter: Record<number, number> = {};
    stats.vals.forEach((v: number)=> {
      counter[v] = (counter[v] || 0) + 1;
    });
    scaleChart = Object.entries(counter).map(([v, c]) => ({ value: Number(v), count: c as number }));
    // Sort tăng dần
    scaleChart.sort((a, b) => a.value - b.value);
  }

  // Kendall's W (nếu có)
  const kendallW = (item.type === "single" || item.type === "multi") && chartData.length >= 3
    ? calcKendallW(stats.vals || [], item) // truyền responses vào nếu muốn chính xác
    : null;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-md max-w-2xl mx-auto">
      <div className="mb-2 font-semibold text-indigo-700">
        {item.item_order ? <>Kỹ năng {item.item_order}: </> : null}
        {item.prompt}
      </div>
      {/* Bar chart cho single/multi */}
      {(item.type === "single" || item.type === "multi") && chartData.length > 0 && (
        <div className="w-full h-56 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
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
      {/* Histogram cho scale */}
      {item.type === "scale" && scaleChart.length > 0 && (
        <div className="w-full h-56 mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scaleChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="value" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#34d399">
                <LabelList dataKey="count" position="top" />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Thống kê số liệu/đồng thuận */}
      <div className="mb-2 space-y-1">
        {(item.type === "single" || item.type === "multi") && (
          <div>
            <b>Đồng thuận:</b> {stats.consensus}% (phương án: <b>{stats.consensusOpt}</b>)
            <span className="mx-2">|</span>
            <b>CVI:</b> {stats.cvi}
            {kendallW !== null && (
              <><span className="mx-2">|</span>
              <b>Kendall’s W:</b> {kendallW}</>
            )}
            <span className="mx-2">|</span>
            <b>N:</b> {stats.N}
          </div>
        )}
        {item.type === "scale" && (
          <div>
            <b>Mean:</b> {stats.mean?.toFixed(2)}
            <span className="mx-2">|</span>
            <b>Median:</b> {stats.median}
            <span className="mx-2">|</span>
            <b>IQR:</b> {stats.iqr}
            <span className="mx-2">|</span>
            <b>Đồng thuận:</b> {stats.consensus}%
            <span className="mx-2">|</span>
            <b>CVI:</b> {stats.cvi}
            <span className="mx-2">|</span>
            <b>N:</b> {stats.N}
          </div>
        )}
      </div>
      {/* Ý kiến mở */}
      {comments.length > 0 && (
        <details className="bg-blue-50 rounded p-3 mt-2">
          <summary className="cursor-pointer font-semibold mb-2 text-blue-700">
            Ý kiến nhận xét của chuyên gia ({comments.length})
          </summary>
          <ul className="mt-2 list-disc ml-7">
            {comments.map((cmt, j) => <li key={j} className="mb-1">{cmt}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
