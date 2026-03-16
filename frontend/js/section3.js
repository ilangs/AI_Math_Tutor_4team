/**
 * ============================================================
 * section3.js  -  시험 (📝 exam) 섹션
 * ============================================================
 *
 * [역할]
 *   단원을 선택하면 AI가 시험 문제를 생성하고, 타이머를 시작하여
 *   제한 시간(40분) 내에 학생이 답안을 작성 및 제출합니다.
 *   제출 후 AI가 채점하여 점수와 틀린 문제의 풀이 설명을 보여줍니다.
 *
 * [사용 페이지] frontend/app.html (id="page-exam" 섹션)
 *
 * [시험 흐름]
 *   ① 단원 선택 (loadExamUnits로 목록 표시)
 *        ↓ [시험지 만들기] 버튼 클릭
 *   ② AI 문제 생성 (POST /api/exam/generate)
 *        ↓ [시험 시작] 버튼 클릭
 *   ③ 타이머 시작 + 문제 잠금 해제 (startExamTimer)
 *        ↓ 답안 작성 후 [답안지 제출] 또는 시간 초과
 *   ④ 채점 (POST /api/exam/submit)
 *        ↓
 *   ⑤ 결과 모달 표시 (fillExamResultBody → openExamResultModal)
 *        ↓ [확인] 버튼 클릭
 *   ⑥ 결과 저장 (POST /api/exam/save-result) + 초기 화면 복귀
 *
 * [사용되는 외부 함수 - app.js에 정의]
 *   - apiFetch(path, options)       : 인증 헤더가 포함된 API 호출
 *   - renderMath(targetId)          : MathJax 수식 렌더링
 *   - showCustomPopup(message)      : 팝업 메시지 표시
 *   - goPage(pageName)              : SPA 페이지 전환
 *   - prepareMathDisplayText(text)  : 분수 등 LaTeX 변환 (section1.js)
 *
 * [학습 포인트 - 3주차 AI 에이전트 과정]
 *   - setInterval / clearInterval 을 이용한 타이머 구현
 *   - 시험지 잠금/해제 패턴: CSS 클래스 토글로 흐림 효과 제어
 *   - 이중 제출 방지: examSubmitting 플래그로 중복 채점 요청 차단
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// 전역 변수
// ─────────────────────────────────────────────────────────────

// 현재 시험의 문제 목록 (서버에서 받아온 문제 객체 배열)
let examProblems = [];

// 타이머 인터벌 ID (clearInterval로 타이머를 취소할 때 사용)
let examTimer = null;

// 남은 시험 시간 (초 단위, 기본 2400초 = 40분)
let examTimeLeft = 2400;

// 시험 진행 중 여부 (타이머 시작 이후 true, 재시작 방지용)
let examStarted = false;

// 채점 요청 중복 방지 플래그 (제출 API 호출 중 true)
let examSubmitting = false;

// 결과 모달 닫기 허용 여부 (채점 완료 후 true로 변경)
let examModalClosable = false;

// 채점 후 저장할 결과 데이터 (확인 버튼 클릭 시 서버에 전송)
let examPendingSaveData = null;

// ─────────────────────────────────────────────────────────────
// 초기화 함수
// ─────────────────────────────────────────────────────────────

/**
 * initExam()
 * ─────────────────────────────────────
 * [역할] 시험 섹션이 열릴 때 초기화 작업을 수행합니다.
 *        goPage("exam") 호출 시 실행됩니다.
 *
 * [초기화 순서]
 *   1. 시험이 이미 진행 중이면(examStarted=true, 채점 중 아닐 때) 건너뜀
 *   2. 모든 시험 상태를 초기값으로 리셋 (resetExamState)
 *   3. 결과 모달의 이벤트 바인딩 (bindExamModalEvents)
 *   4. 서버에서 단원 목록 불러오기 (loadExamUnits)
 */
function initExam() {
  // 시험이 진행 중이고 채점도 아닌 경우 초기화 건너뜀 (시험 중 화면 이동 방지)
  if (examStarted && !examSubmitting) return;

  resetExamState();
  bindExamModalEvents();
  loadExamUnits();
}

