import { describe, expect, test } from 'bun:test'
import { isLoopbackHost } from './serve.js'

describe('isLoopbackHost', () => {
  test('accepts loopback hosts, with and without a port', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('localhost:4400')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('127.0.0.1:4400')).toBe(true)
    expect(isLoopbackHost('[::1]')).toBe(true)
    expect(isLoopbackHost('[::1]:4400')).toBe(true)
  })

  test('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(isLoopbackHost('LOCALHOST:4400')).toBe(true)
    expect(isLoopbackHost(' localhost ')).toBe(true)
  })

  test('rejects a missing or empty header', () => {
    expect(isLoopbackHost(undefined)).toBe(false)
    expect(isLoopbackHost('')).toBe(false)
  })

  test('rejects external and loopback-lookalike domains', () => {
    expect(isLoopbackHost('evil.com')).toBe(false)
    expect(isLoopbackHost('evil.com:4400')).toBe(false)
    expect(isLoopbackHost('127.0.0.1.evil.com')).toBe(false)
    expect(isLoopbackHost('localhost.evil.com')).toBe(false)
  })

  test('rejects non-loopback ipv6 hosts', () => {
    expect(isLoopbackHost('[2001:db8::1]')).toBe(false)
    expect(isLoopbackHost('[2001:db8::1]:4400')).toBe(false)
  })
})
