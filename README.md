# mr-review

Local merge request review, told as chapters. **Your** AI agent (Claude Code, Codex, …) does the review with the subscription you already pay for; `mr-review` prepares the diff and displays the result in a local web UI. No account, no API key, no cloud — everything happens on your machine.

## How it works

```
┌─────────────┐   prep    ┌──────────────────────┐   review   ┌──────────────────────┐   show
│ your branch │ ────────► │ .mr-review/input.json│ ─────────► │ .mr-review/review.json│ ────────► local web UI
└─────────────┘  (CLI)    └──────────────────────┘ (your AI   └──────────────────────┘  (CLI)
                                                     agent)
```

1. **`mr-review prep`** detects your current branch and the target branch (via `glab`/`gh` if an MR/PR exists, else `origin/HEAD`, else nearest merge-base among develop/main/master), computes the MR diff and writes `.mr-review/input.json`.
2. **Your agent** (driven by the bundled skill) reviews the diff like a senior reviewer and writes a structured review: prologue, ordered chapters with risk/take/check, typed findings (security/perf/convention/design/praise/why), and what to review first.
3. **`mr-review show`** opens a local web UI: guided chapter-by-chapter reading, split/unified diff with inline notes, file tree, read/checked progress.

## Requirements

- Node.js ≥ 20 and `git`
- For the one-shot `review` command: an AI agent CLI — `claude` (Claude Code), `codex` (OpenAI) and `gemini` (Google) are auto-detected; anything else works via `--agent '<cmd>'`
- Optional: `glab` or `gh` on the PATH, to auto-detect the target branch from the open MR/PR

## Pick your agent, model and effort

```bash
npx -y mr-review config
```

An interactive wizard lists the agent CLIs found on your PATH, then asks for the model and the reasoning effort (when the provider supports one), and saves the resulting command to `.mr-review/config.json`. The first `mr-review review` run in a terminal offers the same wizard automatically. `--agent '<cmd>'` always overrides it — use it for CLIs without stdin support too, e.g. `--agent 'opencode run "$(cat)"'`.

## Install

The CLI needs no install (`npx -y mr-review …`). To teach your agent the flow, install the bundled skill — it is plain agent-agnostic markdown:

```bash
# Claude Code, from a clone of this repo (global install):
cp -r skills/mr-review ~/.claude/skills/mr-review
```

Then, in any repo, on your feature branch, ask your agent: `/mr-review`.

Or run everything in one shot from your feature branch (uses your local `claude` CLI headlessly; pass `--agent '<cmd>'` for another agent):

```bash
npx -y mr-review review
```

The two underlying steps are also available separately (this is what the skill flow uses):

```bash
npx -y mr-review prep
npx -y mr-review show
```

## Customize

- `.mr-review/PROMPT.md` — your team's review instructions, merged into the agent prompt.
- `.mr-review-ignore` — glob patterns excluded from the diff (lockfiles, minified files and sourcemaps are excluded by default).

## Troubleshooting

- `could not detect the target branch` — no MR/PR found and no develop/main/master to compare against: pass `--target <branch>`.
- `empty diff … nothing to review` — mr-review reviews **committed** work: commit your changes first.
- `agent timed out` — raise the budget with `--timeout <seconds>` (default 900).
- `no supported agent CLI found` — install `claude`, or pass any command with `--agent '<cmd>'` (it receives the prompt on stdin and must print the review JSON on stdout).
- Port busy — mr-review scans 20 ports from the preferred one (default 4400); pick another base with `--port <n>`.

## Development

```bash
bun install
bun run build        # builds the web UI, embeds it in the CLI, builds the CLI
node packages/cli/dist/index.mjs prep
node packages/cli/dist/index.mjs show
```

Monorepo layout: `packages/cli` (Node CLI: prep/show, Hono ephemeral server), `packages/web` (Vue 3 + Vite SPA embedded in the CLI tarball), `skills/mr-review` (the agent skill).

## License

MIT
