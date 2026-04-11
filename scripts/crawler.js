/**
 * scripts/crawler.js  —  Step 2 of the LeadEngine pipeline
 *
 * For every lead (enrichmentStatus=PENDING) in this ScrapeJob:
 *   1. Visits the lead's website (homepage + /contact)
 *   2. Extracts emails, phone numbers, and WhatsApp links via Regex
 *   3. Detects tech stack by scanning HTML source for known signatures
 *   4. Calculates a rule-based lead score (0–100)
 *   5. Updates the lead record in Supabase
 *   6. Logs every action to job_logs (live dashboard terminal)
 *
 * ENV vars: JOB_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { chromium }        from 'playwright'
import { supabase }        from './lib/supabase-client.js'
import { logger, logSync } from './lib/logger.js'

const JOB_ID = process.env.JOB_ID

if (!JOB_ID) {
  console.error('❌ JOB_ID env var is required')
  process.exit(1)
}

// ─── Regex patterns ─────────────────────────────────────────────────────────
const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const WA_RE       = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send|web\.whatsapp\.com)[^\s"'<>]*/gi
const PHONE_RE    = /(?:\+?\d[\d\s\-().]{7,}\d)/g

// Meta description keywords that indicate manufacturing / B2B relevance
const INDUSTRY_KW = /manufactur|OEM|export|wholesale|supplier|factory|casting|forging|distributor/i

// Domains to exclude from email extraction
const EMAIL_BLACKLIST = new Set([
  'example.com', 'sentry.io', 'w3.org', 'schema.org', 'google.com',
  'facebook.com', 'twitter.com', 'linkedin.com', 'amazonaws.com',
  'cloudflare.com', 'jquery.com', 'microsoft.com', 'apple.com',
])

// ─── Tech Stack Signatures ──────────────────────────────────────────────────
const TECH_SIGNATURES = [
  { technology: 'Shopify',            pattern: 'cdn.shopify.com' },
  { technology: 'WordPress',          pattern: '/wp-content/' },
  { technology: 'WooCommerce',        pattern: 'woocommerce' },
  { technology: 'WhatsApp Business',  pattern: 'wa.me' },
  { technology: 'Wix',               pattern: 'static.wixstatic.com' },
  { technology: 'Squarespace',        pattern: 'static1.squarespace.com' },
  { technology: 'Magento',           pattern: 'Mage.Cookies' },
  { technology: 'Webflow',           pattern: 'assets.website-files.com' },
  { technology: 'React',             pattern: 'react.production.min.js' },
  { technology: 'Google Analytics',  pattern: 'gtag(' },
  { technology: 'Facebook Pixel',    pattern: 'fbevents.js' },
]

// ─── Scoring Rules ──────────────────────────────────────────────────────────
/**
 * Calculate lead score from extracted data.
 * Total possible: 100 points
 *
 * +20  Email found on website
 * +15  Phone number found on website
 * +10  WhatsApp Business link detected
 * +10  Industry keywords in page content (Manufacturing/OEM/Export)
 * +10  Tech stack detected
 * +10  Has a website
 * + 5  Has a full address
 * + 5  Scraped from Google Maps (higher-trust source)
 * [+10 added by enrich.js if email verified by Bouncify]
 */
function calculateScore(lead, crawlData) {
  let score = 0

  if (crawlData.emails.length > 0)         score += 20
  if (crawlData.phones.length > 0)          score += 15
  if (crawlData.whatsappLinks.length > 0)   score += 10
  if (crawlData.hasIndustryKeywords)        score += 10
  if (crawlData.techStack.length > 0)       score += 10
  if (lead.has_website || lead.website)     score += 10
  if (lead.address)                         score += 5
  if (lead.source_type === 'GOOGLE_MAPS')   score += 5

  return Math.min(score, 90) // 10 pts reserved for Bouncify email verify
}

function scoreToQuality(score) {
  if (score >= 70) return 'HOT'
  if (score >= 40) return 'WARM'
  return 'COLD'
}

// ─── Extraction Helpers ─────────────────────────────────────────────────────
function cleanEmails(raw) {
  if (!raw) return []
  return [...new Set(raw)].filter((email) => {
    const domain = email.split('@')[1]?.toLowerCase()
    return domain && !EMAIL_BLACKLIST.has(domain) && !domain.includes('.png') && !domain.includes('.js')
  })
}

function cleanPhones(raw) {
  if (!raw) return []
  return [...new Set(
    raw
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.replace(/\D/g, '').length >= 8)
  )]
}

function detectTech(html) {
  return TECH_SIGNATURES.filter((sig) => html.includes(sig.pattern))
}

function extractDomain(website) {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0]
  }
}

