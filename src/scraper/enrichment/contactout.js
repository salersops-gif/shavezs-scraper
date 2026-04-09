/**
 * ContactOut — Email Lookup (Limited free lookups)
 * https://api.contactout.com/v1
 */

const CONTACTOUT_BASE = 'https://api.contactout.com/v1'

/**
 * Lookup email for a person by name and company domain.
 *
 * @param {string} domain - Company domain
 * @param {string} companyName
 * @returns {string|null} Email or null
 */
export async function contactoutLookup(domain, companyName) {
  const apiKey = process.env.CONTACTOUT_API_KEY
  if (!apiKey) return null

  try {
    const url = new URL(`${CONTACTOUT_BASE}/email/find`)
    url.searchParams.set('domain', domain)
    url.searchParams.set('company_name', companyName || '')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 429) {
      console.warn('[ContactOut] Rate limited')
      return null
    }

    if (!res.ok) return null

    const json = await res.json()
    return json?.email || json?.emails?.[0] || null
  } catch (err) {
    console.error('[ContactOut] Error:', err.message)
    return null
  }
}
