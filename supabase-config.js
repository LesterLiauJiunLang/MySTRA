// ==============================================================================
// ⚡ SUPABASE CORE CONFIGURATION & CLIENT INITIALIZATION
// ==============================================================================

const SUPABASE_URL = "https://lpovahpueihltaclwzzy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxwb3ZhaHB1ZWlobHRhY2x3enp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MDI0NjgsImV4cCI6MjEwMjQ3ODQ2OH0.TtSAsdEhn5ZOLiqEsLcXxB5RoPn2XIv6hd4l6v906sU";

// Ensure Supabase JS library is loaded
if (typeof window.supabase === 'undefined' && typeof createClient === 'undefined') {
    console.error("❌ Supabase client library not found. Please ensure '@supabase/supabase-js' script is included.");
}

// Initialize Supabase Client Instance
const supabaseClient = (window.supabase && window.supabase.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : (typeof createClient !== 'undefined' ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null);

// Attach globally for accessibility across scripts
window.supabaseClient = supabaseClient;

// ==============================================================================
// 🛠️ REUSABLE DATABASE API SERVICE LAYER
// ==============================================================================

const MySTRA_API = {
    // 🏢 PROPERTIES & LISTINGS
    async getProperties() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('properties')
            .select(`
                id,
                owner_id,
                title,
                address,
                city,
                state,
                latitude,
                longitude,
                created_at,
                mystra_codes (
                    registration_code,
                    code_status,
                    booked_nights,
                    max_limit_cap,
                    generated_at
                )
            `)
            .order('created_at', { ascending: false });
    },

    // 🔑 MYSTRA CODES
    async getCodes() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('mystra_codes')
            .select(`
                registration_code,
                property_id,
                code_status,
                booked_nights,
                max_limit_cap,
                generated_at,
                properties (
                    id,
                    title,
                    city,
                    state
                )
            `)
            .order('generated_at', { ascending: false });
    },

    async getPendingUnusedCode() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('mystra_codes')
            .select('*')
            .is('property_id', null)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
    },

    async createRegistrationCode(codeString, maxLimitCap = 180, propertyId = null) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        const initialStatus = propertyId ? 'ACTIVE' : 'PENDING_REGISTRATION';
        const payload = {
            registration_code: codeString,
            code_status: initialStatus,
            booked_nights: 0,
            max_limit_cap: maxLimitCap,
            generated_at: new Date().toISOString()
        };
        if (propertyId) {
            payload.property_id = propertyId;
        }

        // 1. Insert into mystra_codes
        const { data, error } = await supabaseClient
            .from('mystra_codes')
            .insert([payload])
            .select();

        if (error) return { data, error };

        // 2. Automatically log State Transition: TOKEN_CREATED in interceptor_audit_logs
        try {
            await supabaseClient
                .from('interceptor_audit_logs')
                .insert([{
                    registration_code: codeString,
                    requesting_ota: 'MySTRA Core Engine [TOKEN_CREATED]',
                    is_valid_pass: true,
                    checked_nights_snapshot: 0,
                    timestamp: new Date().toISOString()
                }]);
        } catch (logErr) {
            console.warn("Could not write creation audit log:", logErr);
        }

        return { data, error: null };
    },

    async verifyRegistrationCode(codeString) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('mystra_codes')
            .select(`
                registration_code,
                property_id,
                code_status,
                booked_nights,
                max_limit_cap,
                properties (
                    id,
                    title,
                    city,
                    state
                )
            `)
            .eq('registration_code', codeString)
            .maybeSingle();
    },

    async bindRegistrationCodeToProperty(codeString, propertyId, otaName = 'Agoda-PROD-West') {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        
        // 1. Update the code record in mystra_codes to ACTIVE and link to target property
        const { data, error } = await supabaseClient
            .from('mystra_codes')
            .update({
                property_id: propertyId,
                code_status: 'ACTIVE',
                booked_nights: 0,
                max_limit_cap: 180
            })
            .eq('registration_code', codeString)
            .select();

        if (error) {
            console.error("Bind error:", error);
            return { data: null, error };
        }

        // 2. Automatically log State Transition: PROPERTY_BOUND_ACTIVE in interceptor_audit_logs
        try {
            await supabaseClient
                .from('interceptor_audit_logs')
                .insert([{
                    registration_code: codeString,
                    requesting_ota: `${otaName} [PROPERTY_BOUND_ACTIVE]`,
                    is_valid_pass: true,
                    checked_nights_snapshot: 0,
                    timestamp: new Date().toISOString()
                }]);
        } catch (logErr) {
            console.warn("Could not write binding audit log:", logErr);
        }

        return { data, error: null };
    },

    // 📋 INTERCEPTOR AUDIT LOGS
    async getAuditLogs(limit = 50) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('interceptor_audit_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);
    },

    async logInterceptorCheck({ registrationCode, requestingOta, isValidPass, checkedNightsSnapshot }) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('interceptor_audit_logs')
            .insert([{
                registration_code: registrationCode,
                requesting_ota: requestingOta,
                is_valid_pass: isValidPass,
                checked_nights_snapshot: checkedNightsSnapshot,
                timestamp: new Date().toISOString()
            }])
            .select();
    },

    // 📄 COMPLIANCE DOCUMENTS
    async getComplianceDocuments() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('compliance_documents')
            .select('*')
            .order('uploaded_at', { ascending: false });
    },

    // 👤 PROFILES
    async getProfile(profileId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        let query = supabaseClient.from('profiles').select('*');
        if (profileId) {
            query = query.eq('id', profileId).single();
        } else {
            query = query.limit(1).single();
        }
        return await query;
    },

    async updateProfile(profileId, updates) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('profiles')
            .update(updates)
            .eq('id', profileId)
            .select();
    }
};

window.MySTRA_API = MySTRA_API;
console.log("⚡ MySTRA Supabase Client Layer configured for:", SUPABASE_URL);
