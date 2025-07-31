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

  // 1️⃣ Load round, items, prevComments, answers
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMessage('');

      // Get round info
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

      // Get items
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

      // Get userId
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      // Lấy responses của user này (draft/submit)
      let resps: any[] = [];
      if (userId) {
        const { data } = await supabase
          .from('responses')
          .select('item_id, answer_json')
          .eq('round_id', r.id)
          .eq('user_id', userId);
        resps = data || [];
      }

      // Khởi tạo state answer/comment
      const map: Record<string, any> = {};
      const cmtMap: Record<string, string> = {};
      resps.forEach((row: any) => {
        map[row.item_id] = row.answer_json?.value ?? row.answer_json?.choices ?? row.answer_json;
        if (row.answer_json?.comment) cmtMap[row.item_id] = row.answer_json.comment;
      });
      setAnswers(map);
      setComments(cmtMap);

      // --- Lấy nhận xét từ vòng trước nếu có ---
      if (r.round_number > 1 && userId) {
        // Tìm round trước cùng project
        const { data: prevR } = await supabase
          .from('rounds')
          .select('id')
          .eq('project_id', r.project_id)
          .eq('round_number', r.round_number - 1)
          .maybeSingle();

        if (prevR?.id) {
          // Lấy response khác userId ở prevRound, chỉ lấy comment
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

  // 2️⃣ Handle thay đổi câu trả lời
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

  // 3️⃣ Validate đã trả lời hết
  const isAllAnswered = items.every(
    it => answers[it.id] !== undefined && answers[it.id] !== null && (Array.isArray(answers[it.id]) ? answers[it.id].length > 0 : answers[it.id] !== "")
  );

  // 4️⃣ Lưu/submit
  const save = async (submit: boolean) => {
    if (!round) return;
    setMessage('Đang lưu...');
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id!;
    const payload = items.map(it => {
      let answer_json: any = {};
      // Main answer
      if (Array.isArray(answers[it.id])) answer_json.choices = answers[it.id];
      else if (typeof answers[it.id] === 'number' || typeof answers[it.id] === 'string') answer_json.value = answers[it.id];
      // Comment/remark
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

  // 5️⃣ Điều hướng câu hỏi
  const goTo = (idx: number) => setCurIndex(idx);

  // 6️⃣ Giao diện từng câu hỏi
  const renderQuestion = (it: Item, idx: number) => {
    const choices = it.options_json?.choices ?? [];
    const isActive = round?.status === 'active' && !submitted;
    return (
      <div key={it.id} className="bg-white rounded-2xl shadow-md p-6 flex flex-col gap-3 mb-2">
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

  // 7️⃣ Nếu đã submit, disable hết, show thông báo
  if (loading) return <Protected><div>Đang tải biểu mẫu...</div></Protected>;
  if (!round) return <Protected><div>{message}</div></Protected>;

  // 8️⃣ Trang giao diện
  return (
    <Protected>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-6 pb-16">
        <h1 className="text-2xl font-bold text-indigo-900 mb-2">
          Khảo sát — Vòng {round.round_number}
        </h1>
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
        {/* Nút điều hướng */}
        <div className="flex gap-4 justify-center my-5">
          <button
            onClick={() => goTo(curIndex - 1)}
            className="px-4 py-2 rounded bg-gray-200 text-gray-700 font-semibold"
            disabled={curIndex === 0}
            type="button"
          >Quay lại</button>
          <button
            onClick={() => goTo(curIndex + 1)}
            className="px-4 py-2 rounded bg-indigo-600 text-white font-semibold"
            disabled={curIndex === items.length - 1}
            type="button"
          >Tiếp tục</button>
        </div>
        {/* Nút gửi bài */}
        <div className="flex flex-col gap-2 items-center">
          <button
            onClick={() => save(true)}
            disabled={!isAllAnswered || round.status !== 'active' || submitted}
            className="bg-green-700 hover:bg-green-800 text-white px-8 py-2 rounded-lg font-bold shadow disabled:opacity-60"
            type="button"
          >
            Gửi bản cuối
          </button>
          <button
            onClick={() => save(false)}
            disabled={round.status !== 'active' || submitted}
            className="bg-gray-400 hover:bg-gray-500 text-white px-8 py-2 rounded-lg font-semibold shadow disabled:opacity-60"
            type="button"
          >
            Lưu nháp
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
