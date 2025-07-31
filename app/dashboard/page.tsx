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

function translateRole(roleId) {
  switch (roleId) {
    case "admin": return "Quản trị viên";
    case "secretary": return "Thư ký hội đồng";
    case "viewer": return "Quan sát viên";
    case "core_expert": return "Chuyên gia nòng cốt";
    case "external_expert": return "Chuyên gia bên ngoài";
    default: return roleId;
  }
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

useEffect(() => {
  const loadData = async () => {
    console.log("🚀 loadData started");
    setLoading(true);
    setError(null);

    // 1️⃣ Lấy user từ Supabase Auth
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log("🔹 [AUTH USER]", user, userError);

    if (userError || !user) {
      setError('❌ Không xác định được người dùng.');
      setLoading(false);
      return;
    }

    // 2️⃣ Lấy profile từ bảng profiles bằng ID (nên ưu tiên lấy bằng id)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('id', user.id)
      .maybeSingle();
    console.log("🔹 [PROFILE]", profile, profileError);

    if (!profile) {
      setError('❌ Không tìm thấy profile cho user hiện tại.');
      setLoading(false);
      return;
    }

    setName(profile.name);

    // 3️⃣ Lấy permissions dựa trên profile.id
    const { data: permissionsData, error: permissionsError } = await supabase
      .from('permissions')
      .select('role, project_id')
      .eq('user_id', profile.id);
    console.log("🔹 [PERMISSIONS]", permissionsData, permissionsError);

    if (!permissionsData || permissionsData.length === 0) {
      console.warn("⚠️ User không có quyền truy cập project nào.");
      setProjects([]);
      setRounds([]);
      setLoading(false);
      return;
    }

    const projectIds = permissionsData.map(p => p.project_id);
    console.log("🔹 [PROJECT IDS]", projectIds);

    // 4️⃣ Lấy projects theo danh sách ID
    const { data: projectsData, error: prjErr } = await supabase
      .from('projects')
      .select('id, title, status')
      .in('id', projectIds);
    console.log("🔹 [PROJECTS DATA]", projectsData, prjErr);

    const validProjects = (projectsData || []).map(proj => {
      const matched = permissionsData.find(p => p.project_id === proj.id);
      return { ...proj, role: matched?.role || '' };
    });

    setProjects(validProjects);

    // 5️⃣ Lấy rounds
    const { data: rnds, error: rndErr } = await supabase
      .from('rounds')
      .select('id, project_id, round_number, status, open_at, close_at')
      .in('project_id', projectIds);
    console.log("🔹 [ROUNDS DATA]", rnds, rndErr);

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
  <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12">
    {/* Tên người dùng */}
    <div className="text-3xl font-bold text-indigo-900 mb-1">{name}</div>

    {/* Vai trò */}
    <div className="flex items-center gap-2 mb-8">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-100 text-indigo-700 font-semibold shadow-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
        </svg>
        {translateRole(role)}
      </span>
    </div>

    <div className="w-full max-w-xl space-y-8">
      {projects.map(project => (
        <div
          key={project.id}
          className="bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xl font-extrabold text-indigo-800">{project.title}</span>
            {project.status === "active" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50 text-green-700 font-semibold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                </svg>
                Đang hoạt động
              </span>
            )}
          </div>

          <div>
            <div className="text-sm text-gray-500 mb-2">Các vòng khảo sát</div>
            {project.rounds.map(round => (
              <div
                key={round.id}
                className="flex items-center justify-between bg-gray-50 rounded-lg p-3 mb-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">Vòng {round.round_number}</span>
                  {round.status === "active" && (
                    <span className="inline-flex items-center gap-1 text-green-700 ml-1 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>
                      Đang hoạt động
                    </span>
                  )}
                </div>
                <a
                  href={`/survey/${round.id}`}
                  className="px-4 py-1 bg-green-700 hover:bg-green-800 text-white rounded-lg font-semibold shadow transition"
                >
                  Vào trả lời
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);
}
