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
  N: number; // N của vòng (số người tham gia vòng đó trong cohort đã chọn)
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
  if (Array.isArray((obj as any).choices)) {
    return (obj as any).choices.map((x: any) => String(x));
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

  if (Array.isArray((obj as any).choices)) {
    return (obj as any).choices.map((x: any) => String(x));
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

  // cắt ngưỡng (meta thôi, FE dùng)
  const cutOffConsensus = typeof body.cut_off === 'number' ? body.cut_off : 70;
  const cutOffNonEssential =
    typeof body.cut_off_nonessential === 'number'
      ? body.cut_off_nonessential
      : 30;

  // lọc theo đối tượng (cohort)
  const cohortCode: string | null =
    typeof body.cohort_code === 'string' && body.cohort_code.trim() !== ''
      ? body.cohort_code.trim()
      : null;

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

    // 3. Lấy items cho các round đã chọn – có phân trang + order ổn định
    const PAGE_ITEMS = 1000;
    let allItems: DBItem[] = [];
    let fromItems = 0;

    while (true) {
      const { data, error } = await s
        .from('items')
        .select('id, round_id, project_id, prompt, options_json, item_order')
        .in('round_id', round_ids)
        .order('round_id', { ascending: true })
        .order('item_order', { ascending: true, nullsFirst: true })
        .order('id', { ascending: true })
        .range(fromItems, fromItems + PAGE_ITEMS - 1);

      if (error) {
        throw new Error('Lỗi truy vấn items: ' + error.message);
      }

      if (!data || data.length === 0) break;

      allItems = allItems.concat(data as unknown as DBItem[]);

      if (data.length < PAGE_ITEMS) break;
      fromItems += PAGE_ITEMS;
    }

    // 4. Lấy responses (chỉ bản đã nộp) – có phân trang + order ổn định
    const PAGE_RESP = 1000;
    let allResponses: DBResponse[] = [];
    let fromResp = 0;

    while (true) {
      const { data, error } = await s
        .from('responses')
        .select('round_id, item_id, user_id, answer_json, is_submitted')
        .in('round_id', round_ids)
        .eq('is_submitted', true)
        .order('round_id', { ascending: true })
        .order('item_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(fromResp, fromResp + PAGE_RESP - 1);

      if (error) {
        throw new Error('Lỗi truy vấn responses: ' + error.message);
      }

      if (!data || data.length === 0) break;

      allResponses = allResponses.concat(data as unknown as DBResponse[]);

      if (data.length < PAGE_RESP) break;
      fromResp += PAGE_RESP;
    }

    // 4b. Nếu có lọc cohort, giới hạn responses theo cohort_code của profile
    let respList: DBResponse[] = allResponses;

    if (cohortCode) {
      const userIds = Array.from(new Set(respList.map((r) => r.user_id)));

      if (userIds.length > 0) {
        const { data: profiles, error: profErr } = await s
          .from('profiles')
          .select('id, cohort_code')
          .in('id', userIds);

        if (profErr) {
          throw new Error('Lỗi truy vấn profiles: ' + profErr.message);
        }

        const cohortMap = new Map<string, string | null>();
        (profiles || []).forEach((p: any) => {
          cohortMap.set(p.id, p.cohort_code ?? null);
        });

        respList = respList.filter(
          (r) => cohortMap.get(r.user_id) === cohortCode
        );
      } else {
        respList = [];
      }
    }

    // 5. Group responses theo (round_id, item_id)
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

    // 5b. Group participants theo round (sau khi đã lọc cohort)
    const roundParticipantMap = new Map<string, Set<string>>();
    for (const r of respList) {
      let set = roundParticipantMap.get(r.round_id);
      if (!set) {
        set = new Set<string>();
        roundParticipantMap.set(r.round_id, set);
      }
      set.add(r.user_id);
    }

    // 6. Tính toán cho từng item
    const rows: AnalysisRow[] = [];

    for (const item of allItems) {
      if (!item.round_id) continue;

      const round = roundMap.get(item.round_id);
      if (!round) continue;

      const project = projectMap.get(round.project_id);
      if (!project) continue;

      const optionLabels = extractOptionLabels(item.options_json);
      if (!optionLabels.length) {
        // câu này không có danh sách option chuẩn → bỏ qua
        continue;
      }

      // N_round: số người (distinct user_id) thuộc cohort (nếu có lọc)
      // đã nộp trong vòng này
      const roundParticipants = roundParticipantMap.get(item.round_id) || new Set<string>();
      const N_round = roundParticipants.size;
      if (N_round === 0) {
        // không ai trong cohort tham gia vòng này → bỏ qua item
        continue;
      }

      const key = `${item.round_id}:${item.id}`;
      const respForItem = itemRespMap.get(key) || [];

      // Đếm số người (trong cohort) chọn từng option
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

      // Tính % cho từng option, chia cho N_round (tổng người tham gia vòng)
      const options: AnalysisOption[] = optionLabels.map((label) => {
        const c = counts.get(label) || 0;
        const percent = N_round > 0 ? (c / N_round) * 100 : 0;
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
        N: N_round,
        options,
        nonEssentialPercent,
      });
    }

    // 7. Sort: project_title → round_number → full_prompt
    rows.sort((a, b) => {
      if (a.project_title !== b.project_title) {
        return a.project_title.localeCompare(b.project_title);
      }
      const ra = roundMap.get(a.round_id);
      const rb = roundMap.get(b.round_id);
      if (ra && rb && ra.round_number !== rb.round_number) {
        return ra.round_number - rb.round_number;
      }
      return a.full_prompt.localeCompare(b.full_prompt);
    });

    return NextResponse.json({
      rows,
      meta: {
        cutOffConsensus,
        cutOffNonEssential,
        round_count: round_ids.length,
        cohort_code: cohortCode,
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
