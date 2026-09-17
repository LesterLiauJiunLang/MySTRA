const fs = require('fs');
const path = require('path');
const https = require('https');

// ==============================================================================
// 1. CONFIGURATION & CREDENTIALS
// ==============================================================================
const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT.supabase.co'; 
const SUPABASE_SERVICE_ROLE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

// Target columns in your Supabase legacy_accounts table
const TARGET_DB_COLUMNS = ['legacy_email', 'license_no', 'business_ssm'];

// Helper function for Supabase REST API calls
function supabaseApiCall(endpoint, method = 'GET', payload = null, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${endpoint}`);
    const postData = payload ? JSON.stringify(payload) : null;

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        ...customHeaders
      }
    };

    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body ? JSON.parse(body) : true);
        } else {
          reject(new Error(`Supabase API Error (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

// ==============================================================================
// 2. STEP A: EXPORT MOCK LEGACY DB TO CSV
// ==============================================================================
async function exportMockDbToCSV(outputFileName) {
  console.log('⏰ Starting 24-hour midnight sync routine...');
  console.log('📥 Fetching data from mock_legacy_external_db...');

  // Query mock_legacy_external_db
  const rows = await supabaseApiCall('mock_legacy_external_db?select=*');

  if (!rows || rows.length === 0) {
    console.log('⚠️ No records found in mock_legacy_external_db.');
    return false;
  }

  // Generate CSV string dynamically
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];

  rows.forEach(row => {
    const line = headers.map(header => {
      let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
      // Escape commas inside text fields
      if (val.includes(',')) val = `"${val}"`;
      return val;
    }).join(',');
    csvLines.push(line);
  });

  const filePath = path.resolve(__dirname, outputFileName);
  fs.writeFileSync(filePath, csvLines.join('\n'), 'utf8');
  console.log(`📄 CSV generated automatically: ${filePath} (${rows.length} rows exported)`);
  return true;
}

// ==============================================================================
// 3. STEP B: DYNAMIC FUZZY MATCHING & INGESTION
// ==============================================================================
function findBestDbMatch(legacyHeader) {
  const cleanHeader = legacyHeader.toLowerCase().replace(/[^a-z0-9]/g, '');

  for (const dbCol of TARGET_DB_COLUMNS) {
    const cleanDbCol = dbCol.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (
      cleanHeader.includes(cleanDbCol) || 
      cleanDbCol.includes(cleanHeader) ||
      (cleanHeader.includes('email') && dbCol === 'legacy_email') ||
      (cleanHeader.includes('licence') && dbCol === 'license_no') ||
      (cleanHeader.includes('license') && dbCol === 'license_no') ||
      (cleanHeader.includes('ssm') && dbCol === 'business_ssm')
    ) {
      return dbCol;
    }
  }
  return null;
}

async function transformAndUploadCSV(csvFileName) {
  const filePath = path.resolve(__dirname, csvFileName);
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const lines = rawContent.split(/\r?\n/).filter(line => line.trim() !== '');

  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const headerMapping = {};

  rawHeaders.forEach((header, index) => {
    const matchedCol = findBestDbMatch(header);
    if (matchedCol) headerMapping[index] = matchedCol;
  });

  console.log('🤖 Auto-Discovered Column Mapping:', headerMapping);

  const payload = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const cleanRecord = { is_migrated: false };

    values.forEach((val, index) => {
      const dbColumn = headerMapping[index];
      if (dbColumn) cleanRecord[dbColumn] = val || null;
    });

    if (cleanRecord.legacy_email && cleanRecord.license_no) {
      payload.push(cleanRecord);
    }
  }

  console.log(`📦 Transformed ${payload.length} records. Uploading to 'legacy_accounts'...`);

  await supabaseApiCall('legacy_accounts', 'POST', payload, {
    'Prefer': 'resolution=merge-duplicates'
  });

  console.log(`✅ Automated Migration Complete! ${payload.length} records landed in 'legacy_accounts'.`);
}

// ==============================================================================
// 4. MAIN PIPELINE EXECUTION
// ==============================================================================
async function runFullPipeline() {
  try {
    const exported = await exportMockDbToCSV('legacy_export.csv');
    if (exported) {
      await transformAndUploadCSV('legacy_export.csv');
    }
  } catch (err) {
    console.error('❌ Pipeline Error:', err.message);
  }
}

runFullPipeline();