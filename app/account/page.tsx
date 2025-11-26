// app/account/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import AccountInfoTab from './AccountInfoTab';
import AccountResourcesTab from './AccountResourcesTab';
import AccountGptTab from './AccountGptTab';

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

type ProfileRole =
  | 'admin'
  | 'core_expert'
  | 'viewer'
  | 'secretary'
  | 'external_expert'
  | string;

type ProfileFormValues = {
  name: string;
  email: string;
  phone: string;
  workplace: string;
  specialty: string;
};

type ActiveTab = 'info' | 'resources' | 'gpt';

export default function AccountPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('info');

  // User & profile
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<ProfileRole | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [specialty, setSpecialty] = useState('');

  // Points & resources
  const [totalPoints, setTotalPoints] = useState<number>(0);
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  // Profile update state
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string>('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace('/login');
        return;
      }

      const u = data.user;
      setUserId(u.id);

      const emailFromAuth = u.email ?? '';

      // lấy profile
      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('email, name, role, phone, workplace, specialty')
        .eq('id', u.id)
        .single();

      if (!profErr && prof) {
        setName(prof.name ?? '');
        setRole(prof.role ?? null);
        setPhone(prof.phone ?? '');
        setWorkplace(prof.workplace ?? '');
        setSpecialty(prof.specialty ?? '');
        setEmail(prof.email ?? emailFromAuth);
      } else {
        setEmail(emailFromAuth);
      }

      // tổng điểm
      let total = 0;
      const { data: pointRow, error: pointErr } = await supabase
        .from('participant_points')
        .select('total_points')
        .eq('profile_id', u.id)
        .single();

      if (!pointErr && pointRow) {
        total = pointRow.total_points ?? 0;
      }
      setTotalPoints(total);

      // lịch sử điểm
      const { data: logRows, error: logErr } = await supabase
        .from('participant_point_logs')
        .select('id, project_id, round_id, points, reason, created_at')
        .eq('profile_id', u.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!logErr && logRows) {
        setLogs(logRows);
      }

      // tài nguyên mở khoá
      const { data: resRows, error: resErr } = await supabase
        .from('reward_resources')
        .select('id, title, required_points, file_url')
        .eq('is_active', true)
        .order('required_points', { ascending: true });

      if (!resErr && resRows) {
        const unlockedByTotal = resRows.filter((r) => total >= r.required_points);
        setResources(unlockedByTotal);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  async function handleSaveProfile(values: ProfileFormValues) {
    if (!userId) return;
    setSavingProfile(true);
    setProfileMsg('');

    try {
      // cập nhật email trong Auth nếu đổi
      const {
        data: { user },
        error: getUserErr,
      } = await supabase.auth.getUser();

      if (!getUserErr && user && values.email && values.email !== user.email) {
        const { error: authErr } = await supabase.auth.updateUser({
          email: values.email,
        });
        if (authErr) {
          console.error(authErr);
          setProfileMsg('Cập nhật email đăng nhập không thành công.');
          // vẫn tiếp tục update profile
        }
      }

      const { error: profErr } = await supabase
        .from('profiles')
        .update({
          email: values.email || null,
          name: values.name || null,
          phone: values.phone || null,
          workplace: values.workplace || null,
          specialty: values.specialty || null,
        })
        .eq('id', userId);

      if (profErr) {
        console.error(profErr);
        setProfileMsg('Cập nhật thông tin hồ sơ không thành công.');
      } else {
        setEmail(values.email);
        setName(values.name);
        setPhone(values.phone);
        setWorkplace(values.workplace);
        setSpecialty(values.specialty);
        setProfileMsg('Đã lưu thông tin tài khoản.');
      }
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <main className="flex-1 p-8 bg-white">
          <p className="text-sm text-gray-600">Đang tải thông tin tài khoản…</p>
        </main>
      </div>
    );
  }

  const profileValues: ProfileFormValues = {
    name,
    email,
    phone,
    workplace,
    specialty,
  };

  return (
    <div className="flex min-h-screen">
      {/* Không có sidebar ở trang account, chỉ main giống admin */}
      <main className="flex-1 p-8 bg-white">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header giống style trang admin: icon + title */}
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-xl">
                👤
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Tài khoản của tôi
                </h1>
                <p className="text-sm text-gray-600">
                  Quản lý thông tin cá nhân, điểm thưởng, tài nguyên và trợ lý GPT
                  nội bộ.
                </p>
              </div>
            </div>
          </header>

          {/* Card tổng điểm – giống 1 section trên admin */}
          <section className="bg-white border rounded-xl shadow-sm p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-gray-700">Tổng điểm thưởng</p>
              <p className="text-2xl font-bold text-blue-700">
                {totalPoints} điểm
              </p>
            </div>
            <p className="text-xs text-gray-500 max-w-xs">
              Bạn được cộng <strong>+20 điểm</strong> cho mỗi khảo sát hoàn thành
              (is_submitted).
            </p>
          </section>

          {profileMsg && (
            <p className="text-sm text-emerald-700" role="status">
              {profileMsg}
            </p>
          )}

          {/* Card chính chứa Tabs + nội dung */}
          <div className="bg-white border rounded-xl shadow-sm">
            {/* Tabs header giống kiểu admin section header */}
            <div className="border-b border-gray-200 px-4 pt-3">
              <nav className="-mb-px flex gap-4 text-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab('info')}
                  className={
                    'px-3 py-2 border-b-2 ' +
                    (activeTab === 'info'
                      ? 'border-blue-600 text-blue-700 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800')
                  }
                >
                  Thông tin chung
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('resources')}
                  className={
                    'px-3 py-2 border-b-2 ' +
                    (activeTab === 'resources'
                      ? 'border-blue-600 text-blue-700 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800')
                  }
                >
                  Tài nguyên
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('gpt')}
                  className={
                    'px-3 py-2 border-b-2 ' +
                    (activeTab === 'gpt'
                      ? 'border-blue-600 text-blue-700 font-semibold'
                      : 'border-transparent text-gray-600 hover:text-gray-800')
                  }
                >
                  Trợ lý GPT
                </button>
              </nav>
            </div>

            {/* Nội dung từng tab – padding giống các khối admin */}
            <div className="p-4">
              {activeTab === 'info' && (
                <AccountInfoTab
                  initialValues={profileValues}
                  role={role}
                  saving={savingProfile}
                  onSave={handleSaveProfile}
                />
              )}

              {activeTab === 'resources' && (
                <AccountResourcesTab
                  totalPoints={totalPoints}
                  resources={resources}
                  logs={logs}
                />
              )}

              {activeTab === 'gpt' && <AccountGptTab role={role} />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
