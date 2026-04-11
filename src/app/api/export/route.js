import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/export
 * Exports leads as CSV. Same filter params as /api/leads.
 */
export async function GET(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)

  const where = {}
  const quality = searchParams.get('quality')
  const status = searchParams.get('enrichmentStatus')
  const jobId = searchParams.get('jobId')

  if (quality) where.leadQuality = quality
  if (status) where.enrichmentStatus = status
  if (jobId) where.scrapeJobId = jobId

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ leadScore: 'desc' }],
    take: 5000,
    include: { techDetections: true, emailVerification: true },
  })

  // Build CSV manually (no extra library dependency on server)
  const header = [
    'Company Name',
    'Website',
    'Email',
    'Email Verified',
    'Phone',
    'Has WhatsApp',
    'Address',
    'City',
    'Country',
    'Industry',
    'Lead Score',
    'Lead Quality',
    'Tech Stack',
    'Enrichment Status',
    'Source',
    'Keyword',
    'Created At',
  ].join(',')

  const rows = leads.map((l) => {
    const tech = l.techDetections.map((t) => t.technology).join(' | ')
    const emailVerified = l.emailVerification?.isValid ? 'Yes' : 'No'
    return [
      `"${(l.companyName || '').replace(/"/g, '""')}"`,
      `"${l.website || ''}"`,
      `"${l.email || ''}"`,
      emailVerified,
      l.phone ? `="${l.phone}"` : '""',
      l.hasWhatsApp ? 'Yes' : 'No',
      `"${(l.address || '').replace(/"/g, '""')}"`,
      `"${l.city || ''}"`,
      `"${l.country || ''}"`,
      `"${l.industry || ''}"`,
      l.leadScore,
      l.leadQuality,
      `"${tech}"`,
      l.enrichmentStatus,
      l.sourceType,
      `"${l.keyword || ''}"`,
      l.createdAt.toISOString(),
    ].join(',')
  })

  const csv = [header, ...rows].join('\n')
  const filename = `leadengine-export-${new Date().toISOString().split('T')[0]}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
