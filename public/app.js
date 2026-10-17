const form = document.querySelector("#research-form");
const questionInput = document.querySelector("#question");
const submitButton = document.querySelector("#submit-button");
const welcome = document.querySelector("#welcome");
const researchView = document.querySelector("#research-view");
const questionTitle = document.querySelector("#question-title");
const agentList = document.querySelector("#agent-list");
const teamStatus = document.querySelector("#team-status");
const answerCard = document.querySelector("#answer-card");
const answerText = document.querySelector("#answer-text");
const answerModel = document.querySelector("#answer-model");
const sourcesCard = document.querySelector("#sources-card");
const sourceList = document.querySelector("#source-list");
const sourceCount = document.querySelector("#source-count");
const errorCard = document.querySelector("#error-card");
const connection = document.querySelector("#connection");
const toast = document.querySelector("#toast");

const agentRows = new Map();

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 4500);
}

function setConnection(ok, detail) {
  connection.classList.toggle("connected", ok);
  connection.classList.toggle("disconnected", !ok);
  connection.lastElementChild.textContent = detail;
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("Local app is not responding.");
    const health = await response.json();
    answerModel.textContent = health.model;
    setConnection(true, `Local · ${health.model}`);
  } catch {
    setConnection(false, "Local services unavailable");
  }
}

function resetSession(question) {
  agentRows.clear();
  agentList.replaceChildren();
  answerText.textContent = "";
  answerCard.classList.add("hidden");
  sourcesCard.classList.add("hidden");
  errorCard.classList.add("hidden");
  teamStatus.textContent = "WORKING";
  questionTitle.textContent = question;
  welcome.classList.add("hidden");
  researchView.classList.remove("hidden");
}

function renderAgent(payload) {
  let row = agentRows.get(payload.agent);
  if (!row) {
    row = document.createElement("div");
    row.className = "agent-row";
    const dot = document.createElement("span");
    dot.className = "agent-dot";
    const copy = document.createElement("div");
    copy.className = "agent-copy";
    const name = document.createElement("strong");
    name.textContent = payload.agent;
    const message = document.createElement("span");
    copy.append(name, message);
    row.append(dot, copy);
    agentRows.set(payload.agent, row);
    agentList.append(row);
  }
  row.className = `agent-row ${payload.state}`;
  row.querySelector(".agent-copy span").textContent = payload.message;
}

function renderSources(sources) {
  sourceList.replaceChildren();
  for (const source of sources) {
    let hostname = source.url;
    try {
      hostname = new URL(source.url).hostname;
    } catch {
      // The server already filters source URLs; retain the original if parsing fails.
    }
    const link = document.createElement("a");
    link.className = "source-item";
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const top = document.createElement("div");
    top.className = "source-top";
    const id = document.createElement("span");
    id.className = "source-id";
    id.textContent = source.id;
    const domain = document.createElement("span");
    domain.className = "source-domain";
    domain.textContent = hostname;
    top.append(id, domain);
    const title = document.createElement("div");
    title.className = "source-title";
    title.textContent = source.title;
    link.append(top, title);
    sourceList.append(link);
  }
  sourceCount.textContent = `${sources.length} source${sources.length === 1 ? "" : "s"} found`;
  sourcesCard.classList.remove("hidden");
}

async function consumeEvents(response) {
  if (!response.body) throw new Error("The browser cannot read the research stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;

  while (!completed) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = pending.split("\n\n");
    pending = events.pop() || "";

    for (const block of events) {
      const eventName = block.match(/^event: ([^\n]+)/m)?.[1];
      const dataLine = block.match(/^data: (.+)$/m)?.[1];
      if (!eventName || !dataLine) continue;
      const payload = JSON.parse(dataLine);
      switch (eventName) {
        case "agent":
          renderAgent(payload);
          break;
        case "sources":
          renderSources(payload);
          break;
        case "answer":
          answerText.textContent = payload.text;
          answerCard.classList.remove("hidden");
          break;
        case "error":
          errorCard.textContent = payload.message;
          errorCard.classList.remove("hidden");
          teamStatus.textContent = "NEEDS ATTENTION";
          break;
        case "done":
          if (payload.ok) teamStatus.textContent = "COMPLETE";
          break;
        default:
          break;
      }
    }
    completed = done;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) {
    questionInput.focus();
    return;
  }
  resetSession(question);
  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = "Researching";
  try {
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Research request failed (HTTP ${response.status}).`);
    }
    await consumeEvents(response);
  } catch (error) {
    errorCard.textContent = error.message;
    errorCard.classList.remove("hidden");
    teamStatus.textContent = "NEEDS ATTENTION";
  } finally {
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = "Start research";
  }
});

document.querySelector("#new-research").addEventListener("click", () => {
  researchView.classList.add("hidden");
  welcome.classList.remove("hidden");
  questionInput.focus();
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    questionInput.value = button.dataset.prompt;
    questionInput.focus();
  });
});

checkHealth();
