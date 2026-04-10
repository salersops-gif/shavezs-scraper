import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase-server'
import { triggerScrapeJob } from '@/lib/github-trigger'

/**
 * POST /api/scrape
 * Creates a ScrapeJob in the DB then triggers a GitHub Actions
 * repository_dispatch event to start the Playwright scraper.
 *
 * Body: { niche: string, location: string, maxResults?: number }
 * Example: { niche: "Auto Spares Manufacturer", location: "Karachi" }
 */
export async function POST(request) {
  // Auth guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { niche, location, maxResults = 50 } = body

  if (!niche?.trim() || !location?.trim()) {
    return NextResponse.json({ error: '`niche` and `location` are required' }, { status: 400 })
  }

  // Compose the human-readable query string sent to Google Maps
  const query = `${niche.trim()} ${location.trim()}`

  try {
    // 1. Create ScrapeJob record in DB — status starts as PENDING
    // Note: userId is omitted here because Supabase auth users live in
    // auth.users (managed by Supabase), not the public.users table that
    // Prisma manages. Linking them requires a manual trigger in Supabase.
    const job = await prisma.scrapeJob.create({
      data: {
        query,
        niche:      niche.trim(),
        location:   location.trim(),
        maxResults: parseInt(maxResults, 10),
        status:     'PENDING',
        // userId omitted — no row in public.users yet (auth user is in auth.users)
      },
    })

    // 2. Fire GitHub Actions dispatch via utility
    const dispatch = await triggerScrapeJob({
      jobId:      job.id,
      niche:      job.niche,
      location:   job.location,
      query:      job.query,
      maxResults: job.maxResults,
    })

    if (!dispatch.success) {
      // Mark job failed immediately if dispatch errored
      await prisma.scrapeJob.update({
        where: { id: job.id },
        data:  { status: 'FAILED', errorMessage: dispatch.error },
      })
      return NextResponse.json({ error: dispatch.error }, { status: 500 })
    }

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/scrape]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
