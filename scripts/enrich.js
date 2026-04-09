/**
 * scripts/enrich.js  —  Step 3 (final) of the LeadEngine pipeline
 *
 * For every lead in this ScrapeJob that still lacks a verified email,
 * runs the enrichment waterfall:
 *
 *   1. Bouncify   — Verify emails found by the crawler
 *   2. Apollo.io  — Domain search for decision-maker emails (if none found)
 *   3. ContactOut — Fallback email lookup
 *   4. Hunter.io  — Final fallback domain search
 *
 * After enrichment, recalculates the final leadScore (+10 if Bouncify
 * confirms the email as "deliverable").
 *
 * ENV vars: JOB_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *           BOUNCIFY_API_KEY, APOLLO_API_KEY,
 *           CONTACTOUT_API_KEY, HUNTER_API_KEY
 */

import { supabase }        from './lib/supabase-client.js'
import { logger, logSync } from './lib/logger.js'

const JOB_ID = process.env.JOB_ID
if (!JOB_ID) { console.error('❌ JOB_ID required'); process.exit(1) }

// ─── Bouncify ───────────────────────────────────────────────────────────────
/**
 * Verify an email address with Bouncify.
 * https://bouncify.io/docs/api/single-email-verification
 * Free plan: 100 credits on signup.
 *
 * @returns {{ isValid: boolean, status: string }|null}
 */
