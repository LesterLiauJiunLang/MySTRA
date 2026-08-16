-- ==============================================================================
-- 🚀 RUN THIS 1-LINE SQL IN SUPABASE SQL EDITOR TO ALLOW CODE RE-ASSIGNMENT
-- URL: https://supabase.com/dashboard/project/lpovahpueihltaclwzzy/sql
-- ==============================================================================

-- Drop unique constraint on property_id so properties can have newly minted / renewed tokens
ALTER TABLE mystra_codes DROP CONSTRAINT IF EXISTS mystra_codes_property_id_key;
