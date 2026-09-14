// ==============================================================================
// ⚡ MySTRA AUTOMATED ETL INGESTION ENGINE (UNALTERED SCHEMA MODE)
// ==============================================================================
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://lpovahpueihltaclwzzy.supabase.co"; 
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwb3ZhaHB1ZWlobHRhY2x3enp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MDI0NjgsImV4cCI6MjEwMjQ3ODQ2OH0.TtSAsdEhn5ZOLiqEsLcXxB5RoPn2XIv6hd4l6v906sU";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwb3ZhaHB1ZWlobHRhY2x3enp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjkwMjQ2OCwiZXhwIjoyMTAyNDc4NDY4fQ.PdiFWArBh5WM6S7RlPm13xnPYo2ux524U0gYSHt6keg";

global.WebSocket = class {};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});


function cleanText(str) {
  return str ? str.trim().replace(/\s+/g, ' ') : '';
}

/**
 * Process a single raw record: fetch PDF if available, upload to Storage,
 * upsert into legacy_accounts, and insert into compliance_documents
 * WITHOUT altering or violating the existing table schema.
 */
async function processRecord(raw) {
  const cleanedEmail = cleanText(raw.legacy_email || raw.old_operator_email).toLowerCase();
  const cleanedLicense = cleanText(raw.license_no || raw.licence_no_code).toUpperCase();
  const cleanedSSM = cleanText(raw.business_ssm || raw.ssm_reg_number).toUpperCase();
  const documentUrl = raw.document_url || raw.pdf_url || null;

  if (!cleanedEmail || !cleanedLicense || !cleanedSSM) {
    console.warn(`⚠️ [ETL] Skipping incomplete record:`, raw);
    return;
  }

  let storedDocumentPath = null;

  // 1. Fetch & Store Valid PDF Document in Supabase Storage if URL exists
  if (documentUrl) {
    try {
      const fetch = (await import('node-fetch')).default;
      const res = await fetch(documentUrl);

      if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileName = `licenses/${cleanedSSM}_license.pdf`;

      const { error: storageErr } = await supabase.storage
        .from('operator-documents')
        .upload(fileName, buffer, { 
          contentType: 'application/pdf', 
          upsert: true 
        });

      if (!storageErr) {
        const { data: publicUrlData } = supabase.storage
          .from('operator-documents')
          .getPublicUrl(fileName);

        storedDocumentPath = publicUrlData.publicUrl;
        console.log(`📁 [PDF Uploaded] Accessible at: ${storedDocumentPath}`);
      } else {
        console.warn(`⚠️ [Storage Error] ${storageErr.message}`);
      }
    } catch (docErr) {
      console.warn(`⚠️ [Fetch Error] Could not download target PDF: ${docErr.message}`);
    }
  }

  // 2. Ingest Record into legacy_accounts table
  const { error: dbErr } = await supabase
    .from('legacy_accounts')
    .upsert({
      legacy_email: cleanedEmail,
      license_no: cleanedLicense,
      business_ssm: cleanedSSM,
      is_migrated: false
    }, { onConflict: 'legacy_email' });

  if (dbErr) {
    console.error(`❌ [DB Error] ${cleanedEmail}: ${dbErr.message}`);
  } else {
    console.log(`✅ [DB Saved] Legacy account created for ${cleanedEmail}`);
  }

  // 3. Insert into compliance_documents strictly matching your existing schema
  if (storedDocumentPath) {
    const { error: docErr } = await supabase
      .from('compliance_documents')
      .insert([{
        document_type: 'SSM Certificate',
        file_path: storedDocumentPath,
        ssm_number: cleanedSSM,
        review_status: 'Pending',
        status: 'PENDING',
        uploaded_at: new Date().toISOString()
      }]);

    if (docErr) {
      console.warn(`⚠️ [Compliance Doc Error] ${docErr.message}`);
    } else {
      console.log(`📄 [Document Queued] SSM Certificate for ${cleanedSSM} saved to compliance_documents.`);
    }
  }
}

/**
 * Pipeline Entrypoint: Handles both CSV files AND Direct Database Extractions
 */
async function runLegacyIngestionPipeline(inputSource) {
  // Option A: Input is a CSV File Path
  if (typeof inputSource === 'string' && fs.existsSync(inputSource)) {
    console.log(`🚀 [ETL CSV Mode] Processing file: ${inputSource}`);
    const records = [];

    fs.createReadStream(inputSource)
      .pipe(csv())
      .on('data', (row) => records.push(row))
      .on('end', async () => {
        console.log(`📄 [ETL] Read ${records.length} CSV records.`);
        for (const raw of records) {
          await processRecord(raw);
        }
        console.log('🎉 [ETL Ingestion Complete]');
      });
  } 
  // Option B: Direct Extraction from mock_legacy_external_db Table
  else {
    console.log('⚡ [ETL DB Mode] Fetching active records from mock_legacy_external_db...');
    
    // Fetch all records to bypass SQL formatting mismatch
    const { data: allRows, error: extractErr } = await supabase
      .from('mock_legacy_external_db')
      .select('*');

    if (extractErr || !allRows) {
      console.error('❌ Direct DB Extraction failed:', extractErr);
      return;
    }

    // Trim whitespace and filter active rows directly
    const rawRows = allRows.filter(row => 
      row.system_status && row.system_status.trim().toUpperCase() === 'ACTIVE'
    );

    console.log(`📦 Extracted ${rawRows.length} raw legacy records from DB.`);
    for (const raw of rawRows) {
      await processRecord(raw);
    }
    console.log('🎉 [ETL Ingestion Complete]');
  }
}

module.exports = { runLegacyIngestionPipeline };