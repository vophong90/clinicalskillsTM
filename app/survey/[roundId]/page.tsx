'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Protected from '@/components/Protected';

// ---- Types ----
type ItemOptions = {
  choices?: string[];
  scale_min?: number;
  scale_max?: number;
};

type ItemType = 'single' | 'multi' | 'scale' | 'text';

type Item = {
  id: string;
  prompt: string;
  options_json: ItemOptions;
  item_order: number;
  project_id: string;
  round_id?: string;
  type: ItemType;
};

type Round = {
  id: string;
  project_id: string;
  status: 'draft' | 'active' | 'closed';
  round_number: number;
  description?: string;
};

type RespRow = {
  item_id: string;
  answer_json: any;
  is_submitted: boolean;
};

export default function SurveyPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params?.roundId as string;

  const [items, setItems] = useState<Item[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [prevComments, setPrevComments] = useState<Record<string, string[]>>({});
  const [curIndex, setCurIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);

  // Load dữ liệu
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage('');

      // 1) Round
      const { data: r, error: er } = await supabase
        .from('rounds')
        .select('*')
        .eq('id', roundId)
        .single();

      if (er || !r) {
        setMessage('Không tìm thấy vòng khảo sát.');
        setLoading(false);
        return;
      }
      setRound(r);

      // 2) Items (của vòng này)
      const { data: its, error: itErr } = await supabase
        .from('items')
        .select('id,prompt,options_json,type,item_order,project_id,round_id')
        .eq('project_id', r.project_id)
        .eq('round_id', r.id)
        .order('item_order', { ascending: true });

      if (itErr) {
        setMessage('Lỗi tải câu hỏi: ' + itErr.message);
        setLoading(false);
        return;
      }
      const safeItems = (its ?? []) as Item[];
      setItems(safeItems);

      // 3) User
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      // 4) Responses của user này (lọc theo round & bỏ trần 1000)
      let resps: RespRow[] = [];
      if (userId) {
        const { data: resData } = await supabase
          .from('responses')
          .select('item_id, answer_json, is_submitted')
          .eq('round_id', r.id)
          .eq('user_id', userId)
          .range(0, 999999);
        resps = (resData ?? []) as RespRow[];
      }

      // 4.1) LỌC BỎ RESPONSES MỒ CÔI (item đã bị xóa)
      const validItemIds = new Set(safeItems.map(i => i.id));
      const filteredResps = resps.filter(row => validItemIds.has(row.item_id));

      // 5) Ánh xạ vào state answer/comment
      const map: Record<string, any> = {};
      const cmtMap: Record<string, string> = {};
      let wasSubmitted = false;

      filteredResps.forEach((row) => {
        const a = row.answer_json;
        // Lưu value/choices "gọn" để binding input
        if (Array.isArray(a?.choices)) map[row.item_id] = a.choices;
        else if (a?.value !== undefined) map[row.item_id] = a.value;
        else map[row.item_id] = a ?? null;

        if (typeof a?.comment === 'string' && a.comment.trim() !== '') {
          cmtMap[row.item_id] = a.comment;
        }
        if (row.is_submitted) wasSubmitted = true;
      });

      setAnswers(map);
      setComments(cmtMap);
      setSubmitted(wasSubmitted);

      // 6) Nhận xét vòng trước qua RPC (nếu có)
      if (r.round_number > 1) {
        const { data: rows, error: prevErr } = await supabase
          .rpc('get_prev_comments', { cur_round_id: r.id });

        if (!prevErr && rows?.length) {
          const prevMap: Record<string, string[]> = {};
          rows.forEach((row: any) => {
            if (!prevMap[row.current_item_id]) prevMap[row.current_item_id] = [];
            prevMap[row.current_item_id].push(row.comment);
          });
          setPrevComments(prevMap);
        }
      }

      setLoading(false);
    };

    load();
  }, [roundId]);

 // ===== Helpers thay đổi câu trả lời =====
const handleChange = (itemId: string, value: any) => {
  setAnswers(prev => ({ ...prev, [itemId]: value }));
};

const handleCommentChange = (itemId: string, value: string) => {
  setComments(prev => ({ ...prev, [itemId]: value }));
};

const toggleMulti = (itemId: string, choice: string) => {
  setAnswers(prev => {
    const cur = Array.isArray(prev[itemId]) ? prev[itemId] : [];
    const exists = cur.includes(choice);
    const next = exists ? cur.filter((c: string) => c !== choice) : [...cur, choice];
    return { ...prev, [itemId]: next };
  });
};

