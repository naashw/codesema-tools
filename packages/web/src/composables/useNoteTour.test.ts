import { describe, expect, test } from 'bun:test'
import { buildNoteTour } from './useNoteTour'

describe('buildNoteTour', () => {
  test('emits one step stop then one stop per referenced finding, in step order', () => {
    const tour = buildNoteTour([{ finding_refs: [2, 0] }, { finding_refs: [1] }], 3)
    expect(tour).toEqual([
      { stepIndex: 0, findingId: null },
      { stepIndex: 0, findingId: 2 },
      { stepIndex: 0, findingId: 0 },
      { stepIndex: 1, findingId: null },
      { stepIndex: 1, findingId: 1 },
    ])
  })

  test('a step without findings still gets its step stop', () => {
    expect(buildNoteTour([{ finding_refs: [] }], 0)).toEqual([{ stepIndex: 0, findingId: null }])
  })

  test('ignores out-of-range and duplicate refs within a step', () => {
    const tour = buildNoteTour([{ finding_refs: [0, 0, 7, -1] }], 2)
    expect(tour).toEqual([
      { stepIndex: 0, findingId: null },
      { stepIndex: 0, findingId: 0 },
    ])
  })

  test('no steps means an empty tour', () => {
    expect(buildNoteTour([], 5)).toEqual([])
  })
})
