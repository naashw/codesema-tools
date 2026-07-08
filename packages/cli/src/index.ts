#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { prep } from './prep.js'
import { review } from './review.js'
import { show } from './show.js'

const VERSION = '0.1.0'

const HELP = `mr-review — local merge request review, told as chapters

Usage:
  mr-review review [--target <branch>] [--agent <cmd>] [--port <n>] [--no-open]
                                       All-in-one: prep, review with your AI agent CLI, then show
  mr-review prep [--target <branch>]   Detect branches, compute the MR diff, write .mr-review/input.json
  mr-review show [--review <file>] [--port <n>] [--no-open]
                                       Display the review (agent output) in a local web UI

Options:
  --target <branch>   Target branch of the MR (default: auto-detected via glab/gh, origin/HEAD, then heuristic)
  --agent <cmd>       Agent command for one-shot review (default: "claude -p"). Receives the prompt on stdin,
                      must print the review JSON on stdout
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
      agent: { type: 'string' },
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
    case 'review':
      await review({
        target: values.target,
        agent: values.agent,
        port: values.port ? Number(values.port) : undefined,
        open: !values['no-open'],
        cwd: process.cwd(),
      })
      break
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
