import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase-server'

/** GET /api/leads/[id] */
export async function GET(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      techDetections: true,
      emailVerification: true,
      enrichmentLogs: { orderBy: { createdAt: 'asc' } },
      scrapeJob: { select: { id: true, keyword: true, location: true, status: true } },
    },
  })

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  return NextResponse.json({ lead })
}

/** PATCH /api/leads/[id] — manual edits (notes, disqualify, etc.) */
export async function PATCH(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const allowed = ['notes', 'email', 'phone', 'website', 'address', 'leadScore', 'leadQuality']
  const data = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  )

  const lead = await prisma.lead.update({ where: { id: params.id }, data })
  return NextResponse.json({ lead })
}
