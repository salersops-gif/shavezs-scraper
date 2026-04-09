import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase-server'

/** GET /api/jobs/[id] */
export async function GET(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const job = await prisma.scrapeJob.findUnique({
    where: { id: params.id },
    include: { _count: { select: { leads: true } } },
  })

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  return NextResponse.json({ job })
}

/** PATCH /api/jobs/[id] — update status or cancel */
export async function PATCH(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const allowedFields = ['status', 'progress', 'errorMessage', 'githubRunId']
  const data = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowedFields.includes(k))
  )

  const job = await prisma.scrapeJob.update({ where: { id: params.id }, data })
  return NextResponse.json({ job })
}

/** DELETE /api/jobs/[id] */
export async function DELETE(request, { params }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.scrapeJob.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true })
}