/**
 * resetExamState()
 * ─────────────────────────────────────
 * [역할] 시험 관련 모든 전역 변수와 UI 요소를 초기 상태로 되돌립니다.
 *        시험 완료 후 "확인" 버튼 클릭 시, 또는 initExam() 호출 시 실행됩니다.
 *
 * [초기화 대상]
 *   - 전역 변수: examProblems, examStarted, examTimeLeft 등 모두 초기값으로
 *   - UI 요소: 타이머 박스 숨김, 문제 컨테이너 초기화, 버튼 활성화 복구 등
 *   - 타이머: setInterval로 생성된 타이머 인터벌 취소
 */
function resetExamState() {
  // 전역 변수 초기화
  examProblems = [];
  examStarted = false;
  examSubmitting = false;
  examTimeLeft = 2400;
  examModalClosable = false;
  examPendingSaveData = null;

  // 진행 중인 타이머가 있으면 취소 (메모리 누수 방지)
  if (examTimer) {
    clearInterval(examTimer);
    examTimer = null;
  }

  // UI 요소 가져오기
  const timerBox = document.getElementById("exam-timer-box");
  const questionsBox = document.getElementById("exam-questions-container");
  const submitArea = document.getElementById("exam-submit-area");
  const startBtn = document.getElementById("exam-start-btn");
  const timerDisplay = document.getElementById("exam-timer-display");
  const modal = document.getElementById("examResultModal");
  const body = document.getElementById("examResultBody");
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  const unitSel = document.getElementById("exam-unit-select");
  const makeBtn = document.getElementById("exam-make-btn");
  const submitBtn = document.getElementById("exam-submit-btn");

  // 타이머 박스 숨김
  if (timerBox) timerBox.style.display = "none";

  // 문제 컨테이너: 잠금/해제 클래스 제거 후 숨김 및 내용 비우기
  if (questionsBox) {
    questionsBox.classList.remove("exam-locked", "exam-unlocked");
    questionsBox.style.display = "none";
    questionsBox.innerHTML = "";
  }

  // 제출 영역 숨김, 시작 버튼 비활성화
  if (submitArea) submitArea.style.display = "none";
  if (startBtn) startBtn.disabled = false;

  // 타이머 표시 초기화 ("40:00", 색상/굵기 기본값 복원)
  if (timerDisplay) {
    timerDisplay.textContent = "40:00";
    timerDisplay.style.color = "";
    timerDisplay.style.fontWeight = "";
  }

  // 결과 모달 숨김
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }

  // 결과 내용 초기화
  if (body) body.innerHTML = "";

  // 확인 버튼 복원
  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }

  // 단원 선택, 시험지 만들기 버튼 활성화
  if (unitSel) unitSel.disabled = false;
  if (makeBtn) makeBtn.disabled = false;

  // 제출 버튼 복원
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "답안지 제출";
  }
}

// ─────────────────────────────────────────────────────────────
// 단원 목록 로드 및 버튼 이벤트 바인딩
// ─────────────────────────────────────────────────────────────

/**
 * loadExamUnits()
 * ─────────────────────────────────────
 * [역할] 서버에서 단원 목록을 가져와 드롭다운 선택 목록을 채우고,
 *        시험지 만들기, 시험 시작, 답안지 제출 버튼 이벤트를 등록합니다.
 *
 * [API 호출]
 *   엔드포인트: GET /api/units
 *   응답 예시:  { units: ["분수의 덧셈", "분수의 뺄셈", ...] }
 *
 * [dataset.examBound 패턴]
 *   goPage("exam")가 여러 번 호출돼도 이벤트가 중복 등록되지 않도록
 *   버튼에 "data-exam-bound=1" 속성을 추가해 등록 여부를 추적합니다.
 */
