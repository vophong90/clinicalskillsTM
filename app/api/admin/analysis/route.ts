// app/api/admin/analysis/route.ts
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
  round_id: string | null;
  project_id: string;
  prompt: string;
  options_json: any;
  item_order: number | null;
};

type DBResponse = {
  round_id: string;
  item_id: string;
  user_id: string;
  answer_json: any;
};

type AnalysisOption = {
  option_label: string;
  percent: number; // 0–100
};

type AnalysisRow = {
  project_id: string;
  project_title: string;
  round_id: string;
  round_label: string;
  item_id: string;
  full_prompt: string;
  N: number;
  options: AnalysisOption[];
  nonEssentialPercent: number;
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

// lấy danh sách label option từ options_json
function extractOptionLabels(options_json: any): string[] {
  const obj = safeParseJSON(options_json) ?? options_json;
  if (!obj) return [];

  // dạng {choices: [...]}
  if (Array.isArray(obj.choices)) {
    return obj.choices.map((x: any) => String(x));
  }

  // fallback: nếu bản thân là array
  if (Array.isArray(obj)) {
    return obj.map((x: any) => String(x));
  }

  return [];
}

// lấy danh sách label mà user đã chọn từ answer_json
function extractAnswerChoices(answer_json: any): string[] {
  const obj = safeParseJSON(answer_json) ?? answer_json;
  if (!obj) return [];

  if (Array.isArray(obj.choices)) {
    return obj.choices.map((x: any) => String(x));
  }

  if (Array.isArray(obj)) {
    return obj.map((x: any) => String(x));
  }

  return [];
}

export async function POST(req: NextRequest) {
  const s = getAdminClient();

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Body phải là JSON' },
      { status: 400 }
    );
  }

  const round_ids: string[] = Array.isArray(body.round_ids) ? body.round_ids : [];
  if (!round_ids.length) {
    return NextResponse.json(
      { error: 'round_ids[] là bắt buộc' },
      { status: 400 }
    );
  }

  // có thể dùng nhưng thực ra không cần cho việc tính toán, FE tự tô đỏ
  const cutOffConsensus = typeof body.cut_off === 'number' ? body.cut_off : 70;
  const cutOffNonEssential =
    typeof body.cut_off_nonessential === 'number' ? body.cut_off_nonessential : 30;

  try {
    // 1. Lấy rounds
    const { data: rounds, error: roundsErr } = await s
      .from('rounds')
      .select('id, project_id, round_number')
      .in('id', round_ids);

    if (roundsErr) {
      throw new Error('Lỗi truy vấn rounds: ' + roundsErr.message);
    }

    if (!rounds || !rounds.length) {
      return NextResponse.json({ rows: [] });
    }

    const roundMap = new Map<string, DBRound>();
    const projectIds = new Set<string>();
    for (const r of rounds as DBRound[]) {
      roundMap.set(r.id, r);
      projectIds.add(r.project_id);
    }

    // 2. Lấy projects
    const { data: projects, error: projErr } = await s
      .from('projects')
      .select('id, title')
      .in('id', Array.from(projectIds));

    if (projErr) {
      throw new Error('Lỗi truy vấn projects: ' + projErr.message);
    }

    const projectMap = new Map<string, DBProject>();
    (projects as DBProject[] | null)?.forEach((p) => {
      projectMap.set(p.id, p);
    });

    // 3. Lấy items cho các round đã chọn
    const { data: items, error: itemsErr } = await s
      .from('items')
      .select('id, round_id, project_id, prompt, options_json, item_order')
      .in('round_id', round_ids);

    if (itemsErr) {
      throw new Error('Lỗi truy vấn items: ' + itemsErr.message);
    }

    // 4. Lấy responses (chỉ của bản đã nộp cuối)
    const { data: responses, error: respErr } = await s
      .from('responses')
      .select('round_id, item_id, user_id, answer_json, is_submitted')
      .in('round_id', round_ids)
      .eq('is_submitted', true);

    if (respErr) {
      throw new Error('Lỗi truy vấn responses: ' + respErr.message);
    }

    const respList = (responses || []) as DBResponse[];

    // 5. Map: round_id → set user_id (để tính N theo vòng)
    const roundParticipants = new Map<string, Set<string>>();
    for (const r of respList) {
      let set = roundParticipants.get(r.round_id);
      if (!set) {
        set = new Set<string>();
        roundParticipants.set(r.round_id, set);
      }
      set.add(r.user_id);
    }

    // 6. Group responses theo (round_id, item_id)
    const itemRespMap = new Map<string, DBResponse[]>();
    for (const r of respList) {
      const key = `${r.round_id}:${r.item_id}`;
      let arr = itemRespMap.get(key);
      if (!arr) {
        arr = [];
        itemRespMap.set(key, arr);
      }
      arr.push(r);
    }

    // 7. Tính toán cho từng item
    const rows: AnalysisRow[] = [];

    for (const item of (items || []) as DBItem[]) {
      if (!item.round_id) continue;
      const round = roundMap.get(item.round_id);
      if (!round) continue;

      const project = projectMap.get(round.project_id);
      if (!project) continue;

      const participants = roundParticipants.get(item.round_id);
      const N = participants ? participants.size : 0;
      if (N === 0) {
        // không ai tham gia vòng này → skip hoặc vẫn thêm với N=0 và % = 0
        continue;
      }

      const optionLabels = extractOptionLabels(item.options_json);
      if (!optionLabels.length) {
        // câu này không có danh sách option chuẩn → bỏ qua
        continue;
      }

      const key = `${item.round_id}:${item.id}`;
      const respForItem = itemRespMap.get(key) || [];

      // Đếm số người chọn từng option
      const counts = new Map<string, number>();
        for (const label of optionLabels) {
        counts.set(label, 0);
        }

        for (const r of respForItem) {
    const choices = extractAnswerChoices(r.answer_json);
    const uniqChoices = new Set(choices);

    uniqChoices.forEach((label) => {
      if (!counts.has(label)) return;
      counts.set(label, (counts.get(label) || 0) + 1);
      });
    }
      
      // Tính % cho từng option
      const options: AnalysisOption[] = optionLabels.map((label) => {
        const c = counts.get(label) || 0;
        const percent = N > 0 ? (c / N) * 100 : 0;
        return { option_label: label, percent };
      });

      // Xác định % "Không thiết yếu"
      const nonEssentialLabel =
        optionLabels.find((l) =>
          l.toLowerCase().includes('không thiết yếu')
        ) ?? null;

      let nonEssentialPercent = 0;
      if (nonEssentialLabel) {
        const optNE = options.find(
          (o) => o.option_label === nonEssentialLabel
        );
        if (optNE) {
          nonEssentialPercent = optNE.percent;
        }
      }

      rows.push({
        project_id: round.project_id,
        project_title: project.title,
        round_id: item.round_id,
        round_label: `Vòng ${round.round_number}`,
        item_id: item.id,
        full_prompt: item.prompt,
        N,
        options,
        nonEssentialPercent,
      });
    }

    // 8. Sort cho đẹp: theo project_title → round_number → item_order → prompt
    rows.sort((a, b) => {
      if (a.project_title !== b.project_title) {
        return a.project_title.localeCompare(b.project_title);
      }
      const ra = roundMap.get(a.round_id);
      const rb = roundMap.get(b.round_id);
      if (ra && rb && ra.round_number !== rb.round_number) {
        return ra.round_number - rb.round_number;
      }
      // item_order không có trong AnalysisRow, nên thôi sort theo full_prompt
      return a.full_prompt.localeCompare(b.full_prompt);
    });

    return NextResponse.json({
      rows,
      meta: {
        cutOffConsensus,
        cutOffNonEssential,
        round_count: round_ids.length,
      },
    });
  } catch (e: any) {
    console.error('Error in /api/admin/analysis:', e);
    return NextResponse.json(
      { error: e.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
