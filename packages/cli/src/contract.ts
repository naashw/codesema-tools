// Contrat de review v2 (storytelling) + sanitizer.
// Toutes les entrées agent passent ici : whitelist + troncature, jamais de throw.

export type NarrativeConfidence = 'high' | 'medium' | 'low'
export type NarrativeRisk = 'high' | 'medium' | 'low'

export type NarrativePrologueKeyChange = {
  title: string
  detail: string
}

export type NarrativePrologue = {
  why: string
  what: string
  key_changes: NarrativePrologueKeyChange[]
}

export type NarrativeChapter = {
  title: string
  rationale: string
  files: string[]
  finding_refs: number[]
  risk?: NarrativeRisk
  take?: string
  check?: string | null
}

export type ReviewFirstRisk = 'high' | 'medium' | 'low'

export type ReviewFirstItem = {
  point: string
  risk: ReviewFirstRisk
  chapter_ref: number | null
  file: string | null
}

export type ReviewNarrative = {
  intent: string
  confidence: NarrativeConfidence
  prologue?: NarrativePrologue
  chapters: NarrativeChapter[]
  review_first: ReviewFirstItem[]
}

export type Verdict = 'approve' | 'request_changes' | 'comment'
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info'
export type FindingKind = 'security' | 'perf' | 'convention' | 'design' | 'praise' | 'why'

export type Finding = {
  file: string
  line?: number
  endLine?: number
  severity: FindingSeverity
  kind?: FindingKind
  title?: string
  message: string
  suggestion?: string
}

export type SanitizedReview = {
  verdict: Verdict
  summary: string
  findings: Finding[]
  narrative: ReviewNarrative | null
}

export type ReviewRecord = {
  version: 1
  meta: {
    title: string
    branch: string
    target: string
    merge_base: string
    repo_root: string
    created_at: string
  }
  commits: string[]
  diff: string
  review: SanitizedReview
}

const REVIEW_FIRST_MAX = 4
const REVIEW_FIRST_POINT_MAX = 300
const KEY_CHANGES_MAX = 5
const TAKE_MAX = 500
const CHECK_MAX = 300
const TITLE_MAX = 200
const MESSAGE_MAX = 2000
const SUGGESTION_MAX = 4000

function sanitizeReviewFirst(raw: unknown, chaptersCount: number): ReviewFirstItem[] {
  if (!Array.isArray(raw)) return []
  const out: ReviewFirstItem[] = []
  for (const item of raw) {
    if (out.length >= REVIEW_FIRST_MAX) break
    if (!item || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    const point = typeof it.point === 'string' ? it.point.trim().slice(0, REVIEW_FIRST_POINT_MAX) : ''
    if (!point) continue
    const risk: ReviewFirstRisk = it.risk === 'high' || it.risk === 'low' ? it.risk : 'medium'
    const chapterRef =
      Number.isInteger(it.chapter_ref) && (it.chapter_ref as number) >= 0 && (it.chapter_ref as number) < chaptersCount
        ? (it.chapter_ref as number)
        : null
    const file = typeof it.file === 'string' && it.file.trim() ? it.file.trim() : null
    out.push({ point, risk, chapter_ref: chapterRef, file })
  }
  return out
}

function sanitizeRisk(raw: unknown): NarrativeRisk | undefined {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return undefined
}

function sanitizePrologue(raw: unknown): NarrativePrologue | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const p = raw as Record<string, unknown>
  const why = typeof p.why === 'string' ? p.why.trim() : ''
  const what = typeof p.what === 'string' ? p.what.trim() : ''
  if (!why && !what) return undefined
  const key_changes: NarrativePrologueKeyChange[] = []
  if (Array.isArray(p.key_changes)) {
    for (const item of p.key_changes) {
      if (key_changes.length >= KEY_CHANGES_MAX) break
      if (!item || typeof item !== 'object') continue
      const it = item as Record<string, unknown>
      const title = typeof it.title === 'string' ? it.title.trim() : ''
      const detail = typeof it.detail === 'string' ? it.detail.trim() : ''
      if (!title) continue
      key_changes.push({ title, detail })
    }
  }
  return { why, what, key_changes }
}

