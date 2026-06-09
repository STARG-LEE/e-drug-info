// GitHub Pages 정적 버전 — 백엔드 없이 브라우저에서 직접 식약처 API를 호출한다.
// 인증키는 localStorage(이 브라우저)에만 저장되며 외부로 전송되지 않는다.

const API = "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";
const LS_KEY = "edrug_service_key";

const FIELD_LABELS = {
  itemSeq: "품목기준코드",
  itemName: "제품명",
  entpName: "업체명",
  efcyQesitm: "효능",
  useMethodQesitm: "사용법",
  atpnWarnQesitm: "주의사항(경고)",
  atpnQesitm: "주의사항",
  intrcQesitm: "상호작용",
  seQesitm: "부작용",
  depositMethodQesitm: "보관법",
  itemImage: "낱알이미지",
  openDe: "공개일자",
  updateDe: "수정일자",
};
const FIELDS = Object.keys(FIELD_LABELS);

// 카드 본문에 표시할 필드
const CARD_FIELDS = [
  ["efcyQesitm", "효능"],
  ["useMethodQesitm", "사용법"],
  ["atpnWarnQesitm", "주의사항(경고)"],
  ["atpnQesitm", "주의사항"],
  ["intrcQesitm", "상호작용"],
  ["seQesitm", "부작용"],
  ["depositMethodQesitm", "보관법"],
];

const state = { q: "", entp: "", page: 1, rows: 10, total: 0, field: "", demo: true };

const $ = (s) => document.querySelector(s);
const results = $("#results");
const statusEl = $("#status");
const toolbar = $("#toolbar");
const pagination = $("#pagination");

// ── 인증키 관리 ──────────────────────────────────────────────
const getKey = () => localStorage.getItem(LS_KEY) || "";

function refreshMode() {
  state.demo = !getKey();
  const badge = $("#modeBadge");
  badge.textContent = state.demo ? "데모 모드" : "실데이터 모드";
  badge.classList.toggle("demo", state.demo);
  badge.classList.toggle("live", !state.demo);
  $("#demoBanner").classList.toggle("hidden", !state.demo);
}

$("#keySave").addEventListener("click", () => {
  const v = $("#keyInput").value.trim();
  if (v) localStorage.setItem(LS_KEY, v);
  $("#keyInput").value = "";
  refreshMode();
  $("#keyBar").open = false;
  if (state.q || state.entp) search();
});

$("#keyClear").addEventListener("click", () => {
  localStorage.removeItem(LS_KEY);
  $("#keyInput").value = "";
  refreshMode();
});

// 공공데이터포털 Encoding/Decoding 키 자동 처리
function encodeKey(key) {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

// ── API 호출 ────────────────────────────────────────────────
function normalize(it) {
  const out = {};
  for (const f of FIELDS) out[f] = it?.[f] ?? "";
  return out;
}

async function callApi({ itemName, entpName, efcyQesitm, pageNo, numOfRows }) {
  const p = new URLSearchParams();
  p.set("pageNo", pageNo);
  p.set("numOfRows", numOfRows);
  p.set("type", "json");
  if (itemName) p.set("itemName", itemName);
  if (entpName) p.set("entpName", entpName);
  if (efcyQesitm) p.set("efcyQesitm", efcyQesitm);
  const url = `${API}?serviceKey=${encodeKey(getKey())}&${p}`;
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("응답을 해석하지 못했습니다. 인증키가 올바른지 확인하세요.");
  }
  const root = data.response ?? data;
  const header = root.header ?? {};
  const body = root.body ?? {};
  if (header.resultCode && header.resultCode !== "00") {
    throw new Error(`API 오류 [${header.resultCode}] ${header.resultMsg ?? ""}`.trim());
  }
  let items = body.items ?? [];
  if (!Array.isArray(items)) items = items.item ? [].concat(items.item) : [];
  return {
    items: items.map(normalize),
    totalCount: Number(body.totalCount ?? items.length),
    raw: text,
  };
}

// 제품명 우선 → 0건이면 효능으로 폴백
async function liveSearch(q, entp, pageNo, numOfRows) {
  let r = await callApi({ itemName: q || undefined, entpName: entp || undefined, pageNo, numOfRows });
  let field = "itemName";
  if (q && r.totalCount === 0) {
    const e = await callApi({ efcyQesitm: q, entpName: entp || undefined, pageNo, numOfRows });
    if (e.totalCount > 0) {
      r = e;
      field = "efcyQesitm";
    }
  }
  return { ...r, field };
}

// ── 데모 모드 (샘플 데이터) ──────────────────────────────────
let samplePromise = null;
function loadSample() {
  if (!samplePromise) samplePromise = fetch("sample.json").then((r) => r.json());
  return samplePromise;
}
async function demoSearch(q, entp, pageNo, numOfRows) {
  const data = await loadSample();
  let items = data.items;
  if (q) items = items.filter((i) => i.itemName.includes(q) || (i.efcyQesitm || "").includes(q));
  if (entp) items = items.filter((i) => i.entpName.includes(entp));
  const start = (pageNo - 1) * numOfRows;
  return { items: items.slice(start, start + numOfRows), totalCount: items.length, field: "mixed", all: items };
}

// ── 검색 ────────────────────────────────────────────────────
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.q = $("#q").value.trim();
  state.entp = $("#entp").value.trim();
  state.page = 1;
  search();
});

