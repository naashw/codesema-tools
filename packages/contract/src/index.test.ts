import { describe, expect, test } from 'bun:test'
import {
  detectDiffSecrets,
  reviewRecordSchema,
  sanitizeFindings,
  sanitizeNarrative,
  sanitizeRecord,
  sanitizeReview,
} from './index.js'

describe('sanitizeReview', () => {
  test('empty input: safe defaults', () => {
    expect(sanitizeReview({})).toEqual({ verdict: 'comment', summary: '', findings: [], narrative: null })
    expect(sanitizeReview(null)).toEqual({ verdict: 'comment', summary: '', findings: [], narrative: null })
    expect(sanitizeReview('junk')).toEqual({ verdict: 'comment', summary: '', findings: [], narrative: null })
  })

  test('valid verdicts kept, unknown ones become comment', () => {
    expect(sanitizeReview({ verdict: 'approve' }).verdict).toBe('approve')
    expect(sanitizeReview({ verdict: 'request_changes' }).verdict).toBe('request_changes')
    expect(sanitizeReview({ verdict: 'LGTM!!' }).verdict).toBe('comment')
  })

  test('summary: trim + truncation to 2000', () => {
    expect(sanitizeReview({ summary: '  ok  ' }).summary).toBe('ok')
    expect(sanitizeReview({ summary: 'x'.repeat(3000) }).summary.length).toBe(2000)
  })
})

describe('sanitizeFindings', () => {
  test('invalid items ignored, file+message required', () => {
    expect(sanitizeFindings('nope')).toEqual([])
    expect(sanitizeFindings([null, 42, { file: 'a.ts' }, { message: 'm' }])).toEqual([])
  })

  test('unknown severity: info, unknown kind: absent', () => {
    const [f] = sanitizeFindings([{ file: 'a.ts', message: 'm', severity: 'blocker', kind: 'typo' }])
    expect(f?.severity).toBe('info')
    expect(f?.kind).toBeUndefined()
  })

  test('invalid line ignored, endLine < line ignored', () => {
    const [f] = sanitizeFindings([{ file: 'a.ts', message: 'm', severity: 'minor', line: -3, endLine: 9 }])
    expect(f?.line).toBeUndefined()
    expect(f?.endLine).toBeUndefined()
    const [g] = sanitizeFindings([{ file: 'a.ts', message: 'm', severity: 'minor', line: 10, endLine: 4 }])
    expect(g?.line).toBe(10)
    expect(g?.endLine).toBeUndefined()
  })

  test('title/suggestion truncated', () => {
    const [f] = sanitizeFindings([
      { file: 'a.ts', message: 'm', severity: 'minor', title: 't'.repeat(500), suggestion: 's'.repeat(9000) },
    ])
    expect(f?.title?.length).toBe(200)
    expect(f?.suggestion?.length).toBe(4000)
  })

  test('file truncated', () => {
    const [f] = sanitizeFindings([{ file: 'f'.repeat(9000), message: 'm', severity: 'minor' }])
    expect(f?.file.length).toBe(500)
  })
})

describe('sanitizeNarrative', () => {
  test('non-object or empty: null', () => {
    expect(sanitizeNarrative(null, 0)).toBeNull()
    expect(sanitizeNarrative({ steps: [], intent: '' }, 0)).toBeNull()
  })

  test('step without title ignored, finding_refs bounded and deduplicated', () => {
    const n = sanitizeNarrative(
      {
        intent: 'i',
        steps: [
          { title: '', files: [] },
          { title: 'Ch', files: ['a.ts', 7], finding_refs: [0, 0, 2, -1, 99] },
        ],
      },
      3,
    )
    expect(n?.steps).toHaveLength(1)
    expect(n?.steps[0]?.files).toEqual(['a.ts'])
    expect(n?.steps[0]?.finding_refs).toEqual([0, 2])
  })

  test('invalid risk absent, null check kept', () => {
    const n = sanitizeNarrative({ steps: [{ title: 'Ch', risk: 'extreme', check: null }] }, 0)
    expect(n?.steps[0]?.risk).toBeUndefined()
    expect(n?.steps[0]?.check).toBeNull()
  })

  test('review_first: capped at 4, default risk medium, step_ref bounded', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ point: `p${i}`, risk: 'weird', step_ref: i }))
    const n = sanitizeNarrative({ steps: [{ title: 'Ch' }], review_first: items }, 0)
    expect(n?.review_first).toHaveLength(4)
    expect(n?.review_first[0]).toEqual({ point: 'p0', risk: 'medium', step_ref: 0, file: null })
    expect(n?.review_first[1]?.step_ref).toBeNull()
  })

  test('legacy archives: chapters and chapter_ref accepted as steps and step_ref', () => {
    const n = sanitizeNarrative(
      {
        intent: 'i',
        chapters: [{ title: 'Legacy group', files: ['a.ts'] }],
        review_first: [{ point: 'p', risk: 'high', chapter_ref: 0 }],
      },
      0,
    )
    expect(n?.steps).toHaveLength(1)
    expect(n?.steps[0]?.title).toBe('Legacy group')
    expect(n?.review_first[0]?.step_ref).toBe(0)
  })

  test('steps win over legacy chapters when both are present', () => {
    const n = sanitizeNarrative({ steps: [{ title: 'New' }], chapters: [{ title: 'Old' }] }, 0)
    expect(n?.steps.map((s) => s.title)).toEqual(['New'])
  })

  test('prologue without why/what absent, key_changes capped at 5 and title required', () => {
    expect(sanitizeNarrative({ steps: [{ title: 'Ch' }], prologue: {} }, 0)?.prologue).toBeUndefined()
    const kcs = Array.from({ length: 7 }, (_, i) => ({ title: `t${i}`, detail: 'd' }))
    const n = sanitizeNarrative({ steps: [{ title: 'Ch' }], prologue: { why: 'w', key_changes: [...kcs, { detail: 'orphan' }] } }, 0)
    expect(n?.prologue?.key_changes).toHaveLength(5)
  })
})

