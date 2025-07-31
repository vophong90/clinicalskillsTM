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
<div className="max-w-3xl mx-auto px-2 py-6">
  <div className="flex justify-between items-center mb-6">
    <h1 className="text-3xl font-bold text-indigo-900">
      Dashboard {name ? <span className="text-lg text-gray-400">— {name}</span> : null}
    </h1>
    <button
      onClick={handleLogout}
      className="bg-gray-200 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded px-3 py-1 text-sm font-medium shadow"
    >
      Đăng xuất
    </button>
  </div>

  <h2 className="text-xl font-semibold text-indigo-700 mb-3">Dự án của bạn</h2>
  {projects.length > 0 ? (
    <div className="grid grid-cols-1 gap-6">
      {projects.map((p) => (
        <div
          key={p.id}
          className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition p-6 border border-gray-100 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-lg font-bold text-indigo-800">{p.title}</span>
              <span
                className={`ml-2 px-2 py-1 rounded text-xs font-semibold
                  ${p.status === "active"
                    ? "bg-green-100 text-green-700"
                    : p.status === "completed"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-400"}`}
              >
                {p.status}
              </span>
            </div>
            <span className="inline-block px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-semibold">
              {p.role}
            </span>
          </div>
          <div className="mt-2">
            <div className="text-sm text-gray-500 font-semibold mb-1">
              Các vòng khảo sát
            </div>
            <ul className="space-y-1">
              {rounds.filter((r) => r.project_id === p.id).length > 0 ? (
                rounds
                  .filter((r) => r.project_id === p.id)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between px-3 py-1 bg-gray-50 rounded group hover:bg-indigo-50"
                    >
                      <span>
                        <span className="font-medium">Vòng {r.round_number}</span>
                        {" – "}
                        <span
                          className={`font-semibold ${
                            r.status === "active"
                              ? "text-green-600"
                              : r.status === "closed"
                              ? "text-gray-400"
                              : "text-yellow-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </span>
                      <Link
                        href={`/survey/${r.id}`}
                        className="ml-4 text-blue-700 hover:underline text-sm font-medium"
                      >
                        Vào trả lời
                      </Link>
                    </li>
                  ))
              ) : (
                <li className="text-gray-400 italic">
                  Chưa có vòng khảo sát nào.
                </li>
              )}
            </ul>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="text-gray-400 italic mt-4">
      Bạn chưa được phân quyền ở dự án nào.
    </div>
  )}
</div>
);
}
