// File: app/admin/AdminSurveyInviteManager.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabaseClient';

type Project = { id: string; title: string };
type Round = { id: string; project_id: string; round_number: number };
type Profile = { id: string; email: string; name: string|null; role: string };

type ProgressRow = { user_id:string; user_name:string; email:string; project_id:string; project_title:string; round_id:string; round_label:string; status:'submitted'|'invited'; responded_at?:string|null; invited_at?:string|null };

const INPUT = 'w-full border rounded-lg px-3 py-2 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200';
const BTN = 'px-3 py-2 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50';
const BTN2 = 'px-3 py-2 rounded-lg font-semibold border border-slate-300 hover:bg-slate-50 disabled:opacity-50';

export default function AdminSurveyInviteManager(){
  const [projects, setProjects] = useState<Project[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);
  const [checkedProfiles, setCheckedProfiles] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');

  const [emailSubject, setEmailSubject] = useState('Lời mời tham gia khảo sát');
  const [emailHtml, setEmailHtml] = useState(`
    <p>Chào {{full_name}},</p>
    <p>Anh/Chị được mời tham gia khảo sát cho các nội dung sau:</p>
    {{project_list}}
    <p>{{open_button}}</p>
  `.trim());

  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Load dữ liệu cơ bản
  useEffect(() => { (async () => {
    const [pr, rd, pf] = await Promise.all([
      supabase.from('projects').select('id,title').order('title'),
      supabase.from('rounds').select('id,project_id,round_number').order('round_number'),
      supabase.from('profiles').select('id,email,name,role').order('email'),
    ]);
    setProjects(pr.data||[]);
    setRounds(rd.data||[]);
    setProfiles(pf.data||[]);
  })(); }, []);

  // Load tiến độ theo filter
  async function reloadProgress() {
    const params = new URLSearchParams();
    if (filterProject) params.set('project_id', filterProject);
    if (filterStatus) params.set('status', filterStatus);
    const r = await fetch('/api/surveys/progress?'+params.toString());
    const d = await r.json();
    setProgress(d.items||[]);
  }
  useEffect(()=>{ reloadProgress(); }, [filterProject, filterStatus]);

  const filteredProfiles = useMemo(()=>{
    const k = q.trim().toLowerCase();
    return profiles.filter(p=>{
      // ưu tiên external_expert, nhưng vẫn cho hiện tất cả để chọn khi cần
      const hit = !k || p.email.toLowerCase().includes(k) || (p.name||'').toLowerCase().includes(k);
      return hit;
    });
  }, [profiles, q]);

  const roundsByProject = useMemo(()=>{
    const m: Record<string, Round[]> = {};
    rounds.forEach(r=>{
      (m[r.project_id] ||= []).push(r);
    });
    Object.values(m).forEach(list=>list.sort((a,b)=>a.round_number-b.round_number));
    return m;
  }, [rounds]);

  function toggleRound(id:string){
    setSelectedRoundIds(prev => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  }

  const checkedIds = useMemo(()=>Object.keys(checkedProfiles).filter(id => checkedProfiles[id]), [checkedProfiles]);

  // CSV upload → server bulk-upsert
  async function onUploadCsv(file: File){
    setLoading(true); setMsg('Đang xử lý CSV...');
    try{
      const csvText = await file.text();
      const parsed = Papa.parse(csvText, { header:true, skipEmptyLines:true });
      const rows = (parsed.data as any[]).map(r=>({
        full_name: String(r.full_name||r.name||'').trim(),
        email: String(r.email||'').trim().toLowerCase(),
        org: r.org||null,
        title: r.title||null,
        phone: r.phone||null,
      })).filter(r=>r.full_name && r.email);
      const res = await fetch('/api/experts/bulk-upsert', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ experts: rows }) });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setMsg(`✅ Đã cập nhật danh bạ: ${d.upserted} email. Tự tạo profiles cho ${d.details?.filter((x:any)=>x.created_profile).length||0} người.`);
      // refresh profiles
      const pf = await supabase.from('profiles').select('id,email,name,role').order('email');
      setProfiles(pf.data||[]);
    }catch(e:any){
      setMsg('❌ Lỗi CSV: '+(e?.message||String(e)));
    }finally{ setLoading(false); }
  }

  async function act(mode: 'invite'|'remind'){
    if (checkedIds.length===0) { alert('Chọn ít nhất 1 người'); return; }
    if (selectedRoundIds.length===0) { alert('Chọn ít nhất 1 vòng'); return; }
    setLoading(true);
    try{
      const r = await fetch('/api/invitations/send', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ profile_ids: checkedIds, round_ids: selectedRoundIds, mode, email: { subject: emailSubject, html: emailHtml } }) });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      const ok = d.results?.filter((x:any)=>x.ok).length||0;
      setMsg(`Đã gửi ${ok}/${d.results?.length||0} email.`);
      setCheckedProfiles({});
      await reloadProgress();
    }catch(e:any){ setMsg('❌ Lỗi gửi email: '+(e?.message||String(e))); }
    finally{ setLoading(false); }
  }

  const previewHtml = useMemo(()=>{
    const sample = {
      raw: emailHtml,
      fullName: 'Nguyễn Văn A',
      email: 'vana@example.com',
      rounds: selectedRoundIds.map(rid=>{
        const r = rounds.find(x=>x.id===rid);
        const pj = projects.find(p=>p.id===r?.project_id);
        return { project_title: pj?.title||'', round_label: r?`V${r.round_number}`:'' };
      })
    };
    const ul = `<ul>` + sample.rounds.map(r=>`<li>${r.project_title} – ${r.round_label}</li>`).join('') + `</ul>`;
    let html = sample.raw
      .replace(/{{\s*full_name\s*}}/gi, sample.fullName)
      .replace(/{{\s*email\s*}}/gi, sample.email)
      .replace(/{{\s*project_list\s*}}/gi, ul)
      .replace(/{{\s*open_button\s*}}/gi, `<a href="${process.env.NEXT_PUBLIC_BASE_URL||''}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a>`);
    if (!/{{\s*open_button\s*}}/i.test(sample.raw)) html += `<div style="margin-top:12px"><a href="${process.env.NEXT_PUBLIC_BASE_URL||''}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none">Mở trang khảo sát</a></div>`;
    if (!/{{\s*project_list\s*}}/i.test(sample.raw)) html += `<div style="margin-top:12px">${ul}</div>`;
    html += `<hr style="margin:24px 0"/><div style="font-size:12px;color:#6b7280">Khoa Y học cổ truyền - Đại học Y Dược Thành phố Hồ Chí Minh.</div>`;
    return html;
  }, [emailHtml, selectedRoundIds, rounds, projects]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">✉️ Mời khảo sát</h1>
      {msg && <div className="p-3 rounded bg-indigo-50 text-indigo-700">{msg}</div>}

      {/* CSV */}
      <div className="space-y-2">
        <div className="font-semibold">1) Nạp danh bạ từ CSV</div>
        <input type="file" accept=".csv" onChange={e=>{const f=e.target.files?.[0]; if (f) onUploadCsv(f);}} />
        <div className="text-xs text-slate-600">CSV header tối thiểu: <code>full_name,email</code> (có thể kèm <code>org,title,phone</code>).</div>
      </div>

      {/* Chọn rounds */}
      <div className="space-y-2">
        <div className="font-semibold">2) Chọn vòng khảo sát (có thể chọn nhiều project)</div>
        <div className="grid md:grid-cols-2 gap-4">
          {projects.map(p=> (
            <div key={p.id} className="border rounded-lg p-3">
              <div className="font-semibold mb-2">{p.title}</div>
              <div className="flex flex-wrap gap-2">
                {(roundsByProject[p.id]||[]).map(r=> (
                  <label key={r.id} className={`inline-flex items-center gap-2 px-2 py-1 rounded border cursor-pointer ${selectedRoundIds.includes(r.id)?'bg-blue-50 border-blue-300':'bg-white'}`}>
                    <input type="checkbox" checked={selectedRoundIds.includes(r.id)} onChange={()=>toggleRound(r.id)} /> V{r.round_number}
                  </label>
                ))}
                {(roundsByProject[p.id]||[]).length===0 && <div className="text-slate-400 text-sm">(Chưa có vòng)</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Soạn email */}
      <div className="space-y-2">
        <div className="font-semibold">3) Soạn email</div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-2">
            <label className="block text-sm">Tiêu đề</label>
            <input className={INPUT} value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} />
            <label className="block text-sm">Tìm & chọn người nhận</label>
            <input className={INPUT} placeholder="Tên/email" value={q} onChange={e=>setQ(e.target.value)} />
            <div className="border rounded max-h-64 overflow-auto mt-2">
              {filteredProfiles.map(u=> (
                <label key={u.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0">
                  <input type="checkbox" checked={!!checkedProfiles[u.id]} onChange={e=>setCheckedProfiles(prev=>({...prev, [u.id]: e.target.checked}))} />
                  <span className="text-sm"><b>{u.name||u.email}</b> <span className="text-slate-500">({u.email})</span></span>
                </label>
              ))}
            </div>
            <div className="text-xs text-slate-600 mt-1">Đã chọn: <b>{checkedIds.length}</b> người.</div>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="block text-sm">Nội dung HTML (hỗ trợ biến: <code>{{`{{full_name}}`}}</code>, <code>{{`{{email}}`}}</code>, <code>{{`{{project_list}}`}}</code>, <code>{{`{{open_button}}`}}</code>)</label>
            <textarea className={INPUT+" h-48 font-mono"} value={emailHtml} onChange={e=>setEmailHtml(e.target.value)} />
            <div className="border rounded p-3">
              <div className="text-sm font-semibold mb-2">Preview</div>
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>
        </div>
      </div>

      {/* Hành động */}
      <div className="flex items-center gap-3">
        <button className={BTN} disabled={loading} onClick={()=>act('invite')}>Mời (add + gửi)</button>
        <button className={BTN2} disabled={loading} onClick={()=>act('remind')}>Nhắc (chỉ gửi)</button>
      </div>

      {/* Bộ lọc tiến độ */}
      <div className="space-y-2">
        <div className="font-semibold">4) Tiến độ tham gia</div>
        <div className="flex flex-wrap items-center gap-3">
          <select className={INPUT+" md:w-64"} value={filterProject} onChange={e=>setFilterProject(e.target.value)}>
            <option value="">— Lọc theo Project —</option>
            {projects.map(p=>(<option key={p.id} value={p.id}>{p.title}</option>))}
          </select>
          <select className={INPUT+" md:w-48"} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="">— Tất cả trạng thái —</option>
            <option value="submitted">Đã nộp</option>
            <option value="invited">Chưa nộp</option>
          </select>
          <button className={BTN2} onClick={reloadProgress}>Làm mới</button>
        </div>
        <div className="border rounded overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-left">Người tham gia</th>
                <th className="p-2">Project</th>
                <th className="p-2">Vòng</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2">Mời lúc</th>
                <th className="p-2">Đã nộp</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((r,i)=> (
                <tr key={i} className="border-t">
                  <td className="p-2 text-left">{r.user_name} <span className="text-slate-500">({r.email})</span></td>
                  <td className="p-2 text-center">{r.project_title}</td>
                  <td className="p-2 text-center">{r.round_label}</td>
                  <td className="p-2 text-center">{r.status==='submitted'?<span className="px-2 py-1 rounded bg-green-100 text-green-700">Đã nộp</span>:<span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700">Chưa nộp</span>}</td>
                  <td className="p-2 text-center">{r.invited_at? new Date(r.invited_at).toLocaleString():'—'}</td>
                  <td className="p-2 text-center">{r.responded_at? new Date(r.responded_at).toLocaleString():'—'}</td>
                </tr>
              ))}
              {progress.length===0 && (
                <tr><td colSpan={6} className="p-4 text-center text-slate-500">Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

