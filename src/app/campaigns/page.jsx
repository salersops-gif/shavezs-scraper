'use client'

import { useState, useEffect } from 'react'
import { Briefcase, Plus, RefreshCw, Clock, CheckCircle, XCircle, Loader, Target } from 'lucide-react'
import NewCampaignForm from '@/components/campaigns/NewCampaignForm'

function JobStatusIcon({ status }) {
  if (status === 'COMPLETED')  return <CheckCircle className="w-4 h-4" style={{ color: 'var(--accent-green)' }} />
  if (status === 'FAILED')     return <XCircle className="w-4 h-4" style={{ color: 'var(--accent-red)' }} />
  if (status === 'RUNNING')    return <Loader className="w-4 h-4" style={{ color: 'var(--accent-blue)', animation: 'spinner 1s linear infinite' }} />
  return <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
}

function statusBadgeClass(status) {
  if (status === 'COMPLETED') return 'badge-done'
  if (status === 'FAILED')    return 'badge-hot'
  if (status === 'RUNNING')   return 'badge-running'
  return 'badge-pending'
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function CampaignsPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedJob, setSelectedJob] = useState(null)

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 15000)
    return () => clearInterval(interval)
  }, [])

  async function fetchJobs() {
    const res = await fetch('/api/jobs?limit=30')
    if (res.ok) {
      const data = await res.json()
      setJobs(data.jobs || [])
    }
    setLoading(false)
  }

  function handleJobStarted(job) {
    setJobs((prev) => [job, ...prev])
    setShowForm(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Campaigns
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Manage and monitor your scrape jobs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchJobs} className="btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        </div>
      </div>

      {/* Collapsible new campaign form */}
      {showForm && (
        <div className="glass-card" style={{ padding: '24px', maxWidth: '480px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
            🚀 Launch New Campaign
          </h2>
          <NewCampaignForm onJobStarted={handleJobStarted} />
        </div>
      )}

      {/* Jobs list */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            All Jobs ({jobs.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <span className="spinner" /> Loading campaigns...
          </div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Briefcase className="w-10 h-10" style={{ margin: '0 auto 12px', opacity: 0.2 }} />
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>No campaigns yet</p>
            <p style={{ fontSize: '12px' }}>Click &quot;New Campaign&quot; to start scraping</p>
          </div>
        ) : (
          <div>
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: selectedJob?.id === job.id ? 'rgba(79,142,247,0.04)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (selectedJob?.id !== job.id) e.currentTarget.style.background = 'rgba(255,255,255,0.025)' }}
                onMouseLeave={(e) => { if (selectedJob?.id !== job.id) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <JobStatusIcon status={job.status} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                        {job.keyword}
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>·</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{job.location}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`badge ${statusBadgeClass(job.status)}`}>{job.status}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Target className="w-3 h-3" />
                        {job._count?.leads || job.total_found || 0} leads
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {relativeTime(job.created_at || job.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-primary)' }}>
                      {job.progress || 0}%
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {job.status === 'RUNNING' && (
                  <div className="progress-bar" style={{ marginTop: '10px' }}>
                    <div className="progress-fill" style={{ width: `${job.progress || 0}%` }} />
                  </div>
                )}

                {/* Expanded logs */}
                {selectedJob?.id === job.id && (job.log_lines || job.logLines)?.length > 0 && (
                  <div className="terminal" style={{ marginTop: '12px', height: '160px', fontSize: '11px' }}>
                    {(job.log_lines || job.logLines).slice(-50).map((line, i) => (
                      <div key={i} style={{ color: line.includes('✅') || line.includes('🎉') ? '#34d399' : line.includes('❌') ? '#f87171' : '#94a3b8' }}>
                        {'>'} {line.replace(/\[.*?\]\s*/, '')}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
