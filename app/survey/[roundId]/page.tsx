'use client';
import { useEffect, useState } from 'react';
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

      // 1. Lấy round
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

      // 2. Lấy items
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
      setItems(its ?? []);

      // 3. Lấy userId
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      // 4. Lấy responses của user này
      let resps: any[] = [];
      if (userId) {
        const { data } = await supabase
          .from('responses')
          .select('item_id, answer_json, is_submitted')
          .eq('round_id', r.id)
          .eq('user_id', userId);
        resps = data || [];
      }

      // 5. Khởi tạo answer/comment state
      const map: Record<string, any> = {};
      const cmtMap: Record<string, string> = {};
      let wasSubmitted = false;
      resps.forEach((row: any) => {
        map[row.item_id] = row.answer_json?.value ?? row.answer_json?.choices ?? row.answer_json;
        if (row.answer_json?.comment) cmtMap[row.item_id] = row.answer_json.comment;
        if (row.is_submitted) wasSubmitted = true;
      });
      setAnswers(map);
      setComments(cmtMap);
      setSubmitted(wasSubmitted);

      // 6. Lấy nhận xét vòng trước
      if (r.round_number > 1 && userId) {
        const { data: prevR } = await supabase
          .from('rounds')
          .select('id')
          .eq('project_id', r.project_id)
          .eq('round_number', r.round_number - 1)
          .maybeSingle();

        if (prevR?.id) {
          const { data: prevRs } = await supabase
            .from('responses')
            .select('item_id, user_id, answer_json')
            .eq('round_id', prevR.id);

          const prevMap: Record<string, string[]> = {};
          prevRs?.forEach((resp: any) => {
            if (resp.user_id !== userId && resp.answer_json?.comment) {
              if (!prevMap[resp.item_id]) prevMap[resp.item_id] = [];
              prevMap[resp.item_id].push(resp.answer_json.comment);
            }
          });
          setPrevComments(prevMap);
        }
      }
      setLoading(false);
    };
    load();
  }, [roundId]);

  // Thay đổi câu trả lời
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

  // Validate đã trả lời hết
  const isAllAnswered = items.every(
    it => answers[it.id] !== undefined && answers[it.id] !== null && (Array.isArray(answers[it.id]) ? answers[it.id].length > 0 : answers[it.id] !== "")
  );

  // Lưu/submit
  const handleSave = async () => save(false);
  const handleSubmit = async () => {
    if (!isAllAnswered) return;
    await save(true);
  };
  const save = async (submit: boolean) => {
    if (!round) return;
    setMessage('Đang lưu...');
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id!;
    const payload = items.map(it => {
      let answer_json: any = {};
      if (Array.isArray(answers[it.id])) answer_json.choices = answers[it.id];
      else if (typeof answers[it.id] === 'number' || typeof answers[it.id] === 'string') answer_json.value = answers[it.id];
      if (comments[it.id]) answer_json.comment = comments[it.id];
      return {
        round_id: round.id,
        item_id: it.id,
        user_id: userId,
        answer_json,
        is_submitted: submit,
      };
    });
    const { error } = await supabase
      .from('responses')
      .upsert(payload, { onConflict: 'round_id,item_id,user_id' });
    setMessage(error ? ('Lỗi lưu: ' + error.message) : (submit ? 'Đã gửi thành công.' : 'Đã lưu nháp.'));
    if (!error && submit) {
      setSubmitted(true);
      setTimeout(() => router.push('/dashboard'), 1500);
    }
  };

  // Điều hướng
  const goTo = (idx: number) => setCurIndex(idx);
  const goBack = () => setCurIndex(idx => Math.max(0, idx - 1));
  const goNext = () => setCurIndex(idx => Math.min(items.length - 1, idx + 1));

  // Giao diện từng câu hỏi
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
              {prevComments[it.id].map((cmt, idx) => (
                <li key={idx}>{cmt}</li>
              ))}
            </ul>
          </div>
        )}
        {/* Các lựa chọn */}
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

  // Xác định đã trả lời hết?
  const canSubmit = isAllAnswered && !submitted;

  // Giao diện tổng
  if (loading) return <Protected><div>Đang tải biểu mẫu...</div></Protected>;
  if (!round) return <Protected><div>{message}</div></Protected>;

  return (
    <Protected>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-6 pb-16">
        <h1 className="text-2xl font-bold text-indigo-900 mb-2">
          Khảo sát — Vòng {round.round_number}
        </h1>
        {/* Block mô tả khảo sát */}
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
        {/* Hiện từng câu hỏi */}
        {items[curIndex] && renderQuestion(items[curIndex], curIndex)}
        {/* Nút điều hướng nhỏ */}
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
        {/* Nút gửi bài và lưu nháp lớn, cùng hàng */}
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
