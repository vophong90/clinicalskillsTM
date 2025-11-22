'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type PointLog = {
  id: string;
  project_id: string | null;
  round_id: string | null;
  points: number;
  reason: string;
  created_at: string;
};

type Resource = {
  id: string;
  title: string;
  required_points: number;
  file_url: string;
};

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);

  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [logs, setLogs] = useState<PointLog[]>([]);
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
      setEmail(data.user.email ?? null);

      // lấy name & role (nếu cần)
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', userId)
        .single();

      if (!profErr && prof) {
        setName(prof.name);
      }

      // tổng điểm
      const { data: pointRow, error: pointErr } = await supabase
        .from('participant_points')
        .select('total_points')
        .eq('profile_id', userId)
        .single();

      if (pointErr && pointErr.code !== 'PGRST116') {
        console.error(pointErr);
        setMsg('Không lấy được điểm thưởng.');
      }
      const total = pointRow?.total_points ?? 0;
      setTotalPoints(total);

      // lịch sử điểm (giới hạn 100 dòng gần nhất)
      const { data: logRows, error: logErr } = await supabase
        .from('participant_point_logs')
        .select('id, project_id, round_id, points, reason, created_at')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (logErr) {
        console.error(logErr);
      } else {
        setLogs(logRows || []);
      }

      // danh sách tài nguyên đã đủ điểm mở khoá
      const { data: resRows, error: resErr } = await supabase
        .from('reward_resources')
        .select('id, title, required_points, file_url')
        .eq('is_active', true)
        .order('required_points', { ascending: true });

      if (resErr) {
        console.error(resErr);
      } else {
        const unlocked = (resRows || []).filter(
          (r) => total >= r.required_points
        );
        setResources(unlocked);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  if (loading) return <p>Đang tải thông tin tài khoản…</p>;

  return (
    <div className="space-y-6">
      <header className="border-b pb-3 mb-2">
        <h1 className="text-2xl font-bold">Tài khoản của tôi</h1>
        <p className="text-sm text-gray-600">
          Thông tin tài khoản, điểm thưởng và lịch sử tham gia khảo sát.
        </p>
      </header>

      <section className="bg-white border rounded-xl p-4 space-y-1">
        <h2 className="text-lg font-semibold mb-1">Thông tin cơ bản</h2>
        <p className="text-sm">
          <span className="font-medium">Họ tên: </span>
          {name || '(chưa cập nhật)'}
        </p>
        <p className="text-sm">
          <span className="font-medium">Email: </span>
          {email}
        </p>
      </section>

      <section className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-700">Tổng điểm thưởng</p>
          <p className="text-2xl font-bold text-blue-700">{totalPoints} điểm</p>
        </div>
        <p className="text-xs text-gray-600 max-w-xs">
          Bạn được cộng <strong>+20 điểm</strong> cho mỗi khảo sát hoàn thành (is_submitted).
        </p>
      </section>

      {msg && <p className="text-sm text-red-600">{msg}</p>}

      <section className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="text-lg font-semibold">Tài nguyên đã mở khoá</h2>
        {resources.length === 0 ? (
          <p className="text-sm text-gray-600">
            Bạn chưa đủ điểm để mở khoá bất kỳ tài nguyên nào. Hoàn thành thêm khảo sát để tích điểm nhé.
          </p>
        ) : (
          <ul className="space-y-2">
            {resources.map((r) => (
              <li
                key={r.id}
                className="border rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-xs text-gray-500">
                    Yêu cầu ≥ {r.required_points} điểm &nbsp;•&nbsp; Bạn đã đạt {totalPoints} điểm
                  </p>
                </div>
                <a
                  href={r.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 underline"
                >
                  Tải / xem
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white border rounded-xl p-4 space-y-2">
        <h2 className="text-lg font-semibold">Lịch sử điểm thưởng (gần đây)</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-gray-600">Chưa có lịch sử điểm.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-2 py-1">Thời gian</th>
                  <th className="text-left px-2 py-1">Điểm</th>
                  <th className="text-left px-2 py-1">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-2 py-1">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-2 py-1">
                      <span
                        className={
                          'font-semibold ' +
                          (log.points >= 0 ? 'text-green-700' : 'text-red-700')
                        }
                      >
                        {log.points >= 0 ? `+${log.points}` : log.points}
                      </span>
                    </td>
                    <td className="px-2 py-1">{log.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
