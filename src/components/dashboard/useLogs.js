'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * useLogs — Real-time terminal stream hook
 *
 * Subscribes to the `job_logs` table via Supabase Realtime.
 * New rows inserted by the GitHub Actions runner are instantly
 * broadcast to the dashboard, creating a live terminal effect.
 *
 * @param {string|null} jobId - ScrapeJob ID to subscribe to. Pass null to unsubscribe.
 * @param {object}      opts
 * @param {number}      [opts.maxLines=200] - Max log lines to keep in memory
 *
 * @returns {{
 *   logs:    Array<{ id: string, level: string, message: string, createdAt: string }>,
 *   isLive:  boolean,
 *   clear:   () => void,
 * }}
 *
 * @example
 * const { logs, isLive } = useLogs(activeJob?.id)
 *
 * return logs.map(log => (
 *   <div key={log.id} className={`terminal-line ${log.level.toLowerCase()}`}>
 *     {log.message}
 *   </div>
 * ))
 */
export function useLogs(jobId, { maxLines = 200 } = {}) {
  const [logs, setLogs] = useState([])
  const [isLive, setIsLive] = useState(false)
  const channelRef = useRef(null)
  const supabase = createClient()

  // Load historical logs when jobId changes
  useEffect(() => {
    if (!jobId || !supabase) return

    setLogs([])

    async function loadHistory() {
      const { data, error } = await supabase
        .from('job_logs')
        .select('id, level, message, created_at')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
        .limit(maxLines)

      if (error) {
        console.error('[useLogs] Failed to load history:', error.message)
        return
      }

      setLogs(data || [])
    }

    loadHistory()
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to realtime for new log lines
  useEffect(() => {
    if (!jobId || !supabase) {
      setIsLive(false)
      return
    }

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`job-logs:${jobId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'job_logs',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const newLog = payload.new
          setLogs((prev) => {
            const updated = [...prev, newLog]
            return updated.length > maxLines ? updated.slice(-maxLines) : updated
          })
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
        if (status === 'CHANNEL_ERROR') {
          console.error('[useLogs] Realtime channel error for job:', jobId)
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      setIsLive(false)
    }
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  function clear() {
    setLogs([])
  }

  return { logs, isLive, clear }
}
