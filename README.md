# codesema

Local merge request review, told as chapters. **Your** AI agent (Claude Code, Codex, …) does the review with the subscription you already pay for; `codesema` prepares the diff and displays the result in a local web UI. No account, no API key, no cloud — everything happens on your machine.

## Quick start

```bash
npx -y codesema
```

That is the whole flow:

1. **First run only** — a short wizard asks which agent CLI to use (auto-detected on your PATH), the model and the reasoning effort. Saved globally, never asked again; change it anytime with `codesema config`.
2. **Pick a branch** — your local branches, sorted by last commit, arrow keys + type-to-filter.
3. **The web UI opens immediately** — the review runs in the background and the page fills in live: diff stats first, then verdict, summary and findings as the agent writes them (true token streaming with Claude Code, best-effort with other agents).

Re-running on the same branch reviews **incrementally**: the agent gets the previous review plus the diff since it, and updates it (pass `--full` to review from scratch).

## How it works

```
┌──────────────┐  prep   ┌───────────────────────┐  review   ┌───────────────────────┐  live SSE
│ local branch │ ──────► │ .codesema/input.json  │ ────────► │ .codesema/review.json │ ─────────► local web UI
└──────────────┘  (CLI)  └───────────────────────┘ (your AI  └───────────────────────┘ (opened before
                                                     agent)                             the review ends)
```

1. **prep** detects the target branch (via `glab`/`gh` if an MR/PR exists, else `origin/HEAD`, else nearest merge-base among develop/main/master) and computes the MR diff.
2. **Your agent** reviews the diff like a senior reviewer and writes a structured review: prologue, ordered chapters with risk/take/check, typed findings (security/perf/convention/design/praise/why), and what to review first.
3. **The local web UI** shows the review in progress, then switches to the full experience: guided chapter-by-chapter reading, split/unified diff with inline notes, file tree, read/checked progress.

## Requirements

- Node.js ≥ 20 and `git`
- An AI agent CLI — `claude` (Claude Code), `codex` (OpenAI) and `gemini` (Google) are auto-detected; anything else works via the "Custom command" wizard option or `--agent '<cmd>'` (e.g. `--agent 'opencode run "$(cat)"'`)
- Optional: `glab` or `gh` on the PATH, to auto-detect the target branch from the open MR/PR

## Configuration

```bash
npx -y codesema config
```

Interactive: agent → model → effort, then where to save. Two levels, field by field:

| Level  | File                             | When                                   |
| ------ | -------------------------------- | -------------------------------------- |
| Global | `~/.config/codesema/config.json` | Your default, every repo (onboarding)  |
| Repo   | `.codesema/config.json`          | Team/project override, wins over global |

CLI flags always win over both. `target`, `port` and `timeout` can also be set in either file.

## Commands

```bash
codesema                       # interactive review (default command)
codesema review --branch feat/x --target develop   # non-interactive, CI-friendly
codesema config                # change agent / model / effort
codesema prep                  # only write .codesema/input.json for your own agent flow
codesema show                  # only display .codesema/review.json (or the last archived review)
codesema export --out review.md   # Markdown export (--out - for stdout)
```

`codesema --help` lists every flag.

## Agent skill (optional)

To drive the flow from inside your agent instead of the CLI, install the bundled skill — plain agent-agnostic markdown:

```bash
# Claude Code, from a clone of this repo (global install):
cp -r skills/codesema ~/.claude/skills/codesema
```

Then, in any repo, on your feature branch, ask your agent: `/codesema`. It uses `codesema prep` + `codesema show` underneath.

## Customize

- `.codesema/PROMPT.md` — your team's review instructions, merged into the agent prompt.
- `.codesema-ignore` — glob patterns excluded from the diff (lockfiles, minified files and sourcemaps are excluded by default).

## Troubleshooting

- `could not detect the target branch` — no MR/PR found and no develop/main/master to compare against: pass `--target <branch>`.
- `empty diff … nothing to review` — codesema reviews **committed** work: commit your changes first.
- `agent timed out` — raise the budget with `--timeout <seconds>` (default 900).
- `no supported agent CLI found` — install `claude`, or pick "Custom command" in `codesema config` (the command receives the prompt on stdin and must print the review JSON on stdout).
- Port busy — codesema scans 20 ports from the preferred one (default 4400); pick another base with `--port <n>`.
- The web page says the review failed — the terminal has the full error; the server stays up so you can read both.

## Development

```bash
bun install
bun run build        # builds the web UI, embeds it in the CLI, builds the CLI
node packages/cli/dist/index.mjs        # full interactive flow
node packages/cli/dist/index.mjs show
```

Monorepo layout (`codesema-tools`): `packages/cli` (Node CLI: review/prep/show, Hono ephemeral server + SSE), `packages/web` (Vue 3 + Vite SPA embedded in the CLI tarball), `skills/codesema` (the agent skill).

## License

MIT
