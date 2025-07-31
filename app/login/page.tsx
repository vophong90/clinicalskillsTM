'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';

  const onSubmit = async (e: any) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    router.push(next);
  };

  return (
    <form onSubmit={onSubmit} style={{ display:'grid', gap:12, maxWidth:360, margin:'48px auto' }}>
      <h2>Đăng nhập</h2>
      <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
      <input placeholder="Mật khẩu" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <button type="submit">Đăng nhập</button>
      {msg && <p style={{ color:'crimson' }}>{msg}</p>}
    </form>
  );
}
