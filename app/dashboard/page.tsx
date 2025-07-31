'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Protected from '@/components/Protected';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Project = {
  id: string;
  title: string;
  status: string;
};

type Round = {
  id: string;
  project_id: string;
  round_number: number;
  status: string;
  open_at: string | null;
  close_at: string | null;
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
  setLoading(true);

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    setError('❌ Không xác định được người dùng. Vui lòng đăng nhập lại.');
    setLoading(false);
    return;
  }

  // Lấy profile.name
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Lỗi khi lấy profile:', profileError);
    setError('❌ Không thể tải thông tin người dùng.');
  } else if (profile) {
    setName(profile.name);
  }

  // Lấy các project thuộc user
  const { data: prjs, error: prjErr } = await supabase
    .from('projects')
    .select('id,title,status')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false });

  if (prjErr) {
    console.error('Lỗi lấy projects:', prjErr);
    setProjects([]);
    setRounds([]);
    setLoading(false);
    return;
  }

  setProjects(prjs || []);

  // Lấy các rounds thuộc các project vừa tìm
  const { data: rnds, error: rndErr } = await supabase
    .from('rounds')
    .select('id,project_id,round_number,status,open_at,close_at')
    .in('project_id', (prjs || []).map(p => p.id));

  if (rndErr) console.error('Lỗi lấy rounds:', rndErr);
  setRounds(rnds || []);
  setLoading(false);
};
  loadData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) return <div>🔄 Đang tải dữ liệu...</div>;
  if (error) return <div>{error}</div>;

  return (
    <Protected>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard {name ? `— ${name}` : ''}</h1>
        <button onClick={handleLogout}>Đăng xuất</button>
      </div>

      <h2>Dự án</h2>
      {projects.length > 0 ? (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <strong>{p.title}</strong> — {p.status}
            </li>
          ))}
        </ul>
      ) : (
        <p>Chưa có dự án nào.</p>
      )}

      <h2>Vòng khảo sát</h2>
      {rounds.length > 0 ? (
        <ul>
          {rounds.map((r) => (
            <li key={r.id}>
              Vòng {r.round_number} — {r.status} &nbsp;
              <Link href={`/survey/${r.id}`}>Vào trả lời</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Chưa có vòng khảo sát nào.</p>
      )}
    </Protected>
  );
}
