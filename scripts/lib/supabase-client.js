/**
 * scripts/lib/supabase-client.js
 * Shared Supabase client for all scraper scripts.
 * Uses the SERVICE ROLE KEY to bypass RLS for server-side writes.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY

if (!url || !key) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set as GitHub Secrets')
  process.exit(1)
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession:    false,
    autoRefreshToken:  false,
    detectSessionInUrl: false,
  },
})
