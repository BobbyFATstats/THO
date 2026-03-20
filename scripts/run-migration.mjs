import 'dotenv/config';
import { readFileSync } from 'fs';

const sql = readFileSync('./supabase/migrations/001_initial_schema.sql', 'utf8');
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Split into individual statements and execute via Supabase's SQL endpoint
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'));

console.log(`Running ${statements.length} statements against ${supabaseUrl}\n`);

let success = 0;
let failed = 0;

for (const stmt of statements) {
  const label = stmt.split('\n').find(l => l.trim() && !l.trim().startsWith('--'))?.trim().substring(0, 60) || '...';

  // Use Supabase's PostgREST rpc or try the SQL query endpoint
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: stmt + ';' })
  });

  if (response.ok) {
    console.log(`OK: ${label}`);
    success++;
  } else {
    // PostgREST can't run DDL. Fall back.
    failed++;
  }
}

if (failed > 0) {
  // PostgREST doesn't support DDL. Use the Supabase client's admin SQL if available,
  // or use the pg protocol directly
  console.log(`\nPostgREST cannot run DDL. Attempting direct connection...`);

  // Extract the project ref from the URL
  const ref = supabaseUrl.replace('https://', '').replace('.supabase.co', '');

  // Try the Supabase pooler connection
  const { default: pg } = await import('pg').catch(() => ({ default: null }));

  if (!pg) {
    console.log('pg module not installed. Installing...');
    const { execSync } = await import('child_process');
    execSync('npm install pg', { stdio: 'inherit' });
    console.log('Retrying...');
    process.exit(1); // Re-run after install
  }

  // Connect via Supabase's pooler
  const connectionString = `postgresql://postgres.${ref}:${process.env.SUPABASE_DB_PASSWORD || 'YOUR_DB_PASSWORD'}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

  console.log('\nCannot connect directly without the database password.');
  console.log('Please run the SQL in your Supabase Dashboard > SQL Editor.');
  console.log('The file is at: supabase/migrations/001_initial_schema.sql');
}
