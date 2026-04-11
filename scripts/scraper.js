/**
 * scripts/scraper.js  —  Step 1: Google Maps Scraper
 *
 * Uses a more reliable selector strategy for 2024/2025 Google Maps DOM:
 *   1. Search via URL navigation
 *   2. Collect all place URLs from .Nv2PK cards
 *   3. Visit each place URL individually to extract full details
 *
 * This avoids the fragile "click + back" pattern which Google often blocks.
 */

import { supabase }        from './lib/supabase-client.js'
import { logger, logSync } from './lib/logger.js'

const JOB_ID      = process.env.JOB_ID
const NICHE       = process.env.NICHE       || 'Restaurants'
const LOCATION    = process.env.LOCATION    || 'Karachi'
const QUERY       = process.env.QUERY       || `${NICHE} ${LOCATION}`
const MAX_RESULTS = parseInt(process.env.MAX_RESULTS || '20', 10)

if (!JOB_ID) { console.error('❌ JOB_ID required'); process.exit(1) }

// ─── Browser factory with stealth fallback ──────────────────────────────────
async function launchBrowser() {
  try {
    const { chromium: extra } = await import('playwright-extra')
    const stealth = (await import('puppeteer-extra-plugin-stealth')).default
    extra.use(stealth())
    logger.info('🥷 Stealth plugin active')
    return extra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
             '--disable-blink-features=AutomationControlled'],
    })
  } catch {
    logger.warn('Stealth not available — using standard Chromium')
    const { chromium } = await import('playwright')
    return chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
  }
}

// ─── Job lifecycle helpers ───────────────────────────────────────────────────
async function markRunning() {
  await supabase.from('scrape_jobs').update({ status: 'RUNNING', progress: 0 }).eq('id', JOB_ID)
  await logSync(`🚀 Scrape started — "${QUERY}" | Max: ${MAX_RESULTS}`)
}

async function setProgress(pct, found) {
  await supabase.from('scrape_jobs').update({ progress: pct, total_found: found }).eq('id', JOB_ID)
}

