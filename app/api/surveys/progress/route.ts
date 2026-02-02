// File: app/api/surveys/progress/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusFilter = "all" | "submitted" | "not_submitted";

function parseStatus(x: string | null): StatusFilter {
  if (x === "submitted" || x === "not_submitted") return x;
  return "all";
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET(req: NextRequest) {
  try {
    const s = getAdminClient();

    const url = new URL(req.url);
    const project_id = url.searchParams.get("project_id");
    const round_id = url.searchParams.get("round_id");
    const status = parseStatus(url.searchParams.get("status"));
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    // ===== 0) require project_id OR round_id =====
    if (!project_id && !round_id) {
      return NextResponse.json({ items: [], error: null }, { status: 200 });
    }

    // ===== 1) resolve roundIds =====
    let roundIds: string[] = [];
    if (round_id) {
      roundIds = [round_id];
    } else if (project_id) {
      const { data: rds, error: er } = await s
        .from("rounds")
        .select("id")
        .eq("project_id", project_id);

      if (er) return NextResponse.json({ error: er.message }, { status: 500 });
      roundIds = (rds || []).map((x: any) => x.id);
    }

    if (roundIds.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    // ===== 2) load round meta =====
    const { data: roundMeta, error: erm } = await s
      .from("rounds")
      .select("id, project_id, round_number")
      .in("id", roundIds);

    if (erm) return NextResponse.json({ error: erm.message }, { status: 500 });

    const roundMetaMap = new Map<
      string,
      { project_id: string; round_number: number }
    >();
    const projectIds = new Set<string>();

    (roundMeta || []).forEach((r: any) => {
      roundMetaMap.set(r.id, {
        project_id: r.project_id,
        round_number: r.round_number ?? 0,
      });
      if (r.project_id) projectIds.add(r.project_id);
    });

    // ===== 3) load project title =====
    const { data: proj, error: ep } = await s
      .from("projects")
      .select("id, title")
      .in("id", Array.from(projectIds));

    if (ep) return NextResponse.json({ error: ep.message }, { status: 500 });

    const projTitleMap = new Map<string, string>();
    (proj || []).forEach((p: any) => projTitleMap.set(p.id, p.title || ""));

    // ===== 4) total items per round =====
    // items schema: has round_id nullable; we count items by round_id
    const { data: its, error: eit } = await s
      .from("items")
      .select("id, round_id")
      .in("round_id", roundIds);

    if (eit) return NextResponse.json({ error: eit.message }, { status: 500 });

    const totalItemsByRound = new Map<string, number>();
    (its || []).forEach((it: any) => {
      const rid = it.round_id as string;
      if (!rid) return;
      totalItemsByRound.set(rid, (totalItemsByRound.get(rid) || 0) + 1);
    });

    // ===== 5) participants =====
    const { data: parts, error: erp } = await s
      .from("round_participants")
      .select("round_id, user_id")
      .in("round_id", roundIds);

    if (erp) return NextResponse.json({ error: erp.message }, { status: 500 });

    const participantRows = parts || [];
    if (participantRows.length === 0) {
      return NextResponse.json({ items: [] }, { status: 200 });
    }

    const userIds = Array.from(
      new Set(participantRows.map((x: any) => x.user_id).filter(Boolean))
    );

    // ===== 6) load profiles (name/email) =====
    // Supabase has IN limit; chunk to be safe
    const profMap = new Map<string, { name: string; email: string }>();

    for (const batch of chunk(userIds, 500)) {
      const { data: profs, error: epr } = await s
        .from("profiles")
        .select("id, name, email")
        .in("id", batch);

      if (epr) return NextResponse.json({ error: epr.message }, { status: 500 });

      (profs || []).forEach((u: any) => {
        profMap.set(u.id, { name: u.name || "", email: u.email || "" });
      });
    }

    // ===== 7) responses aggregate: submitted_items + last_updated =====
    // responses unique (round_id, item_id, user_id)
    type Agg = { submitted_items: number; last_updated_at: string | null };

    const agg = new Map<string, Agg>(); // key = `${round_id}::${user_id}`

    // Query responses by round_id + user_id (chunk userIds)
    for (const uBatch of chunk(userIds, 500)) {
      const { data: resp, error: ers } = await s
        .from("responses")
        .select("round_id, user_id, is_submitted, updated_at")
        .in("round_id", roundIds)
        .in("user_id", uBatch);

      if (ers) return NextResponse.json({ error: ers.message }, { status: 500 });

      (resp || []).forEach((r: any) => {
        const rid = r.round_id as string;
        const uid = r.user_id as string;
        if (!rid || !uid) return;

        const key = `${rid}::${uid}`;
        const cur = agg.get(key) || { submitted_items: 0, last_updated_at: null };

        if (r.is_submitted) cur.submitted_items += 1;

        const t = r.updated_at ? new Date(r.updated_at).toISOString() : null;
        if (t) {
          if (!cur.last_updated_at) cur.last_updated_at = t;
          else if (
            new Date(t).getTime() > new Date(cur.last_updated_at).getTime()
          ) {
            cur.last_updated_at = t;
          }
        }

        agg.set(key, cur);
      });
    }

    // ===== 8) build output items: 1 row / 1 participant / 1 round =====
    const items = participantRows.map((p: any) => {
      const rid = p.round_id as string;
      const uid = p.user_id as string;

      const meta = roundMetaMap.get(rid);
      const pid = meta?.project_id || "";
      const roundNo = meta?.round_number || 0;
      const projectTitle = projTitleMap.get(pid) || "";

      const u = profMap.get(uid) || { name: "", email: "" };

      const total = totalItemsByRound.get(rid) || 0;
      const a = agg.get(`${rid}::${uid}`) || { submitted_items: 0, last_updated_at: null };

      // DONE = submitted_items >= total_items, nhưng total_items phải > 0
      const done = total > 0 && a.submitted_items >= total;

      return {
        user_id: uid,
        user_name: u.name,
        email: u.email,

        project_id: pid,
        project_title: projectTitle,

        round_id: rid,
        round_number: roundNo,

        is_submitted: done,
        updated_at: a.last_updated_at,

        // bonus for UI
        submitted_items: a.submitted_items,
        total_items: total,
      };
    });

    // ===== 9) server-side filters q/status =====
    let out = items;

    if (q) {
      out = out.filter((x: any) => {
        return (
          (x.user_name || "").toLowerCase().includes(q) ||
          (x.email || "").toLowerCase().includes(q)
        );
      });
    }

    if (status === "submitted") out = out.filter((x: any) => !!x.is_submitted);
    if (status === "not_submitted") out = out.filter((x: any) => !x.is_submitted);

    // sort: name/email
    out.sort((a: any, b: any) =>
      (a.user_name || a.email || "").localeCompare(b.user_name || b.email || "")
    );

    return NextResponse.json({ items: out }, { status: 200 });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
