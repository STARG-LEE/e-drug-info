// 식품의약품안전처 e약은요(의약품개요정보) OpenAPI 클라이언트
// 데이터셋: https://www.data.go.kr/data/15075057/openapi.do
// 엔드포인트: getDrbEasyDrugList

const BASE_URL =
  'http://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList';

// 응답 필드 → 한글 라벨 (표 헤더·CSV 헤더에 사용)
export const FIELD_LABELS = {
  itemSeq: '품목기준코드',
  itemName: '제품명',
  entpName: '업체명',
  efcyQesitm: '효능',
  useMethodQesitm: '사용법',
  atpnWarnQesitm: '주의사항(경고)',
  atpnQesitm: '주의사항',
  intrcQesitm: '상호작용',
  seQesitm: '부작용',
  depositMethodQesitm: '보관법',
  itemImage: '낱알이미지',
  openDe: '공개일자',
  updateDe: '수정일자',
};

export const FIELDS = Object.keys(FIELD_LABELS);

// 공공데이터포털은 Encoding/Decoding 두 종류의 키를 제공한다.
// 이미 퍼센트 인코딩된(Encoding) 키면 그대로 쓰고, 아니면(Decoding) 인코딩한다.
function encodeServiceKey(key) {
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

function buildUrl({
  serviceKey,
  itemName,
  entpName,
  efcyQesitm,
  pageNo = 1,
  numOfRows = 10,
  type = 'json',
}) {
  const params = new URLSearchParams();
  params.set('pageNo', String(pageNo));
  params.set('numOfRows', String(numOfRows));
  params.set('type', type);
  if (itemName) params.set('itemName', itemName);
  if (entpName) params.set('entpName', entpName);
  if (efcyQesitm) params.set('efcyQesitm', efcyQesitm);
  // serviceKey는 URLSearchParams에 넣으면 이중 인코딩될 수 있어 직접 이어붙인다.
  return `${BASE_URL}?serviceKey=${encodeServiceKey(serviceKey)}&${params.toString()}`;
}

// API를 호출해 원본 응답 본문(문자열)을 그대로 반환한다. (raw 다운로드용)
export async function fetchDrugsRaw(opts) {
  if (!opts.serviceKey) throw new Error('인증키가 설정되지 않았습니다 (DRUG_API_SERVICE_KEY).');
  const url = buildUrl(opts);
  const res = await fetch(url, { signal: opts.signal });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API 요청 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return text;
}

function normalizeItem(it) {
  const out = {};
  for (const f of FIELDS) out[f] = it?.[f] ?? '';
  return out;
}

// JSON으로 호출해 정규화된 결과 객체를 반환한다.
export async function fetchDrugs(opts) {
  const text = await fetchDrugsRaw({ ...opts, type: 'json' });
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      'API 응답을 JSON으로 해석하지 못했습니다. 인증키가 올바른지, 트래픽 제한에 걸리지 않았는지 확인하세요.',
    );
  }
  // 일부 공공 API는 { response: { header, body } } 로 감싸 내려준다.
  const root = data.response ?? data;
  const header = root.header ?? {};
  const body = root.body ?? {};
  if (header.resultCode && header.resultCode !== '00') {
    throw new Error(`API 오류 [${header.resultCode}] ${header.resultMsg ?? ''}`.trim());
  }
  // items는 배열이거나 { item: [...] } 형태일 수 있다.
  let rawItems = body.items ?? [];
  if (!Array.isArray(rawItems)) rawItems = rawItems.item ? [].concat(rawItems.item) : [];
  return {
    items: rawItems.map(normalizeItem),
    totalCount: Number(body.totalCount ?? rawItems.length),
    pageNo: Number(body.pageNo ?? opts.pageNo ?? 1),
    numOfRows: Number(body.numOfRows ?? opts.numOfRows ?? 10),
    raw: text,
  };
}

// 검색 조건에 해당하는 전체 항목을 페이지네이션으로 모은다. (상한 maxRows로 폭주 방지)
export async function fetchAll(opts, { maxRows = 3000, onProgress } = {}) {
  const numOfRows = 100;
  const first = await fetchDrugs({ ...opts, pageNo: 1, numOfRows });
  const total = Math.min(first.totalCount, maxRows);
  let items = [...first.items];
  const pages = Math.ceil(total / numOfRows);
  for (let p = 2; p <= pages && items.length < maxRows; p++) {
    const r = await fetchDrugs({ ...opts, pageNo: p, numOfRows });
    items = items.concat(r.items);
    if (onProgress) onProgress(items.length, total);
  }
  return { items: items.slice(0, maxRows), totalCount: first.totalCount };
}

// ── 변환 유틸 ────────────────────────────────────────────────

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙인다.
export function toCSV(items) {
  const lines = [FIELDS.map((f) => FIELD_LABELS[f]).join(',')];
  for (const it of items) lines.push(FIELDS.map((f) => csvCell(it[f])).join(','));
  return '﻿' + lines.join('\r\n');
}

function xmlEsc(s) {
  return String(s ?? '').replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]),
  );
}

export function toXML(items) {
  const body = items
    .map(
      (it) =>
        '  <item>\n' +
        FIELDS.map((f) => `    <${f}>${xmlEsc(it[f])}</${f}>`).join('\n') +
        '\n  </item>',
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<items>\n${body}\n</items>\n`;
}
