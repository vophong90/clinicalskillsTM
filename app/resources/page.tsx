'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Resource = {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  required_points: number;
  is_active: boolean;
  created_at: string;
};

const BADGE =
  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold';

export default function ResourcesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [resources, setResources] = useState<Resource[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace('/login');
        return;
      }

      const userId = data.user.id;

      // Lấy tổng điểm
      const { data: pointRow, error: pointErr } = await supabase
        .from('participant_points')
        .select('total_points')
        .eq('profile_id', userId)
        .single();

      if (pointErr && pointErr.code !== 'PGRST116') {
        // PGRST116: no row found (chưa có điểm)
        console.error(pointErr);
        setMsg('Không lấy được điểm thưởng hiện tại.');
      }
      setTotalPoints(pointRow?.total_points ?? 0);

      // Lấy danh sách tài nguyên
      const { data: resRows, error: resErr } = await supabase
        .from('reward_resources')
        .select('id, title, description, file_url, required_points, is_active, created_at')
        .eq('is_active', true)
        .order('required_points', { ascending: true })
        .order('created_at', { ascending: false });

      if (resErr) {
        console.error(resErr);
        setMsg('Không tải được danh sách tài nguyên.');
      } else {
        setResources(resRows || []);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) return <p>Đang tải dữ liệu…</p>;

  return (
    <div className="space-y-6">
      <header className="border-b pb-3 mb-2">
        <h1 className="text-2xl font-bold">Tài nguyên thưởng</h1>
        <p className="text-sm text-gray-600">
          Đây là kho tài nguyên (PDF, slide, tài liệu chuyên môn) dành tặng cho người tham gia khảo sát.
        </p>
      </header>

      <section className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-700">Điểm thưởng hiện tại của bạn</p>
          <p className="text-2xl font-bold text-blue-700">{totalPoints} điểm</p>
        </div>
        <span className={BADGE + ' bg-blue-100 text-blue-800'}>
          +20 điểm cho mỗi khảo sát hoàn thành
        </span>
      </section>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Danh sách tài nguyên</h2>

        {resources.length === 0 ? (
          <p className="text-sm text-gray-600">Hiện chưa có tài nguyên nào được công bố.</p>
        ) : (
          <ul className="space-y-3">
            {resources.map((r) => {
              const unlocked = totalPoints >= r.required_points;
              return (
                <li
                  key={r.id}
                  className={
                    'border rounded-xl p-3 flex flex-col gap-2 ' +
                    (unlocked ? 'bg-white' : 'bg-gray-50 opacity-80')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.title}</p>
                      {r.description && (
                        <p className="text-sm text-gray-600 mt-0.5">{r.description}</p>
                      )}
                    </div>
                    <span
                      className={
                        BADGE +
                        ' ' +
                        (unlocked
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-200 text-gray-700')
                      }
                    >
                      ≥ {r.required_points} điểm
                    </span>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500">
                      Trạng thái:{' '}
                      {unlocked ? (
                        <span className="text-green-700 font-medium">Đã mở khoá</span>
                      ) : (
                        <span className="text-gray-700">
                          Chưa đủ điểm (cần thêm {r.required_points - totalPoints} điểm)
                        </span>
                      )}
                    </p>

                    {unlocked ? (
                      <a
                        href={r.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 underline"
                      >
                        Tải / xem tài nguyên
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Hoàn thành thêm khảo sát để mở khoá
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