async function loadExamUnits() {
  const select = document.getElementById("exam-unit-select");
  if (!select) return;

  try {
    // GET /api/units: 단원 목록 요청
    const res = await apiFetch("/api/units");
    const data = await res.json();

    // 기본 옵션과 각 단원을 option으로 추가
    select.innerHTML = '<option value="">단원 선택</option>';
    (data.units || []).forEach(unit => {
      const opt = document.createElement("option");
      opt.value = unit;
      opt.text = unit;
      select.add(opt);
    });
  } catch (e) {
    console.error("단원 목록 로드 실패", e);
  }

  // 버튼 이벤트 등록 (data-exam-bound 속성으로 중복 바인딩 방지)
  const makeBtn = document.getElementById("exam-make-btn");
  const startBtn = document.getElementById("exam-start-btn");
  const submitBtn = document.getElementById("exam-submit-btn");

  if (makeBtn && !makeBtn.dataset.examBound) {
    makeBtn.dataset.examBound = "1";
    makeBtn.addEventListener("click", makeExamPaper);
  }

  if (startBtn && !startBtn.dataset.examBound) {
    startBtn.dataset.examBound = "1";
    startBtn.addEventListener("click", startExamTimer);
  }

  if (submitBtn && !submitBtn.dataset.examBound) {
    submitBtn.dataset.examBound = "1";
    submitBtn.addEventListener("click", submitExam);
  }
}

// ─────────────────────────────────────────────────────────────
// 시험지 생성 및 렌더링
// ─────────────────────────────────────────────────────────────

/**
 * makeExamPaper()
 * ─────────────────────────────────────
 * [역할] 선택한 단원으로 AI 시험 문제를 생성하고 화면에 렌더링합니다.
 *        [시험지 만들기] 버튼 클릭 시 호출됩니다.
 *
 * [주의사항]
 *   - 단원이 선택되지 않았거나 시험 진행 중이면 생성 불가
 *   - 생성된 문제는 시험 시작 전까지 흐리게(exam-locked 클래스) 표시
 *
 * [API 호출]
 *   엔드포인트: POST /api/exam/generate
 *   전송 데이터: { unit_name: "선택된 단원명" }
 *   응답 예시:  { problems: [{ 문제: "...", 정답: "..." }, ...] }
 */
async function makeExamPaper() {
  const unit = document.getElementById("exam-unit-select")?.value;

  // 단원 미선택 시 알림
  if (!unit) {
    showCustomPopup("단원을 선택하세요.😄");
    return;
  }

  // 시험 이미 진행 중이면 생성 불가
  if (examStarted) {
    showCustomPopup("시험이 이미 진행 중입니다.😢");
    return;
  }

  // 버튼 비활성화 + 생성 중 텍스트 표시
  const makeBtn = document.getElementById("exam-make-btn");
  if (makeBtn) {
    makeBtn.disabled = true;
    makeBtn.textContent = "문제 생성 중...";
  }

  try {
    // POST /api/exam/generate: AI에게 시험 문제 생성 요청
    const res = await apiFetch("/api/exam/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit_name: unit })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showCustomPopup(err.detail || "문제를 불러오는데 실패했습니다.😢");
      return;
    }

    const data = await res.json();
    examProblems = data.problems || [];

    // 디버그용: 콘솔에 정답 목록 출력 (개발/학습 목적)
    console.log("시험 정답 목록");
    examProblems.forEach((prob, idx) => {
      console.log(`${idx + 1}번 정답:`, prob.answer || prob["정답"] || prob["답"] || "");
    });

    if (examProblems.length === 0) {
      showCustomPopup("해당 단원에 문제가 없습니다.😢");
      return;
    }

    // 생성된 문제를 화면에 렌더링 (시험 시작 전까지 잠금 상태)
    renderExamQuestions(examProblems);

    // 시험 시작 버튼, 타이머 박스, 제출 영역 표시
    const startBtn = document.getElementById("exam-start-btn");
    const timerBox = document.getElementById("exam-timer-box");
    const submitArea = document.getElementById("exam-submit-area");

    if (startBtn) startBtn.disabled = false;
    if (timerBox) timerBox.style.display = "block";
    if (submitArea) submitArea.style.display = "block";

    showCustomPopup(`${examProblems.length}개 문제가 생성되었습니다.\n"시험 시작" 버튼을 눌러 타이머를 시작하세요.`);
  } catch (e) {
    console.error("시험지 생성 오류", e);
    showCustomPopup("시험지 생성 중 오류가 발생했습니다.😢");
  } finally {
    // 성공/실패 관계없이 버튼 복원
    if (makeBtn) {
      makeBtn.disabled = false;
      makeBtn.textContent = "시험지 만들기";
    }
  }
}

