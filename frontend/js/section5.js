/**
 * ============================================================
 * section5.js  -  토큰 로그 (🪙 token) 섹션
 * ============================================================
 *
 * [역할]
 *   AI API(Claude 등) 사용 과정에서 소비된 토큰 통계와
 *   예상 비용을 대시보드 형태로 표시합니다.
 *   토큰은 AI 언어모델이 텍스트를 처리하는 단위이며,
 *   API 사용 비용은 토큰 수에 비례합니다.
 *
 * [사용 페이지] frontend/app.html (id="page-token" 섹션)
 *
 * [화면 구성]
 *   ① 요약 카드: 총 토큰 수, API 호출 횟수
 *   ② 입력/출력 토큰 비율 막대 그래프 (인라인 스타일 width% 조절)
 *   ③ 예상 비용 (USD / KRW)
 *   ④ 최근 API 호출 기록 목록
 *
 * [토큰이란?]
 *   LLM(대규모 언어 모델)이 텍스트를 처리할 때 사용하는 단위.
 *   대략 영문 4자 또는 한글 1~2자에 해당합니다.
 *   - 입력 토큰(prompt_tokens):   AI에게 보낸 질문/지시문
 *   - 출력 토큰(completion_tokens): AI가 생성한 답변
 *
 * [사용되는 외부 함수 - app.js에 정의]
 *   - apiFetch(path, options) : 인증 헤더가 포함된 API 호출
 * ============================================================
 */

/**
 * renderTokenPage()
 * ─────────────────────────────────────
 * [역할] 토큰 사용 통계 대시보드를 화면에 렌더링합니다.
 *        goPage("token") 호출 시 실행됩니다.
 *
 * [API 호출]
 *   엔드포인트: GET /api/token/logs
 *   응답 예시: {
 *     prompt_tokens:     5000,    // 입력 토큰 누적 합계
 *     completion_tokens: 2000,    // 출력 토큰 누적 합계
 *     total_tokens:      7000,    // 전체 토큰 (입력 + 출력)
 *     call_count:        42,      // 총 API 호출 횟수
 *     total_cost_usd:    0.0105,  // 예상 비용 (달러)
 *     total_cost_krw:    14.28,   // 예상 비용 (원화)
 *     history: [
 *       { action: "explain", total: 350, ts: "2026-03-12 14:30" },
 *       ...
 *     ]
 *   }
 *
 * [입력/출력 비율 막대]
 *   입력 + 출력 토큰의 합을 100%로 하여
 *   각각의 비율을 CSS width(%)로 표현합니다.
 *   - 네이비 막대: 입력 토큰 비율 (#465a80)
 *   - 올리브 막대: 출력 토큰 비율 (#7a8f63)
 */
