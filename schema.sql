-- ==============================================================================
-- 🇲🇾 MySTRA Database Schema, RLS Policies & Seed Data
-- Target Database: Supabase PostgreSQL (https://lpovahpueihltaclwzzy.supabase.co)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. CREATE TABLES
-- ------------------------------------------------------------------------------

-- Profiles Table (Property owners & STRA operators)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    phone_no TEXT NOT NULL,
    business_name TEXT NOT NULL,
    business_ssm TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    role TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Properties Table (Registered accommodation listings)
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID,
    title TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    latitude NUMERIC NOT NULL,
    longitude NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- MySTRA Codes Table (Unique municipal registration tokens & night quotas)
CREATE TABLE IF NOT EXISTS mystra_codes (
    registration_code TEXT PRIMARY KEY,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    code_status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'SUSPENDED', 'EXPIRED'
    booked_nights INTEGER DEFAULT 0,
    max_limit_cap INTEGER DEFAULT 180,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Relax existing table constraints if already created
ALTER TABLE mystra_codes ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE mystra_codes DROP CONSTRAINT IF EXISTS mystra_codes_code_status_check;
ALTER TABLE properties ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_owner_id_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE compliance_documents DROP CONSTRAINT IF EXISTS compliance_documents_review_status_check;
ALTER TABLE compliance_documents DROP CONSTRAINT IF EXISTS compliance_documents_property_id_fkey;
ALTER TABLE interceptor_audit_logs DROP CONSTRAINT IF EXISTS interceptor_audit_logs_registration_code_fkey;

-- Interceptor Audit Logs Table (OTA live verification ledger)
CREATE TABLE IF NOT EXISTS interceptor_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_code TEXT REFERENCES mystra_codes(registration_code) ON DELETE SET NULL,
    requesting_ota TEXT NOT NULL, -- e.g. 'Airbnb', 'Agoda', 'Booking.com'
    is_valid_pass BOOLEAN NOT NULL,
    checked_nights_snapshot INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Compliance Documents Table (Permits, fire safety certs, municipal packets)
CREATE TABLE IF NOT EXISTS compliance_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    review_status TEXT DEFAULT 'APPROVED', -- 'PENDING', 'APPROVED', 'REJECTED'
    admin_feedback TEXT,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Legacy Accounts Table (Historical local authority registry migrations)
CREATE TABLE IF NOT EXISTS legacy_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legacy_email TEXT NOT NULL,
    license_no TEXT NOT NULL,
    business_ssm TEXT NOT NULL,
    is_migrated BOOLEAN DEFAULT false
);

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS) POLICIES FOR ANON / FRONTEND ACCESS
-- ------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE mystra_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE interceptor_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_accounts ENABLE ROW LEVEL SECURITY;

-- Allow anon public role to read and insert for the prototype demo
DROP POLICY IF EXISTS "Anon full access profiles" ON profiles;
CREATE POLICY "Anon full access profiles" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access properties" ON properties;
CREATE POLICY "Anon full access properties" ON properties FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access mystra_codes" ON mystra_codes;
CREATE POLICY "Anon full access mystra_codes" ON mystra_codes FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access interceptor_audit_logs" ON interceptor_audit_logs;
CREATE POLICY "Anon full access interceptor_audit_logs" ON interceptor_audit_logs FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access compliance_documents" ON compliance_documents;
CREATE POLICY "Anon full access compliance_documents" ON compliance_documents FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access legacy_accounts" ON legacy_accounts;
CREATE POLICY "Anon full access legacy_accounts" ON legacy_accounts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. SEED SAMPLE DATA
-- ------------------------------------------------------------------------------

-- Insert Profile
INSERT INTO profiles (id, full_name, phone_no, business_name, business_ssm, is_verified)
VALUES (
    'a1111111-1111-1111-1111-111111111111',
    'Natalie Koa',
    '+60 12-345 6789',
    'Koa Hospitality Management Sdn Bhd',
    '202401099887 (1548762-X)',
    true
) ON CONFLICT (id) DO NOTHING;

-- Insert Properties
INSERT INTO properties (id, owner_id, title, address, city, state, latitude, longitude)
VALUES 
(
    'b2222222-2222-2222-2222-222222222222',
    'a1111111-1111-1111-1111-111111111111',
    'Luxury Apartment @ KLCC',
    '10 Jalan Ampang, Kuala Lumpur City Centre',
    'Kuala Lumpur',
    'Wilayah Persekutuan',
    3.1579,
    101.7116
),
(
    'c3333333-3333-3333-3333-333333333333',
    'a1111111-1111-1111-1111-111111111111',
    'Urban Duplex @ Penang Island',
    '88 Gurney Drive, George Town',
    'George Town',
    'Pulau Pinang',
    5.4344,
    100.3150
) ON CONFLICT (id) DO NOTHING;

-- Insert Initial MySTRA Registration Codes
INSERT INTO mystra_codes (registration_code, property_id, code_status, booked_nights, max_limit_cap)
VALUES
('MYSTRA-KL-2026-897F', 'b2222222-2222-2222-2222-222222222222', 'ACTIVE', 130, 180),
('MYSTRA-PG-2026-114B', 'c3333333-3333-3333-3333-333333333333', 'SUSPENDED', 180, 180)
ON CONFLICT (registration_code) DO NOTHING;

-- Insert Initial Audit Logs
INSERT INTO interceptor_audit_logs (registration_code, requesting_ota, is_valid_pass, checked_nights_snapshot, timestamp)
VALUES
('MYSTRA-KL-2026-897F', 'MySTRA Core Engine [TOKEN_CREATED]', true, 0, NOW() - INTERVAL '1 day'),
('MYSTRA-KL-2026-897F', 'Agoda-PROD-West [PROPERTY_BOUND_ACTIVE]', true, 0, NOW() - INTERVAL '20 hours'),
('MYSTRA-KL-2026-897F', 'Airbnb-API-node', true, 130, NOW() - INTERVAL '2 hours'),
('MYSTRA-PG-2026-114B', 'MySTRA Core Engine [TOKEN_CREATED]', true, 0, NOW() - INTERVAL '3 days'),
('MYSTRA-PG-2026-114B', 'Agoda-PROD-West [PROPERTY_BOUND_ACTIVE]', true, 0, NOW() - INTERVAL '2 days'),
('MYSTRA-PG-2026-114B', 'Compliance Interceptor [SUSPENDED_CAP_REACHED]', false, 180, NOW() - INTERVAL '5 hours')
ON CONFLICT DO NOTHING;
