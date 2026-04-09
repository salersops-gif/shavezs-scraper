'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import NewCampaignForm from '@/components/campaigns/NewCampaignForm'
import StatsBar from '@/components/dashboard/StatsBar'
import LeadsTable from '@/components/dashboard/LeadsTable'
import CommandTerminal from '@/components/dashboard/CommandTerminal'
import { RefreshCw } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({ total: 0, hot: 0, warm: 0, cold: 0, complete: 0 })
  const [leads, setLeads] = useState([])
  const [activeJob, setActiveJob] = useState(null)
  const [logLines, setLogLines] = useState(['> LeadEngine Pro initialised. Ready for a new campaign.'])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Initial load
  useEffect(() => {
    fetchDashboardData()
  }, [])

  // Supabase Realtime subscriptions
  useEffect(() => {
    const leadsChannel = supabase
      .channel('realtime-leads')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, (payload) => {
        setLeads((prev) => [payload.new, ...prev].slice(0, 100))
        setStats((prev) => ({ ...prev, total: prev.total + 1 }))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, (payload) => {
        setLeads((prev) => prev.map((l) => (l.id === payload.new.id ? payload.new : l)))
        // Recompute stats
        fetchStats()
      })
      .subscribe()

    const jobsChannel = supabase
      .channel('realtime-jobs')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'scrape_jobs' }, (payload) => {
        const job = payload.new
        setActiveJob(job)
        // Stream new log lines into terminal
        if (Array.isArray(job.log_lines)) {
          setLogLines(job.log_lines.slice(-200))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(leadsChannel)
      supabase.removeChannel(jobsChannel)
    }
  }, [])

  async function fetchDashboardData() {
    setLoading(true)
    await Promise.all([fetchLeads(), fetchStats(), fetchLatestJob()])
    setLoading(false)
  }

  async function fetchLeads() {
    const res = await fetch('/api/leads?limit=50')
    if (res.ok) {
      const data = await res.json()
      setLeads(data.leads || [])
    }
  }

  async function fetchStats() {
    const res = await fetch('/api/leads?limit=1')
    if (!res.ok) return
    const data = await res.json()
    // Quick stat fetch
    const [hotR, warmR, completeR] = await Promise.all([
      fetch('/api/leads?quality=HOT&limit=1'),
      fetch('/api/leads?quality=WARM&limit=1'),
      fetch('/api/leads?enrichmentStatus=COMPLETE&limit=1'),
    ])
    const [hotD, warmD, completeD] = await Promise.all([hotR.json(), warmR.json(), completeR.json()])
    setStats({
      total: data.total || 0,
      hot: hotD.total || 0,
      warm: warmD.total || 0,
      cold: (data.total || 0) - (hotD.total || 0) - (warmD.total || 0),
      complete: completeD.total || 0,
    })
  }

  async function fetchLatestJob() {
    const res = await fetch('/api/jobs?limit=1')
    if (res.ok) {
      const data = await res.json()
      if (data.jobs?.[0]) {
        const job = data.jobs[0]
        setActiveJob(job)
        if (job.log_lines?.length) setLogLines(job.log_lines)
      }
    }
  }

  function handleJobStarted(job) {
    setActiveJob(job)
    setLogLines([`> Campaign started: "${job.keyword}" in "${job.location}"`, '> Waiting for GitHub Actions runner...'])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Command Center
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Real-time B2B lead intelligence dashboard
          </p>
        </div>
        <button onClick={fetchDashboardData} className="btn-ghost" title="Refresh data">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI Stats */}
      <StatsBar stats={stats} loading={loading} />

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', alignItems: 'start' }}>
        {/* Left: Leads table */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Live Leads</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Updates in real-time as the engine runs</p>
            </div>
            <span className="badge badge-running">
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-blue)', animation: 'pulse-glow 2s infinite' }} />
              Live
            </span>
          </div>
          <LeadsTable leads={leads} loading={loading} />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* New Campaign Form */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px' }}>
              🚀 New Campaign
            </h2>
            <NewCampaignForm onJobStarted={handleJobStarted} />
          </div>

          {/* Terminal */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '5px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }} />
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                scrape-engine
              </span>
              {activeJob?.status === 'RUNNING' && (
                <span className="badge badge-running" style={{ marginLeft: 'auto', fontSize: '10px' }}>
                  <span className="spinner" style={{ width: '8px', height: '8px' }} />
                  Running
                </span>
              )}
            </div>
            <CommandTerminal logLines={logLines} job={activeJob} />
          </div>
        </div>
      </div>
    </div>
  )
}
