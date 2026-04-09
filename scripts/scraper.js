/**
 * scripts/scraper.js  —  Step 1 of the LeadEngine pipeline
 *
 * Scrapes Google Maps for businesses matching the provided niche + location.
 * Uses playwright-extra with the stealth plugin to avoid bot detection.
 *
 * For every result found it:
 *   1. Creates a Lead record in Supabase (enrichmentStatus = PENDING)
 *   2. Streams a log line to job_logs (powers the live dashboard terminal)
 *   3. Updates the ScrapeJob progress %
 *
 * ENV vars (all injected by the GitHub Actions workflow):
 *   JOB_ID, NICHE, LOCATION, QUERY, MAX_RESULTS,
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import { supabase }        from './lib/supabase-client.js'
import { logger, logSync } from './lib/logger.js'

// ─── Config ────────────────────────────────────────────────────────────────
const JOB_ID      = process.env.JOB_ID
const NICHE       = process.env.NICHE       || 'Auto Spares Manufacturer'
const LOCATION    = process.env.LOCATION    || 'Karachi'
const QUERY       = process.env.QUERY       || `${NICHE} ${LOCATION}`
const MAX_RESULTS = parseInt(process.env.MAX_RESULTS || '50', 10)

if (!JOB_ID) {
  console.error('❌ JOB_ID env var is required')
  process.exit(1)
}

// ─── Stealth Browser Factory ────────────────────────────────────────────────
async function launchBrowser() {
  try {
    // playwright-extra + stealth for anti-bot evasion
    const { chromium: chromiumExtra } = await import('playwright-extra')
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default
    chromiumExtra.use(StealthPlugin())
    logger.info('🥷 Stealth plugin active')
    return chromiumExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--lang=en-US,en',
      ],
    })
  } catch {
    logger.warn('playwright-extra not available — falling back to standard Chromium')
    const { chromium } = await import('playwright')
    return chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
/** Mark the job as RUNNING and log start */
async function jobStart() {
  await supabase
    .from('scrape_jobs')
    .update({ status: 'RUNNING', progress: 0 })
    .eq('id', JOB_ID)

  await logSync(`🚀 Scrape job started — Query: "${QUERY}" | Max: ${MAX_RESULTS}`, 'INFO')
}

/** Update job progress % and total_found count */
async function jobProgress(progress, totalFound) {
  await supabase
    .from('scrape_jobs')
    .update({ progress, total_found: totalFound })
    .eq('id', JOB_ID)
}

/** Extract useful fields from a Google Maps result card */
async function extractResult(card) {
  try {
    const companyName = await card.$eval(
      '.fontHeadlineSmall, [jstcache] span.fontHeadlineSmall, .qBF1Pd',
      (el) => el.innerText.trim()
    ).catch(() => null)

    if (!companyName) return null

    const address = await card.$eval(
      '.W4Efsd .W4Efsd span',
      (el) => el.innerText.trim()
    ).catch(() => null)

    const phone = await card.$eval(
      '[data-tooltip="Copy phone number"], [aria-label*="phone"]',
      (el) => el.getAttribute('aria-label') || el.innerText
    ).catch(() => null)

    const mapsLink = await card.$eval(
      'a[href*="/maps/place/"]',
      (el) => el.href
    ).catch(() => null)

    // Try to get website — shown as a secondary line on some cards
    const website = await card.$eval(
      'a[data-value="Website"], [aria-label="Website"]',
      (el) => el.href
    ).catch(() => null)

    return { companyName, address, phone, website, sourceUrl: mapsLink }
  } catch {
    return null
  }
}

// ─── Detail Page Scrape ─────────────────────────────────────────────────────
/** Click into a result card and extract full details from the detail panel */
async function scrapeDetail(page, card) {
  try {
    await card.click()
    // Wait for the detail panel to load
    await page.waitForSelector('[data-section-id="ap"]', { timeout: 8000 }).catch(() => null)
    await page.waitForTimeout(1500)

    const companyName = await page.$eval(
      'h1.DUwDvf, h1[class*="fontHeadlineLarge"]',
      (el) => el.innerText.trim()
    ).catch(() => null)

    if (!companyName) return null

    const websiteBtn = await page.$('a[data-item-id="authority"]')
    const website = websiteBtn
      ? await websiteBtn.getAttribute('href')
      : null

    const phone = await page.$eval(
      '[data-tooltip="Copy phone number"]',
      (el) => el.getAttribute('aria-label')?.replace('Phone:', '').trim() || el.innerText.trim()
    ).catch(() => null)

    const address = await page.$eval(
      'button[data-item-id="address"] .fontBodyMedium',
      (el) => el.innerText.trim()
    ).catch(() => null)

    const sourceUrl = page.url()

    return { companyName, website, phone, address, sourceUrl }
  } catch {
    return null
  }
}

