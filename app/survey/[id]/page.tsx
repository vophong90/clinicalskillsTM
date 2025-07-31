'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Item = {
  id: string;
  round_id: string;
  content: string;
  type?: string; // nếu có
};

export default function SurveyPage() {
  const { id } = useParams(); // id là round_id
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadItems = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('round_id', id)
        .order('id');

      if (error) {
        setError('❌ Lỗi khi tải câu hỏi.');
        console.error('Lỗi Supabase:', error);
      } else {
        setItems(data || []);
      }

      setLoading(false);
    };

    loadItems();
  }, [id]);

  if (loading) return <p>🔄 Đang tải câu hỏi...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div>
      <h1>📋 Khảo sát — Vòng {id}</h1>
      {items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={item.id}>
              <strong>Câu {index + 1}:</strong> {item.content}
            </li>
          ))}
        </ul>
      ) : (
        <p>⚠️ Không có câu hỏi nào trong vòng khảo sát này.</p>
      )}
    </div>
  );
}
