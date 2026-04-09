/**
 * Apollo.io — People Search (Free tier: 50 exports/month)
 * https://api.apollo.io/v1/mixed_people/search
 */

const APOLLO_BASE = 'https://api.apollo.io/v1'

/**
 * Search for decision-maker emails at a company domain.
 *
 * @param {string} domain - Company domain e.g. "acme.com"
 * @param {string} companyName
 * @returns {string|null} Best email found or null
 */
export async function apolloSearch(domain, companyName) {
  const apiKey = process.env.APOLLO_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        page: 1,
        per_page: 10,
        person_titles: [
          'Export Manager',
          'Sales Manager',
          'Business Development',
          'General Manager',
          'Director',
          'Owner',
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (res.status === 429) {
      console.warn('[Apollo] Rate limited')
      return null
    }

    if (!res.ok) return null

    const json = await res.json()
    const people = json?.people || []

    if (people.length === 0) return null

    // Return the first person with a real email
    const withEmail = people.find((p) => p.email && !p.email.includes('email_not_unlocked'))
    return withEmail?.email || null
  } catch (err) {
    console.error('[Apollo] Error:', err.message)
    return null
  }
}
