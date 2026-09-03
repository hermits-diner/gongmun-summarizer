// ===== 유틸 =====
const $ = (id) => document.getElementById(id);
const MAX_CHARS = 12000; // 전송 텍스트 상한 (토큰 절약)

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

// ===== 설정 저장/로드 =====
async function loadSettings() {
  const { apiKey = "", model = "gemini-flash-latest" } =
    await chrome.storage.local.get(["apiKey", "model"]);
  $("apiKey").value = apiKey;
  $("model").value = model;
  if (!apiKey) $("settings").classList.remove("hidden");
  return { apiKey, model };
}

$("saveSettings").addEventListener("click", async () => {
  const apiKey = $("apiKey").value.trim();
  const model = $("model").value.trim() || "gemini-flash-latest";
  await chrome.storage.local.set({ apiKey, model });
  $("settings").classList.add("hidden");
  setStatus("설정을 저장했습니다.", "ok");
});

$("toggleSettings").addEventListener("click", () => {
  $("settings").classList.toggle("hidden");
});

// ===== 클립보드 붙여넣기 =====
async function readClipboard() {
  try {
    return (await navigator.clipboard.readText()) || "";
  } catch (e) {
    return null; // 권한/포커스 문제 시 null
  }
}

$("paste").addEventListener("click", async () => {
  const text = await readClipboard();
  if (text === null) {
    setStatus("클립보드를 읽지 못했습니다. 입력창에 직접 Ctrl+V 하세요.", "err");
    return;
  }
  if (!text.trim()) {
    setStatus("클립보드가 비어 있습니다.", "err");
    return;
  }
  $("input").value = text;
  setStatus(`붙여넣기 완료 (${text.length.toLocaleString()}자)`, "ok");
});

// ===== 프롬프트 =====
function buildPrompt(text, mode) {
  const clipped =
    text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n...(이하 생략)" : text;

  const detail = `다음은 접수·기안된 공문 본문입니다. 아래 순서로 정리하세요. 본문에 있는 내용만 쓰고, 찾을 수 없는 항목은 "미상" 또는 "해당 없음"으로 적으세요.

먼저 맨 앞에, 라벨 없이 존댓말 안내 문단을 쓰세요. 반드시 "수고많으십니다."로 시작하고 "감사합니다."로 끝맺으세요. 그 사이에는 공문이 왔다는 사실과 무엇을 언제까지 어떻게 하면 되는지를 담되, 사람이 쓰듯 담백하게 쓰세요. 부탁하는 표현은 "제출하시면 되겠습니다"처럼 부드럽게 쓰고, 문서번호와 기호는 넣지 마세요.

그 아래 한 줄 띄우고, 다음 항목을 개조식으로 정리하세요.

작성 규칙:
- 이모지나 장식 기호를 쓰지 말고, 아래 라벨을 그대로 사용하세요.
- 제목부터 담당/발신까지는 개조식으로 간결하게 쓰세요. 문장을 완결하지 말고 명사형이나 "~함", "~할 것"처럼 끝맺으세요.
- 여러 항목은 각 줄 앞에 "- "를 붙여 나열하세요.
- 줄표(—), 번역투, 상투적이거나 과장된 표현은 쓰지 마세요. 제목을 못 찾아도 "(추정)" 표시는 붙이지 마세요.
- 본문에 나오는 URL(http/https 주소)이나 하이퍼링크는 접속해 신청·등록해야 하는 통로이므로 절대 생략하지 마세요. 주소를 원문 그대로(축약·수정 없이) 옮기고, 무엇을 신청·접수하는 링크인지 짧게 덧붙이세요. 안내 문단에도 신청 링크가 있으면 그 주소를 자연스럽게 포함하세요.

제목: (본문에서 찾은 제목)
문서번호: (예: ○○기관-1234, 없으면 미상)
핵심 내용:
- (개조식 항목)
조치 사항:
- (개조식 항목, 없으면 "- 없음")
제출 기한: (날짜 또는 해당 없음)
관련 링크:
- (신청·접수용 URL을 원문 그대로. 각 줄에 "주소 - 용도" 형식. 없으면 "- 없음")
담당/발신: (파악되면, 아니면 미상)

[공문 본문]
${clipped}`;

  const short = `다음 공문 본문을, 동료에게 쿨메신저로 전달할 안내 메시지로 바꿔 주세요.

조건:
- 존댓말로, 실제 담당자가 동료에게 말하듯 담백하고 자연스럽게 쓰세요.
- 반드시 "수고많으십니다."로 시작하고 "감사합니다."로 끝맺으세요.
- 그 사이에 공문이 접수되었다는 사실과, 무엇을 언제까지 어떤 방법으로 하면 되는지를 안내하세요.
- 부탁하는 표현은 "제출하시면 되겠습니다"처럼 부드럽게 쓰세요.
- 문서번호는 넣지 마세요.
- 본문에 URL(http/https 주소)이나 하이퍼링크가 있으면 접속해 신청·등록해야 하는 통로이므로 반드시 포함하세요. 주소는 원문 그대로(축약·수정 없이) 옮기고, 어디에 무엇을 신청하는 링크인지 자연스럽게 안내하세요.
- 이모지, 대괄호 표식, 줄표(—), 기계적인 항목 나열, 과장되거나 상투적인 표현은 쓰지 마세요.
- 안내 문장만 출력하세요.

[공문 본문]
${clipped}`;

  return mode === "short" ? short : detail;
}

// ===== Gemini 호출 =====
async function summarize(text, mode) {
  const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
  if (!apiKey) throw new Error("Gemini API 키를 먼저 설정하세요. (⚙ 버튼)");
  const m = model || "gemini-flash-latest";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ parts: [{ text: buildPrompt(text, mode) }] }],
    generationConfig: { temperature: 0.2 },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API 오류 (${res.status}). 키·모델명을 확인하세요.\n${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const out =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim() || "";
  if (!out) throw new Error("빈 응답을 받았습니다. 모델명 또는 안전 필터를 확인하세요.");
  return out;
}

// ===== 복사 =====
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

// ===== 실행 =====
$("run").addEventListener("click", async () => {
  const text = $("input").value.trim();
  if (!text) {
    setStatus("먼저 본문을 붙여넣으세요.", "err");
    return;
  }

  $("run").disabled = true;
  $("copy").disabled = true;
  $("output").value = "";
  $("meta").textContent = "";
  setStatus("요약하는 중…", "busy");

  try {
    const summary = await summarize(text, $("mode").value);
    $("output").value = summary;
    $("copy").disabled = false;
    $("meta").textContent = `${text.length.toLocaleString()}자 입력`;
    setStatus("완료되었습니다.", "ok");
  } catch (e) {
    setStatus(e.message || String(e), "err");
  } finally {
    $("run").disabled = false;
  }
});

$("copy").addEventListener("click", async () => {
  const ok = await copyText($("output").value);
  setStatus(ok ? "클립보드에 복사했습니다." : "복사에 실패했습니다.", ok ? "ok" : "err");
});

// ===== 초기화 =====
(async function init() {
  await loadSettings();
  // 팝업을 열 때 클립보드에 내용이 있으면 자동으로 채움 (입력창이 비어 있을 때만)
  const clip = await readClipboard();
  if (clip && clip.trim() && !$("input").value.trim()) {
    $("input").value = clip;
    setStatus(`클립보드 자동 첨부 (${clip.length.toLocaleString()}자) · 요약하기를 누르세요.`, "ok");
  }
  $("input").focus();
})();
