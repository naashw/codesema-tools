// Config persistante par repo : .mr-review/config.json.
// Priorité partout : flag CLI > config > détection/défaut.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type RepoConfig = {
  /** Branche cible par défaut (ex : develop). */
  target?: string
  /** Commande agent complète pour `review` (ex : "claude -p --model opus"). */
  agent?: string
  /** Port préféré du serveur local. */
  port?: number
  /** Budget agent en secondes pour `review`. */
  timeout?: number
}

export function loadConfig(repoRoot: string): RepoConfig {
  const path = join(repoRoot, '.mr-review', 'config.json')
  if (!existsSync(path)) return {}
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    return {
      ...(typeof raw.target === 'string' && raw.target ? { target: raw.target } : {}),
      ...(typeof raw.agent === 'string' && raw.agent ? { agent: raw.agent } : {}),
      ...(Number.isInteger(raw.port) ? { port: raw.port as number } : {}),
      ...(Number.isInteger(raw.timeout) ? { timeout: raw.timeout as number } : {}),
    }
  } catch {
    return {}
  }
}

/** Crée .mr-review/ avec son .gitignore auto (aucun impact sur le repo hôte). */
export function ensureWorkDir(repoRoot: string): string {
  const dir = join(repoRoot, '.mr-review')
  mkdirSync(dir, { recursive: true })
  const selfIgnore = join(dir, '.gitignore')
  if (!existsSync(selfIgnore)) writeFileSync(selfIgnore, '*\n')
  return dir
}

export function saveConfig(repoRoot: string, config: RepoConfig): string {
  const dir = ensureWorkDir(repoRoot)
  const path = join(dir, 'config.json')
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
  return path
}
