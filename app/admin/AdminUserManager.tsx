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

  // Load toàn bộ dữ liệu 1 lần
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

  // Tìm user đang chọn
  const selectedUser = users.find(u => u.id === selectedUserId) || null;

  // Các project user đã thuộc
  const userProjects = permissions.filter(p => p.user_id === selectedUserId).map(p => ({
    ...p,
    projectTitle: projects.find(pr => pr.id === p.project_id)?.title || ''
  }));

  // Các round user đã tham gia
  const userRounds = participants.filter(p => p.user_id === selectedUserId).map(p => {
    const round = rounds.find(r => r.id === p.round_id);
    const project = round && projects.find(pr => pr.id === round.project_id);
    return {
      ...p,
      roundInfo: round && project ? `${project.title} - V${round.round_number}` : ''
    };
  });

  // Các round đã nộp (responses)
  const submittedRounds = responses
    .filter(r => r.user_id === selectedUserId)
    .map(r => {
      const round = rounds.find(rd => rd.id === r.round_id);
      const project = round && projects.find(pr => pr.id === round.project_id);
      return round && project ? `${project.title} - V${round.round_number}` : '';
    });

  // Các project/round chưa thuộc/tham gia (để dropdown thêm)
  const availableProjects = projects.filter(pr =>
    !permissions.some(p => p.user_id === selectedUserId && p.project_id === pr.id)
  );
  const availableRounds = rounds.filter(r =>
    !participants.some(p => p.user_id === selectedUserId && p.round_id === r.id)
  );
  // Đổi quyền hệ thống (role trên bảng profiles)
  async function changeUserRole(newRole: string) {
    if (!selectedUserId) return;
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', selectedUserId);
    if (error) setMessage('❌ Lỗi cập nhật quyền hệ thống: ' + error.message);
    else setMessage('✅ Đã cập nhật quyền hệ thống!');
    await loadAll();
  }

  // Thêm vào project (table permissions)
  async function addUserToProject(projectId: string, projectRole: string = "viewer") {
    if (!selectedUserId) return;
    const { error } = await supabase.from('permissions').insert([
      { id: crypto.randomUUID(), user_id: selectedUserId, project_id: projectId, role: projectRole }
    ]);
    if (error) setMessage('❌ Lỗi thêm vào project: ' + error.message);
    else setMessage('✅ Đã thêm user vào project!');
    await loadAll();
  }

  // Xóa khỏi project
  async function removeUserFromProject(permissionId: string) {
    const { error } = await supabase.from('permissions').delete().eq('id', permissionId);
    if (error) setMessage('❌ Lỗi xóa quyền project: ' + error.message);
    else setMessage('🗑️ Đã xóa quyền project!');
    await loadAll();
  }

  // Thêm vào round (table round_participants)
  async function addUserToRound(roundId: string) {
    if (!selectedUserId) return;
    const { error } = await supabase.from('round_participants').insert([
      { id: crypto.randomUUID(), user_id: selectedUserId, round_id: roundId }
    ]);
    if (error) setMessage('❌ Lỗi thêm vào round: ' + error.message);
    else setMessage('✅ Đã thêm user vào round!');
    await loadAll();
  }

  // Xóa khỏi round
  async function removeUserFromRound(participantId: string) {
    const { error } = await supabase.from('round_participants').delete().eq('id', participantId);
    if (error) setMessage('❌ Lỗi xóa round: ' + error.message);
    else setMessage('🗑️ Đã xóa user khỏi round!');
    await loadAll();
  }

  // Giao diện
  return (
    <div className="max-w-3xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-6">👥 Quản lý người dùng</h2>
      {message && <div className="mb-4 text-green-600">{message}</div>}

      {/* Dropdown chọn user */}
      <div className="mb-6">
        <label className="font-semibold mr-2">Chọn người dùng:</label>
        <select
          value={selectedUserId ?? ''}
          onChange={e => setSelectedUserId(e.target.value || null)}
          className="border p-2 min-w-[260px]"
        >
          <option value="">-- Chọn user --</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.name || u.email} ({u.email})
            </option>
          ))}
        </select>
      </div>

      {!selectedUser && <div>Hãy chọn user để xem thông tin chi tiết.</div>}

      {selectedUser && (
        <div className="border rounded p-4 bg-white shadow space-y-6">
          {/* Thông tin user */}
          <div>
            <div><b>Email:</b> {selectedUser.email}</div>
            <div><b>Tên:</b> {selectedUser.name}</div>
            <div className="flex items-center mt-2">
              <b>Quyền hệ thống:</b>
              <select
                className="ml-2 border p-1"
                value={selectedUser.role}
                onChange={e => changeUserRole(e.target.value)}
              >
                <option value="admin">Quản trị viên</option>
                <option value="secretary">Thư ký hội đồng</option>
                <option value="viewer">Quan sát viên</option>
                <option value="core_expert">Chuyên gia nòng cốt</option>
                <option value="external_expert">Chuyên gia bên ngoài</option>
                <option value="editor">Biên tập</option>
              </select>
            </div>
          </div>
          {/* Quản lý quyền/project */}
          <div className="mt-4">
            <b>Phân quyền dự án (Project):</b>
            <div className="flex items-center gap-2 mt-2">
              <select
                className="border p-1"
                defaultValue=""
                onChange={e => {
                  const pid = e.target.value;
                  if (pid) addUserToProject(pid);
                  e.target.selectedIndex = 0; // reset dropdown sau khi thêm
                }}
              >
                <option value="">+ Thêm vào Project</option>
                {projects
                  .filter(p => !userProjects.some(up => up.project_id === p.id))
                  .map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
              </select>
            </div>
            <ul className="ml-4 mt-2">
              {userProjects.length === 0 && <li>Chưa thuộc project nào.</li>}
              {userProjects.map(p => (
                <li key={p.id} className="flex items-center gap-2 mb-1">
                  <span>{p.title} <span className="italic text-gray-500">({p.role})</span></span>
                  <button
                    className="text-red-500 ml-2"
                    onClick={() => removeUserFromProject(p.permission_id)}
                  >Xóa</button>
                </li>
              ))}
            </ul>
          </div>

          {/* Quản lý round */}
          <div className="mt-4">
            <b>Tham gia round:</b>
            <div className="flex items-center gap-2 mt-2">
              <select
                className="border p-1"
                defaultValue=""
                onChange={e => {
                  const rid = e.target.value;
                  if (rid) addUserToRound(rid);
                  e.target.selectedIndex = 0;
                }}
              >
                <option value="">+ Thêm vào Round</option>
                {rounds
                  .filter(r => !userRounds.some(ur => ur.round_id === r.id))
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {projects.find(p => p.id === r.project_id)?.title || '---'} - V{r.round_number}
                    </option>
                  ))}
              </select>
            </div>
            <ul className="ml-4 mt-2">
              {userRounds.length === 0 && <li>Chưa tham gia round nào.</li>}
              {userRounds.map(ur => {
                const round = rounds.find(r => r.id === ur.round_id);
                const project = round && projects.find(p => p.id === round.project_id);
                // Kiểm tra đã nộp khảo sát round này chưa
                const hasSubmitted = responses.some(res => res.user_id === selectedUserId && res.round_id === ur.round_id);
                return (
                  <li key={ur.participant_id} className="flex items-center gap-2 mb-1">
                    <span>
                      {project?.title || ''} - V{round?.round_number}
                      {hasSubmitted
                        ? <span className="ml-2 text-green-600">✅ Đã nộp</span>
                        : <span className="ml-2 text-yellow-600">⏳ Chưa nộp</span>
                      }
                    </span>
                    <button
                      className="text-red-500 ml-2"
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
  );
}
// Tìm các project mà user đã tham gia (từ bảng permissions)
const userProjects = permissions
  .filter(p => p.user_id === selectedUserId)
  .map(p => ({
    permission_id: p.id,
    project_id: p.project_id,
    title: projects.find(pr => pr.id === p.project_id)?.title || "",
    role: p.role
  }));

// Các round user đã tham gia (bảng round_participants)
const userRounds = participants
  .filter(pa => pa.user_id === selectedUserId)
  .map(pa => ({
    participant_id: pa.id,
    round_id: pa.round_id
  }));