// ─── Per-lead Crawl ─────────────────────────────────────────────────────────
async function crawlLead(page, lead) {
  const result = {
    emails:              [],
    phones:              [],
    whatsappLinks:       [],
    techStack:           [],
    hasIndustryKeywords: false,
    metaDescription:     null,
  }

  const website = lead.website
  if (!website) return result

  const baseUrl = website.startsWith('http') ? website : `https://${website}`

  const pagesToCheck = [baseUrl, `${baseUrl}/contact`, `${baseUrl}/contact-us`]

  for (const url of pagesToCheck) {
    try {
      logger.info(`Crawling ${url}`)
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })

      if (!response || response.status() >= 400) {
        logger.warn(`Skipping ${url} — HTTP ${response?.status() ?? 'error'}`)
        continue
      }

      const html = await page.content()

      // Tech detection (only on homepage — first URL)
      if (url === baseUrl) {
        result.techStack = detectTech(html)

        // Meta description
        result.metaDescription = await page.$eval(
          'meta[name="description"]',
          (el) => el.getAttribute('content') || null
        ).catch(() => null)

        if (result.metaDescription) {
          result.hasIndustryKeywords = INDUSTRY_KW.test(result.metaDescription)
        }

        // Also check page body text for keywords
        if (!result.hasIndustryKeywords) {
          const bodyText = await page.$eval('body', (el) => el.innerText).catch(() => '')
          result.hasIndustryKeywords = INDUSTRY_KW.test(bodyText.slice(0, 3000))
        }
      }

      // Emails — from HTML + mailto: links
      const htmlEmails = cleanEmails(html.match(EMAIL_RE))
      const mailtoEmails = await page.$$eval(
        'a[href^="mailto:"]',
        (els) => els.map((el) => el.href.replace('mailto:', '').split('?')[0].trim())
      ).catch(() => [])
      result.emails = [...new Set([...result.emails, ...htmlEmails, ...cleanEmails(mailtoEmails)])]

      // WhatsApp links
      const waMatches = html.match(WA_RE) || []
      result.whatsappLinks = [...new Set([...result.whatsappLinks, ...waMatches])]

      // Phone numbers
      const phoneMatches = html.match(PHONE_RE) || []
      result.phones = cleanPhones([...result.phones, ...phoneMatches])

      // If we found an email, skip remaining pages
      if (result.emails.length > 0) break

    } catch (err) {
      // Non-fatal — skip this URL and continue
      logger.warn(`Could not crawl ${url}: ${err.message}`)
    }
  }

  return result
}

// ─── Insert Tech Detections ─────────────────────────────────────────────────
async function saveTechDetections(leadId, detections) {
  if (!detections.length) return
  const rows = detections.map((d) => ({
    lead_id:    leadId,
    technology: d.technology,
    confidence: 'HIGH',
    evidence:   d.pattern,
  }))
  const { error } = await supabase.from('tech_detections').upsert(rows, { onConflict: 'lead_id,technology' })
  if (error) logger.warn(`Tech detection save failed: ${error.message}`)
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  await logSync(`🔍 Crawler starting — processing leads for job ${JOB_ID}`, 'INFO')

  // Fetch all PENDING leads for this job
  const { data: leads, error: fetchErr } = await supabase
    .from('leads')
    .select('*')
    .eq('scrape_job_id', JOB_ID)
    .eq('enrichment_status', 'PENDING')
    .order('created_at', { ascending: true })

  if (fetchErr) {
    logger.error(`Failed to fetch leads: ${fetchErr.message}`)
    process.exit(1)
  }

  if (!leads?.length) {
    logger.warn('No PENDING leads found for this job — nothing to crawl')
    return
  }

  logger.info(`📋 ${leads.length} leads queued for crawling`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; LeadEngineBot/1.0; +https://leadengine.pro)',
  })
  const page = await context.newPage()

  // Block heavyweight resources to speed up crawling
  await page.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (['image', 'media', 'font'].includes(type)) route.abort()
    else route.continue()
  })

  let processed = 0

  for (const lead of leads) {
    processed++
    const pct = 50 + Math.round((processed / leads.length) * 30) // crawl = 50-80%

    logger.info(`[${processed}/${leads.length}] ${lead.company_name}`)

    // Mark as IN_PROGRESS
    await supabase
      .from('leads')
      .update({ enrichment_status: 'IN_PROGRESS' })
      .eq('id', lead.id)

    // Crawl the website
    const crawlData = await crawlLead(page, lead)

    // Save tech detections
    await saveTechDetections(lead.id, crawlData.techStack)

    // Calculate score
    const leadScore   = calculateScore(lead, crawlData)
    const leadQuality = scoreToQuality(leadScore)

    // Build update payload
    const update = {
      email:              crawlData.emails[0]       || lead.email       || null,
      phone:              lead.phone                || crawlData.phones[0] || null,
      has_email:          crawlData.emails.length   > 0 || Boolean(lead.email),
      has_phone:          crawlData.phones.length   > 0 || Boolean(lead.phone),
      has_whats_app:      crawlData.whatsappLinks.length > 0,
      tech_stack:         crawlData.techStack.map((t) => t.technology),
      meta_description:   crawlData.metaDescription,
      lead_score:         leadScore,
      lead_quality:       leadQuality,
      enrichment_status:  'PARTIAL',
    }

    const { error: updateErr } = await supabase
      .from('leads')
      .update(update)
      .eq('id', lead.id)

    if (updateErr) {
      logger.error(`Update failed for "${lead.company_name}": ${updateErr.message}`)
    } else {
      const contacts = [
        crawlData.emails.length   > 0 && `📧 ${crawlData.emails[0]}`,
        crawlData.phones.length   > 0 && `📞 ${crawlData.phones[0]}`,
        crawlData.whatsappLinks.length > 0 && '💬 WhatsApp',
        crawlData.techStack.length > 0 && `🔧 ${crawlData.techStack.map((t) => t.technology).join(', ')}`,
      ].filter(Boolean).join(' | ')

      logger.success(`Score ${leadScore} (${leadQuality}) — ${contacts || 'no contacts found'}`)
    }

    // Update job progress
    await supabase
      .from('scrape_jobs')
      .update({ progress: pct, total_found: processed })
      .eq('id', JOB_ID)
  }

  await browser.close()
  await logSync(`✅ Crawling complete — ${processed} leads processed`, 'SUCCESS')
}

main().catch(async (err) => {
  logger.error(`Unhandled crawler error: ${err.message}`)
  console.error(err)
  process.exit(1)
})
