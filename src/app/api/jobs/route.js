import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase-server'

/** GET /api/jobs — list all jobs, newest first */
export async function GET(request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const take = parseInt(searchParams.get('limit') || '20', 10)
  const skip = parseInt(searchParams.get('offset') || '0', 10)

  const [jobs, total] = await Promise.all([
    prisma.scrapeJob.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: { _count: { select: { leads: true } } },
    }),
    prisma.scrapeJob.count(),
  ])

  return NextResponse.json({ jobs, total })
}
