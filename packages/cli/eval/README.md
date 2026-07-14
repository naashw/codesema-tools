# Prompt evaluation bench

Measures finding recall of the reviewer (lane A) and prosecutor (lane B) prompts
against small labeled diffs. Run it BEFORE and AFTER any prompt change: a tweak
that does not move recall, or that explodes extras, is not an improvement.

## Usage

```bash
cd packages/cli
bun eval/run.ts --agent "claude -p --model haiku" [--lane a|b|both] [--timeout 300]
```

The agent command gets the same hardening flags as a real review run. Each
fixture runs once per requested lane; the report shows found/missed expected
bugs and `extras` (findings matching no expected bug, a noise proxy). LLM output
varies between runs: compare recall over 2-3 runs, never a single one.

## Fixtures

One JSON file per fixture under `fixtures/`: a PrepInput-like `input` (branch,
commits, files, diff, optional impact_candidates) and `expected` bugs, each with
a `file` and a case-insensitive `pattern` matched against finding title+message.

Notes:

- Keep fixtures small and patterns loose enough to accept different phrasings
  of the same bug.
- Lane A may legitimately answer the breaking-caller fixture with a narrative
  `check` question instead of a finding; the bench only counts findings.

This directory is a development tool: it is type-checked and its scoring module
is unit-tested, but nothing here ships in the npm tarball.
