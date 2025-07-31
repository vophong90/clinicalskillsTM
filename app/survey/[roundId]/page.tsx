'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Protected from '@/components/Protected';

type Item = { id: string; prompt: string; options_json: any; order: number | null; project_id: string };
type Round = { id: string; project_id: string; status: 'draft'|'active'|'closed'; round_number: number };

export default function SurveyPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params?.roundId as string;
  const [items, setItems] = useState<Item[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({}); // itemId -> value
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    const load = async () => {
      // Load round
      const { data: r, error: er } = await supabase.from('rounds').select('*').eq('id', roundId).single();
      if (er || !r) { setMessage('Không tìm thấy vòng khảo sát.'); return; }
      setRound(r);
      // Load items of this project
      const { data: its } = await supabase.from('items').select('id,prompt,options_json,order,project_id').eq('project_id', r.project_id).order('order', { ascending: true });
      setItems(its || []);
      // Load existing responses for this round
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (userId) {
        const { data: resps } = await supabase.from('responses').select('item_id, answer_json').eq('round_id', r.id).eq('user_id', userId);
        const map: Record<string, any> = {};
        (resps || []).forEach((row: any) => {
          map[row.item_id] = row.answer_json?.value ?? row.answer_json?.choices ?? row.answer_json;
        });
        setAnswers(map);
      }
      setLoading(false);
    };
    load();
  }, [roundId]);

  const handleChange = (itemId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [itemId]: value }));
  };

  const save = async (submit: boolean) => {
    if (!round) return;
    setMessage('Đang lưu...');
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id!;
    const payload = items.map(it => ({
      round_id: round.id,
      item_id: it.id,
      user_id: userId,
      answer_json: typeof answers[it.id] === 'string' ? { value: answers[it.id] } : answers[it.id],
      is_submitted: submit
    }));
    // Upsert từng bản ghi theo unique (round_id, item_id, user_id)
    const { error } = await supabase.from('responses').upsert(payload, { onConflict: 'round_id,item_id,user_id' });
    setMessage(error ? ('Lỗi lưu: ' + error.message) : (submit ? 'Đã nộp bài.' : 'Đã lưu nháp.'));
    if (!error && submit) router.push('/dashboard');
  };

  if (loading) return <Protected><div>Đang tải biểu mẫu...</div></Protected>;
  if (!round) return <Protected><div>{message}</div></Protected>;

  return (
    <Protected>
      <h1>Khảo sát — Vòng {round.round_number}</h1>
      {round.status !== 'active' && <p style={{ color: 'red' }}>Vòng này hiện {round.status}. Bạn không thể chỉnh sửa.</p>}
      <form onSubmit={(e)=>e.preventDefault()} style={{ display: 'grid', gap: 16 }}>
        {items.map(it => {
          const choices = (it.options_json?.choices as string[]) || [];
          return (
            <div key={it.id} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8 }}>
              <div style={{ marginBottom: 8 }}><strong>{it.prompt}</strong></div>
              <div style={{ display: 'flex', gap: 16 }}>
                {choices.length > 0 ? choices.map(c => (
                  <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name={it.id}
                      value={c}
                      checked={answers[it.id] === c}
                      onChange={() => handleChange(it.id, c)}
                      disabled={round.status !== 'active'}
                    />
                    {c}
                  </label>
                )) : (
                  <input
                    type="number"
                    min={it.options_json?.scale_min ?? 1}
                    max={it.options_json?.scale_max ?? 9}
                    value={answers[it.id] ?? ''}
                    onChange={(e)=>handleChange(it.id, Number(e.target.value))}
                    disabled={round.status !== 'active'}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={()=>save(false)} disabled={round.status !== 'active'}>Lưu nháp</button>
          <button type="button" onClick={()=>save(true)} disabled={round.status !== 'active'}>Nộp bài</button>
        </div>
        {message && <p>{message}</p>}
      </form>
      <pre>{JSON.stringify({ items, round }, null, 2)}</pre>
    </Protected>
  );
}
