import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, normalizeSearchResults, parsePlan } from "../server.mjs";

test("parsePlan trims, deduplicates, and caps search queries", () => {
  const plan = parsePlan(
    JSON.stringify({
      goal: "  compare options ",
      queries: [" topic ", "topic", "third", "fourth", "fifth"],
    }),
  );
  assert.deepEqual(plan, {
    goal: "compare options",
    queries: ["topic", "third", "fourth", "fifth"],
  });
});

test("parsePlan rejects an empty plan", () => {
  assert.throws(() => parsePlan('{"queries":[]}'), /empty or invalid/);
});

test("normalizeSearchResults excludes unsafe URL schemes", () => {
  assert.deepEqual(
    normalizeSearchResults(
      {
        results: [
          { title: "Good", url: "https://example.com/a", content: "snippet" },
          { title: "Bad", url: "javascript:alert(1)", content: "bad" },
        ],
      },
      "query",
    ),
    [
      {
        title: "Good",
        url: "https://example.com/a",
        snippet: "snippet",
        query: "query",
      },
    ],
  );
});

const plannerResponse = JSON.stringify({
  goal: "Find two sources",
  queries: ["example research"],
});
const analystResponse = JSON.stringify({
  findings: [{ claim: "A sourced finding.", source_ids: ["S1"] }],
});

let server;
let baseUrl;

before(async () => {
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname === "/api/chat") {
      const body = JSON.parse(options.body);
      const systemMessage = body.messages[0].content;
      const content = systemMessage.includes("planning agent")
        ? plannerResponse
        : systemMessage.includes("evidence analyst")
          ? analystResponse
          : "A short answer grounded in the source [S1].";
      return new Response(JSON.stringify({ message: { content } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/search") {
      return new Response(
        JSON.stringify({
          results: [{ title: "Source", url: "https://example.com/source", content: "Evidence snippet." }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected test fetch URL: ${url}`);
  };
  const env = {
    OLLAMA_URL: "http://ollama.test",
    OLLAMA_MODEL: "test-model",
    SEARXNG_URL: "http://search.test",
  };
  const testServer = createServer({ fetchImpl, env });
  await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  server = testServer;
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health endpoint reports the configured model", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).model, "test-model");
});

test("web UI and its local assets are served", async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Local research workspace/);

  const css = await fetch(`${baseUrl}/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);

  const js = await fetch(`${baseUrl}/app.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get("content-type"), /javascript/);
});

test("research endpoint streams agent progress, sources, and cited answer", async () => {
  const response = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "Research a question" }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/event-stream/);
  const stream = await response.text();
  assert.match(stream, /event: agent/);
  assert.match(stream, /event: sources/);
  assert.match(stream, /"id":"S1"/);
  assert.match(stream, /event: answer/);
  assert.match(stream, /A short answer grounded in the source \[S1\]/);
  assert.match(stream, /event: done/);
});

test("research endpoint rejects blank questions", async () => {
  const response = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: " " }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /between 1 and 600 characters/);
});
