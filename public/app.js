const state = { q: "", entp: "", page: 1, rows: 10, total: 0, demo: false, field: "" };

const $ = (s) => document.querySelector(s);
const results = $("#results");
const statusEl = $("#status");
const toolbar = $("#toolbar");
const pagination = $("#pagination");

// 카드에 표시할 본문 필드 (순서대로)
const FIELDS = [
  ["efcyQesitm", "효능"],
  ["useMethodQesitm", "사용법"],
  ["atpnWarnQesitm", "주의사항(경고)"],
  ["atpnQesitm", "주의사항"],
  ["intrcQesitm", "상호작용"],
  ["seQesitm", "부작용"],
  ["depositMethodQesitm", "보관법"],
];

async function init() {
  try {
    const r = await fetch("/api/status").then((x) => x.json());
    state.demo = r.demo;
    if (r.demo) $("#demoBanner").classList.remove("hidden");
  } catch {
    /* 상태 조회 실패는 무시하고 진행 */
  }
}

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
  const params = new URLSearchParams({
    q: state.q,
    entp: state.entp,
    page: state.page,
    rows: state.rows,
  });
  try {
    const data = await fetch("/api/search?" + params).then((x) => {
      if (!x.ok) return x.json().then((j) => Promise.reject(new Error(j.error || "HTTP " + x.status)));
      return x.json();
    });
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
  const rows = FIELDS.filter(([k]) => it[k])
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

toolbar.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-dl]");
  if (!btn) return;
  const params = new URLSearchParams({
    q: state.q,
    entp: state.entp,
    format: btn.dataset.dl,
    scope: btn.dataset.scope,
    page: state.page,
    rows: state.rows,
  });
  window.location = "/api/download?" + params;
});

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

init();
