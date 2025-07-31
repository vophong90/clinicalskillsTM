'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function Protected({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/');
      } else {
        setLoading(false);
      }
    };
    check();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/');
    });
    return () => { authListener.subscription.unsubscribe(); };
  }, [router]);

  if (loading) return <div className="p-6">Đang kiểm tra phiên đăng nhập...</div>;
  return <>{children}</>;
}