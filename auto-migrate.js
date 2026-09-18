const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Supabase Credentials (Read key securely from environment)
const SUPABASE_URL = "https://lpovahpueihltaclwzzy.supabase.co"; 
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Fail-safe check: Stop execution if key is missing
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ ERROR: Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
  console.error("Run: export SUPABASE_SERVICE_ROLE_KEY='your_new_key_here' before executing.");
  process.exit(1);
}

// 2. TARGET DATABASE COLUMNS (Includes document_url)
const TARGET_DB_COLUMNS = ['legacy_email', 'license_no', 'business_ssm', 'document_url'];

/**
 * AUTOMATIC MATCHING ALGORITHM
 * Maps legacy CSV headers to your exact database column names
 */
function findBestDbMatch(legacyHeader) {
  const cleanHeader = legacyHeader.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const dbCol of TARGET_DB_COLUMNS) {
    const cleanDbCol = dbCol.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      cleanHeader.includes(cleanDbCol) || 
      cleanDbCol.includes(cleanHeader) ||
      (cleanHeader.includes('email') && dbCol === 'legacy_email') ||
      (cleanHeader.includes('license') && dbCol === 'license_no') ||
      (cleanHeader.includes('title') && dbCol === 'business_ssm') ||
      (cleanHeader.includes('comp') && dbCol === 'business_ssm') ||
      (cleanHeader.includes('doc') && dbCol === 'document_url') ||
      (cleanHeader.includes('url') && dbCol === 'document_url')
    ) {
      return dbCol;
    }
  }
  return null;
}

/**
 * Native REST API post to Supabase (Targeting 'legacy_accounts')
 */
function postToSupabase(payload) {
  return new Promise((resolve, reject) => {
    const endpoint = `${SUPABASE_URL}/rest/v1/legacy_accounts`;
    const url = new URL(endpoint);

    const postData = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`Supabase API Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function runAutoMigration(csvFileName) {
  try {
    const filePath = path.resolve(__dirname, csvFileName);
    console.log(`🚀 Reading local CSV: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Error: Could not find '${csvFileName}' in ${__dirname}`);
      return;
    }

    const rawContent = fs.readFileSync(filePath, 'utf8');
    const lines = rawContent.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length < 2) {
      console.error('❌ Error: CSV file is empty or missing data rows.');
      return;
    }

    const rawHeaders = lines[0].split(',').map(h => h.trim());
    const headerMapping = {};
    const unmappedColumns = [];

    rawHeaders.forEach((header, index) => {
      const matchedCol = findBestDbMatch(header);
      if (matchedCol) {
        headerMapping[index] = matchedCol;
      } else {
        unmappedColumns.push(header);
      }
    });

    console.log('🤖 Auto-Discovered Mapping Scheme:', headerMapping);
    if (unmappedColumns.length > 0) {
      console.log('⚠️ Ignored / Unmapped CSV Columns:', unmappedColumns);
    }

    const payload = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const cleanRecord = { is_migrated: false };

      values.forEach((val, index) => {
        const dbColumn = headerMapping[index];
        if (dbColumn) {
          cleanRecord[dbColumn] = val || null;
        }
      });

      if (cleanRecord.legacy_email && cleanRecord.license_no) {
        payload.push(cleanRecord);
      }
    }

    console.log(`📦 Transformed ${payload.length} records. Uploading to 'legacy_accounts'...`);

    await postToSupabase(payload);
    console.log(`✅ Success! ${payload.length} records imported into 'legacy_accounts' table in Supabase.`);

  } catch (err) {
    console.error('❌ System Execution Error:', err.message);
  }
}

runAutoMigration('legacy_export.csv');