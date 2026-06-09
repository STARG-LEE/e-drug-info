# 💊 e-drug-info — 한국 의약품 정보 검색·다운로드 툴

식품의약품안전처의 **의약품개요정보(e약은요)** 공공 API로 의약품을 검색하고,
결과를 **원본(raw) 파일(JSON / CSV / XML)로 다운로드**하는 웹 도구입니다.

- 🔎 제품명·효능 키워드·업체명으로 검색
- 📄 효능·용법·주의사항·상호작용·부작용·보관법 한눈에 보기
- ⬇️ 현재 페이지 또는 전체 결과를 **JSON / CSV / 원본 XML**로 저장
- 🧪 인증키 없이도 바로 써보는 **데모 모드** 내장
- 🔐 인증키는 백엔드(.env)에만 두어 브라우저에 노출되지 않음 (CORS·키 노출 회피)

데이터 출처: [식품의약품안전처 의약품개요정보(e약은요)](https://www.data.go.kr/data/15075057/openapi.do) · 공공데이터포털(data.go.kr)

---

## 🌐 온라인에서 바로 쓰기 (GitHub Pages)

설치 없이 브라우저에서 바로 사용: **https://starg-lee.github.io/e-drug-info/**

- 키 없이 **데모 모드**(샘플 데이터)로 즉시 체험됩니다.
- 실데이터는 페이지 상단 **인증키 설정**에 본인 키를 입력하면 전환됩니다.
  키는 **그 브라우저(localStorage)에만** 저장되며 레포·서버로 전송되지 않습니다.
- 정적 버전 소스는 [`docs/`](docs) 폴더이며, 브라우저가 식약처 API를 직접 호출합니다(서버 불필요).
  검색·효능 폴백·다운로드(JSON/CSV/원본 XML)가 모두 브라우저에서 처리됩니다.

> 인증키를 코드에 넣지 않으므로 방문자는 각자 [무료 인증키](https://www.data.go.kr/data/15075057/openapi.do)를 발급받아 입력합니다.

---

## 로컬에서 실행 (Express 백엔드 · 인증키 숨김)

서버가 인증키를 대신 들고 API를 프록시하므로 키가 브라우저에 노출되지 않습니다.

```bash
git clone https://github.com/STARG-LEE/e-drug-info.git
cd e-drug-info
npm install
npm start
```

브라우저에서 <http://localhost:3000> 접속.
인증키가 없으면 **데모 모드(샘플 데이터)** 로 동작하므로 바로 화면을 확인할 수 있습니다.

---

## 실제 데이터 쓰기 — 인증키 발급

1. [공공데이터포털](https://www.data.go.kr) 회원가입/로그인
2. [의약품개요정보(e약은요) 데이터](https://www.data.go.kr/data/15075057/openapi.do) 페이지에서 **활용신청**
   (개발계정은 보통 즉시 승인, 일 트래픽 10,000건)
3. 발급된 **인증키**를 `.env` 파일에 넣기

```bash
cp .env.example .env
```

```ini
# .env
DRUG_API_SERVICE_KEY=발급받은_인증키
PORT=3000
```

> 공공데이터포털은 `Encoding` / `Decoding` 두 종류의 키를 줍니다.
> 이 툴은 둘 다 자동 처리하므로 어느 쪽을 넣어도 됩니다.

서버를 재시작하면 데모 배너가 사라지고 실데이터로 검색됩니다.

```bash
npm start
```

---

## 다운로드(raw 파일) 동작

| 버튼 | 범위 | 형식 | 내용 |
| --- | --- | --- | --- |
| 현재 페이지 · JSON | 현재 페이지 | `.json` | **API 원본 JSON 응답 그대로** |
| 현재 페이지 · CSV | 현재 페이지 | `.csv` | 표 형태(엑셀 호환, UTF-8 BOM) |
| 현재 페이지 · 원본 XML | 현재 페이지 | `.xml` | **API 원본 XML 응답 그대로**(`type=xml` 재요청) |
| 전체 결과 · JSON | 검색 전체 | `.json` | 페이지네이션으로 모은 전체 항목 |
| 전체 결과 · CSV | 검색 전체 | `.csv` | 전체 항목 표 형태 |

- 단일 페이지 다운로드는 식약처 API가 내려준 **응답 본문을 가공 없이** 저장합니다.
- 전체 결과는 한 번에 100건씩 페이지를 돌며 모으고, 폭주 방지를 위해 최대 3,000건까지 받습니다
  (`src/mfds.js`의 `maxRows`로 조정).

---

## API 엔드포인트 (이 앱의 백엔드)

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/api/status` | 데모 모드 여부(`{ demo: boolean }`) |
| GET | `/api/search?q=&entp=&page=&rows=` | 검색 결과(JSON) |
| GET | `/api/download?q=&entp=&format=json\|csv\|xml&scope=page\|all` | 파일 다운로드 |

내부적으로 식약처 엔드포인트
`http://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList` 를 호출합니다.

### 응답 필드

| 필드 | 의미 |
| --- | --- |
| `itemSeq` | 품목기준코드 |
| `itemName` | 제품명 |
| `entpName` | 업체명 |
| `efcyQesitm` | 효능 |
| `useMethodQesitm` | 사용법 |
| `atpnWarnQesitm` | 주의사항(경고) |
| `atpnQesitm` | 주의사항 |
| `intrcQesitm` | 상호작용 |
| `seQesitm` | 부작용 |
| `depositMethodQesitm` | 보관법 |
| `itemImage` | 낱알 이미지 URL |
| `openDe` / `updateDe` | 공개일 / 수정일 |

---

## 프로젝트 구조

```
e-drug-info/
├── server.js          # Express 서버 (검색 프록시 + 파일 다운로드 + 정적 서빙)
├── src/mfds.js        # e약은요 API 클라이언트 (fetch·정규화·CSV/XML 변환)
├── public/            # 웹 UI (index.html / style.css / app.js)
├── data/sample.json   # 데모 모드용 샘플 데이터
└── .env.example       # 환경변수 예시
```

## 기술 스택

Node.js (18+) · Express · 바닐라 JS 프론트엔드 (빌드 단계 없음)

---

## ⚠️ 면책

이 도구는 **정보 제공용**이며 의학적 진단·처방의 근거로 사용해서는 안 됩니다.
복약 관련 판단은 반드시 의사·약사와 상의하세요. 데이터의 최신성·정확성은 식약처 원본을 따릅니다.

## 라이선스

MIT
