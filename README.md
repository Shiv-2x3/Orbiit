# Orbit Research

A local-first, Docker-hostable research workspace. A small agent team plans
searches, retrieves web results through SearXNG, checks claims against those
results, and writes a cited answer using an Ollama model running on your device.

This is an original starter application, not a copy of Perplexity's software or
interface. The model and app run locally; web research needs an internet
connection and sends search queries to the configured SearXNG instance and its
upstream search engines.

## Start with Docker

Requirements: Docker Engine with the Compose plugin, internet access for
container/model downloads and web search, and enough memory for the chosen
Ollama model.

```sh
cp .env.example .env
```

For a shared or non-local deployment, replace `server.secret_key` in
`searxng/settings.yml` with a long random value before starting. The app binds
to `127.0.0.1:3000`, and Ollama/SearXNG are not published on host ports.

```sh
docker compose up -d --build
```

Compose waits for Ollama, then automatically downloads the configured model.
The first download can take a while; view progress with
`docker compose logs -f ollama-model`. The app starts after the pull succeeds.
Open <http://127.0.0.1:3000>. Change
`OLLAMA_MODEL` in `.env` to another model available in Ollama if your device
needs a smaller or larger model, then recreate the app with
`docker compose up -d --build`.

To stop the stack, run `docker compose down`. To also remove downloaded model
data, run `docker compose down -v`.

## Run without Docker

Node.js 22 or newer is required. Run Ollama and a SearXNG instance separately,
enable SearXNG's JSON search format, and start the app:

```sh
OLLAMA_URL=http://127.0.0.1:11434 \
OLLAMA_MODEL=qwen3:4b \
SEARXNG_URL=http://127.0.0.1:8080 \
node server.mjs
```

The app listens on `0.0.0.0:3000` by default; set `HOST=127.0.0.1` to restrict
the direct Node.js server to the local machine.

## What the agents do

1. **Planner** turns a question into up to three focused searches.
2. **Researcher** fetches results from SearXNG and deduplicates source URLs.
3. **Analyst** extracts claims and must associate each finding with supplied
   source IDs.
4. **Writer** produces the answer and cites the collected sources inline.

The app does not execute code, browse arbitrary pages, or expose model tools.
Only search-result titles, URLs, and snippets are passed to the model. Search
snippets are treated as untrusted content. The interface displays source links
separately and inserts model output as text rather than HTML.

## Troubleshooting

- An Ollama model 404: check `docker compose logs ollama-model`. Compose pulls
  the configured model on startup; if the pull failed, retry with
  `docker compose run --rm ollama-model`.
- `fetch failed` or another Ollama HTTP error: check
  `docker compose logs ollama ollama-model`.
- SearXNG JSON errors: check `docker compose logs searxng` and confirm the
  service has started with JSON format enabled in `searxng/settings.yml`.
- No results: retry with more specific terms or check SearXNG's outbound
  internet connectivity.
- Check app and provider configuration with `curl http://127.0.0.1:3000/api/health`.

## Development checks

Install the locked development dependency, compile Tailwind CSS, and run tests:

```sh
npm ci
npm run build:css
node --test
docker compose config
```

The UI uses Tailwind CSS utilities with a black, white, and neutral-gray
palette.
The Tailwind CSS input is `public/styles.css`; compiled output is
`public/generated.css` and is ignored by Git. Docker compiles the stylesheet
during its asset build stage and copies only the generated CSS into the runtime
image.
