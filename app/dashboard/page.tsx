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
  role?: string; // thêm role
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
      setError(null);

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError('❌ Không xác định được người dùng. Vui lòng đăng nhập lại.');
        setLoading(false);
        return;
      }

      // 🔍 Lấy tên từ bảng profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('Lỗi lấy profile:', profileError);
      } else if (profile) {
        setName(profile.name);
      }

      // 🔍 Lấy các project từ bảng permissions
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('permissions')
        .select('role, project:projects(id, title, status)')
        .eq('user_id', user.id);

      if (permissionsError) {
        console.error('Lỗi khi lấy permissions:', permissionsError);
        setProjects([]);
        setRounds([]);
        setLoading(false);
        return;
      }

      const validProjects = (permissionsData || [])
        .filter(p => p.project !== null)
        .map(p => ({
          ...p.project,
          role: p.role
        }));

      setProjects(validProjects);

      // 🔍 Lấy rounds từ các project có quyền
      const allowedProjectIds = validProjects.map(p => p.id);
      const { data: rnds, error: rndErr } = await supabase
        .from('rounds')
        .select('id, project_id, round_number, status, open_at, close_at')
        .in('project_id', allowedProjectIds);

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
              <strong>{p.title}</strong> — {p.status} &nbsp;
              <span style={{ fontStyle: 'italic', color: 'gray' }}>({p.role})</span>
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
