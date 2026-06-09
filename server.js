import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { fetchDrugs, fetchDrugsRaw, fetchAll, toCSV, toXML } from './src/mfds.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_KEY = (process.env.DRUG_API_SERVICE_KEY || '').trim();
const DEMO = !SERVICE_KEY;

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sample.json'), 'utf-8'));

function filterSample(q, entp) {
  let items = sample.items;
  if (q) items = items.filter((i) => i.itemName.includes(q) || (i.efcyQesitm || '').includes(q));
  if (entp) items = items.filter((i) => i.entpName.includes(entp));
  return items;
}

function paginate(items, page, rows) {
  const pageNo = Math.max(1, parseInt(page, 10) || 1);
  const numOfRows = Math.max(1, parseInt(rows, 10) || 10);
  const start = (pageNo - 1) * numOfRows;
  return { slice: items.slice(start, start + numOfRows), pageNo, numOfRows };
}

// 한글 파일명을 안전하게 내려보내기 위한 Content-Disposition (RFC 5987)
function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function sendFile(res, filename, type, body) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', contentDisposition(filename));
  res.send(body);
}

app.use(express.static(path.join(__dirname, 'public')));

// 키 설정 여부 (프론트가 데모 배너 표시에 사용)
app.get('/api/status', (req, res) => {
  res.json({ demo: DEMO });
});

// 검색
app.get('/api/search', async (req, res) => {
  const { q = '', entp = '', page = '1', rows = '10' } = req.query;
  try {
    if (DEMO) {
      const all = filterSample(q, entp);
      const { slice, pageNo, numOfRows } = paginate(all, page, rows);
      return res.json({ demo: true, items: slice, totalCount: all.length, pageNo, numOfRows });
    }
    const result = await fetchDrugs({
      serviceKey: SERVICE_KEY,
      itemName: q || undefined,
      entpName: entp || undefined,
      pageNo: parseInt(page, 10) || 1,
      numOfRows: parseInt(rows, 10) || 10,
    });
    res.json({
      demo: false,
      items: result.items,
      totalCount: result.totalCount,
      pageNo: result.pageNo,
      numOfRows: result.numOfRows,
    });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// 원본/가공 파일 다운로드 (format: json|csv|xml, scope: page|all)
app.get('/api/download', async (req, res) => {
  const { q = '', entp = '', format = 'json', scope = 'page', page = '1', rows = '10' } = req.query;
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `e-drug_${(q || entp || 'all').replace(/\s+/g, '')}_${scope}_${stamp}`;
  try {
    let items;
    let rawJson = null;
    let rawXml = null;

    if (DEMO) {
      const all = filterSample(q, entp);
      items = scope === 'all' ? all : paginate(all, page, rows).slice;
    } else {
      const opts = { serviceKey: SERVICE_KEY, itemName: q || undefined, entpName: entp || undefined };
      if (scope === 'all') {
        items = (await fetchAll(opts)).items;
      } else {
        const pageNo = parseInt(page, 10) || 1;
        const numOfRows = parseInt(rows, 10) || 10;
        // 단일 페이지는 API 원본(raw) 응답을 그대로 보존해 내려준다.
        if (format === 'json') rawJson = await fetchDrugsRaw({ ...opts, pageNo, numOfRows, type: 'json' });
        if (format === 'xml') rawXml = await fetchDrugsRaw({ ...opts, pageNo, numOfRows, type: 'xml' });
        items = (await fetchDrugs({ ...opts, pageNo, numOfRows })).items;
      }
    }

    if (format === 'csv') {
      sendFile(res, base + '.csv', 'text/csv; charset=utf-8', toCSV(items));
    } else if (format === 'xml') {
      sendFile(res, base + '.xml', 'application/xml; charset=utf-8', rawXml ?? toXML(items));
    } else {
      const json = rawJson ?? JSON.stringify({ totalCount: items.length, items }, null, 2);
      sendFile(res, base + '.json', 'application/json; charset=utf-8', json);
    }
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  e-drug-info 서버 실행 중  →  http://localhost:${PORT}`);
  console.log(
    `  모드: ${DEMO ? '데모(샘플 데이터) — 인증키를 설정하면 실데이터로 전환됩니다' : '실데이터(인증키 적용됨)'}\n`,
  );
});