async function renderTokenPage() {
  const container = document.getElementById("page-token");

  // 페이지 초기 HTML 뼈대와 로딩 중 표시
  container.innerHTML = `
    <h1 style="margin-bottom:20px;">🪙 Usage Log</h1>

    <div style="
      background:#f8f9f7;
      border:1px solid #e3e7df;
      border-radius:22px;
      padding:30px;
      box-shadow:0 8px 22px rgba(0,0,0,0.05);
      width:100%;
      box-sizing:border-box;
    ">
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        margin-bottom:24px;
      ">
        <div style="font-size:26px; font-weight:800; color:#2f3a2f;">토큰 사용 대시보드</div>
      </div>

      <div id="token-card" style="font-size:18px; color:#666;">불러오는 중...</div>
    </div>
  `;

  try {
    // GET /api/token/logs: 토큰 사용 통계 요청
    const res = await apiFetch("/api/token/logs");
    if (!res.ok) throw new Error("토큰 로그 조회 실패");

    const data = await res.json();

    // 서버 응답 데이터 추출 (없으면 0 처리)
    const inputTokens  = Number(data.prompt_tokens     || 0);
    const outputTokens = Number(data.completion_tokens || 0);
    const totalTokens  = Number(data.total_tokens      || 0);
    const callCount    = Number(data.call_count        || 0);
    const costUsd      = data.total_cost_usd           || 0;
    const costKrw      = data.total_cost_krw           || 0;

    // 입력/출력 토큰 비율 계산 (막대 그래프 width% 용)
    // 0으로 나누기 방지: 합이 0이면 1로 대체
    const totalForBar  = inputTokens + outputTokens || 1;
    const inputWidth   = (inputTokens  / totalForBar) * 100;
    const outputWidth  = (outputTokens / totalForBar) * 100;

    // action 이름을 보기 쉬운 한국어 뱃지로 변환
    function getActionLabel(action) {
      const map = {
        explain: "개념설명",
        additional_explain: "추가설명",
        extra_explain: "추가설명",
        quiz: "문제풀이",
        solve: "문제풀이",
        grading: "채점",
        check: "채점",
        feedback: "피드백",
        free: "자유학습",
        free_chat: "자유학습",
        summary: "요약",
        report: "리포트",
        exam: "시험",
        evaluate: "이해도평가"
      };
      return map[action] || action || "기록";
    }

    function getTokenLevel(total) {
      const n = Number(total || 0);

      if (n >= 700) return "높음";
      if (n >= 400) return "보통";
      return "양호";
    }

    // 최근 API 호출 기록 목록 HTML 생성
    const history = (data.history || []).map(h => `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:16px 18px;
        margin-bottom:12px;
        background:#ffffff;
        border:1px solid #e6e9e2;
        border-radius:14px;
        box-shadow:0 3px 10px rgba(0,0,0,0.03);
      ">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="
            background:#6B8F71;
            color:#ffffff;
            font-size:15px;
            font-weight:700;
            padding:6px 14px;
            border-radius:999px;
            letter-spacing:-0.2px;
          ">${getActionLabel(h.action)}</span>
          <span style="font-weight:700; font-size:18px; color:#253042;">${Number(h.total || 0).toLocaleString()} tok</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="
            background:#f3f4f6;
            color:#4b5563;
            font-size:15px;
            font-weight:700;
            padding:6px 14px;
            border-radius:999px;
          ">${getTokenLevel(h.total)}</span>
          <span style="color:#7a7f87; font-size:17px; font-weight:500;">${h.ts || "-"}</span>
        </div>
      </div>
    `).join("");

    // 대시보드 전체 내용 삽입
    document.getElementById("token-card").innerHTML = `

      <!-- 요약 카드: 총 토큰, API 호출 횟수 -->
      <div style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:20px;
        margin-bottom:24px;
      ">
        <div style="
          background:#ffffff;
          border:1px solid #e3e7df;
          border-radius:16px;
          padding:24px 20px;
          text-align:center;
          box-shadow:0 3px 10px rgba(0,0,0,0.03);
        ">
          <div style="font-size:18px; color:#7b8078; margin-bottom:12px; font-weight:600;">총 토큰</div>
          <div style="font-size:42px; font-weight:800; color:#1f2937; letter-spacing:-1px;">${totalTokens.toLocaleString()}</div>
        </div>

        <div style="
          background:#ffffff;
          border:1px solid #e3e7df;
          border-radius:16px;
          padding:24px 20px;
          text-align:center;
          box-shadow:0 3px 10px rgba(0,0,0,0.03);
        ">
          <div style="font-size:18px; color:#7b8078; margin-bottom:12px; font-weight:600;">API 호출</div>
          <div style="font-size:42px; font-weight:800; color:#1f2937; letter-spacing:-1px;">${callCount}</div>
        </div>
      </div>

      <!-- 입력/출력 토큰 수치 표시 -->
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        font-size:20px;
        font-weight:700;
        margin-bottom:10px;
      ">
        <span style="color:#465a80;">입력 ${inputTokens.toLocaleString()}</span>
        <span style="color:#7a8f63;">출력 ${outputTokens.toLocaleString()}</span>
      </div>

      <!-- 입력/출력 비율 막대 그래프 (네이비: 입력, 레드: 출력) -->
      <div style="
        display:flex;
        width:100%;
        height:18px;
        overflow:hidden;
        border-radius:999px;
        background:#e4e7e2;
        margin-bottom:22px;
        box-shadow:inset 0 1px 2px rgba(0,0,0,0.04);
      ">
        <div style="width:${inputWidth}%; background:#4F6DB3;"></div>
        <div style="width:${outputWidth}%; background:#B94A48;"></div>
      </div>

      <!-- 예상 비용 표시 (USD + KRW) -->
      <div style="
        background:#FDECC8;
        border:1px solid #e6d5aa;
        border-radius:16px;
        padding:18px 20px;
        font-size:24px;
        font-weight:800;
        color:#5d4630;
        margin-bottom:26px;
      ">
        💰 예상 비용 : $ ${costUsd} (₩ ${Number(costKrw).toLocaleString()})
      </div>

      <!-- 최근 API 호출 기록 -->
      <div style="
        font-size:26px;
        font-weight:800;
        color:#2f3a2f;
        margin-bottom:14px;
      ">최근 기록</div>

      ${history || `<div style="color:#666; font-size:18px;">기록 없음</div>`}
    `;
  } catch (err) {
    // 오류 발생 시 오류 메시지 표시
    document.getElementById("token-card").innerHTML = `
      <div style="
        background:#fff5f5;
        border:1px solid #f5c2c7;
        color:#b02a37;
        border-radius:12px;
        padding:16px;
        font-weight:600;
        font-size:18px;
      ">
        토큰 로그 불러오기 실패
      </div>
    `;
    console.error(err);
  }
}
