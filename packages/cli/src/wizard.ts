// Wizard interactif : provider IA (parmi ceux détectés sur le PATH) → modèle →
// effort (si le provider le supporte) → commande agent persistée en config.

import { createInterface } from 'node:readline/promises'
import type { RepoConfig } from './config.js'
import { loadConfig, saveConfig } from './config.js'
import { tryExec } from './git.js'

export type AgentDef = {
  id: string
  label: string
  /** Binaire sondé sur le PATH. */
  bin: string
  /** Base de la commande headless : lit le prompt sur stdin, écrit sur stdout. */
  base: string
  /** Argument final placé après les flags (ex : "-" de `codex exec -`). */
  suffix?: string
  /** Flag modèle (la valeur est ajoutée juste après). */
  modelFlag: string
  /** Modèles suggérés (saisie libre toujours possible). */
  models: string[]
  /** Construction du flag effort, si le provider le supporte. */
  effortFlag?: (value: string) => string
  efforts?: string[]
}

// Invocations headless vérifiées dans la doc officielle de chaque CLI (2026-07) :
// claude -p / codex exec - / gemini lisent le prompt sur stdin et écrivent sur stdout.
// opencode n'a pas de lecture stdin documentée → utilisable via la commande custom.
export const AGENT_DEFS: AgentDef[] = [
  {
    id: 'claude',
    label: 'Claude Code (Anthropic)',
    bin: 'claude',
    base: 'claude -p',
    modelFlag: '--model',
    models: ['fable', 'opus', 'sonnet', 'haiku'],
    effortFlag: (v) => `--effort ${v}`,
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
  },
  {
    id: 'codex',
    label: 'Codex CLI (OpenAI / ChatGPT)',
    bin: 'codex',
    base: 'codex exec',
    suffix: '-',
    modelFlag: '-m',
    models: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5', 'gpt-5.4-mini'],
    effortFlag: (v) => `-c model_reasoning_effort=${v}`,
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    id: 'gemini',
    label: 'Gemini CLI (Google)',
    bin: 'gemini',
    base: 'gemini',
    modelFlag: '-m',
    models: ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    // pas de flag effort CLI (seulement settings.json côté gemini)
  },
]

export function detectAgents(cwd: string): AgentDef[] {
  return AGENT_DEFS.filter((def) => tryExec(def.bin, ['--version'], cwd) !== null)
}

/** Commande headless par défaut d'un provider (sans modèle ni effort). */
export function defaultCommand(def: AgentDef): string {
  return def.suffix ? `${def.base} ${def.suffix}` : def.base
}

function renderChoices(items: string[], extra?: string): string {
  const lines = items.map((item, i) => `  ${i + 1}. ${item}`)
  if (extra) lines.push(`  ${items.length + 1}. ${extra}`)
  return lines.join('\n')
}

/**
 * Pose les questions et renvoie la commande agent composée (ex :
 * "claude -p --model opus --effort high"), ou null si l'utilisateur abandonne.
 */
export async function runAgentWizard(cwd: string): Promise<string | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const detected = detectAgents(cwd)

    // ── 1. Provider ────────────────────────────────────────────
    console.log('Which AI agent should run the review?')
    console.log(renderChoices(detected.map((d) => `${d.label} — found on PATH (${d.bin})`), 'Custom command'))
    const missing = AGENT_DEFS.filter((d) => !detected.includes(d))
    if (missing.length) {
      console.log(`  (not detected: ${missing.map((d) => d.bin).join(', ')})`)
    }
    const pick = (await rl.question(`Choice [1-${detected.length + 1}]: `)).trim()
    const idx = Number(pick) - 1
    if (!Number.isInteger(idx) || idx < 0 || idx > detected.length) {
      console.log('No valid choice — aborted.')
      return null
    }

    // ── Custom : commande libre, rien d'autre à demander ───────
    if (idx === detected.length) {
      const cmd = (await rl.question('Full agent command (reads the prompt on stdin, prints the review JSON on stdout): ')).trim()
      return cmd || null
    }

    const def = detected[idx]!
    let command = def.base

    // ── 2. Modèle ──────────────────────────────────────────────
    console.log(`\nModel for ${def.label}:`)
    console.log(renderChoices(def.models, 'Other (type a model name)'))
    const modelPick = (await rl.question(`Choice [1-${def.models.length + 1}, empty = CLI default]: `)).trim()
    if (modelPick) {
      const mIdx = Number(modelPick) - 1
      let model: string | undefined
      if (Number.isInteger(mIdx) && mIdx >= 0 && mIdx < def.models.length) model = def.models[mIdx]
      else if (mIdx === def.models.length) model = (await rl.question('Model name: ')).trim() || undefined
      else model = modelPick
      if (model) command += ` ${def.modelFlag} ${model}`
    }

    // ── 3. Effort ──────────────────────────────────────────────
    if (def.effortFlag && def.efforts?.length) {
      console.log(`\nReasoning effort (${def.efforts.join(' / ')}):`)
      const effort = (await rl.question('Effort [empty = CLI default]: ')).trim()
      if (effort) {
        if (!def.efforts.includes(effort)) {
          console.log(`  warning: "${effort}" is not a known ${def.bin} effort (${def.efforts.join(', ')}) — kept as-is.`)
        }
        command += ` ${def.effortFlag(effort)}`
      }
    }

    if (def.suffix) command += ` ${def.suffix}`
    return command
  } finally {
    rl.close()
  }
}

/** `mr-review config` : lance le wizard et persiste le résultat. */
export async function configCommand(repoRoot: string): Promise<void> {
  const command = await runAgentWizard(repoRoot)
  if (!command) return
  const config: RepoConfig = { ...loadConfig(repoRoot), agent: command }
  const path = saveConfig(repoRoot, config)
  console.log('')
  console.log(`agent command saved: ${command}`)
  console.log(`config: ${path}`)
}
