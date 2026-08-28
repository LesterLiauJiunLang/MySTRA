// test-run.js
const path = require('path');
const { runLegacyIngestionPipeline } = require('./migration-engine');

async function test() {
  console.log('🧪 Executing ETL Ingestion Test...');
  
  const csvPath = path.join(__dirname, 'legacy_export.csv');
  
  // Run CSV ingestion if file exists, otherwise pull from mock_legacy_external_db
  await runLegacyIngestionPipeline(csvPath);
}

test();