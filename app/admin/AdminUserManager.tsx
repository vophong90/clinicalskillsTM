'use client';
import React, { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");

  // user được chọn
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  useEffect(() => { loadAll(); }, []);

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

  async function changeRole(userId: string, newRole: string) {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) setMessage('❌ Lỗi cập nhật quyền: ' + error.message);
    else setMessage('✅ Đã cập nhật quyền!');
    await loadAll();
  }

  // Gán user vào project (role mặc định viewer, có thể cho chọn)
  async function addUserToProject(userId: string, projectId: string, role = 'viewer') {
    await supabase.from('permissions').insert([{ user_id: userId, project_id: projectId, role }]);
    setMessage('✅ Đã thêm vào project!');
    await loadAll();
  }
  // Xóa user khỏi project
  async function removeUserFromProject(permissionId: string) {
    await supabase.from('permissions').delete().eq('id', permissionId);
    setMessage('🗑️ Đã xóa khỏi project!');
    await loadAll();
  }

  // Gán user vào round
  async function addUserToRound(userId: string, roundId: string) {
    await supabase.from('round_participants').insert([{ user_id: userId, round_id: roundId }]);
    setMessage('✅ Đã thêm vào round!');
    await loadAll();
  }
  // Xóa user khỏi round
  async function removeUserFromRound(participantId: string) {
    await supabase.from('round_participants').delete().eq('id', participantId);
    setMessage('🗑️ Đã xóa khỏi round!');
    await loadAll();
  }

return (
  <div className="max-w-4xl mx-auto py-8">
    <h2 className="text-2xl font-bold mb-6">👤 Quản lý người dùng</h2>
    {message && <div className="mb-3 text-green-600">{message}</div>}
    <div className="mb-6">
      <label className="font-semibold mr-3">Chọn người dùng:</label>
      <select
        className="border p-2 min-w-[250px]"
        value={selectedUserId}
        onChange={e => setSelectedUserId(e.target.value)}
      >
        <option value="">-- Chọn user --</option>
        {users.map(u =>
          <option key={u.id} value={u.id}>
            {u.name || "(Chưa đặt tên)"} - {u.email}
          </option>
        )}
      </select>
    </div>
    {selectedUserId && renderUserDetail(selectedUserId)}
  </div>
);

function renderUserDetail(userId: string) {
  const user = users.find(u => u.id === userId);
  if (!user) return null;

  // Các project user này đã tham gia (dựa vào permissions)
  const userPermissions = permissions.filter(p => p.user_id === userId);
  // Các project chưa tham gia
  const availableProjects = projects.filter(p => !userPermissions.some(up => up.project_id === p.id));

  // Các round user này đã tham gia (dựa vào participants)
  const userParticipants = participants.filter(p => p.user_id === userId);
  // Các round chưa tham gia, chỉ trong project user đã vào
  const availableRounds = rounds.filter(
    r => userPermissions.some(up => up.project_id === r.project_id)
      && !userParticipants.some(ur => ur.round_id === r.id)
  );

  // Các response user này đã nộp
  const userResponses = responses.filter(r => r.user_id === userId);

  return (
    <div className="border rounded p-6 bg-gray-50 shadow">
      <div className="mb-4">
        <strong>Email:</strong> {user.email} <br />
        <strong>Tên:</strong> {user.name} <br />
        <strong>Quyền:</strong>{" "}
        <select
          className="border p-1 ml-2"
          value={user.role || 'viewer'}
          onChange={e => changeRole(userId, e.target.value)}
        >
          <option value="admin">Quản trị viên</option>
          <option value="secretary">Thư ký hội đồng</option>
          <option value="viewer">Quan sát viên</option>
          <option value="core_expert">Chuyên gia nòng cốt</option>
          <option value="external_expert">Chuyên gia bên ngoài</option>
          <option value="editor">Biên tập</option>
        </select>
      </div>

      {/* --- PROJECTS --- */}
      <div className="mb-6">
        <div className="font-semibold mb-1">Các project đã tham gia:</div>
        <ul className="mb-2">
          {userPermissions.length === 0 && <li className="text-gray-500">(Chưa có)</li>}
          {userPermissions.map(p => (
            <li key={p.id} className="mb-1">
              {projects.find(pr => pr.id === p.project_id)?.title || "?"}
              <button
                className="ml-2 px-2 py-1 bg-red-500 text-white rounded text-xs"
                onClick={() => removeUserFromProject(p.id)}
              >Xóa</button>
            </li>
          ))}
        </ul>
        {availableProjects.length > 0 && (
          <div className="flex gap-2 items-center">
            <select id="addProject"
              className="border p-1"
              defaultValue=""
              onChange={e => {
                if (e.target.value) addUserToProject(userId, e.target.value);
              }}>
              <option value="">+ Thêm vào project</option>
              {availableProjects.map(p =>
                <option key={p.id} value={p.id}>{p.title}</option>
              )}
            </select>
          </div>
        )}
      </div>

      {/* --- ROUNDS --- */}
      <div className="mb-6">
        <div className="font-semibold mb-1">Các round đã tham gia:</div>
        <ul className="mb-2">
          {userParticipants.length === 0 && <li className="text-gray-500">(Chưa có)</li>}
          {userParticipants.map(p => {
            const round = rounds.find(r => r.id === p.round_id);
            const project = round && projects.find(pr => pr.id === round.project_id);
            const hasSubmitted = userResponses.some(res => res.round_id === p.round_id);
            return (
              <li key={p.id} className="mb-1">
                {project?.title || "?"} - V{round?.round_number}
                <span className="ml-2">{hasSubmitted ? "✅ Đã nộp" : "⏳ Chưa nộp"}</span>
                <button
                  className="ml-2 px-2 py-1 bg-red-500 text-white rounded text-xs"
                  onClick={() => removeUserFromRound(p.id)}
                >Xóa</button>
              </li>
            );
          })}
        </ul>
        {availableRounds.length > 0 && (
          <div className="flex gap-2 items-center">
            <select id="addRound"
              className="border p-1"
              defaultValue=""
              onChange={e => {
                if (e.target.value) addUserToRound(userId, e.target.value);
              }}>
              <option value="">+ Thêm vào round</option>
              {availableRounds.map(r =>
                <option key={r.id} value={r.id}>
                  {projects.find(pr => pr.id === r.project_id)?.title || "?"} - V{r.round_number}
                </option>
              )}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
