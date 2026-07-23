import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, Search, Database, Calculator, Upload, Download, Save, Check, X, AlertCircle, FlaskConical, ChevronDown, List, History } from "lucide-react";
import "./storage.js"; // installs window.storage backed by localStorage
import defaultReagentDb from "./default-reagent-db.json"; // bundled 藥冊 snapshot (2025YJC + 2023HSU + 2025YKW), seeded on first launch
import { reagentMatchesQuery } from "./chemAliases.js"; // 化學式/縮寫搜尋對照表（例如 K2CO3、dppf、TBAF）

const ACCENT = "#185FA5";

// ---------- helpers ----------

function parseEquivInput(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  if (trimmed.endsWith("%")) {
    const n = parseFloat(trimmed.slice(0, -1));
    if (isNaN(n)) return null;
    return { equiv: n / 100, isPercent: true, display: trimmed };
  }
  const n = parseFloat(trimmed);
  if (isNaN(n)) return null;
  return { equiv: n, isPercent: false, display: trimmed };
}

function fmt(n, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatMass(mg) {
  if (mg === null || mg === undefined || isNaN(mg)) return "—";
  if (mg >= 1000) return `${fmt(mg / 1000, 3)} g`;
  if (mg < 1) return `${fmt(mg * 1000, 1)} µg`;
  return `${fmt(mg, 2)} mg`;
}

function formatTimestampLabel(ts) {
  return new Date(ts).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Merge a new "LABEL-位置" string into an existing (possibly multi-source)
// location string. Same label (e.g. re-importing an updated "2025YJC" book)
// overwrites just that label's entry; a different label (a different lab)
// is kept alongside the existing ones.
function mergeLocations(existing, incoming) {
  const trimmedIncoming = String(incoming || "").trim();
  if (!trimmedIncoming) return existing || "";
  const map = new Map();
  const existingParts = String(existing || "")
    .split(/、|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of existingParts) {
    const label = part.includes("-") ? part.split("-")[0] : part;
    map.set(label, part);
  }
  const incomingLabel = trimmedIncoming.includes("-") ? trimmedIncoming.split("-")[0] : trimmedIncoming;
  map.set(incomingLabel, trimmedIncoming);
  return Array.from(map.values()).join("、");
}

function csvToRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const splitLine = (l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("名稱") || h.includes("試劑"));
  const casIdx = header.findIndex((h) => h.includes("cas"));
  const mwIdx = header.findIndex((h) => h.includes("mw") || h.includes("分子量"));
  const locationIdx = header.findIndex((h) => h.includes("location") || h.includes("位置"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
    const cas = casIdx >= 0 ? cols[casIdx] : "";
    const mwRaw = mwIdx >= 0 ? cols[mwIdx] : cols[cols.length - 1];
    const mw = parseFloat(mwRaw);
    const location = locationIdx >= 0 ? cols[locationIdx] : "";
    if (name && !isNaN(mw)) {
      rows.push({ name, cas: cas || "", mw, location: location || "" });
    }
  }
  return rows;
}

function newRow() {
  return { id: uid(), name: "", cas: "", mw: "", mmol: "", scaleUnit: "mmol", scaleValue: "", equivInput: "", remember: false, sampleCode: "" };
}

const SCALE_UNITS = ["mmol", "mg", "g"];

// Raw mmol implied by the "known amount" row's own scale input (mmol/mg/g),
// independent of what equivalent that row happens to represent.
function computeBaseMmol(row) {
  const mw = parseFloat(row.mw);
  const val = parseFloat(row.scaleValue);
  if (isNaN(val)) return NaN;
  if (row.scaleUnit === "mmol") return val;
  if (isNaN(mw) || mw <= 0) return NaN;
  if (row.scaleUnit === "mg") return val / mw;
  if (row.scaleUnit === "g") return (val * 1000) / mw;
  return NaN;
}

// ---------- main component ----------

export default function ReactionCalculator() {
  const [tab, setTab] = useState("calc");
  const [db, setDb] = useState([]);
  const [dbLoaded, setDbLoaded] = useState(false);
  const [sampleCompounds, setSampleCompounds] = useState([]);

  const [rows, setRows] = useState([newRow(), newRow(), newRow()]);
  const [savedReactions, setSavedReactions] = useState([]);
  const [currentReactionId, setCurrentReactionId] = useState(null);
  const [reactionNameInput, setReactionNameInput] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClearCalc, setConfirmClearCalc] = useState(false);
  const [reactionSearch, setReactionSearch] = useState("");
  const [expandedReactionId, setExpandedReactionId] = useState(null);

  const [historyEntries, setHistoryEntries] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [confirmDeleteHistoryId, setConfirmDeleteHistoryId] = useState(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  const [importMsg, setImportMsg] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      let loadedDb = false;
      try {
        const res = await window.storage.get("reagent-db", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.length > 0) {
            setDb(parsed);
            loadedDb = true;
          }
        }
      } catch (e) {}
      if (!loadedDb) {
        try {
          const seeded = defaultReagentDb.map((d) => ({ id: uid(), name: d.name, cas: d.cas || "", mw: d.mw, location: d.location || "" }));
          setDb(seeded);
          await window.storage.set("reagent-db", JSON.stringify(seeded), false);
        } catch (e) {
          console.error("Failed to seed default reagent database", e);
        }
      }
      try {
        const res2 = await window.storage.get("sample-compounds", false);
        if (res2 && res2.value) setSampleCompounds(JSON.parse(res2.value));
      } catch (e) {}
      try {
        const res3 = await window.storage.get("saved-reactions", false);
        if (res3 && res3.value) setSavedReactions(JSON.parse(res3.value));
      } catch (e) {}
      try {
        const res4 = await window.storage.get("calc-history", false);
        if (res4 && res4.value) setHistoryEntries(JSON.parse(res4.value));
      } catch (e) {}
      setDbLoaded(true);
    })();
  }, []);

  async function persistDb(next) {
    setDb(next);
    try { await window.storage.set("reagent-db", JSON.stringify(next), false); }
    catch (e) { console.error("Failed to save reagent database", e); }
  }

  async function persistSamples(next) {
    setSampleCompounds(next);
    try { await window.storage.set("sample-compounds", JSON.stringify(next), false); }
    catch (e) { console.error("Failed to save sample compounds", e); }
  }

  async function persistSavedReactions(next) {
    setSavedReactions(next);
    try { await window.storage.set("saved-reactions", JSON.stringify(next), false); }
    catch (e) { console.error("Failed to save reaction templates", e); }
  }

  function cloneRowsForSave() {
    return rows.map((r) => ({ ...r, id: uid() }));
  }

  async function saveReactionAsNew() {
    const name = reactionNameInput.trim();
    if (!name) return;
    const entry = { id: uid(), name, savedAt: Date.now(), rows: cloneRowsForSave() };
    await persistSavedReactions([...savedReactions, entry]);
    setCurrentReactionId(entry.id);
  }

  async function updateCurrentReaction() {
    if (!currentReactionId) return;
    const name = reactionNameInput.trim();
    const next = savedReactions.map((s) =>
      s.id === currentReactionId ? { ...s, name: name || s.name, rows: cloneRowsForSave(), savedAt: Date.now() } : s
    );
    await persistSavedReactions(next);
  }

  function loadReaction(id) {
    const entry = savedReactions.find((s) => s.id === id);
    if (!entry) return;
    setRows(entry.rows.map((r) => ({ ...r, id: uid() })));
    setCurrentReactionId(entry.id);
    setReactionNameInput(entry.name);
  }

  async function deleteReaction(id) {
    await persistSavedReactions(savedReactions.filter((s) => s.id !== id));
    if (currentReactionId === id) {
      setCurrentReactionId(null);
      setReactionNameInput("");
    }
  }

  async function persistHistory(next) {
    setHistoryEntries(next);
    try { await window.storage.set("calc-history", JSON.stringify(next), false); }
    catch (e) { console.error("Failed to save history", e); }
  }

  async function logCurrentCalculation() {
    const name = reactionNameInput.trim() || formatTimestampLabel(Date.now());
    const entry = { id: uid(), name, savedAt: Date.now(), rows: cloneRowsForSave() };
    await persistHistory([entry, ...historyEntries]);
  }

  async function deleteHistoryEntry(id) {
    await persistHistory(historyEntries.filter((h) => h.id !== id));
  }

  async function clearAllHistory() {
    await persistHistory([]);
    setExpandedHistoryId(null);
    setConfirmDeleteHistoryId(null);
    setConfirmClearHistory(false);
  }

  function loadHistoryEntry(id) {
    const entry = historyEntries.find((h) => h.id === id);
    if (!entry) return;
    setRows(entry.rows.map((r) => ({ ...r, id: uid() })));
    setCurrentReactionId(null);
    setReactionNameInput(entry.name);
  }

  function addRow() {
    setRows((r) => [...r, newRow()]);
  }
  function clearCalculation() {
    setRows([newRow(), newRow(), newRow()]);
    setReactionNameInput("");
    setCurrentReactionId(null);
    setConfirmClearCalc(false);
  }
  function updateRow(id, patch) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function removeRow(id) {
    setRows((r) => r.filter((row) => row.id !== id));
  }

  // Auto-detect the "reference" row: whichever row has a 用量 value typed in
  // becomes the basis for the whole calculation — no explicit toggle needed.
  const rowsWithScale = rows.filter((r) => r.scaleValue && r.scaleValue.trim() !== "");
  const referenceRow = rowsWithScale.length === 1 ? rowsWithScale[0] : null;
  const multipleScaleFilled = rowsWithScale.length > 1;

  // mmol of the physically-weighed reference reagent, at whatever equivalent it actually is.
  const rawKnownMmol = referenceRow ? computeBaseMmol(referenceRow) : NaN;
  const knownEquivParsed = referenceRow ? parseEquivInput(referenceRow.equivInput) : null;
  const knownEquiv = knownEquivParsed ? knownEquivParsed.equiv : 1; // blank = assume 1.0 equiv
  // True 1.0-equivalent scale of the reaction, back-calculated from the reference row.
  const baseMmol = !isNaN(rawKnownMmol) && knownEquiv > 0 ? rawKnownMmol / knownEquiv : NaN;
  const baseValid = !!referenceRow && !isNaN(baseMmol) && baseMmol > 0;

  function computeRow(row) {
    const mw = parseFloat(row.mw);
    const isReference = !!referenceRow && row.id === referenceRow.id;
    if (isReference) {
      if (isNaN(rawKnownMmol) || rawKnownMmol <= 0) return { mmol: null, mass: null };
      if (isNaN(mw) || mw <= 0) return { mmol: rawKnownMmol, mass: null };
      return { mmol: rawKnownMmol, mass: rawKnownMmol * mw };
    }
    const parsed = parseEquivInput(row.equivInput);
    if (!baseValid || isNaN(mw) || mw <= 0 || !parsed) return { mmol: null, mass: null };
    const mmol = baseMmol * parsed.equiv;
    return { mmol, mass: mmol * mw, isPercent: parsed.isPercent };
  }

  async function saveSampleCompound(row) {
    if (!row.sampleCode || !row.name || !row.mw) return;
    const mw = parseFloat(row.mw);
    if (isNaN(mw)) return;
    const filtered = sampleCompounds.filter((s) => s.code.toLowerCase() !== row.sampleCode.toLowerCase());
    await persistSamples([...filtered, { code: row.sampleCode, name: row.name, mw }]);
  }
  async function deleteSampleCompound(code) {
    await persistSamples(sampleCompounds.filter((s) => s.code !== code));
  }
  async function updateSampleCompound(code, patch) {
    await persistSamples(sampleCompounds.map((s) => (s.code === code ? { ...s, ...patch } : s)));
  }

  function handleImportClick() { fileInputRef.current?.click(); }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let incoming = [];
    try {
      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        incoming = Array.isArray(parsed) ? parsed : [];
      } else {
        incoming = csvToRows(text);
      }
    } catch (err) {
      setImportMsg({ type: "error", text: "檔案解析失敗，請確認格式（需含 name / cas / mw 欄位）" });
      return;
    }
    if (incoming.length === 0) {
      setImportMsg({ type: "error", text: "沒有讀到任何有效資料列" });
      return;
    }
    let added = 0, updated = 0;
    const byCas = new Map(db.map((d) => [String(d.cas || "").toLowerCase(), d]));
    const byName = new Map(db.map((d) => [String(d.name || "").toLowerCase(), d]));
    const next = [...db];
    for (const item of incoming) {
      const cas = String(item.cas || "").trim();
      const name = String(item.name || "").trim();
      const mw = parseFloat(item.mw);
      const location = String(item.location || "").trim();
      if (!name || isNaN(mw)) continue;
      const key = cas ? cas.toLowerCase() : null;
      let existing = key ? byCas.get(key) : byName.get(name.toLowerCase());
      if (existing) {
        existing.name = name; existing.mw = mw;
        if (cas) existing.cas = cas;
        existing.location = mergeLocations(existing.location, location);
        updated++;
      } else {
        const entry = { id: uid(), name, cas, mw, location };
        next.push(entry);
        if (cas) byCas.set(cas.toLowerCase(), entry);
        byName.set(name.toLowerCase(), entry);
        added++;
      }
    }
    await persistDb(next);
    setImportMsg({ type: "success", text: `匯入完成：新增 ${added} 筆，更新 ${updated} 筆` });
    e.target.value = "";
  }

  function exportDb() {
    const csv = ["name,cas,mw,location", ...db.map((d) => `"${d.name}","${d.cas || ""}",${d.mw},"${d.location || ""}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "reagent-database.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const [newEntry, setNewEntry] = useState({ name: "", cas: "", mw: "", location: "" });
  async function addDbEntry() {
    const mw = parseFloat(newEntry.mw);
    if (!newEntry.name || isNaN(mw)) return;
    const cas = newEntry.cas.trim();
    const location = newEntry.location.trim();
    const key = cas.toLowerCase();
    const existingIdx = cas ? db.findIndex((d) => String(d.cas || "").toLowerCase() === key) : -1;
    let next;
    if (existingIdx >= 0) {
      next = [...db];
      next[existingIdx] = { ...next[existingIdx], name: newEntry.name, mw, location: mergeLocations(next[existingIdx].location, location) };
    } else {
      next = [...db, { id: uid(), name: newEntry.name, cas, mw, location }];
    }
    await persistDb(next);
    setNewEntry({ name: "", cas: "", mw: "", location: "" });
  }
  async function deleteDbEntry(id) { await persistDb(db.filter((d) => d.id !== id)); }
  async function updateDbEntry(id, patch) {
    await persistDb(db.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  const [dbFilter, setDbFilter] = useState("");
  const [editingDbId, setEditingDbId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({ name: "", cas: "", mw: "", location: "" });
  const [editingSampleCode, setEditingSampleCode] = useState(null);
  const [sampleEditBuffer, setSampleEditBuffer] = useState({ name: "", mw: "" });

  function startEditSample(s) {
    setEditingSampleCode(s.code);
    setSampleEditBuffer({ name: s.name, mw: String(s.mw) });
  }
  function cancelEditSample() {
    setEditingSampleCode(null);
  }
  async function saveEditSample(code) {
    const mw = parseFloat(sampleEditBuffer.mw);
    if (!sampleEditBuffer.name.trim() || isNaN(mw)) return;
    await updateSampleCompound(code, { name: sampleEditBuffer.name.trim(), mw });
    setEditingSampleCode(null);
  }

  function startEditDbEntry(d) {
    setEditingDbId(d.id);
    setEditBuffer({ name: d.name, cas: d.cas || "", mw: String(d.mw), location: d.location || "" });
  }
  function cancelEditDbEntry() {
    setEditingDbId(null);
  }
  async function saveEditDbEntry(id) {
    const mw = parseFloat(editBuffer.mw);
    if (!editBuffer.name.trim() || isNaN(mw)) return;
    await updateDbEntry(id, { name: editBuffer.name.trim(), cas: editBuffer.cas.trim(), mw, location: editBuffer.location.trim() });
    setEditingDbId(null);
  }
  const filteredDb = useMemo(() => {
    const q = dbFilter.trim();
    if (!q) return db;
    return db.filter((d) => reagentMatchesQuery(d, q, ["location"]));
  }, [db, dbFilter]);

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2";
  const ringStyle = { "--tw-ring-color": ACCENT };

  return (
    <div className="h-[100dvh] sm:h-auto sm:min-h-screen bg-slate-200 flex justify-center sm:py-6 overflow-hidden">
      <div className="w-full max-w-[430px] bg-slate-50 text-slate-900 h-[100dvh] sm:h-[880px] sm:rounded-[2.25rem] sm:shadow-2xl sm:border-8 sm:border-slate-900 overflow-hidden flex flex-col relative">
        <input ref={fileInputRef} type="file" accept=".csv,.json" className="hidden" onChange={handleFileChange} />

        {/* compact top bar */}
        <div className="border-b border-slate-200 bg-white px-4 pt-3 pb-2.5 flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: ACCENT }}>
            <FlaskConical size={18} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 leading-tight text-sm">反應計算器</div>
            <div className="text-[11px] text-slate-400 leading-tight">Reaction Stoichiometry</div>
          </div>
        </div>

        {/* scrollable content */}
        <div className="flex-1 overflow-y-auto pb-20">

        {tab === "calc" && (
        <div className="px-4 py-4">
          {/* saved reaction dropdown — quick load */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">已儲存的反應</div>
            <select
              value={currentReactionId || ""}
              onChange={(e) => {
                if (e.target.value) {
                  loadReaction(e.target.value);
                } else {
                  setCurrentReactionId(null);
                  setReactionNameInput("");
                }
              }}
              className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2"
              style={ringStyle}
            >
              <option value="">— 選擇要載入的反應 —</option>
              {savedReactions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {savedReactions.length > 0 && (
              <div className="text-xs text-slate-400 mt-2">
                想瀏覽內容或刪除舊紀錄，請至下方導覽列的「已儲存」頁籤。
              </div>
            )}
          </div>

          {!referenceRow && !multipleScaleFilled && (
            <div className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={14} /> 請在其中一列的「用量」欄位輸入實際秤重／mmol，作為換算基準
            </div>
          )}
          {multipleScaleFilled && (
            <div className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={14} /> 目前有多列都填了用量，只能有一列作為基準，請清空其餘欄位
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            {/* reaction name + save controls */}
            <div className="flex gap-2 flex-wrap items-center mb-4 pb-4 border-b border-slate-100">
              <input
                type="text"
                value={reactionNameInput}
                onChange={(e) => setReactionNameInput(e.target.value)}
                placeholder="輸入反應名稱，例如：Pd-catalyzed C–H arylation model"
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2"
                style={ringStyle}
              />
              {currentReactionId && (
                <button onClick={updateCurrentReaction}
                  className="text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5 whitespace-nowrap" style={{ backgroundColor: ACCENT }}>
                  <Save size={14} /> 更新目前反應
                </button>
              )}
              <button onClick={saveReactionAsNew} disabled={!reactionNameInput.trim()}
                className="text-sm px-3 py-2 rounded-lg border disabled:opacity-30 flex items-center gap-1.5 whitespace-nowrap"
                style={{ borderColor: ACCENT, color: ACCENT }}>
                <Save size={14} /> 另存為新反應
              </button>
              <button onClick={logCurrentCalculation}
                className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-500 flex items-center gap-1.5 whitespace-nowrap"
                title="記錄這次計算到歷史紀錄，未命名則以時間標示">
                <History size={14} /> 記錄本次計算
              </button>
              {confirmClearCalc ? (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-xs text-slate-400">清除目前輸入？</span>
                  <button onClick={clearCalculation} className="text-red-500 hover:text-red-600">
                    <Check size={16} />
                  </button>
                  <button onClick={() => setConfirmClearCalc(false)} className="text-slate-400 hover:text-slate-600">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClearCalc(true)}
                  className="text-sm px-3 py-2 rounded-lg text-slate-400 hover:text-red-500 flex items-center gap-1.5 whitespace-nowrap">
                  <Trash2 size={14} /> 清除目前輸入
                </button>
              )}
            </div>

            {rows.length > 1 && (
              <div className="text-xs text-slate-400 mb-2 px-1">向左滑動該列可刪除試劑</div>
            )}

            <div className="space-y-2">
              {rows.map((row) => {
                const result = computeRow(row);
                const isBase = !!referenceRow && row.id === referenceRow.id;
                return (
                  <SwipeToDeleteRow key={row.id} onDelete={() => removeRow(row.id)} disabled={rows.length <= 1}>
                  <div className={`rounded-lg px-1 py-2 ${isBase ? "bg-sky-50" : "bg-slate-50"}`}>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      {/* name / cas */}
                      <ReagentPicker
                        db={db}
                        samples={sampleCompounds}
                        value={row.name}
                        onSelect={(entry) => updateRow(row.id, { name: entry.name, cas: entry.cas || "", mw: String(entry.mw) })}
                        onNameChange={(v) => updateRow(row.id, { name: v })}
                        placeholder="名稱/代號/CAS"
                      />
                      {/* 用量: always editable — whichever row has this filled becomes the reference */}
                      <div className="relative">
                        <input type="text" inputMode="decimal" value={row.scaleValue}
                          onChange={(e) => updateRow(row.id, { scaleValue: e.target.value })}
                          placeholder={row.scaleUnit === "mmol" ? "用量 mmol" : `用量 ${row.scaleUnit}`}
                          className={inputCls + " pr-12"} style={ringStyle} />
                        <button
                          type="button"
                          onClick={() => {
                            const idx = SCALE_UNITS.indexOf(row.scaleUnit);
                            updateRow(row.id, { scaleUnit: SCALE_UNITS[(idx + 1) % SCALE_UNITS.length] });
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-medium px-1.5 py-1 rounded-md hover:bg-slate-100"
                          style={{ color: ACCENT }}
                          title="切換單位（mmol / mg / g）"
                        >
                          {row.scaleUnit}
                        </button>
                      </div>
                      {/* mw */}
                      <input type="text" inputMode="decimal" value={row.mw}
                        onChange={(e) => updateRow(row.id, { mw: e.target.value })}
                        placeholder="分子量 MW" className={inputCls} style={ringStyle} />
                      {/* equiv */}
                      <input type="text" value={row.equivInput}
                        onChange={(e) => updateRow(row.id, { equivInput: e.target.value })}
                        placeholder={isBase ? "當量（預設 1.0）" : "當量 / mol%"}
                        className={inputCls} style={ringStyle} />
                    </div>

                    {/* weight line + remember */}
                    <div className="flex items-center justify-between px-1 mt-1.5 flex-wrap gap-2">
                      <div className="text-sm flex items-baseline gap-1.5">
                        {isBase && row.scaleUnit !== "mmol" ? (
                          <>
                            <span className="text-slate-400">mmol</span>
                            <span className="font-semibold" style={{ color: ACCENT }}>{result.mmol !== null ? fmt(result.mmol, 4) : "—"}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-400">重量</span>
                            <span className="font-semibold" style={{ color: ACCENT }}>{formatMass(result.mass)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500">
                          <input type="checkbox" checked={row.remember}
                            onChange={(e) => updateRow(row.id, {
                              remember: e.target.checked,
                              sampleCode: e.target.checked && !row.sampleCode ? row.name : row.sampleCode,
                            })} className="rounded" />
                          記住此化合物
                        </label>
                        {row.remember && (
                          <>
                            <input type="text" value={row.sampleCode}
                              onChange={(e) => updateRow(row.id, { sampleCode: e.target.value })}
                              placeholder="樣品代號"
                              className="border border-slate-200 rounded-lg px-2 py-1 text-xs w-24 focus:outline-none focus:ring-2" style={ringStyle} />
                            <button onClick={() => saveSampleCompound(row)}
                              disabled={!row.sampleCode || !row.name || !row.mw}
                              className="text-xs px-2 py-1 rounded-lg text-white disabled:opacity-30 flex items-center gap-1"
                              style={{ backgroundColor: ACCENT }}>
                              <Save size={12} /> 儲存
                            </button>
                          </>
                        )}
                        {isBase && (
                          <span className="text-xs font-medium" style={{ color: ACCENT }}>用量基準</span>
                        )}
                      </div>
                    </div>
                  </div>
                  </SwipeToDeleteRow>
                );
              })}
            </div>

            <button onClick={addRow}
              className="w-full mt-3 border-2 border-dashed border-slate-200 rounded-lg py-2.5 text-sm text-slate-400 hover:border-slate-300 hover:text-slate-500 flex items-center justify-center gap-1.5">
              <Plus size={16} /> 新增試劑
            </button>
          </div>
        </div>
      )}

      {tab === "reactions" && (
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Search size={14} className="text-slate-300" />
              <input type="text" value={reactionSearch} onChange={(e) => setReactionSearch(e.target.value)}
                placeholder="搜尋反應名稱" className="flex-1 text-sm focus:outline-none" />
            </div>
          </div>

          {savedReactions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
              尚未儲存任何反應。在「計算」頁籤填好試劑後，可以另存為反應範本。
            </div>
          ) : (
            (() => {
              const q = reactionSearch.trim().toLowerCase();
              const filtered = savedReactions.filter((s) => !q || s.name.toLowerCase().includes(q));
              if (filtered.length === 0) {
                return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">沒有符合的反應</div>;
              }
              return filtered.map((s) => {
                const isExpanded = expandedReactionId === s.id;
                const confirming = confirmDeleteId === s.id;
                const limiting = s.rows.find((r) => r.scaleValue && String(r.scaleValue).trim() !== "");
                return (
                  <div key={s.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setExpandedReactionId(isExpanded ? null : s.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-700">{s.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {s.rows.length} 個試劑{limiting ? ` · 用量基準：${limiting.name || "（未命名）"}` : ""}
                          {s.savedAt ? ` · ${new Date(s.savedAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
                        </div>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                        <div className="grid gap-2 text-xs text-slate-400 px-1 pb-1" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
                          <div>試劑名稱/代號/CAS</div>
                          <div>分子量 MW</div>
                          <div>{"規模 / 當量"}</div>
                          <div></div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {s.rows.map((r) => (
                            <div key={r.id} className="grid gap-2 items-center py-1.5 px-1 text-sm" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
                              <div className="text-slate-700 truncate">{r.name || "—"}</div>
                              <div className="text-slate-500">{r.mw || "—"}</div>
                              <div className="text-slate-500">
                                {(r.scaleValue && String(r.scaleValue).trim() !== "") ? `${r.scaleValue} ${r.scaleUnit || "mmol"}` : (r.equivInput || "—")}
                              </div>
                              <div>
                                {(r.scaleValue && String(r.scaleValue).trim() !== "") && (
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: ACCENT, backgroundColor: "#EAF2FA" }}>用量基準</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                          <button
                            onClick={() => { loadReaction(s.id); setTab("calc"); }}
                            className="text-sm px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5"
                            style={{ backgroundColor: ACCENT }}
                          >
                            <Calculator size={14} /> 載入到計算頁
                          </button>
                          {confirming ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">確定刪除？</span>
                              <button onClick={() => { deleteReaction(s.id); setConfirmDeleteId(null); }} className="text-red-500 hover:text-red-600">
                                <Check size={16} />
                              </button>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteId(s.id)} className="text-sm text-slate-400 hover:text-red-500 flex items-center gap-1.5">
                              <Trash2 size={14} /> 刪除
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Search size={14} className="text-slate-300 shrink-0" />
              <input type="text" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="搜尋歷史紀錄" className="flex-1 text-sm focus:outline-none" />
              {historyEntries.length > 0 && (
                confirmClearHistory ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400 whitespace-nowrap">刪除全部？</span>
                    <button onClick={clearAllHistory} className="text-red-500 hover:text-red-600">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setConfirmClearHistory(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmClearHistory(true)}
                    className="text-xs text-slate-400 hover:text-red-500 flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <Trash2 size={13} /> 刪除全部
                  </button>
                )
              )}
            </div>
          </div>

          {historyEntries.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
              尚未有任何歷史紀錄。在「計算」頁籤按「記錄本次計算」即可留下這次的紀錄，未命名時會以時間標示。
            </div>
          ) : (
            (() => {
              const q = historySearch.trim().toLowerCase();
              const filtered = historyEntries.filter((h) => !q || h.name.toLowerCase().includes(q));
              if (filtered.length === 0) {
                return <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">沒有符合的紀錄</div>;
              }
              return filtered.map((h) => {
                const isExpanded = expandedHistoryId === h.id;
                const confirming = confirmDeleteHistoryId === h.id;
                const limiting = h.rows.find((r) => r.scaleValue && String(r.scaleValue).trim() !== "");
                return (
                  <div key={h.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setExpandedHistoryId(isExpanded ? null : h.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-700">{h.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {h.rows.length} 個試劑{limiting ? ` · 用量基準：${limiting.name || "（未命名）"}` : ""}
                          {h.savedAt ? ` · ${formatTimestampLabel(h.savedAt)}` : ""}
                        </div>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                        <div className="grid gap-2 text-xs text-slate-400 px-1 pb-1" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
                          <div>試劑名稱/代號/CAS</div>
                          <div>分子量 MW</div>
                          <div>{"規模 / 當量"}</div>
                          <div></div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {h.rows.map((r) => (
                            <div key={r.id} className="grid gap-2 items-center py-1.5 px-1 text-sm" style={{ gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)" }}>
                              <div className="text-slate-700 truncate">{r.name || "—"}</div>
                              <div className="text-slate-500">{r.mw || "—"}</div>
                              <div className="text-slate-500">
                                {(r.scaleValue && String(r.scaleValue).trim() !== "") ? `${r.scaleValue} ${r.scaleUnit || "mmol"}` : (r.equivInput || "—")}
                              </div>
                              <div>
                                {(r.scaleValue && String(r.scaleValue).trim() !== "") && (
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ color: ACCENT, backgroundColor: "#EAF2FA" }}>用量基準</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                          <button
                            onClick={() => { loadHistoryEntry(h.id); setTab("calc"); }}
                            className="text-sm px-3 py-1.5 rounded-lg text-white flex items-center gap-1.5"
                            style={{ backgroundColor: ACCENT }}
                          >
                            <Calculator size={14} /> 載入到計算頁
                          </button>
                          {confirming ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">確定刪除？</span>
                              <button onClick={() => { deleteHistoryEntry(h.id); setConfirmDeleteHistoryId(null); }} className="text-red-500 hover:text-red-600">
                                <Check size={16} />
                              </button>
                              <button onClick={() => setConfirmDeleteHistoryId(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDeleteHistoryId(h.id)} className="text-sm text-slate-400 hover:text-red-500 flex items-center gap-1.5">
                              <Trash2 size={14} /> 刪除
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}
        </div>
      )}

      {tab === "db" && (
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">藥冊匯入</div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleImportClick} className="text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
                <Upload size={14} /> 匯入 CSV / JSON
              </button>
              <button onClick={exportDb} className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1.5">
                <Download size={14} /> 匯出 CSV
              </button>
            </div>
            <div className="text-xs text-slate-400 mt-2">
              CSV 欄位需含 name（名稱）、cas（可省略）、mw（分子量），可另外加 location（位置，選填）。CAS 相符會覆蓋更新，沒有 CAS 則用名稱比對。
            </div>
            {importMsg && (
              <div className={`mt-2 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 ${importMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                {importMsg.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                {importMsg.text}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-700 mb-3">手動新增</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={newEntry.name} onChange={(e) => setNewEntry((n) => ({ ...n, name: e.target.value }))} placeholder="名稱" className={inputCls} style={ringStyle} />
              <input type="text" value={newEntry.cas} onChange={(e) => setNewEntry((n) => ({ ...n, cas: e.target.value }))} placeholder="CAS（選填）" className={inputCls} style={ringStyle} />
              <input type="text" inputMode="decimal" value={newEntry.mw} onChange={(e) => setNewEntry((n) => ({ ...n, mw: e.target.value }))} placeholder="MW" className={inputCls} style={ringStyle} />
              <input type="text" value={newEntry.location} onChange={(e) => setNewEntry((n) => ({ ...n, location: e.target.value }))} placeholder="位置（選填，如 鄭家-A1-1）" className={inputCls} style={ringStyle} />
            </div>
            <button onClick={addDbEntry} disabled={!newEntry.name || !newEntry.mw}
              className="mt-2 text-sm px-3 py-2 rounded-lg text-white disabled:opacity-30 flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
              <Plus size={14} /> 新增
            </button>
          </div>

          {sampleCompounds.length > 0 && (
            <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-4">
              <div className="text-sm font-semibold text-slate-700 mb-0.5">已記住的樣品化合物</div>
              <div className="text-xs text-slate-500 mb-3">來自「記住此化合物」，獨立存放，不會與下方藥冊資料庫混合或一起匯入/匯出。點一列可編輯名稱與 MW，向左滑動可刪除</div>
              <div className="space-y-1.5">
                {sampleCompounds.map((s) => {
                  const isEditing = editingSampleCode === s.code;
                  return (
                    <SwipeToDeleteRow key={s.code} onDelete={() => deleteSampleCompound(s.code)} disabled={isEditing}>
                      {isEditing ? (
                        <div className="bg-amber-100/80 rounded-lg p-2.5">
                          <div className="text-xs text-slate-500 mb-1.5">代號 <span className="font-medium text-slate-700">{s.code}</span>（不可修改）</div>
                          <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                            <input type="text" value={sampleEditBuffer.name}
                              onChange={(e) => setSampleEditBuffer((b) => ({ ...b, name: e.target.value }))}
                              placeholder="名稱" className={inputCls + " text-sm bg-white"} style={ringStyle} />
                            <input type="text" inputMode="decimal" value={sampleEditBuffer.mw}
                              onChange={(e) => setSampleEditBuffer((b) => ({ ...b, mw: e.target.value }))}
                              placeholder="MW" className={inputCls + " text-sm bg-white"} style={ringStyle} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEditSample(s.code)}
                              disabled={!sampleEditBuffer.name.trim() || isNaN(parseFloat(sampleEditBuffer.mw))}
                              className="flex-1 text-xs py-1.5 rounded-lg text-white disabled:opacity-30 flex items-center justify-center gap-1"
                              style={{ backgroundColor: ACCENT }}>
                              <Check size={13} /> 儲存
                            </button>
                            <button onClick={cancelEditSample}
                              className="flex-1 text-xs py-1.5 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center gap-1">
                              <X size={13} /> 取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => startEditSample(s)} className="w-full text-left py-2 px-1 text-sm rounded-lg bg-amber-50 hover:bg-amber-100">
                          <span className="font-medium text-slate-700">{s.code}</span>
                          {s.name !== s.code && <span className="text-slate-400 ml-2">{s.name}</span>}
                          <span className="text-slate-400 ml-2">· MW {s.mw}</span>
                        </button>
                      )}
                    </SwipeToDeleteRow>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Search size={14} className="text-slate-300" />
              <input type="text" value={dbFilter} onChange={(e) => setDbFilter(e.target.value)} placeholder="搜尋名稱、CAS 號或位置" className="flex-1 text-sm focus:outline-none" />
            </div>
            {!dbLoaded ? (
              <div className="text-sm text-slate-400 py-6 text-center">載入中…</div>
            ) : filteredDb.length === 0 ? (
              <div className="text-sm text-slate-400 py-6 text-center">
                {db.length === 0 ? "尚未有任何試劑，請先匯入藥冊或手動新增" : "沒有符合的結果"}
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-400 mb-2 px-1">點一列可編輯，向左滑動可刪除</div>
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {filteredDb.map((d) => {
                    const isEditing = editingDbId === d.id;
                    return (
                      <SwipeToDeleteRow key={d.id} onDelete={() => deleteDbEntry(d.id)} disabled={isEditing}>
                        {isEditing ? (
                          <div className="bg-sky-50 rounded-lg p-2.5">
                            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                              <input type="text" value={editBuffer.name}
                                onChange={(e) => setEditBuffer((b) => ({ ...b, name: e.target.value }))}
                                placeholder="名稱" className={inputCls + " text-sm"} style={ringStyle} />
                              <input type="text" value={editBuffer.cas}
                                onChange={(e) => setEditBuffer((b) => ({ ...b, cas: e.target.value }))}
                                placeholder="CAS" className={inputCls + " text-sm"} style={ringStyle} />
                              <input type="text" inputMode="decimal" value={editBuffer.mw}
                                onChange={(e) => setEditBuffer((b) => ({ ...b, mw: e.target.value }))}
                                placeholder="MW" className={inputCls + " text-sm"} style={ringStyle} />
                              <input type="text" value={editBuffer.location}
                                onChange={(e) => setEditBuffer((b) => ({ ...b, location: e.target.value }))}
                                placeholder="位置" className={inputCls + " text-sm"} style={ringStyle} />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveEditDbEntry(d.id)}
                                disabled={!editBuffer.name.trim() || isNaN(parseFloat(editBuffer.mw))}
                                className="flex-1 text-xs py-1.5 rounded-lg text-white disabled:opacity-30 flex items-center justify-center gap-1"
                                style={{ backgroundColor: ACCENT }}>
                                <Check size={13} /> 儲存
                              </button>
                              <button onClick={cancelEditDbEntry}
                                className="flex-1 text-xs py-1.5 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center gap-1">
                                <X size={13} /> 取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => startEditDbEntry(d)} className="w-full text-left py-2 px-1 text-sm rounded-lg bg-white hover:bg-slate-50">
                            <div className="font-medium text-slate-700">{d.name}</div>
                            <div className="text-xs text-slate-400">
                              {d.cas ? `CAS ${d.cas} · ` : ""}MW {d.mw}{d.location ? ` · 位置 ${d.location}` : ""}
                            </div>
                          </button>
                        )}
                      </SwipeToDeleteRow>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
        </div>
        {/* end scrollable content */}

        {/* bottom nav */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-stretch px-1 pt-1.5 shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <button onClick={() => setTab("calc")}
            className="flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg text-[11px] font-medium"
            style={{ color: tab === "calc" ? ACCENT : "#94a3b8" }}>
            <Calculator size={20} />
            計算
          </button>
          <button onClick={() => setTab("db")}
            className="flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg text-[11px] font-medium"
            style={{ color: tab === "db" ? ACCENT : "#94a3b8" }}>
            <Database size={20} />
            資料庫
          </button>
          <button onClick={() => setTab("reactions")}
            className="flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg text-[11px] font-medium"
            style={{ color: tab === "reactions" ? ACCENT : "#94a3b8" }}>
            <List size={20} />
            已儲存
          </button>
          <button onClick={() => setTab("history")}
            className="flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg text-[11px] font-medium"
            style={{ color: tab === "history" ? ACCENT : "#94a3b8" }}>
            <History size={20} />
            紀錄
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- swipe-to-delete row wrapper ----------

const SWIPE_DELETE_WIDTH = 76;

function SwipeToDeleteRow({ onDelete, disabled, children }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef({ x: 0, y: 0, startOffset: 0, horizontal: false });

  function handleTouchStart(e) {
    if (disabled) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, startOffset: offset, horizontal: false };
    setDragging(true);
  }
  function handleTouchMove(e) {
    if (disabled || !dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    if (!startRef.current.horizontal && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
      startRef.current.horizontal = true;
    }
    if (!startRef.current.horizontal) return;
    const next = Math.min(0, Math.max(-SWIPE_DELETE_WIDTH, startRef.current.startOffset + dx));
    setOffset(next);
  }
  function handleTouchEnd() {
    setDragging(false);
    setOffset((o) => (o < -SWIPE_DELETE_WIDTH / 2 ? -SWIPE_DELETE_WIDTH : 0));
  }

  return (
    <div className="relative overflow-x-hidden rounded-lg">
      {!disabled && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: SWIPE_DELETE_WIDTH }}>
          <button
            onClick={() => { onDelete(); setOffset(0); }}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium rounded-lg"
          >
            <Trash2 size={16} />
            刪除
          </button>
        </div>
      )}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ position: "relative", left: `${offset}px`, transition: dragging ? "none" : "left 0.2s ease" }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}

// ---------- reagent picker with autocomplete ----------

function ReagentPicker({ db, samples = [], value, onSelect, onNameChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (inputRef.current) {
        const r = inputRef.current.getBoundingClientRect();
        setAnchor({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const options = useMemo(() => {
    const q = value.trim().toLowerCase();
    const dbMatches = db
      .filter((d) => reagentMatchesQuery(d, value))
      .slice(0, 15)
      .map((d) => ({ ...d }));
    const sampleMatches = samples
      .filter((s) => !q || s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((s) => ({ id: `sample-${s.code}`, name: s.code === s.name ? s.code : `${s.code} — ${s.name}`, mw: s.mw, cas: "" }));
    return [...sampleMatches, ...dbMatches];
  }, [db, samples, value]);

  return (
    <div className="relative">
      <input ref={inputRef} type="text" value={value}
        onChange={(e) => { onNameChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2"
        style={{ "--tw-ring-color": ACCENT }} />

      {open && anchor && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="fixed z-40 bg-white border border-slate-300 rounded-lg shadow-lg overflow-y-auto"
            style={{ top: anchor.top, left: anchor.left, width: anchor.width, maxHeight: "270px", WebkitOverflowScrolling: "touch" }}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {options.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-4 px-2">沒有符合的試劑，可直接輸入自訂名稱</div>
            ) : (
              options.map((o) => (
                <button key={o.id}
                  onMouseDown={() => { onSelect(o); setOpen(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex flex-col gap-0.5 border-b border-slate-50 last:border-b-0">
                  <span className="text-sm text-slate-700 leading-snug whitespace-normal break-words">{o.name}</span>
                  <span className="text-xs text-slate-400">MW {o.mw}{o.cas ? ` · CAS ${o.cas}` : ""}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