export function sanitizeNarrative(raw: unknown, findingsCount: number): ReviewNarrative | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const intent = typeof r.intent === 'string' ? r.intent.trim() : ''
  const confidence: NarrativeConfidence = r.confidence === 'high' || r.confidence === 'low' ? r.confidence : 'medium'
  const prologue = sanitizePrologue(r.prologue)
  const rawChapters = Array.isArray(r.chapters) ? r.chapters : []

  const chapters: NarrativeChapter[] = []
  for (const c of rawChapters) {
    if (!c || typeof c !== 'object') continue
    const cc = c as Record<string, unknown>
    const title = typeof cc.title === 'string' ? cc.title.trim() : ''
    if (!title) continue
    const rationale = typeof cc.rationale === 'string' ? cc.rationale.trim() : ''
    const files = Array.isArray(cc.files) ? cc.files.filter((f): f is string => typeof f === 'string') : []
    const seen = new Set<number>()
    const finding_refs: number[] = []
    for (const n of Array.isArray(cc.finding_refs) ? cc.finding_refs : []) {
      if (Number.isInteger(n) && n >= 0 && n < findingsCount && !seen.has(n as number)) {
        seen.add(n as number)
        finding_refs.push(n as number)
      }
    }
    const risk = sanitizeRisk(cc.risk)
    const take = typeof cc.take === 'string' ? cc.take.trim().slice(0, TAKE_MAX) || undefined : undefined
    const check =
      cc.check === null
        ? null
        : typeof cc.check === 'string'
          ? cc.check.trim().slice(0, CHECK_MAX) || undefined
          : undefined
    chapters.push({
      title,
      rationale,
      files,
      finding_refs,
      ...(risk !== undefined ? { risk } : {}),
      ...(take !== undefined ? { take } : {}),
      ...(check !== undefined ? { check } : {}),
    })
  }

  if (chapters.length === 0 && !intent) return null
  const review_first = sanitizeReviewFirst(r.review_first, chapters.length)
  return { intent, confidence, ...(prologue ? { prologue } : {}), chapters, review_first }
}

const SEVERITIES: readonly FindingSeverity[] = ['critical', 'major', 'minor', 'info']
const KINDS: readonly FindingKind[] = ['security', 'perf', 'convention', 'design', 'praise', 'why']

export function sanitizeFindings(raw: unknown): Finding[] {
  if (!Array.isArray(raw)) return []
  const out: Finding[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const file = typeof f.file === 'string' ? f.file.trim() : ''
    const message = typeof f.message === 'string' ? f.message.trim().slice(0, MESSAGE_MAX) : ''
    if (!file || !message) continue
    const severity: FindingSeverity = SEVERITIES.includes(f.severity as FindingSeverity)
      ? (f.severity as FindingSeverity)
      : 'info'
    const kind = KINDS.includes(f.kind as FindingKind) ? (f.kind as FindingKind) : undefined
    const line = Number.isInteger(f.line) && (f.line as number) > 0 ? (f.line as number) : undefined
    const endLine =
      line !== undefined && Number.isInteger(f.endLine) && (f.endLine as number) >= line
        ? (f.endLine as number)
        : undefined
    const title = typeof f.title === 'string' ? f.title.trim().slice(0, TITLE_MAX) || undefined : undefined
    const suggestion =
      typeof f.suggestion === 'string' ? f.suggestion.slice(0, SUGGESTION_MAX) || undefined : undefined
    out.push({
      file,
      message,
      severity,
      ...(kind !== undefined ? { kind } : {}),
      ...(line !== undefined ? { line } : {}),
      ...(endLine !== undefined ? { endLine } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(suggestion !== undefined ? { suggestion } : {}),
    })
  }
  return out
}

export function sanitizeReview(raw: unknown): SanitizedReview {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const verdict: Verdict =
    r.verdict === 'approve' || r.verdict === 'request_changes' ? r.verdict : 'comment'
  const summary = typeof r.summary === 'string' ? r.summary.trim().slice(0, MESSAGE_MAX) : ''
  const findings = sanitizeFindings(r.findings)
  const narrative = sanitizeNarrative(r.narrative, findings.length)
  return { verdict, summary, findings, narrative }
}