describe('sanitizeRecord', () => {
  test('non-object input → null', () => {
    expect(sanitizeRecord(null)).toBeNull()
    expect(sanitizeRecord('junk')).toBeNull()
  })

  test('missing meta fields default to empty strings, created_at is filled', () => {
    const record = sanitizeRecord({ meta: { branch: 'feat' } })
    expect(record?.meta.branch).toBe('feat')
    expect(record?.meta.title).toBe('')
    expect(record?.meta.created_at.length).toBeGreaterThan(0)
  })

  test('head_sha kept only when a non-empty string', () => {
    expect(sanitizeRecord({ meta: { head_sha: 'abc' } })?.meta.head_sha).toBe('abc')
    expect(sanitizeRecord({ meta: { head_sha: 123 } })?.meta.head_sha).toBeUndefined()
    expect(sanitizeRecord({ meta: {} })?.meta.head_sha).toBeUndefined()
  })

  test('review is sanitized, commits and diff are coerced', () => {
    const record = sanitizeRecord({ commits: ['a', 2, 'b'], diff: 42, review: { verdict: 'approve' } })
    expect(record?.commits).toEqual(['a', 'b'])
    expect(record?.diff).toBe('')
    expect(record?.review.verdict).toBe('approve')
  })
})

function diffFor(path: string, added: string[] = []): string {
  const body = added.map((l) => `+${l}`).join('\n')
  return `diff --git a/${path} b/${path}\nindex 1..2 100644\n--- a/${path}\n+++ b/${path}\n@@ -0,0 +1 @@\n${body}\n`
}

describe('detectDiffSecrets', () => {
  test('non-string or empty input: no matches', () => {
    expect(detectDiffSecrets('')).toEqual([])
    expect(detectDiffSecrets(undefined as unknown as string)).toEqual([])
  })

  test('a clean diff has no matches', () => {
    expect(detectDiffSecrets(diffFor('src/app.ts', ['const answer = 42']))).toEqual([])
  })

  test('sensitive filenames are flagged, placeholders are not', () => {
    expect(detectDiffSecrets(diffFor('.env', ['A=1']))).toContainEqual({ file: '.env', reason: 'filename', detail: '.env' })
    expect(detectDiffSecrets(diffFor('config/db.pem', ['x']))[0]?.reason).toBe('filename')
    expect(detectDiffSecrets(diffFor('service/id_rsa', ['x']))[0]?.reason).toBe('filename')
    expect(detectDiffSecrets(diffFor('.env.local', ['A=1'])).some((m) => m.reason === 'filename')).toBe(true)
    expect(detectDiffSecrets(diffFor('.env.example', ['A=1']))).toEqual([])
  })

  test('credentials in content are flagged on added and removed lines', () => {
    const added = detectDiffSecrets(diffFor('src/app.ts', ['const k = "AKIAIOSFODNN7EXAMPLE"']))
    expect(added).toContainEqual({ file: 'src/app.ts', reason: 'content', detail: 'an AWS access key id' })
    const removedSecret =
      'diff --git a/src/app.ts b/src/app.ts\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-const k = "sk-ant-0123456789ABCDEFGHIJ"\n+const k = readEnv()\n'
    expect(detectDiffSecrets(removedSecret)).toContainEqual({
      file: 'src/app.ts',
      reason: 'content',
      detail: 'an Anthropic API key',
    })
  })

  test('duplicate hits for the same file, reason and detail are collapsed', () => {
    const diff = diffFor('src/app.ts', ['a = "AKIAIOSFODNN7EXAMPLE"', 'b = "AKIAIOSFODNN7EXAMPLE"'])
    expect(detectDiffSecrets(diff)).toHaveLength(1)
  })
})

describe('reviewRecordSchema', () => {
  test('declares a draft 2020-12 schema with an id', () => {
    expect(reviewRecordSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(reviewRecordSchema.$id).toContain('review-record')
  })

  test('every $ref resolves to a defined $def', () => {
    const refs: string[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') refs.push(value)
        else walk(value)
      }
    }
    walk(reviewRecordSchema)
    const defs = new Set(Object.keys(reviewRecordSchema.$defs))
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(defs.has(ref.replace('#/$defs/', ''))).toBe(true)
  })

  test('top-level required keys all exist in properties', () => {
    const props = new Set(Object.keys(reviewRecordSchema.properties))
    for (const key of reviewRecordSchema.required) expect(props.has(key)).toBe(true)
  })
})