/**
 * renderExamQuestions(problems)
 * ─────────────────────────────────────
 * [역할] 시험 문제 목록을 화면에 카드 형태로 렌더링합니다.
 *        시험 시작 전에는 문제가 흐리게(exam-locked 클래스) 보입니다.
 *
 * [exam-locked 패턴]
 *   CSS에서 .exam-locked 클래스는 문제 컨테이너를 반투명/흐리게 처리합니다.
 *   시험 시작 후 startExamTimer()에서 exam-locked를 제거하고
 *   exam-unlocked를 추가해 선명하게 변경합니다.
 *
 * @param {Array} problems - 문제 객체 배열 (각 객체에 "문제" 키 포함)
 */
function renderExamQuestions(problems) {
  const container = document.getElementById("exam-questions-container");
  if (!container) return;

  container.innerHTML = "";
  container.style.display = "block";

  // 문제 생성 직후 흐리게 처리 (시험 시작 버튼 전까지 잠금 상태)
  container.classList.add("exam-locked");
  container.classList.remove("exam-unlocked");

  // 각 문제를 카드 형태로 렌더링
  problems.forEach((prob, idx) => {
    const num = idx + 1;
    const probText = prob["문제"] || "(문제 없음)";

    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "12px";
    card.innerHTML = `
      <p style="font-size:18px; font-weight:bold; margin:0 0 10px 0;" id="exam-q-text-${num}">
        ${num}번. ${escapeHtml(probText)}
      </p>
      <input
        type="text"
        id="exam-answer-${num}"
        class="exam-answer-input"
        placeholder="답 입력"
        autocomplete="off"
        style="width:100%; padding:10px; font-size:17px; border:1px solid #ccc; box-sizing:border-box;"
      >
    `;
    container.appendChild(card);
  });

  // MathJax로 문제 내 수식 렌더링 (100ms 지연: DOM 렌더링 완료 후 실행)
  if (typeof renderMath === "function") {
    setTimeout(() => {
      try {
        renderMath();
      } catch (e) {}
    }, 100);
  }
}

/**
 * escapeHtml(text)
 * ─────────────────────────────────────
 * [역할] 텍스트에 포함된 HTML 특수문자를 이스케이프합니다.
 *        innerHTML에 외부 데이터를 삽입할 때 XSS(크로스 사이트 스크립팅) 공격을 방지합니다.
 *
 * [변환 예시]
 *   "&" → "&amp;", "<" → "&lt;", ">" → "&gt;"
 *
 * @param {string} text - 이스케이프할 원본 텍스트
 * @returns {string} HTML 특수문자가 이스케이프된 텍스트
 */
function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─────────────────────────────────────────────────────────────
// 타이머 관련 함수
// ─────────────────────────────────────────────────────────────

/**
 * startExamTimer()
 * ─────────────────────────────────────
 * [역할] 시험 타이머를 시작하고 문제 잠금을 해제합니다.
 *        [시험 시작] 버튼 클릭 시 호출됩니다.
 *
 * [타이머 동작]
 *   - setInterval로 1초마다 examTimeLeft를 1씩 감소
 *   - updateTimerDisplay()로 화면의 타이머 숫자 갱신
 *   - 0초가 되면 자동으로 handleTimerExpired() 호출
 *
 * [잠금 해제]
 *   exam-locked 클래스를 제거하고 exam-unlocked를 추가해
 *   문제가 선명하게 표시되고 입력창이 활성화됩니다.
 */