// ===== Kiểm tra trống/đầy cho 1 câu trả lời =====
const isEmptyAnswer = (v: any) => {
  if (v === undefined || v === null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'string') return v.trim() === ''; // chuỗi rỗng là chưa trả lời
  return false; // số (kể cả 0) hoặc object hợp lệ
};

// ===== Validate: đã trả lời HẾT tất cả items của vòng hiện tại =====
const isAllAnswered = useMemo(() => {
  return items.every(it => !isEmptyAnswer(answers[it.id]));
}, [items, answers]);

// ===== Lưu / Gửi =====
const handleSave = async () => save(false);

const handleSubmit = async () => {
  // vòng phải đang active
  if (round?.status !== 'active') {
    setMessage('Vòng này chưa mở hoặc đã đóng. Không thể gửi bản cuối.');
    return;
  }

  // phải trả lời đủ 100%
  const unanswered = items.filter(it => isEmptyAnswer(answers[it.id]));
  if (unanswered.length > 0) {
    setMessage(`Bạn còn ${unanswered.length} câu chưa trả lời. Vui lòng hoàn tất trước khi gửi.`);
    return;
  }

  await save(true);
};

// Gộp payload CHỈ từ các item đã có câu trả lời; khi submit bắt buộc đủ
const save = async (submit: boolean) => {
  if (!round) return;
  setMessage('Đang lưu...');

  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id!;
  if (!userId) {
    setMessage('Không xác định được người dùng.');
    return;
  }

  // chỉ build payload cho các item đã có câu trả lời
  const payload = items
    .filter(it => !isEmptyAnswer(answers[it.id]))
    .map(it => {
      const raw = answers[it.id];
      const ans: any = {};
      if (Array.isArray(raw)) ans.choices = raw;
      else if (typeof raw === 'number' || typeof raw === 'string') ans.value = raw;

      const cmt = comments[it.id];
      if (typeof cmt === 'string' && cmt.trim() !== '') ans.comment = cmt.trim();

      return {
        round_id: round.id,
        item_id: it.id,
        user_id: userId,
        answer_json: ans,
        is_submitted: submit,
      };
    });

  // Phòng hờ: nếu bấm gửi mà payload vẫn thiếu so với tổng số câu => chặn
  if (submit && payload.length < items.length) {
    setMessage('Có câu chưa trả lời, không thể gửi bản cuối.');
    return;
  }

  const { error } = await supabase
    .from('responses')
    .upsert(payload, { onConflict: 'round_id,item_id,user_id' });

  setMessage(
    error ? ('Lỗi lưu: ' + error.message) : (submit ? 'Đã gửi thành công.' : 'Đã lưu nháp.')
  );

  if (!error && submit) {
    setSubmitted(true);
    setTimeout(() => router.push('/dashboard'), 1500);
  }
};

  // Điều hướng
  const goTo = (idx: number) => setCurIndex(idx);
  const goBack = () => setCurIndex(idx => Math.max(0, idx - 1));
  const goNext = () => setCurIndex(idx => Math.min(items.length - 1, idx + 1));

  // Render 1 câu
  const renderQuestion = (it: Item, idx: number) => {
    const choices = it.options_json?.choices ?? [];
    const isActive = round?.status === 'active' && !submitted;

    return (
      <div key={it.id} className="bg-white shadow-2xl rounded-2xl p-8 mb-8 w-full max-w-3xl mx-auto min-w-[420px]">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm text-gray-400 font-semibold">Câu {idx + 1}/{items.length}</span>
          <span className="font-bold text-lg text-indigo-800 flex-1">{it.prompt}</span>
        </div>

        {/* Ý kiến chuyên gia vòng trước */}
        {prevComments[it.id]?.length > 0 && (
          <div className="bg-blue-50 border-l-4 border-blue-400 p-3 mb-2 text-sm text-blue-700 rounded">
            <div className="font-semibold mb-1">Ý kiến từ chuyên gia vòng trước:</div>
            <ul className="list-disc ml-5">
              {prevComments[it.id].map((cmt, i) => (<li key={i}>{cmt}</li>))}
            </ul>
          </div>
        )}

        {/* Lựa chọn / thang điểm */}
        <div className="flex gap-4 flex-wrap items-center mb-2">
          {choices.length > 0 ? (
            it.type === 'multi' ? (
              choices.map(c => (
                <label key={c} className="flex items-center gap-2 text-base">
                  <input
                    type="checkbox"
                    checked={Array.isArray(answers[it.id]) && answers[it.id].includes(c)}
                    onChange={() => toggleMulti(it.id, c)}
                    disabled={!isActive}
                  />
                  {c}
                </label>
              ))
            ) : (
              choices.map(c => (
                <label key={c} className="flex items-center gap-2 text-base">
                  <input
                    type="radio"
                    value={c}
                    checked={answers[it.id] === c}
                    onChange={() => handleChange(it.id, c)}
                    disabled={!isActive}
                  />
                  {c}
                </label>
              ))
            )
          ) : (
            <input
              type="number"
              min={it.options_json?.scale_min ?? 1}
              max={it.options_json?.scale_max ?? 9}
              value={answers[it.id] ?? ''}
              onChange={e => handleChange(it.id, Number(e.target.value))}
              disabled={!isActive}
              className="border px-3 py-1 rounded w-24"
            />
          )}
        </div>

        {/* Nhận xét */}
        <div>
          <textarea
            className="w-full border rounded px-3 py-2 mt-1 bg-gray-50"
            rows={2}
            placeholder="Ý kiến khác của bạn về kỹ năng này (nếu có)..."
            value={comments[it.id] || ''}
            onChange={e => handleCommentChange(it.id, e.target.value)}
            disabled={!isActive}
          />
        </div>
      </div>
    );
  };

  const canSubmit = isAllAnswered && !submitted;

  // UI tổng
  if (loading) return <Protected><div>Đang tải biểu mẫu...</div></Protected>;
  if (!round)  return <Protected><div>{message}</div></Protected>;

  return (
    <Protected>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-6 pb-16">
        <h1 className="text-2xl font-bold text-indigo-900 mb-2">
          Khảo sát — Vòng {round.round_number}
        </h1>

        {/* Mô tả khảo sát */}
        {round.description && (
          <div className="w-full max-w-3xl mx-auto mb-6">
            <div className="flex items-start gap-3 bg-blue-50 border-l-4 border-blue-400 shadow rounded-xl px-6 py-4">
              <div className="flex-shrink-0 mt-0.5">
                <svg width="32" height="32" fill="none" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="16" fill="#3B82F6" fillOpacity="0.12"/>
                  <path d="M16 10v5m0 4h.01M16 22a6 6 0 100-12 6 6 0 000 12z" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="font-semibold text-blue-900 mb-1">Hướng dẫn & Thông tin khảo sát</div>
                <div className="text-blue-800 whitespace-pre-line text-base">
                  {round.description}
                </div>
              </div>
            </div>
          </div>
        )}

        {round.status !== 'active' && (
          <p className="text-red-500 mb-2">
            Vòng này hiện {round.status}. Bạn không thể chỉnh sửa.
          </p>
        )}

        {/* Thanh chọn câu hỏi */}
        <div className="flex gap-2 mb-6 flex-wrap justify-center">
          {items.map((it, idx) => (
            <button
              key={it.id}
              className={`rounded-full w-9 h-9 text-base font-bold border-2 ${curIndex === idx ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-indigo-700 border-indigo-200'} shadow-sm transition`}
              onClick={() => goTo(idx)}
              disabled={submitted}
              type="button"
            >
              {idx + 1}
            </button>
          ))}
        </div>

        {/* Câu hiện tại */}
        {items[curIndex] && renderQuestion(items[curIndex], curIndex)}

        {/* Điều hướng nhỏ */}
        <div className="flex justify-between w-full max-w-3xl mb-6">
          <button
            className="px-4 py-1 rounded-lg border text-sm font-medium text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            disabled={curIndex === 0}
            onClick={goBack}
            type="button"
          >
            Quay lại
          </button>
          <button
            className="px-4 py-1 rounded-lg border text-sm font-medium text-indigo-700 border-indigo-200 hover:bg-indigo-50"
            disabled={curIndex === items.length - 1}
            onClick={goNext}
            type="button"
          >
            Tiếp tục
          </button>
        </div>

        {/* Nút lưu / gửi */}
        <div className="flex justify-between items-center gap-4 w-full max-w-3xl mx-auto mb-3">
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-gray-400 text-white rounded-xl font-semibold shadow hover:bg-gray-500 transition w-[180px]"
            disabled={submitted}
            type="button"
          >
            Lưu nháp
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-3 bg-green-700 text-white rounded-xl font-bold shadow hover:bg-green-800 transition w-[180px]"
            disabled={!canSubmit}
            type="button"
          >
            Gửi bản cuối
          </button>
        </div>

        {!isAllAnswered && !submitted && (
          <div className="text-orange-600 mt-2 font-semibold">
            ⚠️ Bạn cần trả lời tất cả các câu hỏi trước khi gửi bản cuối.
          </div>
        )}

        {message && (
          <div className={`mt-4 text-lg font-bold ${submitted ? 'text-green-700' : 'text-indigo-700'}`}>
            {message}
          </div>
        )}
      </div>
    </Protected>
  );
}
