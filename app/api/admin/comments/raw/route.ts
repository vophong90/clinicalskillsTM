// app/api/admin/comments/raw/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DBRound = {
  id: string;
  project_id: string;
  round_number: number;
};

type DBProject = {
  id: string;
  title: string;
};

type DBItem = {
  id: string;
  prompt: string;
};

type DBResponse = {
  round_id: string;
  item_id: string;
  user_id: string;
  answer_json: any;
  is_submitted: boolean;
};

type CommentRow = {
  project_id: string;
  project_title: string;
  round_id: string;
  round_label: string;
  item_id: string;
  item_prompt: string;
  user_id: string | null;
  comment: string;
};

function safeParseJSON(val: any): any {
  if (!val) return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return null;
}

// Ưu tiên các field thường gặp: comment / text / freeText / answer / value
function extractComment(answer_json: any): string | null {
  const obj = safeParseJSON(answer_json) ?? answer_json;
  if (!obj) return null;

  if (typeof obj === 'string') {
    const s = obj.trim();
    return s || null;
  }

  if (typeof obj === 'object') {
    const candidates = ['comment', 'text', 'freeText', 'answer', 'value'];
    for (const key of candidates) {
      const v = (obj as any)[key];
      if (typeof v === 'string') {
        const s = v.trim();
        if (s) return s;
      }
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body phải là JSON' }, { status: 400 });
  }

  const round_id: string | null =
    typeof body.round_id === 'string' ? body.round_id : null;

  // cohort_code là tuỳ chọn: nếu null -> lấy tất cả đối tượng
  const cohort_code_raw =
    typeof body.cohort_code === 'string' ? body.cohort_code.trim() : '';
  const cohort_code: string | null = cohort_code_raw || null;

  if (!round_id) {
    return NextResponse.json({ error: 'round_id là bắt buộc' }, { status: 400 });
  }

  try {
    // 1) Lấy round
    const { data: roundData, error: roundErr } = await s
      .from('rounds')
      .select('id, project_id, round_number')
      .eq('id', round_id)
      .maybeSingle();

    if (roundErr) throw new Error('Lỗi truy vấn rounds: ' + roundErr.message);
    if (!roundData) return NextResponse.json({ comments: [] });

    const round = roundData as DBRound;

    // 2) Lấy project
    const { data: projectData, error: projErr } = await s
      .from('projects')
      .select('id, title')
      .eq('id', round.project_id)
      .maybeSingle();

    if (projErr) throw new Error('Lỗi truy vấn projects: ' + projErr.message);
    if (!projectData) return NextResponse.json({ comments: [] });

    const project = projectData as DBProject;

    // 3) Lấy items của round này
    const { data: itemsData, error: itemsErr } = await s
      .from('items')
      .select('id, prompt')
      .eq('round_id', round_id);

    if (itemsErr) throw new Error('Lỗi truy vấn items: ' + itemsErr.message);

    const itemMap = new Map<string, DBItem>();
    (itemsData || []).forEach((it: any) => {
      itemMap.set(it.id, it as DBItem);
    });

    // 4) Nếu có filter cohort_code -> lấy user_id thuộc cohort đó TRONG round_participants của round
    //    (đây là chỗ “đúng logic đối tượng”)
    let allowedUserIds: string[] | null = null;

    if (cohort_code) {
      // Join chắc kèo theo FK; nếu FK name của anh khác, đổi lại đúng tên.
      // round_participants.user_id -> profiles.id
      const { data: rpData, error: rpErr } = await s
        .from('round_participants')
        .select(
          `user_id, profiles:profiles!round_participants_user_id_fkey(cohort_code)`
        )
        .eq('round_id', round_id);

      if (rpErr) {
        throw new Error('Lỗi truy vấn round_participants: ' + rpErr.message);
      }

      const ids = (rpData || [])
        .filter((row: any) => row.profiles?.cohort_code === cohort_code)
        .map((row: any) => row.user_id as string)
        .filter(Boolean);

      allowedUserIds = ids;

      // Nếu cohort không có ai trong round -> trả rỗng luôn (đỡ query responses)
      if (allowedUserIds.length === 0) {
        return NextResponse.json({
          comments: [],
          total_responses_filtered: 0,
          total_responses_all: 0,
          cohort_code,
        });
      }
    }

    // 5) Lấy responses (chỉ bản đã nộp) với PHÂN TRANG
    const PAGE = 1000;
    let from = 0;
    const allResponses: DBResponse[] = [];

    while (true) {
      let q = s
        .from('responses')
        .select('round_id, item_id, user_id, answer_json, is_submitted')
        .eq('round_id', round_id)
        .eq('is_submitted', true);

      // Nếu lọc cohort -> chỉ lấy response của allowedUserIds
      // (in() giới hạn length; nếu cohort quá đông có thể phải chunk, nhưng thường ok)
      if (allowedUserIds) {
        q = q.in('user_id', allowedUserIds);
      }

      const { data, error } = await q.range(from, from + PAGE - 1);

      if (error) {
        throw new Error('Lỗi truy vấn responses: ' + error.message);
      }

      const batch = (data || []) as DBResponse[];

      if (batch.length === 0) break;

      allResponses.push(...batch);

      if (batch.length < PAGE) break;

      from += PAGE;
    }

    // 6) Extract comment
    const comments: CommentRow[] = [];

    allResponses.forEach((r) => {
      const c = extractComment(r.answer_json);
      if (!c) return;

      const item = itemMap.get(r.item_id);
      if (!item) return;

      comments.push({
        project_id: project.id,
        project_title: project.title,
        round_id: round.id,
        round_label: `Vòng ${round.round_number}`,
        item_id: item.id,
        item_prompt: item.prompt,
        user_id: r.user_id,
        comment: c,
      });
    });

    // Sắp xếp: theo item_prompt, rồi theo user
    comments.sort((a, b) => {
      if (a.item_prompt !== b.item_prompt) {
        return a.item_prompt.localeCompare(b.item_prompt);
      }
      return (a.user_id || '').localeCompare(b.user_id || '');
    });

    return NextResponse.json({
      comments,
      total_responses_filtered: comments.length,
      total_responses_all: allResponses.length,
      cohort_code,
    });
  } catch (e: any) {
    console.error('Error in /api/admin/comments/raw:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
