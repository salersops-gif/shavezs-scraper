import { chromium } from 'playwright'

/**
 * Scrape Google Maps for business leads.
 *
 * @param {object} options
 * @param {string} options.keyword   - Search term e.g. "auto spares manufacturer"
 * @param {string} options.location  - Location e.g. "Johannesburg South Africa"
 * @param {number} options.maxResults
 * @param {function} options.onLog   - Callback for live log lines
 * @param {function} options.onLead  - Callback fired for each scraped lead
 */
export async function scrapeGoogleMaps({ keyword, location, maxResults = 50, onLog, onLead }) {
  const log = (msg) => onLog?.(`[GoogleMaps] ${msg}`)

  log(`Starting scrape: "${keyword}" in "${location}"`)

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
  })
  const page = await context.newPage()

  const leads = []

  try {
    const searchQuery = encodeURIComponent(`${keyword} ${location}`)
    await page.goto(`https://www.google.com/maps/search/${searchQuery}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })

    log('Loaded Google Maps. Waiting for results...')

    // Wait for results list
    await page.waitForSelector('[role="feed"]', { timeout: 15000 }).catch(() => {
      log('Warning: Feed not found — page may have changed structure')
    })

    let lastCount = 0
    let scrollAttempts = 0

    while (leads.length < maxResults && scrollAttempts < 30) {
      // Scrape currently visible results
      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('[role="feed"] > div')
        return Array.from(items)
          .map((el) => {
            const nameEl = el.querySelector('[jstcache] .fontHeadlineSmall, .qBF1Pd')
            const ratingEl = el.querySelector('.MW4etd')
            const reviewsEl = el.querySelector('.UY7F9')
            const categoryEl = el.querySelector('.W4Efsd:first-child .W4Efsd span:first-child')
            const addressEl = el.querySelector('.W4Efsd:last-child .W4Efsd span')
            const linkEl = el.querySelector('a[href*="/maps/place/"]')

            if (!nameEl) return null

            return {
              companyName: nameEl.innerText?.trim() || '',
              rating: ratingEl?.innerText?.trim() || null,
              reviews: reviewsEl?.innerText?.trim() || null,
              category: categoryEl?.innerText?.trim() || null,
              address: addressEl?.innerText?.trim() || null,
              mapsUrl: linkEl?.href || null,
            }
          })
          .filter(Boolean)
      })

      // Dedupe and yield new leads
      for (const result of results) {
        if (!result.companyName) continue
        const alreadyFound = leads.some((l) => l.companyName === result.companyName)
        if (!alreadyFound) {
          const lead = {
            ...result,
            keyword,
            location,
            sourceType: 'GOOGLE_MAPS',
            sourceUrl: result.mapsUrl,
          }
          leads.push(lead)
          log(`Found: ${result.companyName} (${result.category || 'unknown'})`)
          onLead?.(lead)

          if (leads.length >= maxResults) break
        }
      }

      if (leads.length >= maxResults) break

      // Try to get more results — click "More results" button or scroll
      const moreBtn = await page.$('button[aria-label="Show more results"]')
      if (moreBtn) {
        await moreBtn.click()
        await page.waitForTimeout(2000)
      } else {
        // Scroll the results panel
        await page.evaluate(() => {
          const feed = document.querySelector('[role="feed"]')
          if (feed) feed.scrollTop += 1500
        })
        await page.waitForTimeout(2000)
      }

      if (leads.length === lastCount) {
        scrollAttempts++
      } else {
        scrollAttempts = 0
        lastCount = leads.length
      }
    }

    log(`Scrape complete. Total leads found: ${leads.length}`)
  } catch (err) {
    log(`Error: ${err.message}`)
  } finally {
    await browser.close()
  }

  return leads
}
