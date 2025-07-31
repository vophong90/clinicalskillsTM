'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Protected from '@/components/Protected';
import Link from 'next/link';

type Project = { id: string; title: string; status: string; };
type Round = { id: string; project_id: string; round_number: number; status: string; open_at: string | null; close_at: string | null };

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [name, setName] = useState<string>('');

  useEffect(() => {
  const load = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Không lấy được user:", userError);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name')
      .eq('email', user.email)
      .maybeSingle(); // dùng maybeSingle() để tránh lỗi 406 nếu không có dòng nào

    if (profileError) {
      console.error("Không lấy được profile:", profileError);
    } else {
      setName(profile?.name ?? '');
    }

    const { data: prj } = await supabase.from('projects').select('id,title,status').order('created_at', { ascending: false });
    setProjects(prj || []);

    const { data: rnd } = await supabase.from('rounds').select('id,project_id,round_number,status,open_at,close_at').order('round_number', { ascending: true });
    setRounds(rnd || []);
  };

  load();
}, []);

  return (
    <Protected>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard {name ? ('— ' + name) : ''}</h1>
        <button onClick={() => supabase.auth.signOut().then(()=>location.href='/')}>Đăng xuất</button>
      </div>
      <h2>Dự án</h2>
      <ul>
        {projects.map(p => (
          <li key={p.id}><strong>{p.title}</strong> — {p.status}</li>
        ))}
      </ul>
      <h2>Vòng khảo sát</h2>
      <ul>
        {rounds.map(r => (
          <li key={r.id}>
            Vòng {r.round_number} — {r.status} &nbsp;
            <Link href={`/survey/${r.id}`}>Vào trả lời</Link>
          </li>
        ))}
      </ul>
    </Protected>
  );
}
