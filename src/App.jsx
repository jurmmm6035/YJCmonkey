import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Plus, Trash2, Search, Database, Calculator, Upload, Download, Save, Check, X, AlertCircle,
  FlaskConical, ChevronDown, History, Undo2, MoreHorizontal, Copy, SlidersHorizontal, FilePlus2,
  BookmarkPlus, Pin,
} from "lucide-react";
import "./storage.js"; // installs window.storage backed by localStorage
import defaultReagentDb from "./default-reagent-db.json"; // bundled 藥冊 snapshot (2025YJC + 2023HSU + 2025YKW), seeded on first launch
import { filterReagents } from "./chemAliases.js"; // 化學式/縮寫搜尋對照表（例如 K2CO3、dppf、TBAF）

const ACCENT = "#185FA5";
const VOLUME_COLOR = "#0f766e";
const HISTORY_LIMIT = 200; // 自動紀錄最多保留幾筆，避免 localStorage 爆掉
const UNDO_LIMIT = 50;
const AUTO_LOG_DELAY = 1500; // 停止輸入多久後自動記錄（毫秒）

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

function formatVolume(uL) {
  if (uL === null || uL === undefined || isNaN(uL)) return "—";
  if (uL >= 1000) return `${fmt(uL / 1000, 3)} mL`;
  if (uL < 1) return `${fmt(uL, 3)} µL`;
  return `${fmt(uL, 1)} µL`;
}

function formatMmol(mmol) {
  if (mmol === null || mmol === undefined || isNaN(mmol)) return "—";
  return `${fmt(mmol, 4)} mmol`;
}

// 由密度或溶液濃度換算體積（回傳 µL）。
// - 密度模式：體積(µL) = 重量(mg) ÷ 密度(g/mL)
//     單位驗算：mg ÷ (g/mL) = mg·mL/g = 10⁻³ g·mL/g = 10⁻³ mL = 1 µL ✓
//     這裡的重量是「實際要秤的重量」（已除以純度），所以 70% TBHP 水溶液這種情況，
//     填溶液本身的密度即可。
// - 濃度模式：體積(µL) = mmol ÷ 濃度(M) × 1000
//     因為 M = mol/L = mmol/mL，所以 mmol ÷ M 得到 mL，再乘 1000 換成 µL ✓
//     注意濃度模式不需要分子量，n-BuLi 這類溶液只填濃度就能算。
function computeVolumeUL(row, mmol, massMg) {
  if (row.liquidMode === "density") {
    const d = parseFloat(row.density);
    if (isNaN(d) || d <= 0) return null;
    if (massMg === null || massMg === undefined || isNaN(massMg)) return null;
    return massMg / d;
  }
  if (row.liquidMode === "molarity") {
    const m = parseFloat(row.molarity);
    if (isNaN(m) || m <= 0) return null;
    if (mmol === null || mmol === undefined || isNaN(mmol)) return null;
    return (mmol / m) * 1000;
  }
  return null;
}

// 純度（wt%）換算係數：例如 NaH 60% in mineral oil → 0.6。
// 空白或不合理的值視為 100%。溶液（濃度模式）已經用 M 表示，不再套用純度。
function purityFactor(row) {
  if (row.liquidMode === "molarity") return 1;
  const p = parseFloat(row.purity);
  if (isNaN(p) || p <= 0 || p > 100) return 1;
  return p / 100;
}