async function search() {
  statusEl.textContent = "검색 중…";
  results.innerHTML = "";
  toolbar.classList.add("hidden");
  pagination.classList.add("hidden");
  try {
    const data = state.demo
      ? await demoSearch(state.q, state.entp, state.page, state.rows)
      : await liveSearch(state.q, state.entp, state.page, state.rows);
    state.total = data.totalCount || 0;
    state.field = data.field;
    render(data.items || []);
  } catch (e) {
    statusEl.innerHTML = `<div class="error">오류: ${escapeHtml(e.message)}</div>`;
  }
}

function render(items) {
  if (!items.length) {
    statusEl.textContent = "검색 결과가 없습니다.";
    return;
  }
  statusEl.textContent = "";
  const from = (state.page - 1) * state.rows + 1;
  const to = (state.page - 1) * state.rows + items.length;
  const badge = state.field === "efcyQesitm" ? ` <span class="badge">효능·증상 검색</span>` : "";
  $("#resultCount").innerHTML = `총 ${state.total.toLocaleString()}건 중 ${from}–${to}건 표시${badge}`;
  toolbar.classList.remove("hidden");
  results.innerHTML = items.map(card).join("");
  renderPagination();
}

function card(it) {
  const rows = CARD_FIELDS.filter(([k]) => it[k])
    .map(([k, label]) => `<div class="row"><dt>${label}</dt><dd>${escapeHtml(it[k])}</dd></div>`)
    .join("");
  const img = it.itemImage
    ? `<img class="pill-img" src="${escapeHtml(it.itemImage)}" alt="" onerror="this.remove()" />`
    : "";
  return `
    <article class="drug-card">
      <div class="card-head">
        ${img}
        <div>
          <h2>${escapeHtml(it.itemName)}</h2>
          <p class="entp">${escapeHtml(it.entpName)} · 품목기준코드 ${escapeHtml(it.itemSeq || "-")}</p>
        </div>
      </div>
      <dl class="card-body">${rows}</dl>
    </article>`;
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.total / state.rows));
  if (totalPages <= 1) {
    pagination.classList.add("hidden");
    return;
  }
  pagination.classList.remove("hidden");
  const cur = state.page;
  pagination.innerHTML = `
    <button class="btn btn-ghost" ${cur <= 1 ? "disabled" : ""} data-page="${cur - 1}">‹ 이전</button>
    <span>${cur} / ${totalPages}</span>
    <button class="btn btn-ghost" ${cur >= totalPages ? "disabled" : ""} data-page="${cur + 1}">다음 ›</button>`;
}

pagination.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-page]");
  if (!btn || btn.disabled) return;
  state.page = parseInt(btn.dataset.page, 10);
  search();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ── 다운로드 (브라우저에서 직접 파일 생성) ───────────────────
toolbar.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-dl]");
  if (!btn) return;
  const format = btn.dataset.dl;
  const scope = btn.dataset.scope;
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "준비 중…";
  try {
    await doDownload(format, scope);
  } catch (err) {
    statusEl.innerHTML = `<div class="error">다운로드 오류: ${escapeHtml(err.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
});

async function doDownload(format, scope) {
  let items;
  let rawJson = null;

  if (scope === "all") {
    items = await collectAll();
  } else if (state.demo) {
    const d = await demoSearch(state.q, state.entp, state.page, state.rows);
    items = d.items;
  } else {
    const r = await liveSearch(state.q, state.entp, state.page, state.rows);
    items = r.items;
    rawJson = r.raw; // 단일 페이지 JSON은 API 원본 그대로
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `e-drug_${(state.q || state.entp || "all").replace(/\s+/g, "")}_${scope}_${stamp}`;

  if (format === "csv") {
    triggerDownload(base + ".csv", "text/csv;charset=utf-8", toCSV(items));
  } else if (format === "xml") {
    triggerDownload(base + ".xml", "application/xml;charset=utf-8", toXML(items));
  } else {
    const json = rawJson ?? JSON.stringify({ totalCount: items.length, items }, null, 2);
    triggerDownload(base + ".json", "application/json;charset=utf-8", json);
  }
}

// 전체 결과 수집 (페이지네이션, 최대 3000건)
async function collectAll() {
  const maxRows = 3000;
  if (state.demo) {
    return (await demoSearch(state.q, state.entp, 1, maxRows)).items;
  }
  const numOfRows = 100;
  const first = await liveSearch(state.q, state.entp, 1, numOfRows);
  const field = first.field;
  const total = Math.min(first.totalCount, maxRows);
  let items = [...first.items];
  const pages = Math.ceil(total / numOfRows);
  for (let p = 2; p <= pages && items.length < maxRows; p++) {
    const opts = { entpName: state.entp || undefined, pageNo: p, numOfRows };
    if (field === "efcyQesitm") opts.efcyQesitm = state.q;
    else opts.itemName = state.q || undefined;
    const r = await callApi(opts);
    items = items.concat(r.items);
  }
  return items.slice(0, maxRows);
}

function triggerDownload(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── 변환 유틸 ────────────────────────────────────────────────
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(items) {
  const lines = [FIELDS.map((f) => FIELD_LABELS[f]).join(",")];
  for (const it of items) lines.push(FIELDS.map((f) => csvCell(it[f])).join(","));
  return "﻿" + lines.join("\r\n"); // 엑셀 한글 호환 BOM
}
function xmlEsc(s) {
  return String(s ?? "").replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]),
  );
}
function toXML(items) {
  const body = items
    .map(
      (it) =>
        "  <item>\n" +
        FIELDS.map((f) => `    <${f}>${xmlEsc(it[f])}</${f}>`).join("\n") +
        "\n  </item>",
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<items>\n${body}\n</items>\n`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

refreshMode();
