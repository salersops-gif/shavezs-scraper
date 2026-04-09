'use client'

import { useEffect, useRef } from 'react'

function classifyLine(line) {
  if (line.includes('✅') || line.includes('SUCCESS') || line.includes('complete') || line.includes('🎉')) return 'success'
  if (line.includes('❌') || line.includes('Error') || line.includes('FAILED') || line.includes('failed')) return 'error'
  if (line.includes('🚀') || line.includes('⚡') || line.includes('Phase') || line.includes('Crawling') || line.includes('RUNNING')) return 'info'
  if (line.includes('Warning') || line.includes('SKIPPED') || line.includes('Rate limited')) return 'warn'
  return ''
}

export default function CommandTerminal({ logLines = [], job }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logLines])

  // Progress bar
  const progress = job?.progress ?? 0

  return (
    <div>
      {/* Progress */}
      {job && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {job.keyword} · {job.location}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
              {progress}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
            {job.totalFound} leads found · Status:{' '}
            <span style={{ color: job.status === 'COMPLETED' ? 'var(--accent-green)' : job.status === 'FAILED' ? 'var(--accent-red)' : 'var(--accent-blue)' }}>
              {job.status}
            </span>
          </div>
        </div>
      )}

      {/* Log area */}
      <div className="terminal" style={{ height: '280px', borderRadius: 0, border: 'none', margin: 0 }}>
        {logLines.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {'> Awaiting first campaign...'}
          </div>
        ) : (
          logLines.map((line, i) => (
            <div key={i} className={`terminal-line ${classifyLine(line)}`}>
              <span style={{ color: 'var(--text-muted)', marginRight: '8px', userSelect: 'none' }}>{'>'}</span>
              {line.replace(/\[.*?\]\s*/, '')}
            </div>
          ))
        )}
        <div ref={bottomRef} />
        {job?.status === 'RUNNING' && <span className="terminal-cursor" />}
      </div>
    </div>
  )
}
