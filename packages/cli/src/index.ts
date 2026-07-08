#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { prep } from './prep.js'
import { show } from './show.js'

const VERSION = '0.1.0'

const HELP = `mr-review — local merge request review, told as chapters

Usage:
  mr-review prep [--target <branch>]   Detect branches, compute the MR diff, write .mr-review/input.json
  mr-review show [--review <file>] [--port <n>] [--no-open]
                                       Display the review (agent output) in a local web UI

Options:
  --target <branch>   Target branch of the MR (default: auto-detected via glab/gh, origin/HEAD, then heuristic)
  --review <file>     Agent output to display (default: .mr-review/review.json, else last archived review)
  --port <n>          Preferred port for the local server (default: 4400)
  --no-open           Do not open the browser
  -h, --help          Show this help
  -v, --version       Show version
`

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      target: { type: 'string' },
      review: { type: 'string' },
      port: { type: 'string' },
      'no-open': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  })

  if (values.version) {
    console.log(VERSION)
    return
  }
  const command = positionals[0]
  if (values.help || !command) {
    console.log(HELP)
    return
  }

  switch (command) {
    case 'prep':
      prep({ target: values.target, cwd: process.cwd() })
      break
    case 'show':
      await show({
        review: values.review,
        port: values.port ? Number(values.port) : undefined,
        open: !values['no-open'],
        cwd: process.cwd(),
      })
      break
    default:
      console.error(`unknown command: ${command}\n`)
      console.log(HELP)
      process.exitCode = 1
  }
}

main().catch((err: unknown) => {
  console.error(`mr-review: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
