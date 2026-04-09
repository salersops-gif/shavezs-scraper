/**
 * LeadEngine Pro — GitHub Actions Repository Dispatch Trigger
 *
 * Sends a `repository_dispatch` event to GitHub to start a scrape job.
 * The GitHub Action listens for the `scrape-job` event type and receives
 * the job details via `client_payload`.
 *
 * Required env vars:
 *   GITHUB_TOKEN  — Personal Access Token with `repo` + `workflow` scopes
 *   GITHUB_REPO   — e.g. "johndoe/leadengine-pro"
 */

const GITHUB_API = 'https://api.github.com'

/**
 * Trigger a GitHub Actions scrape job via repository_dispatch.
 *
 * @param {object} payload
 * @param {string} payload.jobId       - ScrapeJob DB id (for the runner to update status)
 * @param {string} payload.niche       - Search niche, e.g. "Auto Spares Manufacturer"
 * @param {string} payload.location    - Target location, e.g. "Karachi"
 * @param {string} payload.query       - Combined query string sent to Google Maps
 * @param {number} [payload.maxResults] - Max leads to scrape (default: 50)
 *
 * @returns {Promise<{ success: boolean, runId?: string, error?: string }>}
 */
export async function triggerScrapeJob({ jobId, niche, location, query, maxResults = 50 }) {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO

  if (!token || !repo) {
    const msg = 'GitHub integration not configured. Set GITHUB_TOKEN and GITHUB_REPO in .env.local'
    console.error('[GitHub Trigger]', msg)
    return { success: false, error: msg }
  }

  const [owner, repoName] = repo.split('/')
  if (!owner || !repoName) {
    return { success: false, error: `GITHUB_REPO must be in "owner/repo" format. Got: "${repo}"` }
  }

  const url = `${GITHUB_API}/repos/${owner}/${repoName}/dispatches`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        Accept:         'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        event_type: 'scrape-job',
        client_payload: {
          jobId,
          niche,
          location,
          query,
          maxResults,
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    // GitHub returns 204 No Content on success (no body)
    if (res.status === 204) {
      console.log(`[GitHub Trigger] ✅ Dispatch sent for job ${jobId} — query: "${query}"`)
      return { success: true }
    }

    // Any other status is an error
    let errBody = ''
    try { errBody = await res.text() } catch { /* noop */ }

    const msg = `GitHub API returned ${res.status}: ${errBody}`
    console.error('[GitHub Trigger]', msg)
    return { success: false, error: msg }
  } catch (err) {
    const msg = `Network error triggering GitHub Action: ${err.message}`
    console.error('[GitHub Trigger]', msg)
    return { success: false, error: msg }
  }
}

/**
 * Verify that the GitHub token and repo are valid by fetching repo metadata.
 * Useful for a settings page "Test connection" button.
 *
 * @returns {Promise<{ valid: boolean, repoName?: string, error?: string }>}
 */
export async function verifyGithubConnection() {
  const token = process.env.GITHUB_TOKEN
  const repo  = process.env.GITHUB_REPO

  if (!token || !repo) {
    return { valid: false, error: 'GITHUB_TOKEN and GITHUB_REPO are not set' }
  }

  try {
    const res = await fetch(`${GITHUB_API}/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return { valid: false, error: `GitHub API: ${res.status}` }

    const data = await res.json()
    return { valid: true, repoName: data.full_name }
  } catch (err) {
    return { valid: false, error: err.message }
  }
}
