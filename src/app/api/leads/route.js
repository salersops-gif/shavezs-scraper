import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase-server'

/**
 * GET /api/leads
 * Query params: page, limit, quality, enrichmentStatus, keyword, search, jobId
 */
export async function GET(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
  const skip = (page - 1) * limit

  // Build filter
  const where = {}
  const quality = searchParams.get('quality')
  const status = searchParams.get('enrichmentStatus')
  const keyword = searchParams.get('keyword')
  const search = searchParams.get('search')
  const jobId = searchParams.get('jobId')

  if (quality) where.leadQuality = quality
  if (status) where.enrichmentStatus = status
  if (keyword) where.keyword = { contains: keyword, mode: 'insensitive' }
  if (jobId) where.scrapeJobId = jobId
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { website: { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ leadScore: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip,
      include: {
        techDetections: true,
        emailVerification: true,
        _count: { select: { enrichmentLogs: true } },
      },
    }),
    prisma.lead.count({ where }),
  ])

  return NextResponse.json({
    leads,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
