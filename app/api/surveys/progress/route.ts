import { NextRequest, NextResponse } from "next/server";
import { getRouteClient } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusFilter = "all" | "submitted" | "not_submitted";

function pickStatus(x: string | null): StatusFilter {
  if (x === "submitted" || x === "not_submitted") return x;
  return "all";
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const project_id = url.searchParams.get("project_id");
    const round_id = url.searchParams.get("round_id");
    const status = pickStatus(url.searchParams.get("status"));
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    // 1) auth user (để chặn người ngoài)
    const supabase = await getRouteClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    }

    // 2) admin client (bypass RLS để aggregate)
    const admin = getSupabaseAdmin();

    // 3) xác định danh sách round cần xem
    let roundIds: string[] = [];

    if (round_id) {
      roundIds = [round_id];
    } else if (project_id) {
      const { data: rds, error: rErr } = await admin
        .from("rounds")
        .select("id")
        .eq("project_id", project_id);

      if (rErr) throw rErr;
      roundIds = (rds || []).map((x: any) => x.id);
    } else {
      return NextResponse.json(
        { items: [], note: "Thiếu project_id hoặc round_id." },
        { status: 200 }
      );
    }

    if (roundIds.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // 4) lấy meta round -> project + round_number
    const { data: roundMeta, error: rmErr } = await admin
      .from("rounds")
      .select("id, project_id, round_number")
      .in("id", roundIds);

    if (rmErr) throw rmErr;

    const roundMetaMap = new Map<string, { project_id: string; round_number: number }>();
    (roundMeta || []).forEach((r: any) => {
      roundMetaMap.set(r.id, { project_id: r.project_id, round_number: r.round_number });
    });

    const projectIds = Array.from(new Set((roundMeta || []).map((r: any) => r.project_id)));

    // 5) project titles
    const { data: projData, error: pErr } = await admin
      .from("projects")
      .select("id, title")
      .in("id", projectIds);

    if (pErr) throw pErr;

    const projTitleMap = new Map<string, string>();
    (projData || []).forEach((p: any) => projTitleMap.set(p.id, p.title));

    // 6) total items per round (để biết “hoàn tất”)
    const { data: itemsData, error: itErr } = await admin
      .from("items")
      .select("id, round_id")
      .in("round_id", roundIds);

    if (itErr) throw itErr;

    const totalItemsByRound = new Map<string, number>();
    (itemsData || []).forEach((it: any) => {
      const rid = it.round_id;
      totalItemsByRound.set(rid, (totalItemsByRound.get(rid) || 0) + 1);
    });

    // 7) participants (ai được mời trong round)
    const { data: parts, error: rpErr } = await admin
      .from("round_participants")
      .select("round_id, user_id")
      .in("round_id", roundIds);

    if (rpErr) throw rpErr;

    // 8) load profiles cho participants
    const userIds = Array.from(new Set((parts || []).map((x: any) => x.user_id)));
    const { data: profs, error: prErr } = await admin
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);

    if (prErr) throw prErr;

    const profMap = new Map<string, { name: string; email: string }>();
    (profs || []).forEach((u: any) => profMap.set(u.id, { name: u.name || "", email: u.email || "" }));

    // 9) responses: aggregate submitted count + last updated
    // NOTE: responses unique (round_id, item_id, user_id)
    const { data: resp, error: rsErr } = await admin
      .from("responses")
      .select("round_id, user_id, is_submitted, updated_at")
      .in("round_id", roundIds)
      .in("user_id", userIds);

    if (rsErr) throw rsErr;

    type Agg = { submitted_items: number; last_updated_at: string | null };
    const agg = new Map<string, Agg>(); // key = `${round_id}::${user_id}`

    (resp || []).forEach((r: any) => {
      const key = `${r.round_id}::${r.user_id}`;
      const cur = agg.get(key) || { submitted_items: 0, last_updated_at: null };

      if (r.is_submitted) cur.submitted_items += 1;

      const t = r.updated_at ? new Date(r.updated_at).toISOString() : null;
      if (t) {
        if (!cur.last_updated_at) cur.last_updated_at = t;
        else if (new Date(t).getTime() > new Date(cur.last_updated_at).getTime()) cur.last_updated_at = t;
      }

      agg.set(key, cur);
    });

    // 10) build rows
    const items = (parts || []).map((p: any) => {
      const rid = p.round_id as string;
      const uid = p.user_id as string;

      const meta = roundMetaMap.get(rid);
      const total = totalItemsByRound.get(rid) || 0;

      const a = agg.get(`${rid}::${uid}`) || { submitted_items: 0, last_updated_at: null };
      const done = total > 0 && a.submitted_items >= total;

      const u = profMap.get(uid) || { name: "", email: "" };
      const projectId = meta?.project_id || "";
      const projectTitle = projTitleMap.get(projectId) || "";

      return {
        user_id: uid,
        user_name: u.name,
        email: u.email,
        project_id: projectId,
        project_title: projectTitle,
        round_id: rid,
        round_number: meta?.round_number || 0,
        is_submitted: done,
        updated_at: a.last_updated_at,
        // bonus for UI
        submitted_items: a.submitted_items,
        total_items: total,
      };
    });

    // 11) server-side filter q/status
    let out = items;

    if (q) {
      out = out.filter((x: any) => {
        return (
          (x.user_name || "").toLowerCase().includes(q) ||
          (x.email || "").toLowerCase().includes(q) ||
          (x.project_title || "").toLowerCase().includes(q)
        );
      });
    }

    if (status === "submitted") out = out.filter((x: any) => !!x.is_submitted);
    if (status === "not_submitted") out = out.filter((x: any) => !x.is_submitted);

    // sort: round desc then name
    out.sort((a: any, b: any) => {
      if ((b.round_number || 0) !== (a.round_number || 0)) return (b.round_number || 0) - (a.round_number || 0);
      return (a.user_name || a.email || "").localeCompare(b.user_name || b.email || "");
    });

    return NextResponse.json({ items: out }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
