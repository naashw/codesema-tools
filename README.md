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

## Install

Install the skill in your agent (this also teaches it how to run the CLI via `npx`):

```bash
npx skills add <org>/mr-review
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