function formatTimestampLabel(ts) {
  return new Date(ts).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatTimeOnly(ts) {
  return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nameKey(s) {
  return String(s || "").trim().toLowerCase();
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
  const densityIdx = header.findIndex((h) => h.includes("density") || h.includes("密度"));
  const molarityIdx = header.findIndex((h) => h.includes("molarity") || h.includes("concentration") || h.includes("濃度"));
  const purityIdx = header.findIndex((h) => h.includes("purity") || h.includes("純度"));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const name = nameIdx >= 0 ? cols[nameIdx] : cols[0];
    const cas = casIdx >= 0 ? cols[casIdx] : "";
    const mwRaw = mwIdx >= 0 ? cols[mwIdx] : cols[cols.length - 1];
    const mw = parseFloat(mwRaw);
    const location = locationIdx >= 0 ? cols[locationIdx] : "";
    const density = densityIdx >= 0 ? cols[densityIdx] : "";
    const molarity = molarityIdx >= 0 ? cols[molarityIdx] : "";
    const purity = purityIdx >= 0 ? cols[purityIdx] : "";
    if (name && !isNaN(mw)) {
      rows.push({ name, cas: cas || "", mw, location: location || "", density: density || "", molarity: molarity || "", purity: purity || "" });
    }
  }
  return rows;
}

function newRow() {
  return {
    id: uid(), name: "", cas: "", mw: "", mmol: "", scaleUnit: "mmol", scaleValue: "", equivInput: "",
    remember: false, sampleCode: "", liquidMode: "", density: "", molarity: "", purity: "",
  };
}

// 舊版存下來的列可能缺欄位（例如沒有 purity），補齊預設值
function normalizeRow(r) {
  return { ...newRow(), ...r, id: r && r.id ? r.id : uid() };
}

function cloneRows(rows) {
  return rows.map((r) => ({ ...normalizeRow(r), id: uid() }));
}

function hasScale(row) {
  return row.scaleValue !== undefined && row.scaleValue !== null && String(row.scaleValue).trim() !== "";
}

const SCALE_UNITS = ["mmol", "mg", "g"];

// Raw mmol implied by the "known amount" row's own scale input (mmol/mg/g),
// independent of what equivalent that row happens to represent.
// 秤重（mg / g）時會乘上純度：秤 100 mg 的 60% NaH 只有 60 mg 是 NaH。
function computeBaseMmol(row) {
  const mw = parseFloat(row.mw);
  const val = parseFloat(row.scaleValue);
  if (isNaN(val)) return NaN;
  if (row.scaleUnit === "mmol") return val;
  if (isNaN(mw) || mw <= 0) return NaN;
  const pf = purityFactor(row);
  if (row.scaleUnit === "mg") return (val * pf) / mw;
  if (row.scaleUnit === "g") return (val * 1000 * pf) / mw;
  return NaN;
}

// 整個反應的計算：找出用量基準列，再算出每一列的 mmol / 秤重 / 體積。
function computeReaction(rows) {
  const withScale = rows.filter(hasScale);
  const referenceRow = withScale.length === 1 ? withScale[0] : null;
  const multipleScaleFilled = withScale.length > 1;
  const rawKnownMmol = referenceRow ? computeBaseMmol(referenceRow) : NaN;
  const knownEquivParsed = referenceRow ? parseEquivInput(referenceRow.equivInput) : null;
  const knownEquiv = knownEquivParsed ? knownEquivParsed.equiv : 1; // blank = assume 1.0 equiv
  // True 1.0-equivalent scale of the reaction, back-calculated from the reference row.
  const baseMmol = !isNaN(rawKnownMmol) && knownEquiv > 0 ? rawKnownMmol / knownEquiv : NaN;
  const baseValid = !!referenceRow && !isNaN(baseMmol) && baseMmol > 0;

  const results = {};
  for (const row of rows) {
    const empty = { mmol: null, mass: null, volumeUL: null };
    const mw = parseFloat(row.mw);
    const mwValid = !isNaN(mw) && mw > 0;
    let mmol;
    if (referenceRow && row.id === referenceRow.id) {
      if (isNaN(rawKnownMmol) || rawKnownMmol <= 0) { results[row.id] = empty; continue; }
      mmol = rawKnownMmol;
    } else {
      const parsed = parseEquivInput(row.equivInput);
      if (!baseValid || !parsed) { results[row.id] = empty; continue; }
      mmol = baseMmol * parsed.equiv;
    }
    // 實際要秤的重量 = 純物質重量 ÷ 純度
    const mass = mwValid ? (mmol * mw) / purityFactor(row) : null;
    results[row.id] = { mmol, mass, volumeUL: computeVolumeUL(row, mmol, mass) };
  }
  return { referenceRow, multipleScaleFilled, baseValid, results };
}

// 至少要有用量基準、而且有兩個以上有名字的試劑，才算是一筆值得自動記錄的計算
function isCalcMeaningful(rows) {
  const calc = computeReaction(rows);
  return calc.baseValid && rows.filter((r) => String(r.name || "").trim()).length >= 2;
}

// 依試劑狀態決定要顯示哪些結果：實際操作會量的那個數字放第一個（最大）。
function resultChips(row, result, isBase) {
  const weighedRef = isBase && row.scaleUnit !== "mmol"; // 基準列已經填了重量，要看的是 mmol
  const chips = [];
  if (weighedRef) {
    chips.push({ kind: "mmol", text: formatMmol(result.mmol) });
    if (row.liquidMode) chips.push({ kind: "volume", text: formatVolume(result.volumeUL) });
  } else if (row.liquidMode === "molarity") {
    chips.push({ kind: "volume", text: formatVolume(result.volumeUL) });
  } else if (row.liquidMode === "density") {
    chips.push({ kind: "volume", text: formatVolume(result.volumeUL) });
    chips.push({ kind: "mass", text: formatMass(result.mass) });
  } else {
    chips.push({ kind: "mass", text: formatMass(result.mass) });
  }
  // 基準列如果本來就是用 mmol 填的，就不再重複顯示 mmol
  const showMmolText = !isBase && result.mmol !== null && result.mmol !== undefined;
  return { chips, mmolText: showMmolText ? formatMmol(result.mmol) : null };
}

// 收合時顯示在「更多」按鈕上的小標籤，讓人一眼看出這列有套用純度／密度／濃度
function rowModifierTags(row) {
  const tags = [];
  const p = parseFloat(row.purity);
  if (row.liquidMode !== "molarity" && !isNaN(p) && p > 0 && p < 100) tags.push(`純度 ${p}%`);
  if (row.liquidMode === "density" && String(row.density || "").trim()) tags.push(`密度 ${row.density}`);
  if (row.liquidMode === "molarity" && String(row.molarity || "").trim()) tags.push(`${row.molarity} M`);
  return tags;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through to the textarea fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

function persistKey(key, value) {
  window.storage.set(key, JSON.stringify(value), false).catch((e) => console.error(`Failed to save ${key}`, e));
}

const EMPTY_DB_ENTRY = { name: "", cas: "", mw: "", location: "", density: "", molarity: "", purity: "" };

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
  const [historyEntries, setHistoryEntries] = useState([]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [moreOpen, setMoreOpen] = useState({}); // rowId → 是否展開「純度・液體」區
  const [autoInfo, setAutoInfo] = useState(null); // { at } 本次計算最近一次自動記錄的時間
  const [undoDepth, setUndoDepth] = useState(0);

  const [recordsFilter, setRecordsFilter] = useState("all"); // all | saved | history
  const [recordsSearch, setRecordsSearch] = useState("");
  const [expandedRecordKey, setExpandedRecordKey] = useState(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  const [importMsg, setImportMsg] = useState(null);
  const [dbPanel, setDbPanel] = useState(null); // "add" | "import" | null
  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);

  // ---- 永遠指向最新值的 refs：給計時器、復原、visibilitychange 等非同步流程使用 ----
  const rowsRef = useRef(rows);
  const nameRef = useRef(reactionNameInput);
  const currentIdRef = useRef(currentReactionId);
  rowsRef.current = rows;
  nameRef.current = reactionNameInput;
  currentIdRef.current = currentReactionId;
  const savedRef = useRef([]);
  const historyRef = useRef([]);
  const dbRef = useRef([]);
  const samplesRef = useRef([]);

  // 本次計算（session）對應到哪一筆自動紀錄；清除或載入別的反應時會開新的 session
  const sessionRef = useRef({ historyId: null, dirty: false });
  const autoTimerRef = useRef(null);
  const undoStackRef = useRef([]);
  const lastEditKeyRef = useRef(null);

  // ---- 底部提示條（toast），可附一個「復原」之類的動作按鈕 ----
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  function showToast(text, type = "success", action = null) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ text, type, action, key: Date.now() });
    toastTimerRef.current = setTimeout(() => setToast(null), action ? 5000 : 2200);
  }
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  // ---- 寫入 state + refs + localStorage 的集中入口 ----
  function setSaved(next) { savedRef.current = next; setSavedReactions(next); persistKey("saved-reactions", next); }
  function setHistory(next) { historyRef.current = next; setHistoryEntries(next); persistKey("calc-history", next); }
  function setDbPersist(next) { dbRef.current = next; setDb(next); persistKey("reagent-db", next); }
  function setSamples(next) { samplesRef.current = next; setSampleCompounds(next); persistKey("sample-compounds", next); }

  useEffect(() => {
    (async () => {
      let loadedDb = false;
      try {
        const res = await window.storage.get("reagent-db", false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.length > 0) {
            dbRef.current = parsed;
            setDb(parsed);
            loadedDb = true;
          }
        }
      } catch (e) {}
      if (!loadedDb) {
        const seeded = defaultReagentDb.map((d) => ({
          id: uid(), name: d.name, cas: d.cas || "", mw: d.mw, location: d.location || "",
          density: d.density || "", molarity: d.molarity || "", purity: d.purity || "",
        }));
        setDbPersist(seeded);
      }
      let saved = [];
      try {
        const res2 = await window.storage.get("sample-compounds", false);
        if (res2 && res2.value) { const v = JSON.parse(res2.value); samplesRef.current = v; setSampleCompounds(v); }
      } catch (e) {}
      try {
        const res3 = await window.storage.get("saved-reactions", false);
        if (res3 && res3.value) { saved = JSON.parse(res3.value); savedRef.current = saved; setSavedReactions(saved); }
      } catch (e) {}
      let history = [];
      try {
        const res4 = await window.storage.get("calc-history", false);
        if (res4 && res4.value) { history = JSON.parse(res4.value); historyRef.current = history; setHistoryEntries(history); }
      } catch (e) {}
      // 還原上次關掉 App 時正在算的內容
      try {
        const res5 = await window.storage.get("calc-draft", false);
        const draft = res5 && res5.value ? JSON.parse(res5.value) : null;
        if (draft && Array.isArray(draft.rows) && draft.rows.length > 0) {
          setRows(draft.rows.map(normalizeRow));
          setReactionNameInput(draft.name || "");
          setCurrentReactionId(saved.some((s) => s.id === draft.currentReactionId) ? draft.currentReactionId : null);
          const hid = draft.historyId && history.some((h) => h.id === draft.historyId) ? draft.historyId : null;
          sessionRef.current = { historyId: hid, dirty: false };
          const h = hid ? history.find((x) => x.id === hid) : null;
          setAutoInfo(h ? { at: h.savedAt } : null);
        }
      } catch (e) {}
      setDbLoaded(true);
    })();
  }, []);

  // ---------- 自動記錄（取代原本要手動按的「記錄本次計算」） ----------
  // 每次計算是一個 session：第一次算出有效結果時新增一筆紀錄，之後的修改都更新同一筆，
  // 不會因為每打一個字就多一筆。清除、載入其他反應、或選「固定這筆紀錄」時才會開新的一筆。

  function saveDraft() {
    persistKey("calc-draft", {
      rows: rowsRef.current,
      name: nameRef.current,
      currentReactionId: currentIdRef.current,
      historyId: sessionRef.current.historyId,
    });
  }

  function autoLog() {
    if (!sessionRef.current.dirty) return false;
    const currentRows = rowsRef.current;
    if (!isCalcMeaningful(currentRows)) return false;
    const now = Date.now();
    const name = nameRef.current.trim();
    const hist = historyRef.current;
    const id = sessionRef.current.historyId;
    const idx = id ? hist.findIndex((h) => h.id === id) : -1;
    const rowsCopy = cloneRows(currentRows);
    let next;
    if (idx >= 0) {
      const old = hist[idx];
      const entry = { ...old, name: name || old.autoName || old.name, rows: rowsCopy, savedAt: now };
      next = [entry, ...hist.filter((_, i) => i !== idx)];
    } else {
      const label = formatTimestampLabel(now);
      const entry = { id: uid(), name: name || label, autoName: label, rows: rowsCopy, savedAt: now };
      next = [entry, ...hist].slice(0, HISTORY_LIMIT);
      sessionRef.current.historyId = entry.id;
    }
    setHistory(next);
    sessionRef.current.dirty = false;
    setAutoInfo({ at: now });
    return true;
  }

  function flushAuto() {
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    autoLog();
    saveDraft();
  }

  function startNewSession() {
    sessionRef.current = { historyId: null, dirty: false };
    setAutoInfo(null);
  }

  useEffect(() => {
    if (!dbLoaded) return;
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null;
      autoLog();
      saveDraft();
    }, AUTO_LOG_DELAY);
  }, [rows, reactionNameInput, currentReactionId, dbLoaded]);

  // App 切到背景或關閉前，馬上把還沒存的修改記下來
  useEffect(() => {
    function onVisibility() { if (document.visibilityState === "hidden") flushAuto(); }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushAuto);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushAuto);
    };
  }, []);

  function markEdited() { sessionRef.current.dirty = true; }

  // ---------- 回上一步 ----------
  // 每次「換一個欄位打字」或做刪除、清除、載入、選試劑等動作前，先存一份快照。
  // 同一個欄位連續打字只算一步，按一次就回到開始改這個欄位之前。

  function pushUndo() {
    undoStackRef.current.push({
      rows: rowsRef.current,
      name: nameRef.current,
      currentId: currentIdRef.current,
      historyId: sessionRef.current.historyId,
    });
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    setUndoDepth(undoStackRef.current.length);
    lastEditKeyRef.current = null;
  }

  function undo() {
    const snap = undoStackRef.current.pop();
    setUndoDepth(undoStackRef.current.length);
    lastEditKeyRef.current = null;
    if (!snap) return;
    setRows(snap.rows);
    setReactionNameInput(snap.name);
    setCurrentReactionId(snap.currentId);
    setConfirmOverwrite(false);
    sessionRef.current = { historyId: snap.historyId, dirty: true };
    const h = snap.historyId ? historyRef.current.find((x) => x.id === snap.historyId) : null;
    setAutoInfo(h ? { at: h.savedAt } : null);
  }

  function undoWithToast() {
    if (undoStackRef.current.length === 0) return;
    undo();
    showToast("已回上一步");
  }

  // ---------- 計算頁的列操作 ----------

  function beginEdit(key) {
    if (lastEditKeyRef.current !== key) {
      pushUndo();
      lastEditKeyRef.current = key;
    }
    markEdited();
  }

  function updateRowField(id, field, value) {
    beginEdit(`${id}:${field}`);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  // 在某列輸入用量 → 自動清掉其他列的用量，這列直接成為新的用量基準。
  // 原本的基準列如果當量是空白（代表 1.0），會自動補上 "1"，讓它換算結果不變。
  function handleScaleChange(id, value) {
    beginEdit(`${id}:scaleValue`);
    const filled = String(value).trim() !== "";
    const others = rowsRef.current.filter((r) => r.id !== id && hasScale(r));
    setRows((rs) => rs.map((r) => {
      if (r.id === id) return { ...r, scaleValue: value };
      if (filled && hasScale(r)) {
        return { ...r, scaleValue: "", equivInput: String(r.equivInput || "").trim() ? r.equivInput : "1" };
      }
      return r;
    }));
    if (filled && others.length > 0) {
      const me = rowsRef.current.find((r) => r.id === id);
      showToast(`用量基準改為「${(me && me.name) || "這一列"}」`, "success", { label: "復原", fn: undo });
    }
  }

  function handleSelectReagent(id, entry) {
    pushUndo();
    markEdited();
    // 換試劑時先清掉上一個試劑的密度／濃度／純度，再帶入資料庫裡有存的值
    const patch = {
      name: entry.name, cas: entry.cas || "", mw: String(entry.mw),
      liquidMode: "", density: "", molarity: "", purity: "",
    };
    if (entry.density !== undefined && entry.density !== null && String(entry.density) !== "") {
      patch.density = String(entry.density);
      patch.liquidMode = "density";
    } else if (entry.molarity !== undefined && entry.molarity !== null && String(entry.molarity) !== "") {
      patch.molarity = String(entry.molarity);
      patch.liquidMode = "molarity";
    }
    if (entry.purity !== undefined && entry.purity !== null && String(entry.purity) !== "") {
      patch.purity = String(entry.purity);
    }
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    lastEditKeyRef.current = null;
    setRows((r) => [...r, newRow()]);
  }

  function removeRow(id) {
    const target = rowsRef.current.find((r) => r.id === id);
    pushUndo();
    markEdited();
    setRows((r) => r.filter((row) => row.id !== id));
    showToast(`已刪除「${(target && target.name) || "未命名試劑"}」`, "success", { label: "復原", fn: undo });
  }

  function clearCalculation() {
    setMenuOpen(false);
    flushAuto();
    pushUndo();
    setRows([newRow(), newRow(), newRow()]);
    setReactionNameInput("");
    setCurrentReactionId(null);
    setConfirmOverwrite(false);
    setMoreOpen({});
    startNewSession();
    showToast("已開始新的計算", "success", { label: "復原", fn: undo });
  }

  // 「固定這筆紀錄」：目前內容記成一筆，之後的修改另開新的一筆（例如同一個反應換規模再做一次）
  function pinAndBranch() {
    setMenuOpen(false);
    if (!isCalcMeaningful(rowsRef.current)) {
      showToast("還沒有可記錄的計算（需要用量基準和至少兩個試劑）", "error");
      return;
    }
    sessionRef.current.dirty = true;
    flushAuto();
    startNewSession();
    showToast("已固定這筆紀錄，接下來的修改會另存成新的一筆");
  }

  function handleNameChange(v) {
    beginEdit("name");
    setReactionNameInput(v);
    setConfirmOverwrite(false);
  }

  function loadEntry(entry, kind) {
    flushAuto();
    pushUndo();
    setRows(cloneRows(entry.rows));
    // 沒有命名、只用時間標示的自動紀錄，載入後名稱留空
    setReactionNameInput(kind === "history" && entry.autoName && entry.name === entry.autoName ? "" : entry.name);
    setCurrentReactionId(kind === "saved" ? entry.id : null);
    setConfirmOverwrite(false);
    setMoreOpen({});
    startNewSession();
    setTab("calc");
    showToast(`已載入「${entry.name}」`, "success", { label: "復原", fn: undo });
  }

  // ---------- 儲存範本：同名就更新、不同名就新增 ----------

  const currentSaved = savedReactions.find((s) => s.id === currentReactionId) || null;
  const nameMatchesCurrent = !!currentSaved && nameKey(currentSaved.name) === nameKey(reactionNameInput);
  const sameNameOther = savedReactions.find((s) => nameKey(s.name) === nameKey(reactionNameInput) && s.id !== currentReactionId) || null;

  function handleSave() {
    const name = nameRef.current.trim();
    if (!name) {
      showToast("請先輸入反應名稱", "error");
      nameInputRef.current?.focus();
      return;
    }
    const saved = savedRef.current;
    const curId = currentIdRef.current;
    const existing = saved.find((s) => nameKey(s.name) === nameKey(name));
    if (existing && existing.id !== curId && !confirmOverwrite) {
      setConfirmOverwrite(true); // 會蓋掉另一筆同名範本，先確認
      return;
    }
    const rowsCopy = cloneRows(rowsRef.current);
    let next, id, msg;
    if (existing) {
      next = saved.map((s) => (s.id === existing.id ? { ...s, name, rows: rowsCopy, savedAt: Date.now() } : s));
      id = existing.id;
      msg = `已更新範本「${name}」`;
    } else {
      const entry = { id: uid(), name, savedAt: Date.now(), rows: rowsCopy };
      next = [...saved, entry];
      id = entry.id;
      msg = `已儲存範本「${name}」`;
    }
    setSaved(next);
    setCurrentReactionId(id);
    setConfirmOverwrite(false);
    showToast(msg, "success", { label: "復原", fn: () => { setSaved(saved); setCurrentReactionId(curId); } });
  }

  // ---------- 紀錄頁（範本＋自動紀錄） ----------

  function deleteSaved(id) {
    const prev = savedRef.current;
    const prevCur = currentIdRef.current;
    const target = prev.find((s) => s.id === id);
    setSaved(prev.filter((s) => s.id !== id));
    if (prevCur === id) setCurrentReactionId(null);
    showToast(`已刪除範本「${target ? target.name : ""}」`, "success", {
      label: "復原", fn: () => { setSaved(prev); if (prevCur === id) setCurrentReactionId(prevCur); },
    });
  }

  function deleteHistory(id) {
    const prev = historyRef.current;
    const target = prev.find((h) => h.id === id);
    const wasCurrent = sessionRef.current.historyId === id;
    setHistory(prev.filter((h) => h.id !== id));
    if (wasCurrent) { sessionRef.current = { historyId: null, dirty: false }; setAutoInfo(null); }
    showToast(`已刪除紀錄「${target ? target.name : ""}」`, "success", {
      label: "復原", fn: () => { setHistory(prev); if (wasCurrent) { sessionRef.current.historyId = id; setAutoInfo(target ? { at: target.savedAt } : null); } },
    });
  }

  function clearAllHistory() {
    const prev = historyRef.current;
    const prevSession = sessionRef.current.historyId;
    setHistory([]);
    sessionRef.current = { historyId: null, dirty: false };
    setAutoInfo(null);
    setConfirmClearHistory(false);
    setExpandedRecordKey(null);
    showToast(`已清空 ${prev.length} 筆紀錄`, "success", {
      label: "復原", fn: () => { setHistory(prev); sessionRef.current.historyId = prevSession; },
    });
  }

  function saveHistoryAsTemplate(h) {
    const prev = savedRef.current;
    let name = h.name;
    let n = 2;
    while (prev.some((s) => nameKey(s.name) === nameKey(name))) name = `${h.name} (${n++})`;
    const entry = { id: uid(), name, savedAt: Date.now(), rows: cloneRows(h.rows) };
    setSaved([...prev, entry]);
    showToast(`已存成範本「${name}」`, "success", { label: "復原", fn: () => setSaved(prev) });
  }

  // ---------- 樣品化合物 ----------

  const [confirmOverwriteRowId, setConfirmOverwriteRowId] = useState(null);

  function saveSampleCompound(row) {
    const code = String(row.sampleCode || row.name || "").trim();
    if (!code || !row.name || !row.mw) {
      showToast("請先填好名稱、分子量與樣品代號", "error");
      return false;
    }
    const mw = parseFloat(row.mw);
    if (isNaN(mw)) {
      showToast("分子量格式不正確", "error");
      return false;
    }
    const exists = samplesRef.current.some((s) => s.code.toLowerCase() === code.toLowerCase());
    if (exists && confirmOverwriteRowId !== row.id) {
      setConfirmOverwriteRowId(row.id);
      return false;
    }
    const filtered = samplesRef.current.filter((s) => s.code.toLowerCase() !== code.toLowerCase());
    setSamples([...filtered, { code, name: row.name, mw }]);
    setConfirmOverwriteRowId(null);
    showToast(exists ? `已更新樣品「${code}」` : `已記住樣品「${code}」`);
    return true;
  }

  function deleteSampleCompound(code) {
    const prev = samplesRef.current;
    setSamples(prev.filter((s) => s.code !== code));
    showToast(`已刪除樣品「${code}」`, "success", { label: "復原", fn: () => setSamples(prev) });
  }

  const [editingSampleCode, setEditingSampleCode] = useState(null);
  const [sampleEditBuffer, setSampleEditBuffer] = useState({ name: "", mw: "" });
  function startEditSample(s) {
    setEditingSampleCode(s.code);
    setSampleEditBuffer({ name: s.name, mw: String(s.mw) });
  }
  function saveEditSample(code) {
    const mw = parseFloat(sampleEditBuffer.mw);
    if (!sampleEditBuffer.name.trim() || isNaN(mw)) {
      showToast("請填好名稱與分子量", "error");
      return;
    }
    setSamples(samplesRef.current.map((s) => (s.code === code ? { ...s, name: sampleEditBuffer.name.trim(), mw } : s)));
    setEditingSampleCode(null);
    showToast(`已更新樣品「${code}」`);
  }

  // ---------- 資料庫 ----------

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
    const next = dbRef.current.map((d) => ({ ...d }));
    const byCas = new Map(next.map((d) => [String(d.cas || "").toLowerCase(), d]));
    const byName = new Map(next.map((d) => [String(d.name || "").toLowerCase(), d]));
    for (const item of incoming) {
      const cas = String(item.cas || "").trim();
      const name = String(item.name || "").trim();
      const mw = parseFloat(item.mw);
      const location = String(item.location || "").trim();
      const density = String(item.density ?? "").trim();
      const molarity = String(item.molarity ?? "").trim();
      const purity = String(item.purity ?? "").trim();
      if (!name || isNaN(mw)) continue;
      const key = cas ? cas.toLowerCase() : null;
      const existing = key ? byCas.get(key) : byName.get(name.toLowerCase());
      if (existing) {
        existing.name = name; existing.mw = mw;
        if (cas) existing.cas = cas;
        existing.location = mergeLocations(existing.location, location);
        // 匯入檔沒填的話，保留原本已有的密度／濃度／純度，不要被空值蓋掉
        if (density) existing.density = density;
        if (molarity) existing.molarity = molarity;
        if (purity) existing.purity = purity;
        updated++;
      } else {
        const entry = { id: uid(), name, cas, mw, location, density, molarity, purity };
        next.push(entry);
        if (cas) byCas.set(cas.toLowerCase(), entry);
        byName.set(name.toLowerCase(), entry);
        added++;
      }
    }
    setDbPersist(next);
    setImportMsg({ type: "success", text: `匯入完成：新增 ${added} 筆，更新 ${updated} 筆` });
    showToast(`匯入完成：新增 ${added} 筆，更新 ${updated} 筆`);
    e.target.value = "";
  }

  function exportDb() {
    const csv = [
      "name,cas,mw,location,density,molarity,purity",
      ...dbRef.current.map((d) => `"${d.name}","${d.cas || ""}",${d.mw},"${d.location || ""}","${d.density || ""}","${d.molarity || ""}","${d.purity || ""}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "reagent-database.csv"; a.click();
    URL.revokeObjectURL(url);
    showToast(`已匯出 ${dbRef.current.length} 筆試劑為 CSV`);
    return true;
  }

  const [newEntry, setNewEntry] = useState(EMPTY_DB_ENTRY);
  function addDbEntry() {
    const mw = parseFloat(newEntry.mw);
    if (!newEntry.name || isNaN(mw)) {
      showToast("請先填好名稱與分子量", "error");
      return false;
    }
    const cas = newEntry.cas.trim();
    const fields = {
      name: newEntry.name.trim(), mw,
      density: newEntry.density.trim(), molarity: newEntry.molarity.trim(), purity: newEntry.purity.trim(),
    };
    const location = newEntry.location.trim();
    const cur = dbRef.current;
    const existingIdx = cas ? cur.findIndex((d) => String(d.cas || "").toLowerCase() === cas.toLowerCase()) : -1;
    let next;
    if (existingIdx >= 0) {
      next = [...cur];
      next[existingIdx] = { ...next[existingIdx], ...fields, location: mergeLocations(next[existingIdx].location, location) };
    } else {
      next = [...cur, { id: uid(), cas, location, ...fields }];
    }
    setDbPersist(next);
    showToast(existingIdx >= 0 ? `已更新「${fields.name}」（CAS 相符）` : `已新增「${fields.name}」到資料庫`);
    setNewEntry(EMPTY_DB_ENTRY);
    return true;
  }

  function deleteDbEntry(id) {
    const prev = dbRef.current;
    const target = prev.find((d) => d.id === id);
    setDbPersist(prev.filter((d) => d.id !== id));
    showToast(`已刪除「${target ? target.name : ""}」`, "success", { label: "復原", fn: () => setDbPersist(prev) });
  }

  const [dbFilter, setDbFilter] = useState("");
  const [editingDbId, setEditingDbId] = useState(null);
  const [editBuffer, setEditBuffer] = useState(EMPTY_DB_ENTRY);

  function startEditDbEntry(d) {
    const s = (v) => (v !== undefined && v !== null ? String(v) : "");
    setEditingDbId(d.id);
    setEditBuffer({ name: d.name, cas: s(d.cas), mw: s(d.mw), location: s(d.location), density: s(d.density), molarity: s(d.molarity), purity: s(d.purity) });
  }
  function saveEditDbEntry(id) {
    const mw = parseFloat(editBuffer.mw);
    if (!editBuffer.name.trim() || isNaN(mw)) {
      showToast("請填好名稱與分子量", "error");
      return;
    }
    const name = editBuffer.name.trim();
    setDbPersist(dbRef.current.map((d) => (d.id === id ? {
      ...d, name, cas: editBuffer.cas.trim(), mw, location: editBuffer.location.trim(),
      density: editBuffer.density.trim(), molarity: editBuffer.molarity.trim(), purity: editBuffer.purity.trim(),
    } : d)));
    setEditingDbId(null);
    showToast(`已更新「${name}」`);
  }

  const filteredDb = useMemo(() => filterReagents(db, dbFilter, ["location"]), [db, dbFilter]);

  async function handleCopy(text) {
    if (!text || text === "—") return;
    const ok = await copyText(text);
    showToast(ok ? `已複製 ${text}` : "複製失敗，請長按手動複製", ok ? "success" : "error");
  }

  const calc = computeReaction(rows);
  const { referenceRow, multipleScaleFilled } = calc;

  const inputCls = "w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2";
  const ringStyle = { "--tw-ring-color": ACCENT };

  // ---------- render ----------

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
          {/* 名稱 + 回上一步 + 儲存 + 更多 */}
          <div className="bg-white rounded-xl border border-slate-200 p-3 mb-3">
            <div className="flex items-center gap-2">
              <input
                ref={nameInputRef}
                type="text"
                value={reactionNameInput}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="反應名稱（選填）"
                className="border border-slate-200 rounded-lg px-3 h-10 text-sm flex-1 min-w-0 focus:outline-none focus:ring-2"
                style={ringStyle}
              />
              <button
                onClick={undoWithToast}
                disabled={undoDepth === 0}
                title="回上一步"
                aria-label="回上一步"
                className="w-10 h-10 shrink-0 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center disabled:opacity-30"
              >
                <Undo2 size={17} />
              </button>
              <button
                onClick={handleSave}
                className="h-10 px-3 shrink-0 rounded-lg text-white text-sm font-medium flex items-center gap-1.5"
                style={{ backgroundColor: ACCENT }}
              >
                <Save size={15} /> {nameMatchesCurrent ? "更新" : "儲存"}
              </button>
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="更多動作"
                  className="w-10 h-10 rounded-lg border border-slate-200 text-slate-500 flex items-center justify-center"
                >
                  <MoreHorizontal size={18} />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 top-11 z-40 w-64 bg-white border border-slate-200 rounded-xl shadow-lg py-1 text-sm">
                      <button onClick={clearCalculation} className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700">
                        <FilePlus2 size={16} className="text-slate-400" /> 新的計算（清除目前輸入）
                      </button>
                      <button onClick={pinAndBranch} className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-start gap-2.5 text-slate-700">
                        <Pin size={16} className="text-slate-400 mt-0.5 shrink-0" />
                        <span>固定這筆紀錄<span className="block text-[11px] text-slate-400">之後的修改另存成新的一筆，例如換規模再做一次</span></span>
                      </button>
                      <button onClick={() => { setMenuOpen(false); setRecordsFilter("saved"); setTab("records"); }}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-700">
                        <History size={16} className="text-slate-400" /> 從範本／紀錄載入
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {confirmOverwrite && sameNameOther && (
              <div className="mt-2 flex items-center gap-2 flex-wrap bg-amber-50 rounded-lg px-2.5 py-2">
                <span className="text-xs text-amber-700 flex-1 min-w-[150px]">已有同名範本「{sameNameOther.name}」，要覆蓋它嗎？</span>
                <button onClick={handleSave} className="text-xs px-2.5 py-1.5 rounded-lg text-white bg-amber-500 flex items-center gap-1">
                  <Check size={12} /> 覆蓋
                </button>
                <button onClick={() => setConfirmOverwrite(false)} className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center gap-1">
                  <X size={12} /> 取消
                </button>
              </div>
            )}

            <div className="mt-2 text-[11px] leading-snug text-slate-400 flex flex-col gap-0.5">
              {currentSaved && (
                <span>
                  範本：<span className="text-slate-600">{currentSaved.name}</span>
                  {!nameMatchesCurrent && reactionNameInput.trim() && "（已改名，按儲存會另存成新範本）"}
                </span>
              )}
              {autoInfo ? (
                <span className="text-emerald-600 flex items-center gap-1"><Check size={11} /> 已自動記錄到「紀錄」· {formatTimeOnly(autoInfo.at)}</span>
              ) : (
                <span>算出結果後會自動記錄到「紀錄」，不用另外按</span>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3">
            {!referenceRow && !multipleScaleFilled && (
              <div className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2 mb-2">
                <AlertCircle size={14} className="shrink-0" /> 在任一列的「用量」填入秤重或 mmol，那列就是換算基準
              </div>
            )}
            {multipleScaleFilled && (
              <div className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-2 mb-2">
                <AlertCircle size={14} className="shrink-0" /> 有多列都填了用量，請清空其餘欄位，只留一列當基準
              </div>
            )}

            <div className="text-[11px] text-slate-400 mb-2 px-1">點結果數字可複製 · 向左滑動可刪除試劑</div>

            <div className="space-y-2">
              {rows.map((row) => {
                const result = calc.results[row.id] || { mmol: null, mass: null, volumeUL: null };
                const isBase = !!referenceRow && row.id === referenceRow.id;
                const { chips, mmolText } = resultChips(row, result, isBase);
                const tags = rowModifierTags(row);
                const isMore = !!moreOpen[row.id];
                const equivHasPercent = String(row.equivInput || "").includes("%");
                return (
                  <SwipeToDeleteRow key={row.id} onDelete={() => removeRow(row.id)} disabled={rows.length <= 1}>
                  <div className={`rounded-lg px-1.5 py-2 ${isBase ? "bg-sky-50" : "bg-slate-50"}`}>
                    <div className="grid grid-cols-2 gap-2 items-center">
                      <ReagentPicker
                        db={db}
                        samples={sampleCompounds}
                        value={row.name}
                        onSelect={(entry) => handleSelectReagent(row.id, entry)}
                        onNameChange={(v) => updateRowField(row.id, "name", v)}
                        placeholder="名稱/代號/CAS"
                      />
                      {/* 用量：哪一列有填，哪一列就是基準 */}
                      <div className="relative">
                        <input type="text" inputMode="decimal" value={row.scaleValue}
                          onChange={(e) => handleScaleChange(row.id, e.target.value)}
                          placeholder="用量"
                          className={inputCls + " pr-14"} style={ringStyle} />
                        <button
                          type="button"
                          onClick={() => {
                            const idx = SCALE_UNITS.indexOf(row.scaleUnit);
                            updateRowField(row.id, "scaleUnit", SCALE_UNITS[(idx + 1) % SCALE_UNITS.length]);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-xs font-medium px-1.5 py-1 rounded-md border border-slate-200 bg-white"
                          style={{ color: ACCENT }}
                          title="切換單位（mmol / mg / g）"
                        >
                          {row.scaleUnit}
                        </button>
                      </div>
                      <SuffixInput value={row.mw} onChange={(v) => updateRowField(row.id, "mw", v)}
                        placeholder="分子量" suffix="g/mol" inputMode="decimal" />
                      <SuffixInput value={row.equivInput} onChange={(v) => updateRowField(row.id, "equivInput", v)}
                        placeholder={isBase ? "當量（預設 1）" : "當量或 mol%"} suffix={equivHasPercent ? "" : "equiv"} />
                    </div>

                    {/* 結果：點一下複製 */}
                    <div className="flex items-center justify-between gap-2 px-0.5 mt-2">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {chips.map((c, i) => (
                          <ResultChip key={i} text={c.text} primary={i === 0}
                            color={c.kind === "volume" ? VOLUME_COLOR : ACCENT}
                            onCopy={() => handleCopy(c.text)} />
                        ))}
                        {mmolText && (
                          <button type="button" onClick={() => handleCopy(mmolText)} className="text-xs text-slate-400 px-1 py-1">
                            {mmolText}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isBase && (
                          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ color: ACCENT, backgroundColor: "#EAF2FA" }}>用量基準</span>
                        )}
                        <button
                          type="button"
                          onClick={() => setMoreOpen((m) => ({ ...m, [row.id]: !m[row.id] }))}
                          className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border bg-white max-w-[130px] ${tags.length ? "border-sky-200 text-sky-700" : "border-slate-200 text-slate-500"}`}
                        >
                          <SlidersHorizontal size={12} className="shrink-0" />
                          <span className="truncate">{tags.length ? tags.join(" · ") : "純度・液體"}</span>
                          <ChevronDown size={12} className={`shrink-0 transition-transform ${isMore ? "rotate-180" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {isMore && (
                      <div className="mt-2 p-2.5 rounded-lg bg-white border border-slate-200 space-y-3">
                        {/* 狀態：固體 / 純液體（密度）/ 溶液（濃度） */}
                        <div>
                          <div className="text-[11px] text-slate-500 mb-1">狀態</div>
                          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                            {[["", "固體"], ["density", "純液體"], ["molarity", "溶液"]].map(([mode, label], i) => {
                              const active = (row.liquidMode || "") === mode;
                              return (
                                <button key={mode || "solid"} type="button"
                                  onClick={() => updateRowField(row.id, "liquidMode", mode)}
                                  className={`flex-1 py-1.5 ${i > 0 ? "border-l border-slate-200" : ""} ${active ? "text-white" : "text-slate-500 bg-white"}`}
                                  style={active ? { backgroundColor: ACCENT } : undefined}>
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                          {row.liquidMode === "density" && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="w-32 shrink-0">
                                <SuffixInput value={row.density} onChange={(v) => updateRowField(row.id, "density", v)}
                                  placeholder="密度" suffix="g/mL" inputMode="decimal" compact />
                              </div>
                              <span className="text-[11px] text-slate-400">由秤重換算體積</span>
                            </div>
                          )}
                          {row.liquidMode === "molarity" && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <div className="w-32 shrink-0">
                                <SuffixInput value={row.molarity} onChange={(v) => updateRowField(row.id, "molarity", v)}
                                  placeholder="濃度" suffix="M" inputMode="decimal" compact />
                              </div>
                              <span className="text-[11px] text-slate-400">如 n-BuLi 2.5 M，不需分子量</span>
                            </div>
                          )}
                        </div>

                        {/* 純度 */}
                        <div>
                          <div className="text-[11px] text-slate-500 mb-1">純度</div>
                          <div className="flex items-center gap-2">
                            <div className="w-32 shrink-0">
                              <SuffixInput value={row.purity} onChange={(v) => updateRowField(row.id, "purity", v)}
                                placeholder="100" suffix="%" inputMode="decimal" compact disabled={row.liquidMode === "molarity"} />
                            </div>
                            <span className="text-[11px] text-slate-400 leading-snug">
                              {row.liquidMode === "molarity" ? "溶液已用濃度計算，不需純度" : "如 NaH 60% in oil，秤重會自動除以純度"}
                            </span>
                          </div>
                        </div>

                        {/* 記住為樣品化合物 */}
                        <div>
                          <div className="text-[11px] text-slate-500 mb-1">記住為樣品化合物（之後搜尋代號即可帶入）</div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <input type="text" value={row.sampleCode}
                              onChange={(e) => { updateRowField(row.id, "sampleCode", e.target.value); setConfirmOverwriteRowId(null); }}
                              placeholder={row.name ? `代號（預設 ${row.name}）` : "樣品代號"}
                              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[110px] focus:outline-none focus:ring-2" style={ringStyle} />
                            {confirmOverwriteRowId === row.id ? (
                              <>
                                <span className="text-xs text-amber-600">代號已存在，覆蓋？</span>
                                <ActionButton onAction={() => saveSampleCompound(row)} doneLabel="已更新" doneIcon={<Check size={12} />}
                                  className="text-xs px-2 py-1.5 rounded-lg text-white flex items-center gap-1 bg-amber-500">
                                  <Check size={12} /> 覆蓋
                                </ActionButton>
                                <button onClick={() => setConfirmOverwriteRowId(null)}
                                  className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 text-slate-500 flex items-center gap-1">
                                  <X size={12} /> 取消
                                </button>
                              </>
                            ) : (
                              <ActionButton onAction={() => saveSampleCompound(row)} doneLabel="已記住" doneIcon={<Check size={12} />}
                                disabled={!row.name || !row.mw}
                                className="text-xs px-2.5 py-1.5 rounded-lg text-white disabled:opacity-30 flex items-center gap-1"
                                style={{ backgroundColor: ACCENT }}>
                                <BookmarkPlus size={12} /> 記住
                              </ActionButton>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
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

      {tab === "records" && (() => {
        const q = recordsSearch.trim().toLowerCase();
        const all = [
          ...savedReactions.map((s) => ({ ...s, kind: "saved" })),
          ...historyEntries.map((h) => ({ ...h, kind: "history" })),
        ].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        const items = all.filter((it) =>
          (recordsFilter === "all" || it.kind === recordsFilter) &&
          (!q || it.name.toLowerCase().includes(q) || it.rows.some((r) => String(r.name || "").toLowerCase().includes(q)))
        );
        const filters = [
          ["all", "全部", all.length],
          ["saved", "範本", savedReactions.length],
          ["history", "自動紀錄", historyEntries.length],
        ];
        return (
          <div className="px-4 py-4 space-y-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5">
              <div className="flex items-center gap-2">
                <Search size={14} className="text-slate-300 shrink-0" />
                <input type="text" value={recordsSearch} onChange={(e) => setRecordsSearch(e.target.value)}
                  placeholder="搜尋反應名稱或試劑" className="flex-1 text-sm focus:outline-none min-w-0" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {filters.map(([key, label, count]) => {
                  const active = recordsFilter === key;
                  return (
                    <button key={key} onClick={() => { setRecordsFilter(key); setConfirmClearHistory(false); }}
                      className={`text-xs px-2.5 py-1.5 rounded-full border ${active ? "text-white border-transparent" : "text-slate-500 border-slate-200 bg-white"}`}
                      style={active ? { backgroundColor: ACCENT } : undefined}>
                      {label} {count}
                    </button>
                  );
                })}
                {recordsFilter === "history" && historyEntries.length > 0 && (
                  confirmClearHistory ? (
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">清空全部紀錄？</span>
                      <button onClick={clearAllHistory} className="text-xs px-2 py-1 rounded-lg bg-red-500 text-white">清空</button>
                      <button onClick={() => setConfirmClearHistory(false)} className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-500">取消</button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmClearHistory(true)}
                      className="ml-auto text-xs text-slate-400 hover:text-red-500 flex items-center gap-1">
                      <Trash2 size={13} /> 清空
                    </button>
                  )
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
                {all.length === 0
                  ? "還沒有任何紀錄。在「計算」頁算出結果後會自動記錄；按「儲存」可存成範本。"
                  : "沒有符合的項目"}
              </div>
            ) : items.map((it) => {
              const key = `${it.kind}-${it.id}`;
              const isExpanded = expandedRecordKey === key;
              const limiting = it.rows.find(hasScale);
              const isCurrent = it.kind === "saved" && it.id === currentReactionId;
              return (
                <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <button onClick={() => setExpandedRecordKey(isExpanded ? null : key)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-medium text-slate-700 truncate">{it.name}</span>
                        {it.kind === "saved" ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0" style={{ color: ACCENT, backgroundColor: "#EAF2FA" }}>範本</span>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 text-slate-500 bg-slate-100">自動紀錄</span>
                        )}
                        {isCurrent && <span className="text-[10px] text-emerald-600 shrink-0">使用中</span>}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {it.rows.length} 個試劑{limiting ? ` · 基準：${limiting.name || "（未命名）"}` : ""}
                        {it.savedAt ? ` · ${formatTimestampLabel(it.savedAt)}` : ""}
                      </div>
                    </div>
                    <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-slate-100 pt-3">
                      <div className="grid gap-2 text-xs text-slate-400 px-1 pb-1" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,0.8fr) minmax(0,1.6fr)" }}>
                        <div>試劑</div>
                        <div>MW</div>
                        <div>用量 / 當量</div>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {it.rows.map((r, i) => {
                          const p = parseFloat(r.purity);
                          const purityText = !isNaN(p) && p > 0 && p < 100 && r.liquidMode !== "molarity" ? ` · ${p}%` : "";
                          return (
                            <div key={r.id || i} className="grid gap-2 items-center py-1.5 px-1 text-sm" style={{ gridTemplateColumns: "minmax(0,1.6fr) minmax(0,0.8fr) minmax(0,1.6fr)" }}>
                              <div className="text-slate-700 truncate">{r.name || "—"}</div>
                              <div className="text-slate-500 truncate">{r.mw || "—"}</div>
                              <div className="text-slate-500 leading-snug">
                                {hasScale(r) ? (
                                  <span style={{ color: ACCENT }}>{r.scaleValue} {r.scaleUnit || "mmol"}</span>
                                ) : (r.equivInput ? `${r.equivInput}${String(r.equivInput).includes("%") ? "" : " equiv"}` : "—")}
                                {purityText}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                        <button onClick={() => loadEntry(it, it.kind)}
                          className="text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
                          <Calculator size={14} /> 載入到計算頁
                        </button>
                        {it.kind === "history" && (
                          <button onClick={() => saveHistoryAsTemplate(it)}
                            className="text-sm px-3 py-2 rounded-lg border flex items-center gap-1.5" style={{ borderColor: ACCENT, color: ACCENT }}>
                            <BookmarkPlus size={14} /> 存成範本
                          </button>
                        )}
                        <button onClick={() => (it.kind === "saved" ? deleteSaved(it.id) : deleteHistory(it.id))}
                          className="ml-auto text-sm px-2 py-2 text-slate-400 hover:text-red-500 flex items-center gap-1.5">
                          <Trash2 size={14} /> 刪除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {tab === "db" && (
        <div className="px-4 py-4 space-y-3">
          {/* 搜尋放最上面：這是資料庫頁最常用的功能 */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2 border border-slate-200 rounded-lg px-2.5 h-10">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input type="text" value={dbFilter} onChange={(e) => setDbFilter(e.target.value)}
                placeholder="搜尋名稱、化學式、CAS 或位置" className="flex-1 text-sm focus:outline-none min-w-0" />
              {dbFilter && (
                <button onClick={() => setDbFilter("")} className="text-slate-400" aria-label="清除搜尋"><X size={15} /></button>
              )}
            </div>
            {!dbLoaded ? (
              <div className="text-sm text-slate-400 py-6 text-center">載入中…</div>
            ) : filteredDb.length === 0 ? (
              <div className="text-sm text-slate-400 py-6 text-center">
                {db.length === 0 ? "尚未有任何試劑，請先匯入藥冊或手動新增" : "沒有符合的結果"}
              </div>
            ) : (
              <>
                <div className="text-[11px] text-slate-400 mb-1.5 px-1">
                  共 {filteredDb.length} 筆 · 點一列可編輯，向左滑動可刪除
                </div>
                <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                  {filteredDb.map((d) => {
                    const isEditing = editingDbId === d.id;
                    return (
                      <SwipeToDeleteRow key={d.id} onDelete={() => deleteDbEntry(d.id)} disabled={isEditing}>
                        {isEditing ? (
                          <div className="bg-sky-50 rounded-lg p-2.5">
                            <DbEntryFields value={editBuffer} onChange={setEditBuffer} inputCls={inputCls + " text-sm bg-white"} ringStyle={ringStyle} />
                            <div className="flex gap-2 mt-1.5">
                              <button onClick={() => saveEditDbEntry(d.id)}
                                disabled={!editBuffer.name.trim() || isNaN(parseFloat(editBuffer.mw))}
                                className="flex-1 text-xs py-2 rounded-lg text-white disabled:opacity-30 flex items-center justify-center gap-1"
                                style={{ backgroundColor: ACCENT }}>
                                <Check size={13} /> 儲存
                              </button>
                              <button onClick={() => setEditingDbId(null)}
                                className="flex-1 text-xs py-2 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center gap-1">
                                <X size={13} /> 取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => startEditDbEntry(d)} className="w-full text-left py-2 px-1.5 text-sm rounded-lg bg-white hover:bg-slate-50">
                            <div className="font-medium text-slate-700">{d.name}</div>
                            <div className="text-xs text-slate-400">
                              {d.cas ? `CAS ${d.cas} · ` : ""}MW {d.mw}
                              {d.purity ? ` · 純度 ${d.purity}%` : ""}
                              {d.density ? ` · 密度 ${d.density} g/mL` : ""}
                              {d.molarity ? ` · 濃度 ${d.molarity} M` : ""}
                              {d.location ? ` · 位置 ${d.location}` : ""}
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

          {sampleCompounds.length > 0 && (
            <div className="bg-amber-50/60 rounded-xl border border-amber-200 p-3">
              <div className="text-sm font-semibold text-slate-700 mb-0.5">已記住的樣品化合物</div>
              <div className="text-xs text-slate-500 mb-2">獨立存放，不會跟藥冊一起匯入／匯出。點一列可編輯，向左滑動可刪除</div>
              <div className="space-y-1.5 max-h-[248px] overflow-y-auto">
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
                              className="flex-1 text-xs py-2 rounded-lg text-white disabled:opacity-30 flex items-center justify-center gap-1"
                              style={{ backgroundColor: ACCENT }}>
                              <Check size={13} /> 儲存
                            </button>
                            <button onClick={() => setEditingSampleCode(null)}
                              className="flex-1 text-xs py-2 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center gap-1">
                              <X size={13} /> 取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => startEditSample(s)} className="w-full text-left py-2 px-1.5 text-sm rounded-lg bg-amber-50 hover:bg-amber-100">
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

          <Collapsible title="手動新增試劑" icon={<Plus size={15} />} open={dbPanel === "add"} onToggle={() => setDbPanel((p) => (p === "add" ? null : "add"))}>
            <DbEntryFields value={newEntry} onChange={setNewEntry} inputCls={inputCls} ringStyle={ringStyle} />
            <div className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              純度、密度、濃度都是選填。填了之後在計算頁選到這個試劑會自動帶入：例如 NaH 填純度 60、純液體填密度、n-BuLi 這類溶液填濃度。
            </div>
            <ActionButton onAction={addDbEntry} doneLabel="已新增" disabled={!newEntry.name || !newEntry.mw}
              className="mt-2 text-sm px-3 py-2 rounded-lg text-white disabled:opacity-30 flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
              <Plus size={14} /> 新增
            </ActionButton>
          </Collapsible>

          <Collapsible title="藥冊匯入／匯出" icon={<Upload size={15} />} open={dbPanel === "import"} onToggle={() => setDbPanel((p) => (p === "import" ? null : "import"))}>
            <div className="flex gap-2 flex-wrap">
              <button onClick={handleImportClick} className="text-sm px-3 py-2 rounded-lg text-white flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
                <Upload size={14} /> 匯入 CSV / JSON
              </button>
              <ActionButton onAction={exportDb} doneLabel="已匯出"
                className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 flex items-center gap-1.5">
                <Download size={14} /> 匯出 CSV
              </ActionButton>
            </div>
            <div className="text-xs text-slate-400 mt-2 leading-relaxed">
              CSV 欄位需含 name（名稱）、mw（分子量），可另外加 cas、location（位置）、purity（純度 %）、density（密度 g/mL）、molarity（濃度 M）。CAS 相符會覆蓋更新，沒有 CAS 則用名稱比對；匯入檔沒填的純度／密度／濃度會保留原有的值。
            </div>
            {importMsg && (
              <div className={`mt-2 text-xs px-3 py-2 rounded-lg flex items-center gap-1.5 ${importMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                {importMsg.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
                {importMsg.text}
              </div>
            )}
          </Collapsible>
        </div>
      )}
        </div>
        {/* end scrollable content */}

        {/* toast：操作回饋提示條，浮在底部導覽列上方；可附「復原」按鈕 */}
        {toast && (
          <div
            key={toast.key}
            className="absolute left-0 right-0 flex justify-center px-4 pointer-events-none z-50"
            style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
          >
            <div
              className={`pointer-events-auto flex items-center gap-2 pl-3.5 pr-2 py-2 rounded-xl shadow-lg text-sm font-medium max-w-full ${
                toast.type === "error" ? "bg-red-600 text-white" : "bg-slate-800 text-white"
              }`}
              style={{ animation: "toastIn 0.18s ease-out" }}
            >
              {toast.type === "error" ? <AlertCircle size={16} className="shrink-0" /> : <Check size={16} className="shrink-0" />}
              <span className="leading-snug break-words py-0.5">{toast.text}</span>
              {toast.action && (
                <button
                  onClick={() => { toast.action.fn(); setToast(null); }}
                  className="shrink-0 ml-1 px-2.5 py-1 rounded-lg text-sky-300 font-semibold hover:bg-white/10"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </div>
        )}
        <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

        {/* bottom nav */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-stretch px-1 pt-1.5 shrink-0" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          {[
            ["calc", "計算", Calculator],
            ["records", "紀錄", History],
            ["db", "資料庫", Database],
          ].map(([key, label, Icon]) => (
            <button key={key} onClick={() => { setTab(key); setMenuOpen(false); }}
              className="flex-1 flex flex-col items-center gap-0.5 py-1 rounded-lg text-[11px] font-medium"
              style={{ color: tab === key ? ACCENT : "#94a3b8" }}>
              <Icon size={20} />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- 帶單位後綴的輸入框（例如 g/mol、equiv、%） ----------

function SuffixInput({ value, onChange, placeholder, suffix, inputMode, compact, disabled }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode={inputMode}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-slate-200 rounded-lg pl-2.5 ${compact ? "py-1.5" : "py-2"} ${suffix ? "pr-12" : "pr-2.5"} text-sm focus:outline-none focus:ring-2 disabled:bg-slate-50 disabled:text-slate-300`}
        style={{ "--tw-ring-color": ACCENT }}
      />
      {suffix && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 pointer-events-none">{suffix}</span>
      )}
    </div>
  );
}

// ---------- 結果數字：點一下複製 ----------

function ResultChip({ text, primary, color, onCopy }) {
  const empty = !text || text === "—";
  if (empty) {
    return <span className={`${primary ? "text-base" : "text-sm"} text-slate-300 px-1`}>—</span>;
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className={`flex items-center gap-1 rounded-lg font-semibold active:scale-95 transition-transform ${primary ? "text-base px-2.5 py-1" : "text-sm px-2 py-0.5"}`}
      style={{ color, backgroundColor: primary ? `${color}14` : "transparent", border: primary ? "none" : `1px solid ${color}33` }}
    >
      {text}
      <Copy size={primary ? 13 : 11} className="opacity-50" />
    </button>
  );
}

// ---------- 資料庫試劑欄位（新增與編輯共用） ----------

function DbEntryFields({ value, onChange, inputCls, ringStyle }) {
  const set = (field) => (e) => onChange((b) => ({ ...b, [field]: e.target.value }));
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <input type="text" value={value.name} onChange={set("name")} placeholder="名稱" className={inputCls} style={ringStyle} />
      <input type="text" value={value.cas} onChange={set("cas")} placeholder="CAS（選填）" className={inputCls} style={ringStyle} />
      <input type="text" inputMode="decimal" value={value.mw} onChange={set("mw")} placeholder="MW (g/mol)" className={inputCls} style={ringStyle} />
      <input type="text" inputMode="decimal" value={value.purity} onChange={set("purity")} placeholder="純度 %（選填）" className={inputCls} style={ringStyle} />
      <input type="text" inputMode="decimal" value={value.density} onChange={set("density")} placeholder="密度 g/mL（選填）" className={inputCls} style={ringStyle} />
      <input type="text" inputMode="decimal" value={value.molarity} onChange={set("molarity")} placeholder="濃度 M（選填）" className={inputCls} style={ringStyle} />
      <input type="text" value={value.location} onChange={set("location")} placeholder="位置（選填，如 2025YJC-A1-1）" className={inputCls + " col-span-2"} style={ringStyle} />
    </div>
  );
}

// ---------- 可收合的卡片 ----------

function Collapsible({ title, icon, open, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700">
        <span className="flex items-center gap-2"><span className="text-slate-400">{icon}</span>{title}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ---------- 按下後短暫顯示「已完成」狀態的按鈕 ----------
// onAction 可回傳 false 代表「這次沒有真的執行」（例如驗證未通過、或跳出確認流程），
// 此時不顯示成功狀態，避免誤導。
function ActionButton({ onAction, doneLabel = "已儲存", doneIcon, children, className, style, disabled, title }) {
  const [done, setDone] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  async function handleClick() {
    const result = await onAction?.();
    if (result === false) return;
    setDone(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDone(false), 1500);
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={title}
      className={className}
      style={done ? { ...style, backgroundColor: "#16a34a", borderColor: "#16a34a", color: "#fff" } : style}
    >
      {done ? (
        <>
          {doneIcon ?? <Check size={14} />}
          {doneLabel}
        </>
      ) : (
        children
      )}
    </button>
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
      {/* 只在滑動時才放刪除鈕，避免紅色從圓角邊緣透出來 */}
      {!disabled && (offset < 0 || dragging) && (
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
    const dbMatches = filterReagents(db, value)
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
                  <span className="text-xs text-slate-400">MW {o.mw}{o.purity ? ` · ${o.purity}%` : ""}{o.cas ? ` · CAS ${o.cas}` : ""}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
