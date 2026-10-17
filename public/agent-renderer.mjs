export function createAgentRenderer({ document, agentList }) {
  const agents = new Map();

  function render(payload) {
    let row = agents.get(payload.agent);
    if (!row) {
      row = document.createElement("div");
      row.className = "flex items-start gap-3 border-b border-neutral-800 py-3 last:border-0";
      const dot = document.createElement("span");
      dot.className = "mt-1.5 size-1.5 shrink-0 rounded-full bg-neutral-600";
      const copy = document.createElement("div");
      copy.className = "grid min-w-0 gap-1";
      const name = document.createElement("strong");
      name.className = "text-[11px] font-medium text-neutral-200";
      name.textContent = payload.agent;
      const message = document.createElement("span");
      message.className = "text-[10px] leading-5 text-neutral-500";
      message.dataset.agentMessage = "";
      copy.append(name, message);
      row.append(dot, copy);
      agents.set(payload.agent, row);
      agentList.append(row);
    }

    const dot = row.firstElementChild;
    dot.className = `mt-1.5 size-1.5 shrink-0 rounded-full ${
      payload.state === "working"
        ? "animate-pulse bg-white"
        : payload.state === "done"
          ? "bg-neutral-300"
          : "bg-neutral-600"
    }`;
    row.querySelector("[data-agent-message]").textContent = payload.message;
  }

  function reset() {
    agents.clear();
    agentList.replaceChildren();
  }

  return { render, reset };
}