// ─── Insert one lead (skip duplicates) ─────────────────────────────────────
async function insertLead(data) {
  const city = LOCATION.split(',')[0]?.trim() || null

  let query = supabase
    .from('leads')
    .select('id')
    .eq('company_name', data.company_name)

  if (city) query = query.eq('city', city)

  const { data: existing } = await query.limit(1)

  if (existing?.length) {
    logger.info(`⏭️ Skipped (Already in DB): ${data.company_name}`)
    return existing[0]
  }

  const { data: inserted, error } = await supabase
    .from('leads')
    .insert({
      company_name:      data.company_name,
      website:           data.website    || null,
      phone:             data.phone      || null,
      address:           data.address    || null,
      location:          LOCATION,
      city:              LOCATION.split(',')[0]?.trim() || null,
      country:           LOCATION.split(',').length > 1 ? LOCATION.split(',').pop()?.trim() : null,
      industry:          NICHE,
      keyword:           NICHE,
      source_type:       'GOOGLE_MAPS',
      source_url:        data.source_url || null,
      scrape_job_id:     JOB_ID,
      enrichment_status: 'PENDING',
      lead_score:        data.website ? 10 : 0, // +10 for having a website
      lead_quality:      'COLD',
      has_website:       Boolean(data.website),
      has_phone:         Boolean(data.phone),
      tech_stack:        [],
      updated_at:        new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) logger.error(`Insert failed for "${data.company_name}": ${error.message}`)
  return inserted
}

// ─── Extract details from a Google Maps place page ─────────────────────────
async function extractPlaceDetails(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // Wait for the company name — signals the page has loaded
    await page.waitForSelector('h1', { timeout: 10000 })

    const company_name = await page.$eval(
      'h1.DUwDvf, h1[class*="fontHeadlineLarge"], h1',
      el => el.innerText.trim()
    ).catch(() => null)

    if (!company_name) return null

    const website = await page.$eval(
      'a[data-item-id="authority"]',
      el => el.href
    ).catch(() => null)

    const phone = await page.evaluate(() => {
      // Try multiple selectors for phone
      const btn = document.querySelector(
        '[data-tooltip="Copy phone number"], button[aria-label*="Phone"], [data-item-id^="phone:"]'
      )
      if (!btn) return null
      const label = btn.getAttribute('aria-label') || btn.innerText || ''
      return label.replace(/Phone:\s*/i, '').replace(/^phone:/i, '').trim() || null
    })

    const address = await page.$eval(
      'button[data-item-id="address"] .fontBodyMedium',
      el => el.innerText.trim()
    ).catch(() => null)

    return { company_name, website, phone, address, source_url: url }
  } catch (err) {
    logger.warn(`Failed to extract ${url}: ${err.message}`)
    return null
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  await markRunning()

  const browser = await launchBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale:    'en-US',
    viewport:  { width: 1280, height: 900 },
  })

  // Speed up: block images, fonts, media
  const listPage = await context.newPage()
  await listPage.route('**/*', route => {
    if (['image', 'media', 'font'].includes(route.request().resourceType())) route.abort()
    else route.continue()
  })

  let placeUrls = []

  try {
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(QUERY)}`
    logger.info(`📍 Opening: ${searchUrl}`)
    await listPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // Dismiss consent / cookie dialogs
    for (const selector of [
      'button[aria-label="Accept all"]',
      'button[aria-label="Reject all"]',
      'button:has-text("Accept all")',
      'form[action*="consent"] button',
    ]) {
      await listPage.click(selector).catch(() => null)
    }
    await listPage.waitForTimeout(2000)

    // Wait for the results list to appear
    await listPage.waitForSelector(
      '.Nv2PK, [role="feed"], div[aria-label*="Results"]',
      { timeout: 20000 }
    ).catch(() => logger.warn('Results feed not detected — will try anyway'))

    // Scroll to load up to MAX_RESULTS cards
    let scrollTries = 0
    while (scrollTries < 20) {
      await listPage.waitForTimeout(1500)

      // Collect all place links currently visible
      const urls = await listPage.$$eval(
        '.Nv2PK a[href*="/maps/place/"], [role="feed"] a[href*="/maps/place/"]',
        els => [...new Set(els.map(el => el.href.split('?')[0] + '?hl=en'))]
      )

      placeUrls = [...new Set([...placeUrls, ...urls])]
      logger.info(`Found ${placeUrls.length} place URLs so far...`)

      if (placeUrls.length >= MAX_RESULTS) break

      // Scroll the feed panel
      const scrolled = await listPage.evaluate(() => {
        const feed = document.querySelector('[role="feed"]') || document.querySelector('.m6QErb')
        if (!feed) return false
        feed.scrollTop += 3000
        return true
      })

      if (!scrolled) { scrollTries += 2; continue }

      // Check for "end of results"
      const ended = await listPage.$('.HlvSq, [class*="noResultsMessage"]')
      if (ended) { logger.info('Reached end of results'); break }

      scrollTries++
    }

    placeUrls = placeUrls.slice(0, MAX_RESULTS)
    logger.info(`🗺️  Total: ${placeUrls.length} places to visit`)
  } catch (err) {
    logger.error(`Search page error: ${err.message}`)
  } finally {
    await listPage.close()
  }

  if (!placeUrls.length) {
    logger.warn('No place URLs found — Google Maps may have blocked the request or changed its layout')
    await supabase.from('scrape_jobs').update({ status: 'COMPLETED', progress: 100, total_found: 0 }).eq('id', JOB_ID)
    await browser.close()
    return
  }

  // ── Visit each place URL and extract details ─────────────────────────────
  const detailPage = await context.newPage()
  await detailPage.route('**/*', route => {
    if (['image', 'media', 'font'].includes(route.request().resourceType())) route.abort()
    else route.continue()
  })

  let saved = 0

  for (const [i, url] of placeUrls.entries()) {
    logger.info(`[${i + 1}/${placeUrls.length}] Visiting: ${url}`)

    const details = await extractPlaceDetails(detailPage, url)
    if (!details) continue

    logger.success(`Found: ${details.company_name}`)
    await insertLead(details)
    saved++

    const pct = Math.round(((i + 1) / placeUrls.length) * 50)
    await setProgress(pct, saved)

    // Polite delay between requests
    await detailPage.waitForTimeout(1200 + Math.random() * 800)
  }

  await detailPage.close()
  await browser.close()

  await logSync(`✅ Scraping complete — ${saved} leads saved`, 'SUCCESS')
  await setProgress(50, saved)
}

main().catch(async err => {
  logger.error(`Fatal: ${err.message}`)
  await supabase.from('scrape_jobs').update({ status: 'FAILED', error_message: err.message }).eq('id', JOB_ID)
  process.exit(1)
})
