'use client'

import { useRef, useEffect } from 'react'
import { Globe, Mail, Phone, MessageCircle, Zap, ExternalLink } from 'lucide-react'

function QualityBadge({ quality }) {
  const classMap = { HOT: 'badge-hot', WARM: 'badge-warm', COLD: 'badge-cold' }
  const emojis = { HOT: '🔥', WARM: '♨️', COLD: '❄️' }
  return (
    <span className={`badge ${classMap[quality] || 'badge-cold'}`}>
      {emojis[quality]} {quality}
    </span>
  )
}

function ScorePill({ score }) {
  const color =
    score >= 70 ? '#f87171' :
    score >= 40 ? '#fbbf24' :
    '#818cf8'

  return (
    <div className="score-ring" style={{ color, borderColor: color, fontSize: '11px' }}>
      {score}
    </div>
  )
}

function TechBadges({ techs = [] }) {
  if (!techs.length) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>–</span>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {techs.slice(0, 3).map((t) => (
        <span key={t.technology || t} className="badge badge-tech" style={{ fontSize: '10px' }}>
          {t.technology || t}
        </span>
      ))}
      {techs.length > 3 && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+{techs.length - 3}</span>
      )}
    </div>
  )
}

function ContactIconRow({ lead }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {lead.has_email || lead.hasEmail ? <Mail className="w-3.5 h-3.5" style={{ color: 'var(--accent-blue)' }} title={lead.email} /> : <Mail className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />}
      {lead.has_phone || lead.hasPhone ? <Phone className="w-3.5 h-3.5" style={{ color: 'var(--accent-green)' }} title={lead.phone} /> : <Phone className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />}
      {lead.has_whats_app || lead.hasWhatsApp ? <MessageCircle className="w-3.5 h-3.5" style={{ color: '#25D366' }} title="WhatsApp" /> : <MessageCircle className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)', opacity: 0.3 }} />}
      {lead.has_website || lead.hasWebsite ? <Globe className="w-3.5 h-3.5" style={{ color: 'var(--accent-cyan)' }} title={lead.website} /> : null}
    </div>
  )
}

export default function LeadsTable({ leads = [], loading }) {
  const prevCountRef = useRef(0)
  const tbodyRef = useRef(null)

  // Animate new rows when leads count increases
  useEffect(() => {
    if (leads.length > prevCountRef.current && tbodyRef.current) {
      const firstRow = tbodyRef.current.querySelector('tr')
      if (firstRow) {
        firstRow.classList.remove('new-row')
        void firstRow.offsetWidth // force reflow
        firstRow.classList.add('new-row')
      }
    }
    prevCountRef.current = leads.length
  }, [leads.length])

  if (loading) {
    return (
      <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
        <div className="spinner" />
        Loading leads...
      </div>
    )
  }

  if (leads.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        <Zap className="w-8 h-8" style={{ margin: '0 auto 12px', opacity: 0.3 }} />
        No leads yet. Start a campaign to begin.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Score</th>
            <th>Company</th>
            <th>Contact</th>
            <th>Tech Stack</th>
            <th>Quality</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {leads.map((lead, i) => (
            <tr key={lead.id} className={i === 0 ? 'new-row' : ''}>
              <td>
                <ScorePill score={lead.lead_score ?? lead.leadScore ?? 0} />
              </td>
              <td className="primary">
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{lead.company_name || lead.companyName}</div>
                {(lead.website) && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
                  </div>
                )}
                {(lead.address) && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                    📍 {lead.address}
                  </div>
                )}
              </td>
              <td>
                <ContactIconRow lead={lead} />
                {lead.email && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'monospace' }}>
                    {lead.email}
                  </div>
                )}
              </td>
              <td>
                <TechBadges techs={lead.tech_detections || lead.techDetections || []} />
              </td>
              <td>
                <QualityBadge quality={lead.lead_quality || lead.leadQuality || 'COLD'} />
              </td>
              <td>
                <span className={`badge ${
                  (lead.enrichment_status || lead.enrichmentStatus) === 'COMPLETE' ? 'badge-done' :
                  (lead.enrichment_status || lead.enrichmentStatus) === 'IN_PROGRESS' ? 'badge-running' :
                  'badge-pending'
                }`}>
                  {lead.enrichment_status || lead.enrichmentStatus || 'PENDING'}
                </span>
              </td>
              <td>
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: '4px 8px' }}>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
