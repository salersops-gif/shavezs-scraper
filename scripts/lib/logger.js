/**
 * scripts/lib/logger.js
 * Unified logger that simultaneously:
 *   1. Prints to GitHub Actions stdout (visible in the workflow run UI)
 *   2. Inserts a row into Supabase `job_logs` → powers the live terminal dashboard
 */

import { supabase } from './supabase-client.js'

const JOB_ID = process.env.JOB_ID

const LEVEL_PREFIX = {
  INFO:    '●',
  SUCCESS: '✅',
  WARN:    '⚠️',
  ERROR:   '❌',
}

/**
 * Write a log line to stdout AND the job_logs table.
 * Non-blocking — does NOT await the DB insert to keep the pipeline fast.
 *
 * @param {string} message
 * @param {'INFO'|'SUCCESS'|'WARN'|'ERROR'} level
 */
export function log(message, level = 'INFO') {
  const ts     = new Date().toISOString()
  const prefix = LEVEL_PREFIX[level] ?? '●'
  console.log(`${prefix} [${ts}] ${message}`)

  if (!JOB_ID) return

  // Fire-and-forget DB insert — failures are only logged to console
  supabase
    .from('job_logs')
    .insert({ job_id: JOB_ID, message, level })
    .then(({ error }) => {
      if (error) console.error('[Logger] DB insert failed:', error.message)
    })
}

/**
 * Async version — awaits the DB insert. Use this for critical milestones
 * where you want to guarantee the log appears before the next step.
 */
export async function logSync(message, level = 'INFO') {
  const ts     = new Date().toISOString()
  const prefix = LEVEL_PREFIX[level] ?? '●'
  console.log(`${prefix} [${ts}] ${message}`)

  if (!JOB_ID) return

  const { error } = await supabase
    .from('job_logs')
    .insert({ job_id: JOB_ID, message, level })

  if (error) console.error('[Logger] DB insert failed:', error.message)
}

// Convenience shorthand methods
export const logger = {
  info:    (msg) => log(msg, 'INFO'),
  success: (msg) => log(msg, 'SUCCESS'),
  warn:    (msg) => log(msg, 'WARN'),
  error:   (msg) => log(msg, 'ERROR'),
  // Awaitable versions for milestones
  infoSync:    (msg) => logSync(msg, 'INFO'),
  successSync: (msg) => logSync(msg, 'SUCCESS'),
}
