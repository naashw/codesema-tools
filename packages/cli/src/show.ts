// `mr-review show` : sanitize la sortie de l'agent, archive la review en JSON,
// sert l'UI web embarquée sur un serveur local éphémère et ouvre le navigateur.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ReviewRecord } from './contract.js'
import { sanitizeReview } from './contract.js'
import type { PrepInput } from './prep.js'
import { repoRoot } from './git.js'
import { openBrowser } from './open.js'

const WEB_DIST = fileURLToPath(new URL('../web-dist', import.meta.url))

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'review'
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function readJson(path: string): unknown {
  const raw = readFileSync(path, 'utf8')
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${path} is not valid JSON — the agent output must be a single JSON object`)
  }
}

function buildRecord(agentOutputPath: string, dir: string): ReviewRecord {
  const inputPath = join(dir, 'input.json')
  if (!existsSync(inputPath)) {
    throw new Error('.mr-review/input.json not found — run `mr-review prep` first')
  }
  const input = readJson(inputPath) as PrepInput
  const review = sanitizeReview(readJson(agentOutputPath))
  return {
    version: 1,
    meta: {
      title: input.title,
      branch: input.branch,
      target: input.target,
      merge_base: input.merge_base,
      repo_root: input.repo_root,
      created_at: new Date().toISOString(),
    },
    commits: input.commits ?? [],
    diff: input.diff ?? '',
    review,
  }
}

function latestSavedRecord(reviewsDir: string): { record: ReviewRecord; path: string } | null {
  if (!existsSync(reviewsDir)) return null
  const names = readdirSync(reviewsDir).filter((n) => n.endsWith('.json')).sort()
  const last = names[names.length - 1]
  if (!last) return null
  const path = join(reviewsDir, last)
  return { record: readJson(path) as ReviewRecord, path }
}

async function listen(app: Hono, startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    const ok = await new Promise<boolean>((resolve) => {
      const server = serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () => resolve(true))
      server.on('error', (err: NodeJS.ErrnoException) => {
        server.close()
        if (err.code !== 'EADDRINUSE') console.error(err.message)
        resolve(false)
      })
    })
    if (ok) return port
  }
  throw new Error(`no free port between ${startPort} and ${startPort + 19}`)
}

export async function show(opts: { review?: string; port?: number; open: boolean; cwd: string }): Promise<void> {
  const cwd = repoRoot(opts.cwd)
  const dir = join(cwd, '.mr-review')
  const reviewsDir = join(dir, 'reviews')

  let record: ReviewRecord
  const freshPath = opts.review ?? join(dir, 'review.json')
  if (existsSync(freshPath)) {
    record = buildRecord(freshPath, dir)
    mkdirSync(reviewsDir, { recursive: true })
    const savedPath = join(reviewsDir, `${slug(record.meta.branch)}-${stamp(new Date())}.json`)
    writeFileSync(savedPath, JSON.stringify(record, null, 2))
    console.log(`review archived: ${savedPath}`)
  } else if (opts.review) {
    throw new Error(`review file not found: ${opts.review}`)
  } else {
    const latest = latestSavedRecord(reviewsDir)
    if (!latest) {
      throw new Error('no review to show — run `mr-review prep`, let your agent write .mr-review/review.json, then retry')
    }
    record = latest.record
    console.log(`showing last archived review: ${latest.path}`)
  }

  if (!existsSync(join(WEB_DIST, 'index.html'))) {
    throw new Error(`embedded web UI not found at ${WEB_DIST} — broken install/build`)
  }
  const indexHtml = readFileSync(join(WEB_DIST, 'index.html'), 'utf8')

  const app = new Hono()
  app.get('/api/review', (c) => c.json(record))
  app.get('/', (c) => c.html(indexHtml))
  app.use('/*', serveStatic({ root: WEB_DIST }))

  const port = await listen(app, opts.port ?? 4400)
  const url = `http://localhost:${port}`
  console.log('')
  console.log(`mr-review — ${record.meta.branch} → ${record.meta.target}`)
  console.log(`  ${url}`)
  console.log('  Ctrl+C to stop')
  if (opts.open) openBrowser(url)
}
