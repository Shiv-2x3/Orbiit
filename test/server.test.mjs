import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  createServer,
  normalizeSearchResults,
  parsePlan,
  validateWriterAnswer,
} from "../server.mjs";

test("parsePlan trims, deduplicates, and caps search queries", () => {
  const plan = parsePlan(
    JSON.stringify({
      goal: "  compare options ",
      queries: [" topic ", "topic", "third", "fourth", "fifth"],
    }),
  );
  assert.deepEqual(plan, {
    goal: "compare options",
    queries: ["topic", "third", "fourth"],
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

test("writer answer renders only analyst-approved source citations", () => {
  const findings = [{ claim: "A sourced finding.", source_ids: ["S1"] }];
  assert.equal(
    validateWriterAnswer(
      JSON.stringify({
        paragraphs: [{ text: "A concise answer.", source_ids: ["S1"] }],
      }),
      findings,
    ),
    "A concise answer. [S1]",
  );
  assert.throws(
    () =>
      validateWriterAnswer(
        JSON.stringify({
          paragraphs: [{ text: "An unsupported answer.", source_ids: ["S2"] }],
        }),
        findings,
      ),
    /not attached to an analyst finding/,
  );
});

const plannerResponse = JSON.stringify({
  goal: "Find two sources",
  queries: ["example research"],
});
const analystResponse = JSON.stringify({
  findings: [{ claim: "A sourced finding.", source_ids: ["S1"] }],
});
const writerResponse = JSON.stringify({
  paragraphs: [{ text: "A short answer grounded in the source.", source_ids: ["S1"] }],
});

let server;
let baseUrl;

before(async () => {
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname === "/api/chat") {
      const body = JSON.parse(options.body);
      const systemMessage = body.messages[0].content;
      assert.equal(body.think, false);
      assert.ok(body.options.num_predict > 0);
      const content = systemMessage.includes("planning agent")
        ? plannerResponse
        : systemMessage.includes("evidence analyst")
          ? analystResponse
          : writerResponse;
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
  assert.match(stream, /A short answer grounded in the source\. \[S1\]/);
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

test("research reports the model pull command when Ollama has no configured model", async () => {
  const missingModelFetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/api/chat") {
      return new Response(
        JSON.stringify({ error: 'model "qwen3:4b" not found, try pulling it first' }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`Unexpected test fetch URL: ${url}`);
  };
  const testServer = createServer({
    fetchImpl: missingModelFetch,
    env: {
      OLLAMA_URL: "http://ollama.test",
      OLLAMA_MODEL: "qwen3:4b",
      SEARXNG_URL: "http://search.test",
    },
  });
  await new Promise((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${testServer.address().port}/api/research`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Research a question" }),
    });
    const stream = await response.text();
    assert.match(stream, /event: error/);
    assert.match(stream, /Ollama model \\"qwen3:4b\\" is not installed/);
    assert.match(stream, /docker compose exec ollama ollama pull qwen3:4b/);
  } finally {
    await new Promise((resolve, reject) =>
      testServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
