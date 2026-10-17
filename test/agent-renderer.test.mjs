import assert from "node:assert/strict";
import { test } from "node:test";
import { createAgentRenderer } from "../public/agent-renderer.mjs";

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.className = "";
    this.textContent = "";
  }

  get firstElementChild() {
    return this.children[0] ?? null;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  querySelector(selector) {
    if (selector === "[data-agent-message]") {
      const pending = [...this.children];
      while (pending.length) {
        const element = pending.shift();
        if (Object.hasOwn(element.dataset, "agentMessage")) return element;
        pending.push(...element.children);
      }
    }
    return null;
  }
}

test("agent renderer updates a row without relying on styling classes", () => {
  const agentList = new Element();
  const renderer = createAgentRenderer({
    document: { createElement: () => new Element() },
    agentList,
  });

  renderer.render({ agent: "Planner", state: "working", message: "Planning searches." });
  const [row] = agentList.children;
  assert.equal(row.querySelector("[data-agent-message]").textContent, "Planning searches.");
  assert.match(row.firstElementChild.className, /animate-pulse/);

  renderer.render({ agent: "Planner", state: "done", message: "Plan ready." });
  assert.equal(agentList.children.length, 1);
  assert.equal(row.querySelector("[data-agent-message]").textContent, "Plan ready.");
  assert.match(row.firstElementChild.className, /bg-neutral-300/);

  renderer.reset();
  assert.equal(agentList.children.length, 0);
});