// ─── Insert Lead to Supabase ────────────────────────────────────────────────
async function insertLead(data) {
  const { data: existing } = await supabase
    .from('leads')
    .select('id')
    .eq('company_name', data.companyName)
    .eq('scrape_job_id', JOB_ID)
    .limit(1)

  if (existing?.length) return existing[0] // Skip duplicate

  const payload = {
    company_name:      data.companyName,
    website:           data.website    || null,
    phone:             data.phone      || null,
    address:           data.address    || null,
    location:          LOCATION,
    keyword:           NICHE,
    source_type:       'GOOGLE_MAPS',
    source_url:        data.sourceUrl  || null,
    scrape_job_id:     JOB_ID,
    enrichment_status: 'PENDING',
    lead_score:        0,
    lead_quality:      'COLD',
    has_website:       Boolean(data.website),
    has_phone:         Boolean(data.phone),
    tech_stack:        [],
  }

  const { data: inserted, error } = await supabase
    .from('leads')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    logger.error(`DB insert failed for "${data.companyName}": ${error.message}`)
    return null
  }

  return inserted
}

// ─── Main Scrape Loop ───────────────────────────────────────────────────────
async function main() {
  await jobStart()

  const browser = await launchBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:    'en-US',
    viewport:  { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // Block images, fonts, and media to speed up scraping
  await page.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
      route.abort()
    } else {
      route.continue()
    }
  })

  const leads       = []
  let   scrollTries = 0

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(QUERY)}`
    logger.info(`📍 Navigating to Google Maps: ${searchUrl}`)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Accept cookie consent if it appears
    await page.click('button[aria-label*="Accept"], button[jsname="b3VHJd"]')
      .catch(() => null)

    // Wait for the results feed
    await page.waitForSelector('[role="feed"]', { timeout: 20000 }).catch(() => {
      logger.warn('Results feed not found — Google Maps layout may have changed')
    })

    logger.info(`🔍 Scanning results for "${QUERY}"...`)

    while (leads.length < MAX_RESULTS && scrollTries < 25) {
      // Get all visible result cards
      const cards = await page.$$('[role="feed"] > div[jsaction]')

      for (const card of cards) {
        if (leads.length >= MAX_RESULTS) break

        // Quick extract from card (doesn't require click)
        const quickData = await extractResult(card)
        if (!quickData?.companyName) continue

        // Skip if already captured
        if (leads.some((l) => l.companyName === quickData.companyName)) continue

        // For detailed data (website, phone, address) click into the card
        const detail = await scrapeDetail(page, card).catch(() => null)
        const data   = detail || quickData

        if (!data.companyName) continue

        leads.push(data)
        logger.info(`[${leads.length}/${MAX_RESULTS}] Found: ${data.companyName}`)

        // Insert immediately so the dashboard shows leads appearing live
        await insertLead(data)

        // Update progress
        const progress = Math.round((leads.length / MAX_RESULTS) * 50) // scraping = 0-50%
        await jobProgress(progress, leads.length)

        // Navigate back to results list
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null)
        await page.waitForSelector('[role="feed"]', { timeout: 8000 }).catch(() => null)
        await page.waitForTimeout(800)
      }

      if (leads.length >= MAX_RESULTS) break

      // Scroll the feed to load more results
      const scrolled = await page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]')
        if (!feed) return false
        feed.scrollTop += 2000
        return true
      })

      if (!scrolled) break

      await page.waitForTimeout(2000)

      // Check for "end of list" message
      const endMsg = await page.$('.HlvSq')
      if (endMsg) {
        logger.info("📋 Reached end of Google Maps results")
        break
      }

      const newCards = await page.$$('[role="feed"] > div[jsaction]')
      if (newCards.length <= leads.length + 2) {
        scrollTries++
      } else {
        scrollTries = 0
      }
    }

    logger.success(`✅ Scraping complete — ${leads.length} leads captured`)
    await jobProgress(50, leads.length)
  } catch (err) {
    logger.error(`Fatal scraper error: ${err.message}`)
    await supabase
      .from('scrape_jobs')
      .update({ status: 'FAILED', error_message: err.message })
      .eq('id', JOB_ID)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main().catch(async (err) => {
  console.error('Unhandled error in scraper:', err)
  await supabase
    .from('scrape_jobs')
    .update({ status: 'FAILED', error_message: err.message })
    .eq('id', JOB_ID)
  process.exit(1)
})
