'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Papa from 'papaparse';

type Item = {
  id: string;
  round_id: string | null;
  project_id: string;
  prompt: string;
  type: string;
  options_json: any; // jsonb
  code: string | null;
  item_order?: number | null;
  original_item_id?: string | null;
};

type Round = {
  id: string;
  round_number: number;
  project_id: string;
  status?: string;
};

type Project = { id: string; title: string };

type SortKey = 'item_order' | 'prompt' | 'code' | 'project' | 'round' | 'type';

type CsvRow = {
  code?: string;
  prompt?: string;
  type?: string;
  option_json?: any; // string JSON
  item_order?: string | number;
};

function safeTrim(v: any) {
  return (v ?? '').toString().trim();
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function normalizeText(s: string) {
  return (s ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesLoose(haystack: string, needle: string) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return true;
  return h.includes(n) || h.includes('(' + n);
}

function truncate(s: string, max = 180) {
  const t = (s ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

/** ===== Searchable Project Combobox ===== */
function ProjectCombobox({
  projects,
  valueId,
  onChange,
  placeholder = 'Gõ để tìm project…',
  disabled = false,
  className = 'min-w-72',
}: {
  projects: Project[];
  valueId: string;
  onChange: (nextId: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => projects.find((p) => p.id === valueId) ?? null, [projects, valueId]);

  useEffect(() => {
    // khi valueId đổi (chọn từ ngoài), set lại text theo title
    if (selected) setQuery(selected.title);
    if (!valueId) setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueId]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return projects.slice(0, 30);
    return projects.filter((p) => includesLoose(p.title, q)).slice(0, 30);
  }, [projects, query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as any)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <input
          disabled={disabled}
          className="border p-2 rounded w-full"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
            // nếu user gõ khác title đã chọn => coi như chưa chọn
            if (valueId) onChange('');
          }}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="px-2 py-2 rounded border bg-white hover:bg-gray-50 disabled:opacity-50"
          disabled={disabled || (!valueId && !query)}
          title="Xóa chọn"
          onClick={() => {
            setQuery('');
            onChange('');
            setOpen(false);
          }}
        >
          ✕
        </button>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded border bg-white shadow max-h-72 overflow-auto">
          {filtered.length === 0 ? (
            <div className="p-2 text-sm text-gray-500">Không có project phù hợp.</div>
          ) : (
            filtered.map((p) => {
              const active = p.id === valueId;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                    active ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => {
                    onChange(p.id);
                    setQuery(p.title);
                    setOpen(false);
                  }}
                >
                  {p.title}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminItemManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>(''); // filter
  const [roundId, setRoundId] = useState<string>(''); // filter
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // sorting
  const [sortBy, setSortBy] = useState<SortKey>('item_order');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // pagination (items)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState<number>(1);

  // CSV import states
  const [csvProjectId, setCsvProjectId] = useState<string>('');
  const [csvRoundId, setCsvRoundId] = useState<string>('');
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvPreviewMsg, setCsvPreviewMsg] = useState<string>('');
  const [csvParsedCount, setCsvParsedCount] = useState<number>(0);
  const [csvValidCount, setCsvValidCount] = useState<number>(0);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvRowsToInsert, setCsvRowsToInsert] = useState<
    Array<{
      project_id: string;
      round_id: string | null;
      code: string | null;
      prompt: string;
      type: string;
      options_json: any | null;
      item_order: number | null;
    }>
  >([]);
  const [importingCsv, setImportingCsv] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editItemId, setEditItemId] = useState<string>('');
  const [editProjectId, setEditProjectId] = useState<string>('');
  const [editRoundId, setEditRoundId] = useState<string>('');
  const [editCode, setEditCode] = useState<string>('');
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [editType, setEditType] = useState<string>('likert');
  const [editItemOrder, setEditItemOrder] = useState<string>(''); // input text
  const [editOptionsJsonText, setEditOptionsJsonText] = useState<string>(''); // textarea JSON
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    void loadMasterData();
  }, []);

  useEffect(() => {
    void loadItems();
    setSelectedIds(new Set());
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, roundId]);

  async function loadMasterData() {
    setLoading(true);
    setMessage('');
    const [{ data: roundsData, error: rErr }, { data: projectsData, error: pErr }] = await Promise.all([
      supabase.from('rounds').select('id, round_number, project_id, status'),
      supabase.from('projects').select('id, title'),
    ]);
    if (rErr) setMessage((m) => (m ? m + ' | ' : '') + '❌ Lỗi load rounds: ' + rErr.message);
    if (pErr) setMessage((m) => (m ? m + ' | ' : '') + '❌ Lỗi load projects: ' + pErr.message);

    setRounds((roundsData as Round[]) ?? []);
    setProjects((projectsData as Project[]) ?? []);
    await loadItems();
    setLoading(false);
  }

  async function loadItems() {
    setLoading(true);
    setMessage('');
    let q = supabase
      .from('items')
      .select('id, round_id, project_id, prompt, type, options_json, code, item_order, original_item_id');

    if (projectId) q = q.eq('project_id', projectId);
    if (roundId) q = q.eq('round_id', roundId);

    const { data: itemsData, error } = await q;
    if (error) setMessage('❌ Lỗi khi load item: ' + error.message);
    setItems((itemsData as Item[]) ?? []);
    setLoading(false);
  }

  const filteredRounds = useMemo(
    () => (projectId ? rounds.filter((r) => r.project_id === projectId) : rounds),
    [rounds, projectId]
  );

  const filteredRoundsForCsv = useMemo(
    () => (csvProjectId ? rounds.filter((r) => r.project_id === csvProjectId) : rounds),
    [rounds, csvProjectId]
  );

  const filteredRoundsForEdit = useMemo(
    () => (editProjectId ? rounds.filter((r) => r.project_id === editProjectId) : rounds),
    [rounds, editProjectId]
  );

  function getProjectTitle(pid: string) {
    return projects.find((p) => p.id === pid)?.title ?? '';
  }
  function getRoundNumber(rid: string | null) {
    if (!rid) return undefined;
    const r = rounds.find((rr) => rr.id === rid);
    return r?.round_number ?? undefined;
  }

  const sortedItems = useMemo(() => {
    const arr = items.slice();
    arr.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;

      switch (sortBy) {
        case 'item_order':
          av = a.item_order ?? 0;
          bv = b.item_order ?? 0;
          break;
        case 'prompt':
          av = (a.prompt ?? '').toLowerCase();
          bv = (b.prompt ?? '').toLowerCase();
          break;
        case 'code':
          av = (a.code ?? '').toLowerCase();
          bv = (b.code ?? '').toLowerCase();
          break;
        case 'project':
          av = getProjectTitle(a.project_id).toLowerCase();
          bv = getProjectTitle(b.project_id).toLowerCase();
          break;
        case 'round':
          av = getRoundNumber(a.round_id) ?? 0;
          bv = getRoundNumber(b.round_id) ?? 0;
          break;
        case 'type':
          av = (a.type ?? '').toLowerCase();
          bv = (b.type ?? '').toLowerCase();
          break;
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return a.id.localeCompare(b.id);
    });
    return arr;
  }, [items, sortBy, sortDir, projects, rounds]);

  // pagination slice
  const totalItems = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const visibleItems = useMemo(() => {
    const start = (pageSafe - 1) * PAGE_SIZE;
    return sortedItems.slice(start, start + PAGE_SIZE);
  }, [sortedItems, pageSafe]);

  useEffect(() => {
    if (page !== pageSafe) setPage(pageSafe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((i) => selectedIds.has(i.id));

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const ids = visibleItems.map((i) => i.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function bulkDeleteSelected() {
    if (selectedIds.size === 0) return;
    const confirm = window.confirm(`Bạn chắc chắn muốn xóa ${selectedIds.size} item đã chọn?`);
    if (!confirm) return;

    setLoading(true);
    setMessage('');
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('items').delete().in('id', ids);
    if (error) setMessage('❌ Lỗi khi xóa: ' + error.message);
    else {
      setMessage(`🗑️ Đã xóa ${ids.length} item.`);
      setSelectedIds(new Set());
      await loadItems();
    }
    setLoading(false);
  }

  function findNextRoundForItem(item: Item): Round | undefined {
    const current = rounds.find((r) => r.id === item.round_id);
    if (!current) return undefined;
    return rounds
      .filter((r) => r.project_id === current.project_id && r.round_number > current.round_number)
      .sort((a, b) => a.round_number - b.round_number)[0];
  }

  async function bulkCloneToNextRound() {
    if (selectedIds.size === 0) return;

    const confirm = window.confirm(`Chuyển ${selectedIds.size} item đã chọn sang vòng kế tiếp (theo từng project)?`);
    if (!confirm) return;

    setLoading(true);
    setMessage('');
    const ids = Array.from(selectedIds);
    const selectedItems = sortedItems.filter((i) => ids.includes(i.id));

    let ok = 0;
    const noNext: string[] = [];
    const errs: string[] = [];

    for (const item of selectedItems) {
      const next = findNextRoundForItem(item);
      if (!next) {
        noNext.push(item.code || item.id);
        continue;
      }

      const { count, error: cntErr } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('round_id', next.id);

      if (cntErr) {
        errs.push(`${item.code || item.id}: ${cntErr.message}`);
        continue;
      }
      const nextOrder = (count ?? 0) + 1;

      const { error } = await supabase.from('items').insert([
        {
          id: crypto.randomUUID(),
          round_id: next.id,
          project_id: next.project_id,
          prompt: item.prompt,
          type: item.type,
          options_json: item.options_json,
          code: item.code,
          item_order: nextOrder,
          original_item_id: item.original_item_id || item.id,
        },
      ]);

      if (error) errs.push(`${item.code || item.id}: ${error.message}`);
      else ok += 1;
    }

    let msg = `➡️ Đã chuyển ${ok}/${ids.length} item sang vòng kế tiếp.`;
    if (noNext.length) msg += ` Không có vòng kế tiếp: ${noNext.join(', ')}.`;
    if (errs.length) msg += ` Lỗi: ${errs.join(' | ')}.`;
    setMessage(msg);

    await loadItems();
    setSelectedIds(new Set());
    setLoading(false);
  }

  // ===== CSV import (PapaParse) =====
  function resetCsvState() {
    setCsvFileName('');
    setCsvPreviewMsg('');
    setCsvParsedCount(0);
    setCsvValidCount(0);
    setCsvErrors([]);
    setCsvRowsToInsert([]);
  }

  async function handlePickCsvFile(file: File | null) {
    resetCsvState();
    if (!file) return;

    setCsvFileName(file.name);
    if (!csvProjectId) {
      setCsvPreviewMsg('❌ Vui lòng chọn Project trước khi đọc CSV.');
      return;
    }
    if (!csvRoundId) {
      setCsvPreviewMsg('❌ Vui lòng chọn Round trước khi đọc CSV.');
      return;
    }

    const text = await file.text();

    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      // PapaParse sẽ handle dấu phẩy trong prompt nếu CSV đúng chuẩn (quote)
    });

    if (parsed.errors?.length) {
      const errList = parsed.errors.slice(0, 20).map((e) => `CSV parse error: ${e.message} (row ${e.row})`);
      setCsvPreviewMsg(`❌ CSV không hợp lệ (PapaParse).`);
      setCsvErrors(errList);
      return;
    }

    const rows = (parsed.data ?? []).filter((r) => r && Object.keys(r).length > 0);
    setCsvParsedCount(rows.length);

    const errs: string[] = [];
    const toInsert: Array<{
      project_id: string;
      round_id: string | null;
      code: string | null;
      prompt: string;
      type: string;
      options_json: any | null;
      item_order: number | null;
    }> = [];

    rows.forEach((r, idx) => {
      const lineNo = idx + 2;
      const code = safeTrim((r as any).code);
      const prompt = safeTrim((r as any).prompt);
      const type = safeTrim((r as any).type) || 'likert';
      const option_json_raw = (r as any).option_json;
      const item_order_raw = (r as any).item_order;

      if (!prompt) {
        errs.push(`Dòng ~${lineNo}: thiếu prompt`);
        return;
      }

      let options_json: any | null = null;
      const optStr = typeof option_json_raw === 'string' ? option_json_raw.trim() : safeTrim(option_json_raw);
      if (optStr) {
        try {
          options_json = JSON.parse(optStr);
        } catch {
          errs.push(`Dòng ~${lineNo}: option_json không phải JSON hợp lệ`);
          return;
        }
      }

      let item_order: number | null = null;
      const ordStr = typeof item_order_raw === 'string' ? item_order_raw.trim() : safeTrim(item_order_raw);
      if (ordStr) {
        const n = Number(ordStr);
        if (!Number.isFinite(n)) {
          errs.push(`Dòng ~${lineNo}: item_order không hợp lệ`);
          return;
        }
        item_order = Math.trunc(n);
      }

      toInsert.push({
        project_id: csvProjectId,
        round_id: csvRoundId || null,
        code: code || null,
        prompt,
        type,
        options_json,
        item_order,
      });
    });

    setCsvValidCount(toInsert.length);
    setCsvErrors(errs);
    setCsvRowsToInsert(toInsert);

    if (errs.length) setCsvPreviewMsg(`⚠️ Đọc ${rows.length} dòng. Hợp lệ: ${toInsert.length}. Lỗi: ${errs.length}.`);
    else setCsvPreviewMsg(`✅ Đọc ${rows.length} dòng. Hợp lệ: ${toInsert.length}.`);
  }

  async function importItemsFromCsv() {
    setMessage('');
    if (!csvProjectId) return setMessage('❌ Bạn chưa chọn Project cho CSV.');
    if (!csvRoundId) return setMessage('❌ Bạn chưa chọn Round cho CSV.');
    if (csvRowsToInsert.length === 0) return setMessage('❌ Không có dòng hợp lệ để import.');
    if (csvErrors.length) return setMessage('❌ CSV còn lỗi, hãy sửa CSV trước khi import.');

    const confirm = window.confirm(`Import ${csvRowsToInsert.length} item vào Project/Round đã chọn?`);
    if (!confirm) return;

    setImportingCsv(true);
    try {
      const BATCH = 200;
      let ok = 0;
      const errs: string[] = [];

      for (const part of chunkArray(csvRowsToInsert, BATCH)) {
        const payload = part.map((row) => ({
          id: crypto.randomUUID(),
          project_id: row.project_id,
          round_id: row.round_id,
          code: row.code,
          prompt: row.prompt,
          type: row.type,
          options_json: row.options_json,
          item_order: row.item_order,
        }));

        const { error } = await supabase.from('items').insert(payload);
        if (error) errs.push(error.message);
        else ok += payload.length;
      }

      let msg = `✅ Import xong: ${ok}/${csvRowsToInsert.length} item.`;
      if (errs.length) msg += ` Lỗi: ${errs.join(' | ')}`;
      setMessage(msg);

      await loadItems();
      resetCsvState();
    } catch (e: any) {
      setMessage('❌ Lỗi khi import CSV: ' + (e?.message ?? 'Unknown'));
    } finally {
      setImportingCsv(false);
    }
  }

  // ===== edit / delete one item =====
  function openEditModal(item: Item) {
    setEditItemId(item.id);
    setEditProjectId(item.project_id);
    setEditRoundId(item.round_id ?? '');
    setEditCode(item.code ?? '');
    setEditPrompt(item.prompt ?? '');
    setEditType(item.type ?? 'likert');
    setEditItemOrder(item.item_order == null ? '' : String(item.item_order));

    try {
      setEditOptionsJsonText(item.options_json == null ? '' : JSON.stringify(item.options_json, null, 2));
    } catch {
      setEditOptionsJsonText('');
    }

    setEditOpen(true);
  }

  function closeEditModal() {
    setEditOpen(false);
    setEditItemId('');
    setEditProjectId('');
    setEditRoundId('');
    setEditCode('');
    setEditPrompt('');
    setEditType('likert');
    setEditItemOrder('');
    setEditOptionsJsonText('');
    setSavingEdit(false);
  }

  async function saveEdit() {
    if (!editItemId) return;
    if (!editPrompt.trim()) {
      setMessage('❌ prompt không được trống.');
      return;
    }

    let options_json: any = null;
    const raw = editOptionsJsonText.trim();
    if (raw) {
      try {
        options_json = JSON.parse(raw);
      } catch {
        setMessage('❌ options_json không phải JSON hợp lệ.');
        return;
      }
    }

    let item_order: number | null = null;
    const ord = editItemOrder.trim();
    if (ord) {
      const n = Number(ord);
      if (!Number.isFinite(n)) {
        setMessage('❌ item_order không hợp lệ.');
        return;
      }
      item_order = Math.trunc(n);
    }

    setSavingEdit(true);
    setMessage('');

    const updatePayload: any = {
      code: editCode.trim() ? editCode.trim() : null,
      prompt: editPrompt,
      type: editType,
      options_json,
      item_order,
      project_id: editProjectId,
      round_id: editRoundId ? editRoundId : null,
    };

    const { error } = await supabase.from('items').update(updatePayload).eq('id', editItemId);
    if (error) {
      setMessage('❌ Lỗi cập nhật item: ' + error.message);
      setSavingEdit(false);
      return;
    }

    setMessage('✅ Đã cập nhật item.');
    closeEditModal();
    await loadItems();
  }

  async function deleteOneItem(item: Item) {
    const label = item.code ? `${item.code}` : item.id;
    const confirm = window.confirm(`Bạn chắc chắn muốn xóa item: ${label}?`);
    if (!confirm) return;

    setLoading(true);
    setMessage('');

    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) setMessage('❌ Lỗi xóa item: ' + error.message);
    else setMessage('🗑️ Đã xóa item.');

    await loadItems();
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h2 className="text-xl font-bold mb-4">📝 Quản lý Item</h2>

      {message && (
        <div className="mb-3 text-sm rounded border p-2 bg-emerald-50 border-emerald-200 text-emerald-800">
          {message}
        </div>
      )}

      {/* ====== IMPORT CSV (TẠO ITEM) ====== */}
      <section className="mb-4 border rounded bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold">➕ Tạo item bằng CSV</h3>
            <p className="text-xs text-gray-600">
              CSV cột: <code>code,prompt,type,option_json,item_order</code>. Hỗ trợ prompt có dấu phẩy/ngoặc kép (PapaParse).
            </p>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
            onClick={resetCsvState}
          >
            Xóa dữ liệu CSV
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Chọn Project (gõ để tìm)</label>
            <ProjectCombobox
              projects={projects}
              valueId={csvProjectId}
              onChange={(nextId) => {
                setCsvProjectId(nextId);
                setCsvRoundId('');
                resetCsvState();
              }}
              placeholder="Gõ từ khóa project…"
              className="min-w-80"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Chọn Round</label>
            <select
              className="border p-2 rounded min-w-64"
              value={csvRoundId}
              onChange={(e) => {
                setCsvRoundId(e.target.value);
                resetCsvState();
              }}
              disabled={!csvProjectId}
            >
              <option value="">— Chọn Round —</option>
              {filteredRoundsForCsv
                .slice()
                .sort((a, b) => a.round_number - b.round_number)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {projects.find((p) => p.id === r.project_id)?.title ?? 'Project'} – Vòng {r.round_number}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Tải CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="border p-2 rounded"
              onChange={(e) => handlePickCsvFile(e.target.files?.[0] ?? null)}
              disabled={!csvProjectId || !csvRoundId}
            />
          </div>

          <button
            type="button"
            className="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
            onClick={importItemsFromCsv}
            disabled={importingCsv || csvRowsToInsert.length === 0 || !!csvErrors.length}
            title={csvErrors.length ? 'CSV còn lỗi, hãy sửa CSV trước khi import' : 'Import các dòng hợp lệ vào items'}
          >
            {importingCsv ? 'Đang import…' : `Import (${csvRowsToInsert.length})`}
          </button>
        </div>

        <div className="text-sm">
          {csvFileName && (
            <div className="text-xs text-gray-600">
              File: <span className="font-medium">{csvFileName}</span>
            </div>
          )}
          {csvPreviewMsg && <div className="mt-1">{csvPreviewMsg}</div>}
          {(csvParsedCount > 0 || csvValidCount > 0) && (
            <div className="mt-1 text-xs text-gray-600">
              Đã đọc: {csvParsedCount} dòng • Hợp lệ: {csvValidCount} dòng
            </div>
          )}
          {csvErrors.length > 0 && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-red-700">
              <div className="font-semibold text-sm mb-1">Lỗi CSV ({csvErrors.length}):</div>
              <ul className="list-disc pl-5 text-xs space-y-1">
                {csvErrors.slice(0, 20).map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
              {csvErrors.length > 20 && (
                <div className="text-xs mt-1 text-red-700">… còn {csvErrors.length - 20} lỗi nữa (giới hạn hiển thị 20).</div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* BỘ LỌC + MENU CHUNG */}
      <div className="mb-4 flex flex-wrap items-end gap-2 border p-3 rounded bg-gray-50">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Lọc theo Project (gõ để tìm)</label>
          <ProjectCombobox
            projects={projects}
            valueId={projectId}
            onChange={(nextId) => {
              setProjectId(nextId);
              setRoundId('');
            }}
            placeholder="Gõ từ khóa project để lọc…"
            className="min-w-80"
            disabled={loading}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Lọc theo Round</label>
          <select
            className="border p-2 rounded min-w-64"
            value={roundId}
            onChange={(e) => setRoundId(e.target.value)}
            disabled={!!projectId && filteredRounds.length === 0}
          >
            <option value="">— Lọc theo Vòng —</option>
            {filteredRounds
              .slice()
              .sort((a, b) => a.round_number - b.round_number)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {(projects.find((p) => p.id === r.project_id)?.title ?? 'Project')} – Vòng {r.round_number}
                </option>
              ))}
          </select>
        </div>

        <div className="flex-1" />

        {/* sort controls (giữ tối giản) */}
        <div className="flex items-center gap-2">
          <select
            className="border p-2 rounded"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            title="Sắp xếp theo"
          >
            <option value="item_order">Thứ tự</option>
            <option value="prompt">Prompt</option>
            <option value="code">Code</option>
            <option value="project">Project</option>
            <option value="round">Round</option>
            <option value="type">Type</option>
          </select>
          <button
            type="button"
            className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            title="Đổi chiều sắp xếp"
          >
            {sortDir === 'asc' ? '▲' : '▼'}
          </button>
        </div>

        <button
          className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
          onClick={bulkCloneToNextRound}
          disabled={selectedIds.size === 0 || loading}
          title="Chuyển các câu đã chọn sang vòng kế tiếp tương ứng"
        >
          ➡️ Chuyển sang vòng tiếp theo
        </button>

        <button
          className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-50"
          onClick={bulkDeleteSelected}
          disabled={selectedIds.size === 0 || loading}
          title="Xóa các câu đã chọn"
        >
          🗑️ Xóa đã chọn
        </button>
      </div>

      {/* PAGINATION BAR */}
      <div className="mb-2 flex items-center justify-between text-sm">
        <div className="text-gray-700">
          Tổng: <b>{totalItems}</b> • Trang <b>{pageSafe}</b>/<b>{totalPages}</b>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={pageSafe <= 1}
          >
            ◀ Trang trước
          </button>
          <button
            className="px-3 py-1 rounded border bg-white disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={pageSafe >= totalPages}
          >
            Trang sau ▶
          </button>
        </div>
      </div>

      {/* ===== LIST CARDS (mỗi item 1 card ngang) ===== */}
      <section className="space-y-2">
        {loading ? (
          <div>Đang tải...</div>
        ) : (
          <>
            {/* header row tối giản */}
            <div className="flex items-center gap-2 text-sm text-gray-700 border rounded bg-white p-2">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                aria-label="Chọn tất cả trang này"
              />
              <span>Chọn tất cả trên trang</span>
              <span className="ml-auto text-xs text-gray-500">Mỗi trang: {PAGE_SIZE} item</span>
            </div>

            {visibleItems.map((i) => {
              const round = rounds.find((r) => r.id === i.round_id);
              const project = projects.find((p) => p.id === i.project_id);

              return (
                <div key={i.id} className="border rounded bg-white p-3 flex items-start gap-3">
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(i.id)}
                      onChange={() => toggleSelectOne(i.id)}
                      aria-label={`Chọn ${i.code || i.id}`}
                    />
                  </div>

                  {/* left meta */}
                  <div className="w-56 shrink-0 text-sm">
                    <div className="font-semibold">
                      {i.code ? i.code : <span className="text-gray-500">(no code)</span>}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      <div>Order: <b>{i.item_order ?? '—'}</b></div>
                      <div>Type: <b>{i.type}</b></div>
                      <div className="mt-1">
                        <div className="truncate" title={project?.title || ''}>
                          Project: <b>{project?.title || '—'}</b>
                        </div>
                        <div>
                          Round: <b>{round ? `Vòng ${round.round_number}` : '—'}</b>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* main content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm whitespace-pre-wrap leading-5">
                      {truncate(i.prompt, 260)}
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      {Array.isArray(i.options_json?.choices) && i.options_json.choices.length > 0 ? (
                        <div className="truncate" title={i.options_json.choices.join(' | ')}>
                          Choices: {i.options_json.choices.join(' | ')}
                        </div>
                      ) : (
                        <div className="text-gray-400">Choices: —</div>
                      )}
                    </div>
                  </div>

                  {/* actions */}
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      className="px-3 py-2 rounded bg-blue-600 text-white"
                      onClick={() => openEditModal(i)}
                    >
                      Sửa
                    </button>
                    <button
                      className="px-3 py-2 rounded bg-red-600 text-white"
                      onClick={() => deleteOneItem(i)}
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              );
            })}

            {visibleItems.length === 0 && (
              <div className="p-4 text-center text-gray-500 border rounded bg-white">
                Không có item nào phù hợp bộ lọc.
              </div>
            )}
          </>
        )}
      </section>

      {/* ===== EDIT MODAL ===== */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded bg-white shadow-lg border">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="font-semibold">Sửa Item</div>
              <button className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200" onClick={closeEditModal}>
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-600">Project (gõ để tìm)</label>
                  <ProjectCombobox
                    projects={projects}
                    valueId={editProjectId}
                    onChange={(nextId) => {
                      setEditProjectId(nextId);
                      setEditRoundId('');
                    }}
                    className="min-w-full"
                    placeholder="Gõ để tìm project…"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600">Round (tùy chọn)</label>
                  <select
                    className="border p-2 rounded w-full"
                    value={editRoundId}
                    onChange={(e) => setEditRoundId(e.target.value)}
                    disabled={!editProjectId}
                  >
                    <option value="">— Không gán Round —</option>
                    {filteredRoundsForEdit
                      .slice()
                      .sort((a, b) => a.round_number - b.round_number)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {(projects.find((p) => p.id === r.project_id)?.title ?? 'Project')} – Vòng {r.round_number}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-600">Code</label>
                  <input
                    className="border p-2 rounded w-full"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600">Type</label>
                  <input
                    className="border p-2 rounded w-full"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-600">Item order</label>
                  <input
                    className="border p-2 rounded w-full"
                    value={editItemOrder}
                    onChange={(e) => setEditItemOrder(e.target.value)}
                    placeholder="Ví dụ: 1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-600">Prompt</label>
                <textarea
                  className="border p-2 rounded w-full"
                  rows={5}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">options_json (JSON)</label>
                <textarea
                  className="border p-2 rounded w-full font-mono text-xs"
                  rows={8}
                  value={editOptionsJsonText}
                  onChange={(e) => setEditOptionsJsonText(e.target.value)}
                  placeholder='Ví dụ: {"choices":["A","B","C","D"]}'
                />
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2">
              <button
                className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200"
                onClick={closeEditModal}
                disabled={savingEdit}
              >
                Hủy
              </button>
              <button
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
                onClick={saveEdit}
                disabled={savingEdit}
              >
                {savingEdit ? 'Đang cập nhật…' : 'Cập nhật'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
