'use client'

import { Users, Flame, TrendingUp, CheckCircle, LayoutGrid } from 'lucide-react'

const STATS = [
  { key: 'total',    label: 'Total Leads',  icon: Users,       color: 'var(--accent-blue)',   glow: 'rgba(79,142,247,0.15)' },
  { key: 'hot',      label: 'Hot Leads',    icon: Flame,       color: 'var(--accent-red)',    glow: 'rgba(239,68,68,0.12)' },
  { key: 'warm',     label: 'Warm Leads',   icon: TrendingUp,  color: 'var(--accent-amber)',  glow: 'rgba(245,158,11,0.12)' },
  { key: 'complete', label: 'Enriched',     icon: CheckCircle, color: 'var(--accent-green)',  glow: 'rgba(16,185,129,0.12)' },
]

export default function StatsBar({ stats, loading }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
      {STATS.map(({ key, label, icon: Icon, color, glow }) => (
        <div key={key} className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Subtle background glow */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '14px',
            background: `radial-gradient(circle at top right, ${glow} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px', border: `1px solid ${glow}`,
              background: glow, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '4px' }}>
              {label}
            </span>
          </div>

          <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1, fontFamily: 'JetBrains Mono, monospace' }}>
            {loading ? (
              <div style={{ width: '60px', height: '28px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ) : (
              (stats[key] || 0).toLocaleString()
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
