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

  async function changeRole(userId: string, newRole: string) {
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) setMessage('❌ Lỗi cập nhật quyền: ' + error.message);
    else setMessage('✅ Đã cập nhật quyền!');
    await loadAll();
  }

  function getProjectsOfUser(userId: string) {
    return permissions.filter(p => p.user_id === userId)
      .map(p => projects.find(pr => pr.id === p.project_id)?.title)
      .filter(Boolean).join(", ");
  }
  function getRoundsOfUser(userId: string) {
    return participants.filter(p => p.user_id === userId)
      .map(part => {
        const round = rounds.find(r => r.id === part.round_id);
        const project = round && projects.find(pr => pr.id === round.project_id);
        return round && project ? `${project.title} - V${round.round_number}` : '';
      })
      .filter(Boolean).join(", ");
  }
  function getResponseStatus(userId: string) {
    return participants.filter(p => p.user_id === userId)
      .map(part => {
        const round = rounds.find(r => r.id === part.round_id);
        const project = round && projects.find(pr => pr.id === round.project_id);
        const hasSubmitted = responses.some(res => res.user_id === userId && res.round_id === part.round_id);
        return round && project
          ? `${project.title} - V${round.round_number}: ${hasSubmitted ? '✅ Đã nộp' : '⏳ Chưa nộp'}`
          : "";
      })
      .filter(Boolean).join("; ");
  }

  return (
    <div className="max-w-7xl mx-auto py-8">
      <h2 className="text-2xl font-bold mb-6">👥 Danh sách người dùng</h2>
      {loading && <div>⏳ Đang tải...</div>}
      {message && <div className="mb-3 text-green-600">{message}</div>}
      <div className="overflow-x-auto rounded shadow bg-white">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-100 text-base">
              <th className="p-3 border">Email</th>
              <th className="p-3 border">Tên</th>
              <th className="p-3 border">Quyền</th>
              <th className="p-3 border">Project</th>
              <th className="p-3 border">Round</th>
              <th className="p-3 border">Tình trạng nộp</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 &&
              <tr><td colSpan={6} className="text-center text-gray-400 p-8">Không có người dùng nào</td></tr>
            }
            {users.map(u => (
              <tr key={u.id} className="hover:bg-blue-50 border-b">
                <td className="p-3 border">{u.email}</td>
                <td className="p-3 border">{u.name}</td>
                <td className="p-3 border">
                  <select
                    value={u.role || 'viewer'}
                    onChange={e => changeRole(u.id, e.target.value)}
                    className="border rounded p-1 min-w-[120px] bg-white"
                  >
                    <option value="admin">Quản trị viên</option>
                    <option value="secretary">Thư ký hội đồng</option>
                    <option value="viewer">Quan sát viên</option>
                    <option value="core_expert">Chuyên gia nòng cốt</option>
                    <option value="external_expert">Chuyên gia bên ngoài</option>
                    <option value="editor">Biên tập</option>
                  </select>
                </td>
                <td className="p-3 border">{getProjectsOfUser(u.id)}</td>
                <td className="p-3 border">{getRoundsOfUser(u.id)}</td>
                <td className="p-3 border text-center">{getResponseStatus(u.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
