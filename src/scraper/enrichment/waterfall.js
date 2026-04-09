import { hunterDomainSearch } from './hunter.js'
import { apolloSearch } from './apollo.js'
import { contactoutLookup } from './contactout.js'



/**
 * Extract the domain from a URL string.
 * @param {string} website
 * @returns {string|null}
 */
function extractDomain(website) {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return website.replace(/^www\./, '').split('/')[0]
  }
}

/**
 * Run the full enrichment waterfall for a single lead.
 *
 * Steps (each skipped if email already found):
 *   1. Hunter.io domain search
 *   2. Apollo.io people search
 *   3. ContactOut lookup
 *   4. Bouncify email verification (see scripts/enrich.js)
 *
 * @param {object} lead - Lead record with website/companyName
 * @param {function} onLog - Log callback
 * @returns {{ email: string|null, emailVerification: object|null, logs: Array }}
 */
export async function runEnrichmentWaterfall(lead, onLog) {
  const log = (step, status, message) => {
    onLog?.(`[${step}] ${status}: ${message}`)
    return { step, status, message }
  }

  const logs = []
  let email = lead.email || null
  let emailVerification = null
  const domain = extractDomain(lead.website)

  // ─── Step 1: Hunter.io ──────────────────────────────
  if (!email && domain) {
    const logEntry = log('HUNTER', 'RUNNING', `Searching ${domain}...`)
    logs.push(logEntry)
    email = await hunterDomainSearch(domain, lead.companyName)
    if (email) {
      logs.push(log('HUNTER', 'SUCCESS', `Found: ${email}`))
    } else {
      logs.push(log('HUNTER', 'FAILED', 'No email found'))
    }
  } else if (!domain) {
    logs.push(log('HUNTER', 'SKIPPED', 'No website/domain available'))
  }

  // ─── Step 2: Apollo.io ──────────────────────────────
  if (!email && domain) {
    logs.push(log('APOLLO', 'RUNNING', `Searching ${domain}...`))
    email = await apolloSearch(domain, lead.companyName)
    if (email) {
      logs.push(log('APOLLO', 'SUCCESS', `Found: ${email}`))
    } else {
      logs.push(log('APOLLO', 'FAILED', 'No email found'))
    }
  } else if (!email) {
    logs.push(log('APOLLO', 'SKIPPED', 'No domain available'))
  }

  // ─── Step 3: ContactOut ─────────────────────────────
  if (!email && domain) {
    logs.push(log('CONTACTOUT', 'RUNNING', `Looking up ${domain}...`))
    email = await contactoutLookup(domain, lead.companyName)
    if (email) {
      logs.push(log('CONTACTOUT', 'SUCCESS', `Found: ${email}`))
    } else {
      logs.push(log('CONTACTOUT', 'FAILED', 'No email found'))
    }
  } else if (!email) {
    logs.push(log('CONTACTOUT', 'SKIPPED', 'No domain available'))
  }

  // Step 4: Email verification is handled by Bouncify in scripts/enrich.js
  // (Verifalia removed)

  return { email, emailVerification, logs }
}
