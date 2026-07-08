// `mr-review review` : tout-en-un. prep → agent IA headless (claude -p par défaut,
// l'abonnement de l'utilisateur, aucun LLM embarqué) → review.json → show.

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot, tryExec } from './git.js'
import { prep } from './prep.js'
import { show } from './show.js'
import { printBanner, startSpinner } from './ui.js'

const REVIEW_INSTRUCTIONS = `You are a senior code reviewer. Review the merge request provided in the <input> block below (JSON: branch, target, commits, files, and the full unified diff). Do NOT use any tools; base your review ONLY on the provided input. Then output the review as a single JSON object and NOTHING else (no prose, no code fences).

Review guidelines:
- Judge the change on: correctness, regressions and breaking changes, security, error handling, missing tests, and whether it matches its stated intent (inferred from the branch name and commit messages). Ground EVERY finding in the diff; never speculate. The diff shows ONLY the changed files: NEVER claim that something is absent from the repository — turn such doubts into a chapter "check" question instead.
- If the input has non-null custom_instructions, apply them on top of these guidelines; they win on conflicts.
- Language: write all human-readable text (summary, messages, narrative) in the language of the commit messages when clearly identifiable, otherwise in English. Keep code identifiers and file paths verbatim.

Output JSON shape (exactly these fields):
{
  "verdict": "approve" | "request_changes" | "comment",
  "summary": "concise human summary",
  "findings": [
    {
      "file": "path from the diff",
      "line": <new-file line number from the @@ headers, when anchorable>,
      "endLine": <optional, only for multi-line suggestions>,
      "severity": "critical" | "major" | "minor" | "info",
      "kind": "security" | "perf" | "convention" | "design" | "praise" | "why",
      "title": "short title",
      "message": "one short plain sentence: what is wrong and what it breaks in practice, then the fix. A junior must understand it on first read.",
      "suggestion": "optional corrected code, verbatim replacement, only for trivial self-contained fixes"
    }
  ],
  "narrative": {
    "intent": "1-3 sentences on what this MR tries to accomplish",
    "confidence": "high" | "medium" | "low",
    "prologue": {
      "why": "the problem this MR addresses (max 3 sentences)",
      "what": "what it concretely changes (max 3 sentences)",
      "key_changes": [{ "title": "short label", "detail": "one sentence" }]
    },
    "chapters": [
      {
        "title": "concise chapter name",
        "rationale": "the PURPOSE of the chapter",
        "files": ["ordered diff paths"],
        "finding_refs": [<0-based indices into findings>],
        "risk": "high" | "medium" | "low",
        "take": "your opinion on the chapter (max 2 sentences)",
        "check": "one question the human should verify, or omit"
      }
    ],
    "review_first": [
      { "point": "what to check and why it is risky (one sentence)", "risk": "high" | "medium" | "low", "chapter_ref": <0-based chapter index>, "file": "path" }
    ]
  }
}

Rules for the narrative:
- chapters: ORDERED logical groups (NOT alphabetical): foundations first (migrations, shared types, contracts), then business logic, then surface (routes, UI).
- review_first: 2-4 hot spots ordered by risk, highest first.
- You MUST produce praise findings when the code deserves it; reserve severity "info" for praise/why findings.
- Do NOT approve changes you cannot justify; prefer "request_changes" when impact is unclear.`

function detectAgent(cwd: string): string {
  if (tryExec('claude', ['--version'], cwd) !== null) return 'claude -p'
  throw new Error(
    "no supported agent CLI found on PATH (looked for: claude) — pass one with --agent '<command>' (it receives the full prompt on stdin and must print the review JSON on stdout)",
  )
}

function runAgent(command: string, prompt: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, cwd, stdio: ['pipe', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`agent command exited with code ${code}`))
    })
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

/** Extrait l'objet JSON de la sortie agent (tolère fences et prose autour). */
function extractReviewJson(raw: string): string {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('the agent did not return a JSON review (raw output saved to .mr-review/agent-output.txt)')
  }
  const candidate = raw.slice(start, end + 1)
  try {
    JSON.parse(candidate)
  } catch {
    throw new Error('the agent returned invalid JSON (raw output saved to .mr-review/agent-output.txt)')
  }
  return candidate
}

export async function review(opts: {
  target?: string
  agent?: string
  port?: number
  open: boolean
  cwd: string
}): Promise<void> {
  printBanner()
  prep({ target: opts.target, cwd: opts.cwd })

  const cwd = repoRoot(opts.cwd)
  const dir = join(cwd, '.mr-review')
  const input = readFileSync(join(dir, 'input.json'), 'utf8')

  const agentCommand = opts.agent ?? detectAgent(cwd)
  console.log('')
  const shortCmd = agentCommand.length > 40 ? `${agentCommand.slice(0, 37)}…` : agentCommand
  const spinner = startSpinner(`reviewing with ${shortCmd}`)

  const prompt = `${REVIEW_INSTRUCTIONS}\n\n<input>\n${input}\n</input>\n\nOutput ONLY the JSON object now.`

  let out: string
  try {
    out = await runAgent(agentCommand, prompt, cwd)
  } catch (err) {
    spinner.stop('  ✘ agent run failed')
    throw new Error(`agent run failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  mkdirSync(dir, { recursive: true })
  let json: string
  try {
    json = extractReviewJson(out)
  } catch (err) {
    spinner.stop('  ✘ unusable agent output')
    writeFileSync(join(dir, 'agent-output.txt'), out)
    throw err
  }
  writeFileSync(join(dir, 'review.json'), json)
  spinner.stop('  ✔ review received')

  await show({ port: opts.port, open: opts.open, cwd })
}
