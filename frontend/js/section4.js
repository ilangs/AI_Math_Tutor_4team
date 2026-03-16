/**
 * ============================================================
 * section4.js  -  성적 로그 (📊 score) 섹션
 * ============================================================
 *
 * [역할]
 *   시험 섹션(section3.js)에서 제출된 시험 결과를 서버에서 불러와
 *   요약 카드, 점수 변화 그래프(SVG), 시험 기록 목록 테이블로 표시합니다.
 *
 * [사용 페이지] frontend/app.html (id="page-score" 섹션)
 *
 * [화면 구성]
 *   ① 시험 기록 요약 (최근 단원, 최근 점수, 평균 점수)
 *   ② 점수 변화 그래프 (SVG 직접 생성, buildScoreGraphSvg)
 *   ③ 시험 기록 목록 테이블 (buildScoreRow)
 *
 * [사용되는 외부 함수 - app.js에 정의]
 *   - apiFetch(path, options) : 인증 헤더가 포함된 API 호출
 *
 * [학습 포인트 - 3주차 AI 에이전트 과정]
 *   - SVG(Scalable Vector Graphics)를 JavaScript로 동적 생성
 *   - 좌표 변환 함수(toX, toY)를 이용한 데이터 시각화
 *   - 점수 등급 뱃지(badge) UI 패턴
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// 성적 로그 로드 및 렌더링
// ─────────────────────────────────────────────────────────────

/**
 * loadScoreLog()
 * ─────────────────────────────────────
 * [역할] 서버에서 시험 결과 목록을 가져와 성적 로그 화면을 렌더링합니다.
 *        goPage("score") 호출 시 실행됩니다.
 *
 * [API 호출]
 *   엔드포인트: GET /api/exam/results
 *   응답 예시: {
 *     results: [
 *       { unit: "분수의 덧셈", score: 80, total_questions: 10, timestamp: "2026-03-12T..." },
 *       ...
 *     ]
 *   }
 *
 * [로딩 UX]
 *   데이터 로드 전 "로딩 중..." 텍스트를 표시해 사용자에게 처리 중임을 알립니다.
 */
async function loadScoreLog() {
  const card = document.getElementById("score-log-card");
  if (!card) return;

  // 로딩 중 표시 (데이터를 받기 전 임시 메시지)
  card.innerHTML = '<p style="color:#999; padding:10px;">로딩 중...</p>';

  try {
    // GET /api/exam/results: 시험 결과 목록 요청
    const res = await apiFetch("/api/exam/results");
    const data = await res.json();
    renderScoreLog(card, data.results || []);
  } catch (e) {
    console.error("성적 데이터 로드 실패", e);
    card.innerHTML = '<p style="color:#c00; padding:10px;">성적 데이터를 불러오는데 실패했습니다.</p>';
  }
}

/**
 * renderScoreLog(card, results)
 * ─────────────────────────────────────
 * [역할] 서버에서 받은 시험 결과 배열을 화면에 시각적으로 렌더링합니다.
 *        시험 기록이 없으면 안내 메시지를, 있으면 요약/그래프/목록을 표시합니다.
 *
 * [렌더링 구성]
 *   1. 요약 카드: 최근 시험 단원, 최근 점수, 평균 점수
 *   2. 점수 그래프: buildScoreGraphSvg()로 SVG 생성
 *   3. 기록 테이블: buildScoreRow()로 각 행 생성
 *
 * [점수 계산]
 *   convertScoreTo100()으로 서버의 점수(0~100)를 100점 만점으로 환산합니다.
 *
 * @param {HTMLElement} card    - 성적 로그 카드 요소 (내용을 채울 컨테이너)
 * @param {Array}       results - 시험 결과 객체 배열
 */

function renderScoreLog(card, results) {
  // 시험 기록이 없는 경우 안내 메시지 표시
  if (results.length === 0) {
    card.innerHTML = `
      <div class="score-dashboard">
        <p style="color:#999; font-size:18px; text-align:center; padding:40px 0;">
          아직 시험 기록이 없어요.<br>
          <strong>시험</strong> 메뉴에서 시험을 치면 여기에 기록이 쌓여요!
        </p>
      </div>`;
    return;
  }

  // 각 결과를 100점 만점으로 변환한 점수 배열 생성
  const scores = results.map(r => convertScoreTo100(r.score, r.total_questions));

  // 최근 시험 정보 (배열의 마지막 항목)
  const latest = results[results.length - 1];
  const latestScore100 = convertScoreTo100(latest.score, latest.total_questions);

  // 전체 시험의 평균 점수 계산
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // 전체 성적 대시보드 HTML 생성 및 삽입
  card.innerHTML = `
    <div class="score-dashboard">

      <h2>시험 기록 요약</h2>
      <div class="score-summary" style="display:grid; grid-template-columns:1.8fr 1fr 1fr; gap:20px;">
        <div class="summary-card">
          <div class="summary-label">최근 시험 단원</div>
          <div class="summary-value">${escapeHtmlScore(latest.unit)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">최근 점수</div>
          <div class="summary-value">${latestScore100}점 / 100점</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">평균 점수</div>
          <div class="summary-value">${avgScore}점 / 100점</div>
        </div>
      </div>

      <h2>점수 변화 그래프</h2>
      <div class="graph-card graph-scroll">
        ${buildScoreGraphSvg(scores)}
      </div>

      <h2>시험 기록 목록</h2>
      <div class="log-card">
        <table class="score-table">
          <thead>
            <tr>
              <th>날짜</th>
              <th>단원</th>
              <th>점수</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${results.map(r => buildScoreRow(r)).join("")}
          </tbody>
        </table>
      </div>

    </div>
  `;
}

