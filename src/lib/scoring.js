/**
 * LeadEngine Pro — Lead Scoring Algorithm
 *
 * Rule-based scoring (0-100) followed by quality bucketing.
 * Higher score = more complete, more contactable lead.
 */

const SCORE_RULES = [
  { label: 'Verified email',     points: 30, check: (l) => l.hasEmail && l.emailVerification?.isValid },
  { label: 'Email found',        points: 20, check: (l) => l.hasEmail && !l.emailVerification?.isValid },
  { label: 'Phone number',       points: 15, check: (l) => l.hasPhone },
  { label: 'WhatsApp',          points: 15, check: (l) => l.hasWhatsApp },
  { label: 'Has website',        points: 10, check: (l) => l.hasWebsite },
  { label: 'Tech detected',      points: 10, check: (l) => l.techDetections?.length > 0 },
  { label: 'Full address',       points:  5, check: (l) => Boolean(l.address) },
  { label: 'Google Maps source', points:  5, check: (l) => l.sourceType === 'GOOGLE_MAPS' },
]

/**
 * Calculate a 0-100 lead score from a lead object.
 * Works with both Prisma model shape and plain JS objects.
 *
 * @param {object} lead - Lead record (may include relations)
 * @returns {{ score: number, breakdown: Array<{label: string, points: number, matched: boolean}> }}
 */
export function calculateScore(lead) {
  let score = 0
  const breakdown = []

  for (const rule of SCORE_RULES) {
    const matched = Boolean(rule.check(lead))
    if (matched) score += rule.points
    breakdown.push({ label: rule.label, points: rule.points, matched })
  }

  return { score: Math.min(score, 100), breakdown }
}

/**
 * Map a numeric score to a LeadQuality enum value.
 *
 * @param {number} score
 * @returns {'COLD' | 'WARM' | 'HOT'}
 */
export function scoreToQuality(score) {
  if (score >= 70) return 'HOT'
  if (score >= 40) return 'WARM'
  return 'COLD'
}

/**
 * Convenience: compute both score and quality from a lead.
 *
 * @param {object} lead
 * @returns {{ leadScore: number, leadQuality: string, breakdown: Array }}
 */
export function enrichLeadScore(lead) {
  const { score, breakdown } = calculateScore(lead)
  return {
    leadScore: score,
    leadQuality: scoreToQuality(score),
    breakdown,
  }
}
