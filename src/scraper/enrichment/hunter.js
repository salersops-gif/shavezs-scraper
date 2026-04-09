/**
 * Hunter.io — Domain Search (Free tier: 25 requests/month)
 * https://hunter.io/api/v2/domain-search
 */

const HUNTER_BASE = 'https://api.hunter.io/v2'

/**
 * Search for email addresses associated with a domain.
 *
 * @param {string} domain - Company domain e.g. "acme.com"
 * @param {string} companyName - Used for fallback name guessing
 * @returns {string|null} Best email found or null
 */
export async function hunterDomainSearch(domain, companyName) {
  const apiKey = process.env.HUNTER_API_KEY
  if (!apiKey) return null

  try {
    const url = new URL(`${HUNTER_BASE}/domain-search`)
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', apiKey)
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })

    if (res.status === 429) {
      console.warn('[Hunter] Rate limited')
      return null
    }

    if (!res.ok) return null

    const json = await res.json()
    const emails = json?.data?.emails || []

    if (emails.length === 0) return null

    // Prefer emails with "manager", "export", "sales", "info", "contact"
    const priority = ['export', 'sales', 'manager', 'info', 'contact', 'hello']
    const bestEmail = emails.find((e) =>
      priority.some((kw) => e.value?.toLowerCase().includes(kw))
    )

    return bestEmail?.value || emails[0]?.value || null
  } catch (err) {
    console.error('[Hunter] Error:', err.message)
    return null
  }
}