// ─────────────────────────────────────────────────────────────
// 점수 계산 유틸
// ─────────────────────────────────────────────────────────────

/**
 * convertScoreTo100(score, totalQuestions)
 * ─────────────────────────────────────
 * [역할] 서버에서 받은 점수를 100점 만점 기준으로 환산합니다.
 *        서버가 문제 수에 따라 점수를 다르게 반환하는 경우 대응합니다.
 *
 * [계산 방식]
 *   - 문제 당 배점 = 100 / 총 문제 수
 *   - 맞은 문제 수 = round(score / 100 * 총 문제 수)
 *   - 최종 점수 = 맞은 문제 수 × 문제 당 배점
 *
 * @param {number} score          - 서버 응답의 점수 (0~100 기준)
 * @param {number} totalQuestions - 총 문제 수 (없으면 기본값 10)
 * @returns {number} 100점 만점으로 환산된 점수
 */
function convertScoreTo100(score, totalQuestions) {
  const total = totalQuestions || 10;        // 문제 수 없으면 기본 10문제로 계산
  const eachPoint = 100 / total;             // 문제 당 배점
  const correctCount = Math.round((score / 100) * total);  // 맞은 문제 수
  return Math.round(correctCount * eachPoint);
}

// ─────────────────────────────────────────────────────────────
// 점수 그래프 SVG 생성
// ─────────────────────────────────────────────────────────────

/**
 * buildScoreGraphSvg(scores)
 * ─────────────────────────────────────
 * [역할] 시험 점수 변화를 꺾은선 그래프로 시각화한 SVG 문자열을 생성합니다.
 *        canvas나 외부 라이브러리 없이 순수 SVG 태그로 직접 그립니다.
 *
 * [SVG 그래프 구성]
 *   - 세로축(Y): 0~100점 범위, 20 간격으로 눈금선 표시
 *   - 가로축(X): 1회, 2회, 3회... 형태로 시험 회차 표시
 *   - 꺾은선: 각 점을 polyline으로 연결
 *   - 점(circle): 각 시험의 점수 위치에 원형 점 표시
 *
 * [좌표 변환]
 *   toX(i): 회차 인덱스 → 화면 X 좌표
 *   toY(s): 점수 → 화면 Y 좌표 (위가 높은 화면 좌표계를 뒤집어서 계산)
 *
 * @param {Array<number>} scores - 100점 만점 기준 점수 배열 (시간 순서대로)
 * @returns {string} SVG HTML 문자열
 */

