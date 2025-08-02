'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type UserProfile = { id: string; email: string; name: string; role: string };
type Project = { id: string; title: string };
type Round = { id: string; project_id: string; round_number: number };
type Permission = { id: string; user_id: string; project_id: string; role: string };
type Participant = { id: string; user_id: string; round_id: string };
type Response = { id: string; user_id: string; round_id: string };

function translateRole(role: string) {
  switch (role) {
    case "admin": return "Quản trị viên";
    case "secretary": return "Thư ký hội đồng";
    case "viewer": return "Quan sát viên";
    case "core_expert": return "Chuyên gia nòng cốt";
    case "external_expert": return "Chuyên gia bên ngoài";
    case "editor": return "Biên tập";
    default: return role;
  }
}

const SYSTEM_ROLES = [
  { value: "admin", label: "Quản trị viên" },
  { value: "secretary", label: "Thư ký hội đồng" },
  { value: "viewer", label: "Quan sát viên" },
  { value: "core_expert", label: "Chuyên gia nòng cốt" },
  { value: "external_expert", label: "Chuyên gia bên ngoài" },
  { value: "editor", label: "Biên tập" }
];

export default function AdminUserManager() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");

  // Load tất cả data
  async function loadAll() {
    setLoading(true);
    const { data: profiles } = await supabase.from('profiles').select('id, email, name, role');
    const { data: projectsData } = await supabase.from('projects').select('id, title');
    const { data: roundsData } = await supabase.from('rounds').select('id, project_id, round_number');
    const { data: permissionsData } = await supabase.from('permissions').select('id, user_id, project_id, role');
    const { data: participantsData } = await supabase.from('round_participants').select('id, user_id, round_id');
    const { data: responsesData } = await supabase.from('responses').select('id, user_id, round_id');
    setUsers((profiles as UserProfile[]) ?? []);
    setProjects((projectsData as Project[]) ?? []);
    setRounds((roundsData as Round[]) ?? []);
    setPermissions((permissionsData as Permission[]) ?? []);
    setParticipants((participantsData as Participant[]) ?? []);
    setResponses((responsesData as Response[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function changeUserRole(newRole: string) {
    if (!selectedUserId) return;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', selectedUserId);
    if (error) setMessage('❌ Lỗi cập nhật quyền hệ thống: ' + error.message);
    else setMessage('✅ Đã cập nhật quyền hệ thống!');
    await loadAll();
  }

  async function addUserToProject(projectId: string, projectRole: string = "viewer") {
    if (!selectedUserId) return;
    const { error } = await supabase.from('permissions').insert([
      { id: crypto.randomUUID(), user_id: selectedUserId, project_id: projectId, role: projectRole }
    ]);
    if (error) setMessage('❌ Lỗi thêm vào project: ' + error.message);
    else setMessage('✅ Đã thêm user vào project!');
    await loadAll();
  }
  async function removeUserFromProject(permissionId: string) {
    const { error } = await supabase.from('permissions').delete().eq('id', permissionId);
    if (error) setMessage('❌ Lỗi xóa quyền project: ' + error.message);
    else setMessage('🗑️ Đã xóa quyền project!');
    await loadAll();
  }

  // Cập nhật quyền project (phân quyền từng project)
  async function changeProjectRole(permissionId: string, newRole: string) {
    const { error } = await supabase
      .from('permissions')
      .update({ role: newRole })
      .eq('id', permissionId);
    if (error) setMessage('❌ Lỗi cập nhật quyền project: ' + error.message);
    else setMessage('✅ Đã cập nhật quyền project!');
    await loadAll();
  }

  async function addUserToRound(roundId: string) {
    if (!selectedUserId) return;
    const { error } = await supabase.from('round_participants').insert([
      { id: crypto.randomUUID(), user_id: selectedUserId, round_id: roundId }
    ]);
    if (error) setMessage('❌ Lỗi thêm vào round: ' + error.message);
    else setMessage('✅ Đã thêm user vào round!');
    await loadAll();
  }
  async function removeUserFromRound(participantId: string) {
    const { error } = await supabase.from('round_participants').delete().eq('id', participantId);
    if (error) setMessage('❌ Lỗi xóa round: ' + error.message);
    else setMessage('🗑️ Đã xóa user khỏi round!');
    await loadAll();
  }

  const selectedUser = users.find(u => u.id === selectedUserId) || null;

  const userProjects = permissions
    .filter(p => p.user_id === selectedUserId)
    .map(p => ({
      permission_id: p.id,
      project_id: p.project_id,
      title: projects.find(pr => pr.id === p.project_id)?.title || "",
      role: p.role
    }));

  const userRounds = participants
    .filter(pa => pa.user_id === selectedUserId)
    .map(pa => ({
      participant_id: pa.id,
      round_id: pa.round_id
    }));

  const availableProjects = projects.filter(pr =>
    !userProjects.some(up => up.project_id === pr.id)
  );
  const availableRounds = rounds.filter(r =>
    !userRounds.some(ur => ur.round_id === r.id)
  );

  return (
    <div className="max-w-3xl mx-auto py-10 px-2">
      <h2 className="text-3xl font-extrabold mb-8 flex items-center gap-3 text-indigo-800">
        <span className="inline-block rounded bg-indigo-100 p-2">
          <svg width="28" height="28" fill="none"><path d="M14 16c-2.5 0-7 1.25-7 3.75V21h14v-1.25C21 17.25 16.5 16 14 16ZM14 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        Quản lý người dùng
      </h2>
      {message && <div className="mb-6 text-center py-2 rounded bg-green-50 text-green-700 shadow">{message}</div>}

      <div className="mb-8 flex flex-col gap-6 items-stretch">
        {/* Dropdown chọn user */}
        <div>
          <label className="block font-semibold mb-2 text-gray-700">Chọn người dùng:</label>
          <select
            value={selectedUserId ?? ''}
            onChange={e => setSelectedUserId(e.target.value || null)}
            className="w-full border border-gray-300 rounded px-3 py-2 shadow bg-white"
          >
            <option value="">-- Chọn user --</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.name || u.email} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {/* Card thông tin user */}
        {selectedUser && (
          <div className="w-full border rounded-2xl p-6 bg-white shadow-xl min-w-[350px] space-y-6">
            {/* Thông tin user */}
            <div>
              <div className="mb-1 text-gray-700">
                <b className="mr-2">Email:</b>
                <span className="font-mono text-indigo-800">{selectedUser.email}</span>
              </div>
              <div className="mb-1 text-gray-700">
                <b className="mr-2">Tên:</b>
                <span>{selectedUser.name}</span>
              </div>
              <div className="flex items-center mt-2">
                <b>Quyền hệ thống:</b>
                <select
                  className="ml-2 border border-gray-300 rounded px-2 py-1 bg-gray-50 text-indigo-800"
                  value={selectedUser.role}
                  onChange={e => changeUserRole(e.target.value)}
                >
                  {SYSTEM_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {/* Phân quyền dự án */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <b className="text-gray-800">Phân quyền dự án:</b>
                <select
                  className="border rounded px-2 py-1 bg-gray-100 text-gray-800 text-sm"
                  defaultValue=""
                  onChange={e => {
                    const pid = e.target.value;
                    if (pid) addUserToProject(pid);
                    e.target.selectedIndex = 0;
                  }}
                >
                  <option value="">+ Thêm vào Project</option>
                  {availableProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <ul className="mt-2 space-y-1">
                {userProjects.length === 0 && <li className="text-gray-400 italic">Chưa thuộc project nào.</li>}
                {userProjects.map(p => (
                  <li
                    key={p.permission_id}
                    className="flex flex-wrap md:flex-nowrap items-center justify-between gap-2 bg-gray-50 rounded px-3 py-2"
                  >
                    <span>
                      <b>{p.title}</b>
                    </span>
                    <span className="flex items-center gap-2">
                      <select
                        className="border rounded px-2 py-1 bg-indigo-50 text-indigo-800 text-xs font-semibold"
                        value={p.role}
                        onChange={e => changeProjectRole(p.permission_id, e.target.value)}
                      >
                        {SYSTEM_ROLES.filter(r => r.value !== 'admin').map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <span className="inline-block px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-semibold">
                        {translateRole(p.role)}
                      </span>
                      <button
                        className="text-red-500 text-xs font-bold hover:underline hover:text-red-700 ml-2"
                        onClick={() => removeUserFromProject(p.permission_id)}
                      >Xóa</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Quản lý round */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <b className="text-gray-800">Tham gia round:</b>
                <select
                  className="border rounded px-2 py-1 bg-gray-100 text-gray-800 text-sm"
                  defaultValue=""
                  onChange={e => {
                    const rid = e.target.value;
                    if (rid) addUserToRound(rid);
                    e.target.selectedIndex = 0;
                  }}
                >
                  <option value="">+ Thêm vào Round</option>
                  {availableRounds.map(r => (
                    <option key={r.id} value={r.id}>
                      {projects.find(p => p.id === r.project_id)?.title || '---'} - V{r.round_number}
                    </option>
                  ))}
                </select>
              </div>
              <ul className="mt-2 space-y-1">
                {userRounds.length === 0 && <li className="text-gray-400 italic">Chưa tham gia round nào.</li>}
                {userRounds.map(ur => {
                  const round = rounds.find(r => r.id === ur.round_id);
                  const project = round && projects.find(p => p.id === round.project_id);
                  const hasSubmitted = responses.some(res => res.user_id === selectedUserId && res.round_id === ur.round_id);
                  return (
                    <li key={ur.participant_id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2">
                      <span>
                        <b>{project?.title || ''} - V{round?.round_number}</b>
                        {hasSubmitted
                          ? <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs font-semibold"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Đã nộp</span>
                          : <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs font-semibold"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Chưa nộp</span>
                        }
                      </span>
                      <button
                        className="text-red-500 text-sm font-bold hover:underline hover:text-red-700"
                        onClick={() => removeUserFromRound(ur.participant_id)}
                      >Xóa</button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )}
      </div>
      {loading && <div className="text-gray-500 mt-6">Đang tải dữ liệu...</div>}
    </div>
  );
}
