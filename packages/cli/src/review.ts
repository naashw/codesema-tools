// `mr-review review` : tout-en-un. prep → agent IA headless (claude -p par défaut,
// l'abonnement de l'utilisateur, aucun LLM embarqué) → review.json → show.

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadConfig, saveConfig } from './config.js'
import { prep } from './prep.js'
import { show } from './show.js'
import { printBanner, startSpinner } from './ui.js'
import { AGENT_DEFS, defaultCommand, detectAgents, runAgentWizard } from './wizard.js'

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
  const [first] = detectAgents(cwd)
  if (first) return defaultCommand(first)
  throw new Error(
    `no supported agent CLI found on PATH (looked for: ${AGENT_DEFS.map((d) => d.bin).join(', ')}) — pass one with --agent '<command>' (it receives the full prompt on stdin and must print the review JSON on stdout)`,
  )
}

function runAgent(command: string, prompt: string, cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // detached (hors Windows) : l'agent tourne dans son propre groupe de process,
    // le timeout peut donc tuer le shell ET ses enfants d'un seul kill(-pid).
    const detached = process.platform !== 'win32'
    const child = spawn(command, { shell: true, cwd, stdio: ['pipe', 'pipe', 'inherit'], detached })
    let out = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        if (detached && child.pid) process.kill(-child.pid, 'SIGTERM')
        else child.kill('SIGTERM')
      } catch {
        // groupe déjà terminé
      }
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`agent timed out after ${Math.round(timeoutMs / 1000)}s — raise it with --timeout <seconds>`))
      } else if (code === 0) resolve(out)
      else reject(new Error(`agent command exited with code ${code}`))
    })
    // un agent qui crashe ferme stdin tôt : sans handler, l'EPIPE tuerait tout le process
    child.stdin.on('error', () => {})
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

/** Extrait l'objet JSON de la sortie agent (tolère fences et prose autour). */
export function extractReviewJson(raw: string): string {
  let fallback: string | null = null
  for (const candidate of jsonCandidates(raw.trim())) {
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    if ('verdict' in (parsed as Record<string, unknown>)) return candidate
    fallback ??= candidate
  }
  if (fallback) return fallback
  throw new Error('the agent did not return a JSON review (raw output saved to .mr-review/agent-output.txt)')
}

/** Candidats par priorité : sortie entière, contenu des fences, chaque objet {…} balancé. */
function* jsonCandidates(s: string): Generator<string> {
  yield s
  for (const m of s.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    if (m[1]) yield m[1].trim()
  }
  for (let i = s.indexOf('{'); i >= 0; i = s.indexOf('{', i + 1)) {
    const end = balancedEnd(s, i)
    if (end > i) yield s.slice(i, end + 1)
  }
}

/** Index de la '}' fermant l'objet ouvert à `start`, en respectant strings et échappements. */
function balancedEnd(s: string, start: number): number {
  let depth = 0
  let inString = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const DEFAULT_TIMEOUT_S = 900

export async function review(opts: {
  target?: string
  agent?: string
  port?: number
  timeout?: number
  open: boolean
  cwd: string
}): Promise<void> {
  printBanner()
  const input = prep({ target: opts.target, cwd: opts.cwd })

  const cwd = input.repo_root
  const dir = join(cwd, '.mr-review')

  let agentCommand = opts.agent
  if (!agentCommand) {
    // Premier run interactif sans config : wizard agent/modèle/effort, persisté.
    if (process.stdin.isTTY && process.stdout.isTTY) {
      console.log('')
      const chosen = await runAgentWizard(cwd)
      if (chosen) {
        agentCommand = chosen
        saveConfig(cwd, { ...loadConfig(cwd), agent: chosen })
        console.log('saved to .mr-review/config.json — reused next time (change it with `mr-review config`)')
      }
    }
    agentCommand ??= detectAgent(cwd)
  }
  console.log('')
  const shortCmd = agentCommand.length > 40 ? `${agentCommand.slice(0, 37)}…` : agentCommand
  const spinner = startSpinner(`reviewing with ${shortCmd}`)

  const prompt = `${REVIEW_INSTRUCTIONS}\n\n<input>\n${JSON.stringify(input, null, 2)}\n</input>\n\nOutput ONLY the JSON object now.`

  let out: string
  try {
    out = await runAgent(agentCommand, prompt, cwd, (opts.timeout ?? DEFAULT_TIMEOUT_S) * 1000)
  } catch (err) {
    spinner.stop('  ✘ agent run failed')
    throw new Error(`agent run failed: ${err instanceof Error ? err.message : String(err)}`)
  }

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
