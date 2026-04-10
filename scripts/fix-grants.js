/**
 * scripts/fix-grants.js
 *
 * Ensures all Supabase roles have full access to the public schema.
 * Must be run after any schema reset (prisma db push --force-reset).
 *
 * Requires: DATABASE_URL env var (direct Supabase Postgres connection)
 */

import pg from 'pg'

const { Client } = pg
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required')
  process.exit(1)
}

const SQL = `
  GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
`

const client = new Client({ connectionString: DATABASE_URL })

try {
  await client.connect()
  await client.query(SQL)
  console.log('✅ Supabase schema permissions granted successfully')
} catch (err) {
  console.error('❌ Grant failed:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
