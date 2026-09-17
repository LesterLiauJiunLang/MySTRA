-- ==============================================================================
-- 🚀 MySTRA Supabase RLS Fix Script
-- Run this in your Supabase SQL Editor:
-- ==============================================================================

-- 1. Ensure owner_id column exists on mystra_codes (references auth.users or profiles)
ALTER TABLE mystra_codes ADD COLUMN IF NOT EXISTS owner_id UUID;

-- 2. Drop any conflicting unique constraint on property_id
ALTER TABLE mystra_codes DROP CONSTRAINT IF EXISTS mystra_codes_property_id_key;

-- 3. Enable RLS on mystra_codes and interceptor_audit_logs
ALTER TABLE mystra_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interceptor_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- 4. Grant Full Insert, Select, Update permissions for mystra_codes
DROP POLICY IF EXISTS "Allow authenticated users to insert mystra_codes" ON mystra_codes;
DROP POLICY IF EXISTS "Allow authenticated users to select mystra_codes" ON mystra_codes;
DROP POLICY IF EXISTS "Allow authenticated users to update mystra_codes" ON mystra_codes;
DROP POLICY IF EXISTS "Anon full access mystra_codes" ON mystra_codes;
DROP POLICY IF EXISTS "Public full access mystra_codes" ON mystra_codes;

CREATE POLICY "Public full access mystra_codes" 
ON mystra_codes 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 5. Grant Full Access on interceptor_audit_logs
DROP POLICY IF EXISTS "Anon full access interceptor_audit_logs" ON interceptor_audit_logs;
DROP POLICY IF EXISTS "Public full access interceptor_audit_logs" ON interceptor_audit_logs;

CREATE POLICY "Public full access interceptor_audit_logs" 
ON interceptor_audit_logs 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 6. Grant Full Access on properties
DROP POLICY IF EXISTS "Public full access properties" ON properties;
CREATE POLICY "Public full access properties" 
ON properties 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 7. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