function startExamTimer() {
  // 이미 시험이 시작된 경우 중복 시작 방지
  if (examStarted) {
    showCustomPopup("이미 시험이 시작되었습니다.😢");
    return;
  }

  // 시험지 없이 시작 시도 방지
  if (examProblems.length === 0) {
    showCustomPopup("먼저 시험지를 만들어주세요.😢");
    return;
  }

  examStarted = true;

  // 시험 시작 후 버튼/선택창 비활성화 (변경 불가)
  const startBtn = document.getElementById("exam-start-btn");
  const makeBtn = document.getElementById("exam-make-btn");
  const unitSel = document.getElementById("exam-unit-select");
  const container = document.getElementById("exam-questions-container");

  if (startBtn) startBtn.disabled = true;
  if (makeBtn) makeBtn.disabled = true;
  if (unitSel) unitSel.disabled = true;

  // 문제 잠금 해제: 흐림 효과 제거 → 선명하게 표시
  if (container) {
    container.classList.remove("exam-locked");
    container.classList.add("exam-unlocked");
  }

  // 타이머 표시 초기화
  updateTimerDisplay();

  // 1초마다 타이머 감소
  examTimer = setInterval(() => {
    examTimeLeft--;
    updateTimerDisplay();

    // 시간 초과 시 타이머 중지 후 자동 제출
    if (examTimeLeft <= 0) {
      clearInterval(examTimer);
      examTimer = null;
      handleTimerExpired();
    }
  }, 1000);
}

/**
 * updateTimerDisplay()
 * ─────────────────────────────────────
 * [역할] 화면의 타이머 표시(MM:SS 형식)를 현재 남은 시간으로 갱신합니다.
 *        남은 시간이 5분(300초) 이하가 되면 타이머를 빨간색/굵게 표시합니다.
 *
 * [padStart 사용]
 *   padStart(2, "0"): 한 자리 숫자를 두 자리로 맞춤 (예: "3" → "03")
 *   → "40:07", "09:45" 형태로 일관된 표시
 */
