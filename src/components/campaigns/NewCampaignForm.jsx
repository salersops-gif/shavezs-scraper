'use client'

import { useState } from 'react'
import { Search, MapPin, Hash, Zap } from 'lucide-react'

const KEYWORD_PRESETS = [
  'Auto Spares Manufacturer',
  'Automotive Casting',
  'OEM Parts Wholesaler',
  'Spare Parts Exporter',
  'Chassis Factory',
  'Engine Parts Supplier',
]

const LOCATION_PRESETS = [
  'South Africa',
  'India',
  'China',
  'UAE',
  'Germany',
  'United States',
]

export default function NewCampaignForm({ onJobStarted }) {
  const [keyword, setKeyword] = useState('')
  const [location, setLocation] = useState('')
  const [maxResults, setMaxResults] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!keyword.trim() || !location.trim()) {
      setError('Keyword and location are required')
      return
    }
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), location: location.trim(), maxResults }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to start campaign')
        return
      }

      onJobStarted?.(data.job)
      setKeyword('')
      setLocation('')
    } catch (err) {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Keyword */}
      <div>
        <label className="input-label">Search Keyword</label>
        <div style={{ position: 'relative' }}>
          <Search style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: '34px' }}
            placeholder="e.g. auto spares manufacturer"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            list="keyword-presets"
          />
        </div>
        <datalist id="keyword-presets">
          {KEYWORD_PRESETS.map((k) => <option key={k} value={k} />)}
        </datalist>
        {/* Quick presets */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
          {KEYWORD_PRESETS.slice(0, 3).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKeyword(k)}
              style={{
                fontSize: '10px', padding: '3px 8px', borderRadius: '99px', cursor: 'pointer',
                background: keyword === k ? 'rgba(79,142,247,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${keyword === k ? 'rgba(79,142,247,0.4)' : 'var(--border)'}`,
                color: keyword === k ? 'var(--accent-blue)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="input-label">Target Location</label>
        <div style={{ position: 'relative' }}>
          <MapPin style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: 'var(--text-muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: '34px' }}
            placeholder="e.g. Johannesburg, South Africa"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            list="location-presets"
          />
        </div>
        <datalist id="location-presets">
          {LOCATION_PRESETS.map((l) => <option key={l} value={l} />)}
        </datalist>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
          {LOCATION_PRESETS.slice(0, 4).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocation(l)}
              style={{
                fontSize: '10px', padding: '3px 8px', borderRadius: '99px', cursor: 'pointer',
                background: location === l ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${location === l ? 'rgba(139,92,246,0.4)' : 'var(--border)'}`,
                color: location === l ? 'var(--accent-violet)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Max Results */}
      <div>
        <label className="input-label">
          <Hash style={{ display: 'inline', width: '10px', height: '10px', marginRight: '4px' }} />
          Max Results: <span style={{ color: 'var(--accent-blue)', fontFamily: 'monospace' }}>{maxResults}</span>
        </label>
        <input
          type="range"
          min={10}
          max={200}
          step={10}
          value={maxResults}
          onChange={(e) => setMaxResults(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
          <span>10</span><span>200</span>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: 'var(--accent-red)', padding: '8px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        className="btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px' }}
        disabled={loading}
      >
        {loading ? <span className="spinner" /> : <Zap style={{ width: '14px', height: '14px' }} />}
        {loading ? 'Dispatching to GitHub Actions...' : 'Launch Scrape Campaign'}
      </button>

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
        Triggers a GitHub Actions runner · Results appear live below
      </p>
    </form>
  )
}
