'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Type khai báo đầy đủ
type Round = {
  id: string;
  project_id: string;
  round_number: number;
  status: string;
  open_at: string | null;
  close_at: string | null;
};

type Project = {
  id: string;
  title: string;
  status: string;
  role?: string;
  rounds: Round[];
};

function translateRole(roleId: string) {
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
  const [name, setName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // Lấy user từ Supabase Auth
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('❌ Không xác định được người dùng.');
        setLoading(false);
        return;
      }

      // Lấy profile theo id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, app_role')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile) {
        setError('❌ Không tìm thấy profile cho user hiện tại.');
        setLoading(false);
        return;
      }

      setName(profile.name);
      setIsAdmin(profile.app_role === 'admin');

      // Lấy quyền
      const { data: permissionsData } = await supabase
        .from('permissions')
        .select('role, project_id')
        .eq('user_id', profile.id);

      if (!permissionsData || permissionsData.length === 0) {
        setProjects([]);
        setLoading(false);
        return;
      }
      const projectIds = permissionsData.map(p => p.project_id);

      // Lấy projects
      const { data: projectsData } = await supabase
        .from('projects')
        .select('id, title, status')
        .in('id', projectIds);

      // Lấy rounds
      const { data: roundsData } = await supabase
        .from('rounds')
        .select('id, project_id, round_number, status, open_at, close_at')
        .in('project_id', projectIds);

      // Map projects với rounds và role
      const finalProjects: Project[] = (projectsData || []).map(proj => {
        const matched = permissionsData.find(p => p.project_id === proj.id);
        const rounds = (roundsData || []).filter(r => r.project_id === proj.id);
        return { ...proj, role: matched?.role || '', rounds };
      });

      setProjects(finalProjects);
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
      <div className="text-3xl font-bold text-indigo-900 mb-2">{name}</div>
      {/* Nút quản trị chỉ hiện nếu là admin */}
      {isAdmin && (
        <Link
          href="/admin"
          className="inline-block mb-3 px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold shadow hover:bg-blue-200 transition"
        >
          🔧 Vào trang quản trị
        </Link>
      )}
      <button onClick={handleLogout} className="absolute top-6 right-6 px-4 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 text-sm font-semibold">
        Đăng xuất
      </button>
      <div className="w-full max-w-2xl space-y-8 mt-4">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-indigo-800">{project.title}</span>
                {project.status === "active" && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50 text-green-700 font-semibold">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}
              </div>
              {/* Role tiếng Việt */}
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-100 text-indigo-700 font-semibold shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                </svg>
                {translateRole(project.role ?? "?")}
              </span>
            </div>

            {/* Danh sách vòng khảo sát */}
            <div>
              <div className="text-sm text-gray-500 mb-2">Các vòng khảo sát</div>
              {project.rounds && project.rounds.length > 0 ? (
                project.rounds.map(round => {
                  // Chỉ các role này mới được xem kết quả
                  const canViewStats = ["secretary", "viewer", "admin"].includes(project.role ?? "");
                  return (
                    <div
                      key={round.id}
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-3 mb-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Vòng {round.round_number}</span>
                        {round.status === "active" && (
                          <span className="inline-flex items-center gap-1 text-green-700 ml-1 text-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Đang hoạt động
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`/survey/${round.id}`}
                          className="px-4 py-1 bg-green-700 hover:bg-green-800 text-white rounded-lg font-semibold shadow transition"
                        >
                          Vào trả lời
                        </a>
                        {canViewStats ? (
                          <Link
                            href={`/stats/${round.id}`}
                            className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow transition"
                          >
                            Kết quả khảo sát
                          </Link>
                        ) : (
                          <button
                            disabled
                            className="px-4 py-1 bg-gray-200 text-gray-400 rounded-lg font-semibold shadow cursor-not-allowed"
                            title="Bạn không có quyền xem kết quả"
                          >
                            Kết quả khảo sát
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-gray-400 italic text-sm">Chưa có vòng khảo sát nào</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
