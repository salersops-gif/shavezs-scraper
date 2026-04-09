#!/usr/bin/env node
/**
 * LeadEngine Pro — GitHub Actions Scrape Runner
 *
 * This script is executed by the GitHub Actions workflow.
 * It reads job config from environment variables, runs the full
 * scrape + crawl + enrich pipeline, and writes results to Supabase via Prisma.
 *
 * Environment variables required (set as GitHub Actions secrets):
 *   DATABASE_URL, DIRECT_URL, JOB_ID, KEYWORD, LOCATION, MAX_RESULTS
 *   (+ optional enrichment API keys)
 */

import { PrismaClient } from '@prisma/client'
import { scrapeGoogleMaps } from '../src/scraper/googleMaps.js'
import { crawlWebsite } from '../src/scraper/websiteCrawler.js'
import { runEnrichmentWaterfall } from '../src/scraper/enrichment/waterfall.js'
import { enrichLeadScore } from '../src/lib/scoring.js'

const prisma = new PrismaClient()

const JOB_ID = process.env.JOB_ID
const KEYWORD = process.env.KEYWORD || 'auto spares manufacturer'
const LOCATION = process.env.LOCATION || 'South Africa'
const MAX_RESULTS = parseInt(process.env.MAX_RESULTS || '50', 10)

if (!JOB_ID) {
  console.error('JOB_ID environment variable is required')
  process.exit(1)
}

/**
 * Append a log line to the ScrapeJob in the DB (Supabase Realtime will broadcast it).
 */
async function appendLog(line) {
  console.log(line)
  try {
    await prisma.scrapeJob.update({
      where: { id: JOB_ID },
      data: {
        logLines: { push: `[${new Date().toISOString()}] ${line}` },
      },
    })
  } catch (err) {
    console.error('Failed to append log:', err.message)
  }
}

/**
 * Update job status fields.
 */
async function updateJob(data) {
  return prisma.scrapeJob.update({ where: { id: JOB_ID }, data })
}

async function main() {
  await updateJob({ status: 'RUNNING' })
  await appendLog(`🚀 Job started — Keyword: "${KEYWORD}" | Location: "${LOCATION}" | Max: ${MAX_RESULTS}`)

  let totalFound = 0
  let progress = 0

  try {
    // ─── Phase 1: Google Maps Scrape ────────────────────────────
    await appendLog('📍 Phase 1: Scraping Google Maps...')

    const rawLeads = await scrapeGoogleMaps({
      keyword: KEYWORD,
      location: LOCATION,
      maxResults: MAX_RESULTS,
      onLog: appendLog,
      onLead: async (lead) => {
        // Persist the raw lead immediately so the dashboard sees it
        try {
          const created = await prisma.lead.create({
            data: {
              companyName: lead.companyName,
              address: lead.address,
              keyword: lead.keyword,
              sourceType: 'GOOGLE_MAPS',
              sourceUrl: lead.sourceUrl,
              scrapeJobId: JOB_ID,
              enrichmentStatus: 'PENDING',
              leadScore: 0,
              leadQuality: 'COLD',
            },
          })
          return created
        } catch (err) {
          console.error('Failed to persist raw lead:', err.message)
          return null
        }
      },
    })

    totalFound = rawLeads.length
    await updateJob({ totalFound, progress: 20 })
    await appendLog(`✅ Phase 1 complete: ${totalFound} leads found`)

    // Fetch all leads created for this job from the DB
    const dbLeads = await prisma.lead.findMany({
      where: { scrapeJobId: JOB_ID },
    })

    // ─── Phase 2 + 3: Crawl & Enrich each lead ─────────────────
    await appendLog('🔍 Phase 2: Crawling websites + Enrichment waterfall...')

    for (let i = 0; i < dbLeads.length; i++) {
      const lead = dbLeads[i]
      await appendLog(`[${i + 1}/${dbLeads.length}] Processing: ${lead.companyName}`)

      await prisma.lead.update({
        where: { id: lead.id },
        data: { enrichmentStatus: 'IN_PROGRESS' },
      })

      let crawlData = { emails: [], phones: [], whatsappLinks: [], techDetections: [] }

      // Crawl the website if available
      if (lead.website) {
        crawlData = await crawlWebsite(lead.website, appendLog)
      }

      // Save tech detections
      if (crawlData.techDetections.length > 0) {
        await prisma.techDetection.createMany({
          data: crawlData.techDetections.map((td) => ({
            ...td,
            leadId: lead.id,
          })),
          skipDuplicates: true,
        })
      }

      // Update lead with crawl data
      const bestEmail = crawlData.emails[0] || null
      const bestPhone = crawlData.phones[0] || lead.phone || null
      const hasWhatsApp = crawlData.whatsappLinks.length > 0

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          email: bestEmail,
          phone: bestPhone,
          hasEmail: Boolean(bestEmail),
          hasPhone: Boolean(bestPhone),
          hasWebsite: Boolean(lead.website),
          hasWhatsApp,
        },
      })

      // Run enrichment waterfall if no email found from crawl
      let verificationResult = null
      if (!bestEmail) {
        const waterfallResult = await runEnrichmentWaterfall(lead, appendLog)

        if (waterfallResult.email) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { email: waterfallResult.email, hasEmail: true },
          })
        }

        // Save enrichment logs
        if (waterfallResult.logs.length > 0) {
          await prisma.enrichmentLog.createMany({
            data: waterfallResult.logs.map((l) => ({
              leadId: lead.id,
              step: l.step,
              status: l.status,
              message: l.message,
            })),
          })
        }

        verificationResult = waterfallResult.emailVerification
      }

      // Save email verification if we have one
      if (verificationResult) {
        await prisma.emailVerification.upsert({
          where: { leadId: lead.id },
          update: verificationResult,
          create: { leadId: lead.id, ...verificationResult },
        })
      }

      // Recalculate score with all enriched data
      const fullyEnrichedLead = await prisma.lead.findUnique({
        where: { id: lead.id },
        include: { techDetections: true, emailVerification: true },
      })

      const { leadScore, leadQuality } = enrichLeadScore(fullyEnrichedLead)
      const enrichmentStatus =
        fullyEnrichedLead.hasEmail || fullyEnrichedLead.hasPhone ? 'COMPLETE' : 'PARTIAL'

      await prisma.lead.update({
        where: { id: lead.id },
        data: { leadScore, leadQuality, enrichmentStatus },
      })

      progress = Math.round(20 + ((i + 1) / dbLeads.length) * 80)
      await updateJob({ progress })
    }

    // ─── Done ───────────────────────────────────────────────────
    await updateJob({
      status: 'COMPLETED',
      progress: 100,
      completedAt: new Date(),
    })
    await appendLog(`🎉 Job complete! ${totalFound} leads processed.`)
  } catch (err) {
    console.error('Fatal error:', err)
    await updateJob({ status: 'FAILED', errorMessage: err.message })
    await appendLog(`❌ Job failed: ${err.message}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