function buildScoreGraphSvg(scores) {
  if (!scores || scores.length === 0) return "<p>데이터가 없습니다.</p>";

  function getScoreColor(score) {
    if (score >= 80) return "#e53935";   // 빨강
    if (score <= 50) return "#1e88e5";   // 파랑
    return "#43a047";                    // 초록
  }

  const H = 300;
  const PAD_L = 80, PAD_R = 30, PAD_T = 35, PAD_B = 55;

  // 데이터 많아지면 가로폭 자동 증가
  const stepX = 48;
  const START_OFFSET = stepX;

  const W = Math.max(800, PAD_L + PAD_R + START_OFFSET + stepX * (scores.length - 1));

  const graphW = W - PAD_L - PAD_R;
  const graphH = H - PAD_T - PAD_B;

  const yMin = 0, yMax = 100;
  const yScale = graphH / (yMax - yMin);

  const toX = (i) => PAD_L + START_OFFSET + (scores.length > 1 ? i * stepX : graphW / 2);
  const toY = (s) => PAD_T + graphH - (s - yMin) * yScale;

  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  
  // 배경
  svg += `<rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="#fcfcfc"/>`;

  // Y축 / X축
  svg += `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + graphH}" stroke="#b0b0b0" stroke-width="2"/>`;
  svg += `<line x1="${PAD_L}" y1="${PAD_T + graphH}" x2="${PAD_L + graphW}" y2="${PAD_T + graphH}" stroke="#b0b0b0" stroke-width="2"/>`;

  // 눈금선
  [20, 40, 60, 80, 100].forEach(val => {
    const y = toY(val);
    svg += `<text x="${PAD_L - 10}" y="${y + 5}" font-size="13" text-anchor="end" fill="#666">${val}</text>`;
    svg += `<line x1="${PAD_L}" y1="${y}" x2="${PAD_L + graphW}" y2="${y}" stroke="#e9e9e9" stroke-width="1" stroke-dasharray="4 4"/>`;
  });

  // 점수 구간별 선분 색상
  for (let i = 0; i < scores.length - 1; i++) {
    const x1 = toX(i);
    const y1 = toY(scores[i]);
    const x2 = toX(i + 1);
    const y2 = toY(scores[i + 1]);

    const lineColor = getScoreColor(scores[i + 1]);

    svg += `<line
      x1="${x1}" y1="${y1}"
      x2="${x2}" y2="${y2}"
      stroke="${lineColor}"
      stroke-width="4"
      stroke-linecap="round"
      opacity="0.95"
    />`;
  }

  // 각 점 + 점수
  scores.forEach((s, i) => {
    const x = toX(i);
    const y = toY(s);
    const color = getScoreColor(s);

    // 점 glow 느낌
    svg += `<circle cx="${x}" cy="${y}" r="10" fill="${color}" opacity="0.18"/>`;
    svg += `<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#fff" stroke-width="2"/>`;

    // 점수 텍스트
    svg += `<text x="${x}" y="${y - 14}" font-size="12" font-weight="600" text-anchor="middle" fill="${color}">${s}</text>`;

    // 회차
    svg += `<text x="${x}" y="${PAD_T + graphH + 24}" font-size="13" text-anchor="middle" fill="#666">${i + 1}회</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ─────────────────────────────────────────────────────────────
// 성적 테이블 행 생성 유틸
// ─────────────────────────────────────────────────────────────

/**
 * buildScoreRow(record)
 * ─────────────────────────────────────
 * [역할] 시험 결과 하나를 성적 테이블의 한 행(<tr>)으로 변환합니다.
 *
 * @param {object} record           - 시험 결과 객체
 * @param {string} record.timestamp - 시험 일시 (ISO 8601 형식)
 * @param {string} record.unit      - 시험 단원명
 * @param {number} record.score     - 점수
 * @param {number} record.total_questions - 총 문제 수
 * @returns {string} 테이블 행 HTML 문자열
 */
function buildScoreRow(record) {
  const date = formatDateScore(record.timestamp);       // "YYYY-MM-DD" 형식으로 변환
  const unit = escapeHtmlScore(record.unit);             // XSS 방지 처리
  const score100 = convertScoreTo100(record.score, record.total_questions);
  const badge = getStatusBadge(score100);                // 점수 등급 뱃지

  return `<tr>
    <td>${date}</td>
    <td>${unit}</td>
    <td>${score100}점 / 100점</td>
    <td>${badge}</td>
  </tr>`;
}

/**
 * getStatusBadge(score)
 * ─────────────────────────────────────
 * [역할] 점수 구간에 따라 색깔 뱃지 HTML을 반환합니다.
 *        성적 테이블의 "상태" 열에 표시됩니다.
 *
 * [점수 구간별 뱃지]
 *   - 50점 이하: danger (빨간색)  "노력해야겠어요!"
 *   - 70점 이하: up    (노란색)   "조금만 더 열심히 해보도록 해요!"
 *   - 90점 이하: good  (초록색)   "정말 훌륭하네요!"
 *   - 91점 이상: stable(파란색)   "당신은 수학천재!"
 *
 * @param {number} score - 100점 만점 기준 점수
 * @returns {string} 뱃지 HTML 문자열
 */
function getStatusBadge(score) {
  if (score <= 50) return `<span class="status-badge danger">노력해야겠어요!</span>`;
  if (score <= 70) return `<span class="status-badge up">조금만 더 열심히 해보도록 해요!</span>`;
  if (score <= 90) return `<span class="status-badge good">정말 훌륭하네요!</span>`;
  return `<span class="status-badge stable">🏆 당신은 수학천재!</span>`;
}

/**
 * formatDateScore(timestamp)
 * ─────────────────────────────────────
 * [역할] ISO 8601 타임스탬프를 "YYYY-MM-DD" 형식으로 잘라서 반환합니다.
 *        시험 기록 테이블의 날짜 표시에 사용합니다.
 *
 * [변환 예시]
 *   "2026-03-12T14:30:00.000Z" → "2026-03-12"
 *
 * @param {string} timestamp - ISO 8601 형식 타임스탬프
 * @returns {string} "YYYY-MM-DD" 날짜 문자열, 값이 없으면 "-"
 */
function formatDateScore(timestamp) {
  if (!timestamp) return "-";
  // slice(0, 10)으로 날짜 부분만 추출
  return String(timestamp).slice(0, 10);
}

/**
 * escapeHtmlScore(text)
 * ─────────────────────────────────────
 * [역할] 텍스트에 포함된 HTML 특수문자를 이스케이프합니다.
 *        단원명 등 서버 데이터를 innerHTML에 삽입할 때 XSS를 방지합니다.
 *
 * @param {string} text - 이스케이프할 원본 텍스트
 * @returns {string} HTML 특수문자가 이스케이프된 텍스트
 */
function escapeHtmlScore(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
