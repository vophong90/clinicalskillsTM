'use client';

import { useEffect, useMemo, useState } from 'react';
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
    case 'admin':
      return 'Quản trị viên';
    case 'secretary':
      return 'Thư ký hội đồng';
    case 'viewer':
      return 'Quan sát viên';
    case 'core_expert':
      return 'Chuyên gia nòng cốt';
    case 'external_expert':
      return 'Chuyên gia bên ngoài';
    default:
      return roleId;
  }
}

type ProjectFilterStatus = 'all' | 'submitted' | 'completed';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // NEW: danh sách các round mà user đã nộp bản cuối
  const [submittedRoundIds, setSubmittedRoundIds] = useState<Set<string>>(
    () => new Set()
  );

  // ✅ NEW: filters
  const [projectFilterId, setProjectFilterId] = useState<string>('all'); // 'all' | project.id
  const [statusFilter, setStatusFilter] = useState<ProjectFilterStatus>('all');

  const router = useRouter();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      // Lấy user từ Supabase Auth
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        setError('❌ Không xác định được người dùng.');
        setLoading(false);
        return;
      }
      const user = userData.user;

      // Lấy profile (id, name, role)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        setError('❌ Lỗi truy vấn profile: ' + profileError.message);
        setLoading(false);
        return;
      }
      if (!profile) {
        setError('❌ Không tìm thấy profile cho user hiện tại.');
        setLoading(false);
        return;
      }

      setName(profile.name || '');
      setIsAdmin(profile.role === 'admin');

      // Lấy quyền từ bảng permissions (chỉ để lấy danh sách dự án)
      const { data: permissionsData, error: permissionsError } = await supabase
        .from('permissions')
        .select('role, project_id')
        .eq('user_id', profile.id);

      if (permissionsError) {
        setError('❌ Lỗi truy vấn permissions: ' + permissionsError.message);
        setLoading(false);
        return;
      }

      const projectIds = permissionsData?.map((p) => p.project_id) || [];

      // NEW: lấy tất cả round mà user này đã nộp bản cuối
      try {
        const { data: submittedResps, error: submittedErr } = await supabase
          .from('responses')
          .select('round_id')
          .eq('user_id', profile.id)
          .eq('is_submitted', true)
          .range(0, 999999);

        if (submittedErr) {
          console.error('Lỗi truy vấn trạng thái nộp:', submittedErr.message);
        } else if (submittedResps) {
          const s = new Set<string>();
          submittedResps.forEach((row: { round_id: string | null }) => {
            if (row.round_id) s.add(row.round_id);
          });
          setSubmittedRoundIds(s);
        }
      } catch (e) {
        console.error('Lỗi khi lấy submittedRoundIds', e);
      }

      // Lấy projects
      const { data: projectsData, error: projErr } = await supabase
        .from('projects')
        .select('id, title, status')
        .in('id', projectIds);

      if (projErr) {
        setError('❌ Lỗi truy vấn projects: ' + projErr.message);
        setLoading(false);
        return;
      }

      // Lấy rounds
      const { data: roundsData, error: roundErr } = await supabase
        .from('rounds')
        .select('id, project_id, round_number, status, open_at, close_at')
        .in('project_id', projectIds);

      if (roundErr) {
        setError('❌ Lỗi truy vấn rounds: ' + roundErr.message);
        setLoading(false);
        return;
      }

      // Map projects với rounds và role
      const finalProjects: Project[] = (projectsData || []).map((proj) => {
        const matched = (permissionsData || []).find((p) => p.project_id === proj.id);
        const rounds = (roundsData || []).filter((r) => r.project_id === proj.id);
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

  // ✅ Helper: trạng thái “Đã nộp” / “Hoàn thành” theo project
  const projectMeta = useMemo(() => {
    const map = new Map<
      string,
      { hasAnySubmitted: boolean; allRoundsSubmitted: boolean; isCompleted: boolean }
    >();

    projects.forEach((p) => {
      const rounds = p.rounds || [];
      const hasAnySubmitted =
        rounds.length > 0 && rounds.some((r) => submittedRoundIds.has(r.id));

      const allRoundsSubmitted =
        rounds.length > 0 && rounds.every((r) => submittedRoundIds.has(r.id));

      // Mặc định: Hoàn thành theo projects.status
      // Nếu bạn muốn “Hoàn thành” theo vòng: ví dụ tất cả rounds.status === 'completed' thì bật dòng dưới.
      const isCompletedByProjectStatus = p.status === 'completed';
      // const isCompletedByRounds =
      //   rounds.length > 0 && rounds.every((r) => r.status === 'completed');

      const isCompleted = isCompletedByProjectStatus; // || isCompletedByRounds

      map.set(p.id, { hasAnySubmitted, allRoundsSubmitted, isCompleted });
    });

    return map;
  }, [projects, submittedRoundIds]);

  // ✅ Apply filters
  const filteredProjects = useMemo(() => {
    let list = [...projects];

    if (projectFilterId !== 'all') {
      list = list.filter((p) => p.id === projectFilterId);
    }

    if (statusFilter !== 'all') {
      list = list.filter((p) => {
        const meta = projectMeta.get(p.id);
        if (!meta) return false;

        if (statusFilter === 'submitted') {
          // ✅ đang dùng: chỉ cần “có ít nhất 1 vòng đã nộp”
          return meta.hasAnySubmitted;

          // Nếu bạn muốn “Đã nộp” = “tất cả vòng đã nộp”, đổi thành:
          // return meta.allRoundsSubmitted;
        }

        if (statusFilter === 'completed') return meta.isCompleted;

        return true;
      });
    }

    return list;
  }, [projects, projectFilterId, statusFilter, projectMeta]);

  if (loading) return <div>🔄 Đang tải dữ liệu...</div>;
  if (error) return <div>{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12">
      {/* Thanh góc phải: Tài khoản + Đăng xuất */}
      <div className="absolute top-6 right-6 flex items-center gap-2">
        <Link
          href="/account"
          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold shadow"
        >
          👤 Tài khoản của tôi
        </Link>
        <button
          onClick={handleLogout}
          className="px-4 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-600 text-sm font-semibold"
        >
          Đăng xuất
        </button>
      </div>

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

      {/* ✅ NEW: Filters */}
      <div className="w-full max-w-2xl mt-2 mb-4">
        <div className="bg-white rounded-2xl shadow p-4 flex flex-col gap-3">
          <div className="text-sm font-semibold text-gray-700">Bộ lọc</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Project</span>
              <select
                value={projectFilterId}
                onChange={(e) => setProjectFilterId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">Tất cả project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Trạng thái</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ProjectFilterStatus)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">Tất cả</option>
                <option value="submitted">Đã nộp</option>
                <option value="completed">Hoàn thành</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              Hiển thị: <span className="font-semibold text-gray-700">{filteredProjects.length}</span> project
            </div>

            <button
              type="button"
              onClick={() => {
                setProjectFilterId('all');
                setStatusFilter('all');
              }}
              className="text-xs px-3 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-w-2xl space-y-8 mt-2">
        {filteredProjects.map((project) => {
          const meta = projectMeta.get(project.id);
          const hasAnySubmitted = meta?.hasAnySubmitted ?? false;
          const allRoundsSubmitted = meta?.allRoundsSubmitted ?? false;
          const isCompleted = meta?.isCompleted ?? false;

          return (
            <div
              key={project.id}
              className="bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-indigo-800">
                    {project.title}
                  </span>

                  {/* Badge trạng thái project */}
                  <div className="flex items-center gap-2">
                    {hasAnySubmitted && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 font-semibold">
                        ✅ Đã nộp
                        {/* nếu bạn dùng allRoundsSubmitted cho “Đã nộp”, có thể hiện thêm */}
                        {allRoundsSubmitted ? '' : ''}
                      </span>
                    )}
                    {isCompleted && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-purple-50 text-purple-700 font-semibold">
                        🏁 Hoàn thành
                      </span>
                    )}

                    {project.status === 'active' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-50 text-green-700 font-semibold">
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                        Active
                      </span>
                    )}
                  </div>
                </div>

                {/* Role tiếng Việt */}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-100 text-indigo-700 font-semibold shadow-sm">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <circle cx="12" cy="12" r="3" fill="currentColor" />
                  </svg>
                  {translateRole(project.role ?? '?')}
                </span>
              </div>

              {/* Danh sách vòng khảo sát */}
              <div>
                <div className="text-sm text-gray-500 mb-2">Các vòng khảo sát</div>
                {project.rounds && project.rounds.length > 0 ? (
                  project.rounds.map((round) => {
                    // Chỉ các role này mới được xem kết quả
                    const canViewStats = ['secretary', 'viewer', 'admin'].includes(
                      project.role ?? ''
                    );
                    // kiểm tra vòng này đã nộp chưa
                    const isSubmitted = submittedRoundIds.has(round.id);

                    return (
                      <div
                        key={round.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg p-3 mb-2"
                      >
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">Vòng {round.round_number}</span>
                            {round.status === 'active' && (
                              <span className="inline-flex items-center gap-1 text-green-700 ml-1 text-sm">
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={3}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                                Đang hoạt động
                              </span>
                            )}
                          </div>

                          {/* trạng thái đã nộp / chưa nộp */}
                          <div className="text-sm">
                            {isSubmitted ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700">
                                <span>✅</span>
                                <span>Bạn đã nộp bản cuối</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-orange-600">
                                <span>⚠️</span>
                                <span>Bạn chưa nộp bản cuối</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <a
                            href={`/survey/${round.id}`}
                            className={
                              'px-4 py-1 rounded-lg font-semibold shadow transition ' +
                              (isSubmitted
                                ? 'bg-gray-300 text-gray-700 hover:bg-gray-300 cursor-pointer'
                                : 'bg-green-700 hover:bg-green-800 text-white')
                            }
                          >
                            {isSubmitted ? 'Đã nộp' : 'Vào trả lời'}
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
                    );
                  })
                ) : (
                  <div className="text-gray-400 italic text-sm">Chưa có vòng khảo sát nào</div>
                )}
              </div>

              {/* Nút Kết quả dự án, chỉ cho admin và viewer */}
              {['admin', 'viewer'].includes(project.role ?? '') && (
                <Link
                  href={`/stats/project/${project.id}`}
                  className="inline-block mt-2 px-4 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-semibold shadow transition"
                  style={{ alignSelf: 'flex-end' }}
                >
                  📊 Kết quả dự án
                </Link>
              )}
            </div>
          );
        })}

        {filteredProjects.length === 0 && (
          <div className="text-center text-gray-500 italic py-10">
            Không có project nào phù hợp bộ lọc.
          </div>
        )}
      </div>
    </div>
  );
}
