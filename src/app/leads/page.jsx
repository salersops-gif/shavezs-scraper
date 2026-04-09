'use client'

import { useState, useEffect, useCallback } from 'react'
import LeadsTable from '@/components/dashboard/LeadsTable'
import { Search, Filter, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const QUALITY_OPTIONS = ['', 'HOT', 'WARM', 'COLD']
const STATUS_OPTIONS  = ['', 'COMPLETE', 'PARTIAL', 'PENDING', 'IN_PROGRESS', 'FAILED']

export default function LeadsPage() {
  const [leads, setLeads]         = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading]     = useState(true)

  // Filters
  const [search, setSearch]   = useState('')
  const [quality, setQuality] = useState('')
  const [status, setStatus]   = useState('')

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page, limit: 50 })
    if (search)  params.set('search', search)
    if (quality) params.set('quality', quality)
    if (status)  params.set('enrichmentStatus', status)

    const res = await fetch(`/api/leads?${params}`)
    if (res.ok) {
      const data = await res.json()
      setLeads(data.leads || [])
      setTotal(data.total || 0)
      setTotalPages(data.totalPages || 1)
    }
    setLoading(false)
  }, [page, search, quality, status])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  // Debounce search
  useEffect(() => {
    setPage(1)
  }, [search, quality, status])

  function handleExport() {
    const params = new URLSearchParams()
    if (quality) params.set('quality', quality)
    if (status)  params.set('enrichmentStatus', status)
    window.open(`/api/export?${params}`, '_blank')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            All Leads
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {total.toLocaleString()} leads in database
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchLeads} className="btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <button onClick={handleExport} className="btn-primary">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter className="w-4 h-4" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '13px', height: '13px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: '30px', height: '36px', padding: '0 10px 0 30px', fontSize: '13px' }}
            placeholder="Search company, email, website..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Quality filter */}
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          className="input"
          style={{ width: 'auto', height: '36px', padding: '0 10px', fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">All Quality</option>
          {QUALITY_OPTIONS.filter(Boolean).map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="input"
          style={{ width: 'auto', height: '36px', padding: '0 10px', fontSize: '13px', cursor: 'pointer' }}
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {(search || quality || status) && (
          <button
            onClick={() => { setSearch(''); setQuality(''); setStatus('') }}
            className="btn-ghost"
            style={{ fontSize: '12px', color: 'var(--accent-red)' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <LeadsTable leads={leads} loading={loading} />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <button
            className="btn-secondary"
            style={{ padding: '7px 12px' }}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
            {page} / {totalPages}
          </span>
          <button
            className="btn-secondary"
            style={{ padding: '7px 12px' }}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