function updateTimerDisplay() {
  const display = document.getElementById("exam-timer-display");
  if (!display) return;

  const min = Math.floor(examTimeLeft / 60);
  const sec = examTimeLeft % 60;
  display.textContent = `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;

  // 5분 이하: 빨간색 + 굵게 표시 (긴박감 전달)
  if (examTimeLeft <= 300) {
    display.style.color = "#d32f2f";
    display.style.fontWeight = "bold";
  }
}

/**
 * handleTimerExpired()
 * ─────────────────────────────────────
 * [역할] 시험 시간이 0이 되었을 때 자동으로 호출됩니다.
 *        타이머를 "00:00"으로 표시하고, 팝업 안내 후 자동 제출합니다.
 *
 * [호출 시점] startExamTimer()의 setInterval 콜백에서 examTimeLeft <= 0 조건 시
 */
function handleTimerExpired() {
  const display = document.getElementById("exam-timer-display");

  // 타이머를 "00:00"으로 고정
  if (display) {
    display.textContent = "00:00";
    display.style.color = "#d32f2f";
  }

  // 시간 초과 안내 후 자동 제출
  showCustomPopup("시험 시간이 완료 되었습니다.\n답안지가 자동으로 제출됩니다.😄");
  submitExam();
}

// ─────────────────────────────────────────────────────────────
// 채점 (답안 제출)
// ─────────────────────────────────────────────────────────────

/**
 * submitExam()
 * ─────────────────────────────────────
 * [역할] 학생의 답안을 수집하고 서버에 채점을 요청합니다.
 *        채점 결과를 받아 결과 모달을 표시합니다.
 *
 * [호출 시점]
 *   - [답안지 제출] 버튼 클릭 시
 *   - 시간 초과 시 handleTimerExpired()에서 자동 호출
 *
 * [API 호출]
 *   엔드포인트: POST /api/exam/submit
 *   전송 데이터: {
 *     unit: "단원명",
 *     problems: [{ 문제: "...", 정답: "..." }, ...],
 *     answers: ["학생 답안1", "학생 답안2", ...]
 *   }
 *   응답 예시: {
 *     score: 80,
 *     correct: 8,
 *     total: 10,
 *     wrong_numbers: [3, 7],
 *     feedbacks: { "3": "풀이 설명...", "7": "풀이 설명..." }
 *   }
 *
 * [중복 제출 방지]
 *   examSubmitting 플래그로 제출 중 재요청을 차단합니다.
 */
async function submitExam() {
  // 이미 채점 중이면 무시 (중복 제출 방지)
  if (examSubmitting) return;

  if (!examStarted) {
    showCustomPopup("시험을 먼저 시작하세요.😄");
    return;
  }

  if (examProblems.length === 0) {
    showCustomPopup("시험지가 없습니다.😢");
    return;
  }

  // 진행 중인 타이머 취소 (타이머가 계속 돌지 않도록)
  if (examTimer) {
    clearInterval(examTimer);
    examTimer = null;
  }

  examSubmitting = true;

  // 제출 버튼 비활성화 + 채점 중 텍스트 표시
  const submitBtn = document.getElementById("exam-submit-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "채점 중...";
  }

  // 각 문제의 입력창에서 답안 수집 (빈 입력은 빈 문자열로 처리)
  const answers = examProblems.map((_, idx) => {
    const input = document.getElementById(`exam-answer-${idx + 1}`);
    return input ? (input.value || "") : "";
  });

  const unit = document.getElementById("exam-unit-select")?.value || "";

  try {
    // POST /api/exam/submit: 문제와 답안을 서버에 전송해 채점 요청
    const res = await apiFetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unit, problems: examProblems, answers })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showExamResultError(err.detail || "채점 오류가 발생했습니다.");
      return;
    }

    const result = await res.json();

    // 채점 결과를 임시 보관 (확인 버튼 클릭 시 서버에 저장)
    examPendingSaveData = {
      unit,
      score: result.score,
      total_questions: result.total,
      wrong_numbers: result.wrong_numbers || [],
      feedbacks: result.feedbacks || {}
    };

    // 결과 모달에 채점 내용 채우고 열기
    fillExamResultBody(result);
    openExamResultModal();
  } catch (e) {
    console.error("채점 오류", e);
    showExamResultError("서버 연결 오류가 발생했습니다.");
  } finally {
    // 성공/실패 관계없이 플래그 해제 + 버튼 복원
    examSubmitting = false;

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "답안지 제출";
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 시험 결과 모달
// ─────────────────────────────────────────────────────────────

/**
 * openExamResultModal()
 * ─────────────────────────────────────
 * [역할] 시험 결과 모달(examResultModal)을 화면에 표시합니다.
 *        fillExamResultBody() 또는 showExamResultError() 호출 후 사용합니다.
 */
function openExamResultModal() {
  const modal = document.getElementById("examResultModal");
  const box = modal?.querySelector(".modal-box");
  if (!modal) return;

  modal.classList.remove("hidden");
  modal.style.display = "flex";
  // 모달이 열릴 때 사운드 효과 재생 (사용자 경험 향상)
  playModalSound();

  if (box) box.scrollTop = 0;   // 핵심 : 모달 내용이 길어질 수 있으므로 스크롤을 맨 위로 초기화
  
}

/**
 * fillExamResultBody(result)
 * ─────────────────────────────────────
 * [역할] 채점 결과 데이터를 받아 결과 모달의 내용을 채웁니다.
 *        점수, 평가 메시지, 틀린 문제 풀이 설명을 표시합니다.
 *
 * [점수 등급 분류]
 *   - 50점 이하: "조금 더 연습해 봅시다! 화이팅!"
 *   - 70점 이하: "괜찮아요! 조금만 더 하면 잘할 수 있어요!"
 *   - 90점 이하: "너무 훌륭해요! 수학을 정말 잘하네요!"
 *   - 91점 이상: "진짜 대단해요! 우리 친구는 수학 천재!"
 *
 * [MathJax 렌더링]
 *   틀린 문제 풀이 내 수식을 렌더링하기 위해
 *   HTML 삽입 후 100ms 지연 후 renderMath() 호출합니다.
 *
 * @param {object} result - 채점 결과 객체
 *   @param {number} result.correct       - 맞은 문제 수
 *   @param {number} result.score         - 점수 (0~100)
 *   @param {Array}  result.wrong_numbers - 틀린 문제 번호 배열 (예: [3, 7])
 *   @param {object} result.feedbacks     - 번호별 풀이 설명 ({ "3": "...", "7": "..." })
 */
function fillExamResultBody(result) {
  const body = document.getElementById("examResultBody");
  if (!body) return;

  const correct = result.correct ?? 0;
  const wrongNums = result.wrong_numbers || [];
  const feedbacks = result.feedbacks || {};

  // 100점 만점으로 환산 (문제 당 10점)
  const displayScore = correct * 10;

  if (displayScore === 100) {
  showHearts();
  }

  // 점수 구간별 평가 메시지
  let levelText = "";
  if (displayScore <= 50) {
    levelText = "조금 더 연습해 봅시다! 화이팅!";
  } else if (displayScore <= 70) {
    levelText = "괜찮아요! 조금만 더 하면 잘할 수 있어요!";
  } else if (displayScore <= 90) {
    levelText = "너무 훌륭해요! 수학을 정말 잘하네요!";
  } else {
    levelText = "진짜 대단해요! 우리 친구는 수학 천재!";
  }

  // 틀린 문제별 풀이 설명 HTML 생성
  let feedbackHtml = "";

  if (wrongNums.length === 0) {
    // 전부 맞혔을 때: 칭찬 메시지 표시
    feedbackHtml = `
      <div class="solution-box" style="background:#f4fff6; border-color:#b9e3c1;">
        모든 문제를 맞혔어! 정말 잘했어!
      </div>
    `;
  } else {
    // 틀린 문제마다 풀이 설명 박스 생성
    wrongNums.forEach(num => {
      const fb = feedbacks[String(num)] || "풀이 설명이 없습니다.";

      // 분수 등 수식을 LaTeX 형식으로 1차 변환 (MathJax 렌더링 준비)
      let processedFb = fb;
      if (typeof prepareMathDisplayText === "function") {
        processedFb = prepareMathDisplayText(fb);
      }

      feedbackHtml += `
        <div style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid #eee;">
          <p style="font-weight:bold; color:#d32f2f; font-size:17px; margin:0 0 6px 0;">
            ${num}번 풀이
          </p>
          <div class="solution-box">${escapeHtml(processedFb)}</div>
        </div>
      `;
    });
  }

  // 결과 모달 전체 내용 삽입
  body.innerHTML = `
    <p style="font-size:24px; font-weight:bold; margin-bottom:10px;">
      시험 점수 : ${displayScore}점 / 100점
    </p>
    <div style="
    background:#fff3cd;
    border:1px solid #ffe69c;
    padding:12px 16px;
    border-radius:10px;
    font-size:20px;
    font-weight:600;
    margin-bottom:20px;
    display:inline-block;">
    ⭐ ${levelText}
    </div>
    <h3 style="margin:0 0 12px 0; font-size:20px;">틀린 문제 풀이</h3>
    ${feedbackHtml}
  `;

  // HTML 삽입 직후 MathJax로 수식 렌더링 (100ms 대기: DOM 업데이트 완료 후 실행)
  if (typeof renderMath === "function") {
    setTimeout(() => {
      try {
        renderMath("examResultBody");
      } catch (e) {
        console.error("수식 렌더링 실패:", e);
      }
    }, 100);
  }

  // 점수 텍스트 저장 (TTS 읽기용, 미래 확장 대비)
  examTtsText = `시험 점수는 ${displayScore}점입니다. ${levelText}`;

  // 모달 닫기 허용 (채점 완료 후에만 닫을 수 있도록)
  examModalClosable = true;

  // 확인 버튼 활성화
  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }
}

/**
 * showExamResultError(message)
 * ─────────────────────────────────────
 * [역할] 채점 중 오류가 발생했을 때 결과 모달에 오류 메시지를 표시합니다.
 *
 * @param {string} message - 표시할 오류 메시지
 */
function showExamResultError(message) {
  const body = document.getElementById("examResultBody");
  if (!body) return;

  // 오류 메시지 표시
  body.innerHTML = `
    <p style="color:#c00; padding:20px; font-size:16px;">
      ${message}
    </p>
  `;

  examModalClosable = true;

  const confirmBtn = document.getElementById("examResultConfirmBtn");
  if (confirmBtn) {
    confirmBtn.textContent = "확인";
    confirmBtn.style.display = "inline-block";
    confirmBtn.disabled = false;
  }

  openExamResultModal();
}

/**
 * closeExamResultModal()
 * ─────────────────────────────────────
 * [역할] 시험 결과 모달을 닫고 시험 페이지로 복귀합니다.
 *        examModalClosable이 true일 때만 닫을 수 있습니다.
 *
 * [주의] resetExamState()를 직접 호출하지 않고 goPage("exam")으로
 *        부드럽게 초기 화면으로 복귀합니다.
 *        (resetExamState() 직접 호출 시 레이아웃 깜빡임 발생 가능)
 */
function closeExamResultModal() {
  // 채점 완료 전에는 모달 닫기 불가
  if (!examModalClosable) return;

  const modal = document.getElementById("examResultModal");
  if (modal) {
    modal.classList.add("hidden");
    modal.style.display = "none";
  }

  // 시험 섹션 첫 화면으로 복귀 (resetExamState는 goPage 내에서 처리됨)
  goPage("exam");
}

/**
 * saveExamResultAfterConfirm(data)
 * ─────────────────────────────────────
 * [역할] 확인 버튼 클릭 후 시험 결과를 서버 DB에 저장합니다.
 *        성적 로그(section4.js)에서 이 데이터를 조회해 표시합니다.
 *
 * [API 호출]
 *   엔드포인트: POST /api/exam/save-result
 *   전송 데이터: {
 *     unit: "단원명",
 *     score: 80,
 *     total_questions: 10,
 *     wrong_numbers: [3, 7],
 *     feedbacks: { "3": "...", "7": "..." }
 *   }
 *
 * @param {object} data - 저장할 시험 결과 데이터
 */
async function saveExamResultAfterConfirm(data) {
  try {
    await apiFetch("/api/exam/save-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error("시험 결과 저장 실패", e);
  }
}

// ─────────────────────────────────────────────────────────────
// 결과 모달 이벤트 바인딩
// ─────────────────────────────────────────────────────────────

/**
 * bindExamModalEvents()
 * ─────────────────────────────────────
 * [역할] 시험 결과 모달의 "확인" 버튼에 클릭 이벤트를 등록합니다.
 *        initExam() 호출 시 한 번 실행됩니다.
 *
 * [확인 버튼 동작 순서]
 *   1. 결과 모달 즉시 닫기
 *   2. 채점 결과를 서버에 비동기로 저장 (saveExamResultAfterConfirm)
 *   3. 시험 상태 전체 초기화 (resetExamState)
 *   4. 시험 페이지 첫 화면으로 복귀 (goPage("exam"))
 */
function bindExamModalEvents() {
  const confirmBtn = document.getElementById("examResultConfirmBtn");

  if (confirmBtn) {
    // 확인 버튼 클릭 시 초기 화면으로 복귀하는 로직
    confirmBtn.onclick = async function(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      console.log("✅ 시험 결과 확인 - 초기 화면으로 복귀합니다.");

      // 1. 모달창 즉시 닫기
      const modal = document.getElementById("examResultModal");
      if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
      }

      // 2. 시험 결과를 서버에 비동기로 저장 (실패해도 화면 복귀는 진행)
      if (examPendingSaveData) {
        saveExamResultAfterConfirm(examPendingSaveData).catch(err => console.error(err));
      }

      // 3. 시험 섹션의 모든 상태와 UI를 초기화
      resetExamState();

      // 4. 시험 페이지 첫 화면으로 이동
      if (typeof goPage === "function") {
        goPage("exam");
      }

      return false;
    };
  }
}

function showHearts() {

  let count = 0;

  const interval = setInterval(() => {

    const heart = document.createElement("div");
    heart.innerHTML = "❤️";
    heart.className = "floating-heart";

    heart.style.left = Math.random() * 100 + "vw";
    heart.style.fontSize = Math.floor(Math.random() * 25 + 30) + "px";
    heart.style.animationDuration = (Math.random() * 3 + 3) + "s";

    document.body.appendChild(heart);

    setTimeout(() => {
      heart.remove();
    }, 6000);

    count++;

    if (count > 40) {   // 하트 총 개수
      clearInterval(interval);
    }

  }, 80);  // 생성 간격 (작을수록 촤라라라)

}