async function bouncifyVerify(email) {
  const key = process.env.BOUNCIFY_API_KEY
  if (!key) return null

  try {
    const res = await fetch(
      `https://api.bouncify.io/v1/verify?apikey=${key}&email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(12000) }
    )
    if (!res.ok) return null

    const json = await res.json()
    // Bouncify result statuses: "deliverable" | "undeliverable" | "risky" | "unknown"
    const status  = json?.result || json?.status || 'unknown'
    const isValid = status === 'deliverable'
    return { isValid, status, provider: 'bouncify' }
  } catch (err) {
    logger.warn(`Bouncify error for ${email}: ${err.message}`)
    return null
  }
}

// ─── Apollo.io ──────────────────────────────────────────────────────────────
/**
 * Search Apollo.io for decision-maker emails by domain.
 * https://apolloio.github.io/apollo-api-docs/?shell#people-search
 * Free plan: 50 exports/month.
 *
 * @returns {string|null} email
 */
async function apolloSearch(domain) {
  const key = process.env.APOLLO_API_KEY
  if (!key || !domain) return null

  try {
    const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':    key,
      },
      body: JSON.stringify({
        q_organization_domains: domain,
        page:        1,
        per_page:    10,
        person_titles: [
          'Export Manager', 'Sales Manager', 'Business Development',
          'General Manager', 'Director', 'Owner', 'MD',
        ],
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (res.status === 429) { logger.warn('[Apollo] Rate limited'); return null }
    if (!res.ok) return null

    const json   = await res.json()
    const people = json?.people || []
    const locked = 'email_not_unlocked'
    const best   = people.find((p) => p.email && !p.email.includes(locked))
    return best?.email || null
  } catch (err) {
    logger.warn(`Apollo error for ${domain}: ${err.message}`)
    return null
  }
}

// ─── ContactOut ─────────────────────────────────────────────────────────────
/**
 * Find email via ContactOut by company domain.
 * https://contactout.com/api
 *
 * @returns {string|null}
 */
async function contactoutLookup(domain) {
  const key = process.env.CONTACTOUT_API_KEY
  if (!key || !domain) return null

  try {
    const url = new URL('https://api.contactout.com/v1/email/find')
    url.searchParams.set('domain', domain)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
      signal:   AbortSignal.timeout(10000),
    })
    if (res.status === 429) { logger.warn('[ContactOut] Rate limited'); return null }
    if (!res.ok) return null

    const json = await res.json()
    return json?.email || json?.emails?.[0] || null
  } catch (err) {
    logger.warn(`ContactOut error for ${domain}: ${err.message}`)
    return null
  }
}

// ─── Hunter.io ──────────────────────────────────────────────────────────────
/**
 * Search Hunter.io for emails by domain.
 * https://hunter.io/api-documentation/v2#domain-search
 * Free plan: 25 searches/month.
 *
 * @returns {string|null}
 */
async function hunterSearch(domain) {
  const key = process.env.HUNTER_API_KEY
  if (!key || !domain) return null

  try {
    const url = new URL('https://api.hunter.io/v2/domain-search')
    url.searchParams.set('domain', domain)
    url.searchParams.set('api_key', key)
    url.searchParams.set('limit', '5')

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    if (res.status === 429) { logger.warn('[Hunter] Rate limited'); return null }
    if (!res.ok) return null

    const json   = await res.json()
    const emails = json?.data?.emails || []
    if (!emails.length) return null

    // Prefer business-type emails
    const priority = ['export', 'sales', 'manager', 'info', 'contact', 'hello', 'admin']
    const best     = emails.find((e) => priority.some((kw) => e.value?.toLowerCase().includes(kw)))
    return best?.value || emails[0]?.value || null
  } catch (err) {
    logger.warn(`Hunter error for ${domain}: ${err.message}`)
    return null
  }
}

// ─── Domain extractor ───────────────────────────────────────────────────────
function extractDomain(website) {
  if (!website) return null
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] || null
  }
}

// ─── Save enrichment log ────────────────────────────────────────────────────
async function saveEnrichmentLog(leadId, step, status, message, data = null) {
  await supabase.from('enrichment_logs').insert({
    lead_id: leadId, step, status, message, data,
  })
}

// ─── Save email verification ─────────────────────────────────────────────────
async function saveVerification(leadId, email, result) {
  if (!result) return
  await supabase.from('email_verifications').upsert({
    lead_id:    leadId,
    email,
    is_valid:   result.isValid,
    status:     result.status,
    provider:   result.provider,
  }, { onConflict: 'lead_id' })
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  await logSync(`💧 Enrichment waterfall starting for job ${JOB_ID}`, 'INFO')

  // Fetch all PARTIAL leads (crawled but no verified email)
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('scrape_job_id', JOB_ID)
    .in('enrichment_status', ['PARTIAL', 'IN_PROGRESS'])
    .order('lead_score', { ascending: false }) // Process hottest leads first

  if (error) { logger.error(`Fetch failed: ${error.message}`); process.exit(1) }
  if (!leads?.length) { logger.warn('No leads to enrich'); return }

  logger.info(`💧 ${leads.length} leads entering the enrichment waterfall`)

  let processed = 0

  for (const lead of leads) {
    processed++
    const pct = 80 + Math.round((processed / leads.length) * 20) // enrich = 80-100%

    const domain = extractDomain(lead.website)
    logger.info(`[${processed}/${leads.length}] Enriching: ${lead.company_name} (${domain || 'no domain'})`)

    let email           = lead.email || null
    let verifyResult    = null
    let enriched        = false
    let scoreDelta      = 0

    // ── Step 1: Verify existing email with Bouncify ────────────────────────
    if (email) {
      logger.info(`  → Bouncify: verifying ${email}`)
      verifyResult = await bouncifyVerify(email)

      if (verifyResult) {
        await saveVerification(lead.id, email, verifyResult)
        await saveEnrichmentLog(lead.id, 'BOUNCIFY', verifyResult.isValid ? 'SUCCESS' : 'FAILED',
          `${email} is ${verifyResult.status}`, verifyResult)

        if (verifyResult.isValid) {
          logger.success(`  ✅ Bouncify: ${email} is DELIVERABLE`)
          scoreDelta += 10 // bonus points for verified email
          enriched = true
        } else {
          logger.warn(`  ⚠️ Bouncify: ${email} is ${verifyResult.status} — will try API lookup`)
          email = null // treat as no valid email, try APIs
        }
      } else {
        await saveEnrichmentLog(lead.id, 'BOUNCIFY', 'SKIPPED', 'No API key or request failed')
        enriched = true // we have an email even if unverified
      }
    }

    // ── Step 2: Apollo.io domain search ───────────────────────────────────
    if (!email && domain) {
      logger.info(`  → Apollo: searching ${domain}`)
      const apolloEmail = await apolloSearch(domain)
      if (apolloEmail) {
        email = apolloEmail
        await saveEnrichmentLog(lead.id, 'APOLLO', 'SUCCESS', `Found: ${apolloEmail}`)
        logger.success(`  ✅ Apollo found: ${apolloEmail}`)
        enriched = true
      } else {
        await saveEnrichmentLog(lead.id, 'APOLLO', 'FAILED', 'No email found')
        logger.info(`  Apollo: no result`)
      }
    }

    // ── Step 3: ContactOut ────────────────────────────────────────────────
    if (!email && domain) {
      logger.info(`  → ContactOut: looking up ${domain}`)
      const coEmail = await contactoutLookup(domain)
      if (coEmail) {
        email = coEmail
        await saveEnrichmentLog(lead.id, 'CONTACTOUT', 'SUCCESS', `Found: ${coEmail}`)
        logger.success(`  ✅ ContactOut found: ${coEmail}`)
        enriched = true
      } else {
        await saveEnrichmentLog(lead.id, 'CONTACTOUT', 'FAILED', 'No email found')
      }
    }

    // ── Step 4: Hunter.io ─────────────────────────────────────────────────
    if (!email && domain) {
      logger.info(`  → Hunter.io: searching ${domain}`)
      const hunterEmail = await hunterSearch(domain)
      if (hunterEmail) {
        email = hunterEmail
        await saveEnrichmentLog(lead.id, 'HUNTER', 'SUCCESS', `Found: ${hunterEmail}`)
        logger.success(`  ✅ Hunter found: ${hunterEmail}`)
        enriched = true
      } else {
        await saveEnrichmentLog(lead.id, 'HUNTER', 'FAILED', 'No email found')
      }
    }

    // ── Step 5: Verify newly found email ──────────────────────────────────
    if (email && !verifyResult) {
      logger.info(`  → Bouncify: verifying API-sourced email ${email}`)
      verifyResult = await bouncifyVerify(email)
      if (verifyResult) {
        await saveVerification(lead.id, email, verifyResult)
        if (verifyResult.isValid) {
          scoreDelta += 10
          logger.success(`  ✅ ${email} verified as DELIVERABLE`)
        } else {
          logger.warn(`  ${email} status: ${verifyResult.status}`)
        }
      }
    }

    // ── Final update ──────────────────────────────────────────────────────
    const finalScore   = Math.min((lead.lead_score || 0) + scoreDelta, 100)
    const finalQuality = finalScore >= 70 ? 'HOT' : finalScore >= 40 ? 'WARM' : 'COLD'
    const finalStatus  = enriched ? 'COMPLETE' : 'PARTIAL'

    const { error: updateErr } = await supabase
      .from('leads')
      .update({
        email,
        has_email:         Boolean(email),
        lead_score:        finalScore,
        lead_quality:      finalQuality,
        enrichment_status: finalStatus,
      })
      .eq('id', lead.id)

    if (updateErr) {
      logger.error(`Update failed for "${lead.company_name}": ${updateErr.message}`)
    } else {
      logger.success(
        `  💯 Final score: ${finalScore} (${finalQuality}) | Email: ${email || 'none'}`
      )
    }

    // Update job progress
    await supabase
      .from('scrape_jobs')
      .update({ progress: pct })
      .eq('id', JOB_ID)
  }

  // Mark job as COMPLETED
  await supabase
    .from('scrape_jobs')
    .update({ status: 'COMPLETED', progress: 100, completed_at: new Date().toISOString() })
    .eq('id', JOB_ID)

  await logSync(`🎉 Pipeline complete! ${leads.length} leads fully enriched.`, 'SUCCESS')
}

main().catch(async (err) => {
  logger.error(`Unhandled enrichment error: ${err.message}`)
  console.error(err)
  await supabase
    .from('scrape_jobs')
    .update({ status: 'FAILED', error_message: err.message })
    .eq('id', JOB_ID)
  process.exit(1)
})
