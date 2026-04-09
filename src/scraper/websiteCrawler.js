import { chromium } from 'playwright'
import { detectTech } from './techDetector.js'

// ─── Regex patterns ────────────────────────────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const WHATSAPP_REGEX = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send|web\.whatsapp\.com)[^\s"'<>]*/gi
const PHONE_REGEX = /(?:\+?\d[\d\s\-().]{7,}\d)/g

// Domains to skip when extracting emails
const EMAIL_BLACKLIST = [
  'example.com', 'test.com', 'sentry.io', 'w3.org', 'schema.org',
  'google.com', 'facebook.com', 'twitter.com', 'amazonaws.com',
  'cloudflare.com', 'jquery.com',
]

function cleanEmails(matches) {
  if (!matches) return []
  return [...new Set(matches)].filter((email) => {
    const domain = email.split('@')[1]?.toLowerCase()
    return domain && !EMAIL_BLACKLIST.some((b) => domain.includes(b))
  })
}

function cleanPhones(matches) {
  if (!matches) return []
  return [...new Set(matches.map((p) => p.replace(/\s+/g, ' ').trim()))].filter(
    (p) => p.replace(/\D/g, '').length >= 8
  )
}

/**
 * Visit a company website, extract contact info and detect tech stack.
 *
 * @param {string} website - URL to crawl
 * @param {function} onLog - Log callback
 * @returns {{ emails: string[], phones: string[], whatsappLinks: string[], techDetections: Array }}
 */
export async function crawlWebsite(website, onLog) {
  const log = (msg) => onLog?.(`[Crawler] ${msg}`)

  if (!website) return { emails: [], phones: [], whatsappLinks: [], techDetections: [] }

  const url = website.startsWith('http') ? website : `https://${website}`
  log(`Crawling ${url}`)

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; LeadEngineBot/1.0)',
  })
  const page = await context.newPage()

  let emails = []
  let phones = []
  let whatsappLinks = []
  let techDetections = []

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // Get full page HTML for tech detection + regex extraction
    const html = await page.content()

    // Tech detection from full source
    techDetections = detectTech(html)

    // Extract emails from rendered HTML
    const emailMatches = html.match(EMAIL_REGEX)
    emails = cleanEmails(emailMatches)

    // Also check mailto: links
    const mailtoLinks = await page.$$eval('a[href^="mailto:"]', (els) =>
      els.map((el) => el.href.replace('mailto:', '').split('?')[0])
    )
    emails = cleanEmails([...emails, ...mailtoLinks])

    // Extract WhatsApp links
    const waMatches = html.match(WHATSAPP_REGEX)
    whatsappLinks = waMatches ? [...new Set(waMatches)] : []

    // Extract phone numbers
    const phoneMatches = html.match(PHONE_REGEX)
    phones = cleanPhones(phoneMatches)

    log(
      `Found: ${emails.length} emails, ${phones.length} phones, ${whatsappLinks.length} WA links, ${techDetections.length} techs`
    )

    // If no email on homepage, try /contact page
    if (emails.length === 0) {
      log('No email on homepage — trying /contact ...')
      try {
        await page.goto(`${url}/contact`, { waitUntil: 'domcontentloaded', timeout: 10000 })
        const contactHtml = await page.content()
        const contactEmails = cleanEmails(contactHtml.match(EMAIL_REGEX))
        const contactMailtos = await page.$$eval('a[href^="mailto:"]', (els) =>
          els.map((el) => el.href.replace('mailto:', '').split('?')[0])
        )
        emails = cleanEmails([...contactEmails, ...contactMailtos])
        if (emails.length > 0) log(`Found ${emails.length} emails on /contact`)
      } catch {
        log('Could not load /contact page')
      }
    }
  } catch (err) {
    log(`Error crawling ${url}: ${err.message}`)
  } finally {
    await browser.close()
  }

  return { emails, phones, whatsappLinks, techDetections }
}
