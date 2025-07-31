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

type ItemType = 'single' | 'multi' | 'scale' | 'text'; // tuỳ bạn dùng

type Item = {
  id: string;
  prompt: string;
  options_json: ItemOptions;
  order: number;            // FE thống nhất dùng 'order'
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
  const [answers, setAnswers] = useState<Record<string, any>>({}); // itemId -> value | string[]
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // 1) Load round
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

      // 2) Load items (alias item_order -> order) + responses
      const { data: its, error: itErr } = await supabase
        .from('items')
        // Nếu DB của bạn dùng items_order (số nhiều), đổi thành 'order:items_order' + .order('items_order', ...)
        .select('id,prompt,options_json,type,order:item_order,project_id,round_id')
        .eq('project_id', r.project_id)
        .eq('round_id', r.id) // để chắc chắn đúng vòng
        .order('item_order', { ascending: true });

      if (itErr) {
        setMessage('Lỗi tải câu hỏi: ' + itErr.message);
        setLoading(false);
        return;
      }

      setItems((its ?? []) as Item[]);

      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      let resps: any[] = [];
      if (userId) {
        const { data } = await supabase
          .from('responses')
          .select('item_id, answer_json')
          .eq('round_id', r.id)
          .eq('user_id', userId);
        resps = data || [];
      }

      const map: Record<string, any> = {};
      resps.forEach((row: any) => {
        // nếu multi: answer_json.choices là string[]
        // nếu single/scale: answer_json.value là string|number
        map[row.item_id] = row.answer_json?.value ?? row.answer_json?.choices ?? row.answer_json;
      });
      setAnswers(map);

      setLoading(false);
    };

    load();
  }, [roundId]);

  const handleChange = (itemId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [itemId]: value }));
  };

  // Toggle cho câu hỏi multi (checkbox)
  const toggleMulti = (itemId: string, choice: string) => {
    setAnswers(prev => {
      const cur = Array.isArray(prev[itemId]) ? (prev[itemId] as string[]) : [];
      const exists = cur.includes(choice);
      const next = exists ? cur.filter(c => c !== choice) : [...cur, choice];
      return { ...prev, [itemId]: next };
    });
  };

  const save = async (submit: boolean) => {
    if (!round) return;
    setMessage('Đang lưu...');

    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id!;
    const payload = items.map(it => {
      const val = answers[it.id];
      let answer_json: any;

      if (Array.isArray(val)) {
        // multi
        answer_json = { choices: val };
      } else if (typeof val === 'number' || typeof val === 'string') {
        // single/scale
        answer_json = { value: val };
      } else {
        answer_json = val; // fallback
      }

      return {
        round_id: round.id,
        item_id: it.id,
        user_id: userId,
        answer_json,
        is_submitted: submit,
      };
    });

    // Upsert theo unique (round_id, item_id, user_id)
    const { error } = await supabase
      .from('responses')
      .upsert(payload, { onConflict: 'round_id,item_id,user_id' });

    setMessage(error ? ('Lỗi lưu: ' + error.message) : (submit ? 'Đã nộp bài.' : 'Đã lưu nháp.'));
    if (!error && submit) router.push('/dashboard');
  };

  if (loading) return <Protected><div>Đang tải biểu mẫu...</div></Protected>;
  if (!round) return <Protected><div>{message}</div></Protected>;

  return (
    <Protected>
      <h1>Khảo sát — Vòng {round.round_number}</h1>
      {round.status !== 'active' && (
        <p style={{ color: 'red' }}>
          Vòng này hiện {round.status}. Bạn không thể chỉnh sửa.
        </p>
      )}

      <form onSubmit={(e) => e.preventDefault()} style={{ display: 'grid', gap: 16 }}>
        {items.map(it => {
          const choices = it.options_json?.choices ?? [];
          const isActive = round.status === 'active';

          return (
            <div key={it.id} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ marginBottom: 8 }}><strong>{it.prompt}</strong></div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {choices.length > 0 ? (
                  it.type === 'multi' ? (
                    // MULTI → checkbox
                    choices.map(c => {
                      const selected = Array.isArray(answers[it.id]) && (answers[it.id] as string[]).includes(c);
                      return (
                        <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            name={`${it.id}-${c}`}
                            checked={!!selected}
                            onChange={() => toggleMulti(it.id, c)}
                            disabled={!isActive}
                          />
                          {c}
                        </label>
                      );
                    })
                  ) : (
                    // SINGLE → radio
                    choices.map(c => (
                      <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="radio"
                          name={it.id}
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
                  // SCALE (không có choices) → input number
                  <input
                    type="number"
                    min={it.options_json?.scale_min ?? 1}
                    max={it.options_json?.scale_max ?? 9}
                    value={answers[it.id] ?? ''}
                    onChange={(e) => handleChange(it.id, Number(e.target.value))}
                    disabled={!isActive}
                  />
                )}
              </div>
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => save(false)} disabled={round.status !== 'active'}>Lưu nháp</button>
          <button type="button" onClick={() => save(true)} disabled={round.status !== 'active'}>Nộp bài</button>
        </div>

        {message && <p>{message}</p>}
      </form>

      <pre>{JSON.stringify({ items, round }, null, 2)}</pre>
    </Protected>
  );
}
