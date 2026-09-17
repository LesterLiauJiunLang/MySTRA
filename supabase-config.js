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
    // 🏢 PROPERTIES & LISTINGS (all — used by admin)
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

    // 🏢 PROPERTIES filtered by logged-in owner
    async getPropertiesByOwner(userId) {
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
            .eq('owner_id', userId)
            .order('created_at', { ascending: false });
    },

    // 🔑 MYSTRA CODES (all — used by admin)
    async getCodes() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('mystra_codes')
            .select(`
                registration_code,
                property_id,
                owner_id,
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

    // 🔑 MYSTRA CODES filtered by logged-in owner
    async getCodesByOwner(userId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('mystra_codes')
            .select(`
                registration_code,
                property_id,
                owner_id,
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
            .eq('owner_id', userId)
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

    // 📋 INTERCEPTOR AUDIT LOG RECORDER (SUPABASE + LOCAL STORAGE FALLBACK)
    async recordAuditLog({ registrationCode, requestingOta, isValidPass = true, checkedNightsSnapshot = 0, actionDetails = '' }) {
        const timestamp = new Date().toISOString();
        const localEntry = {
            id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            registration_code: registrationCode,
            requesting_ota: requestingOta,
            is_valid_pass: isValidPass,
            checked_nights_snapshot: checkedNightsSnapshot,
            action_details: actionDetails,
            timestamp: timestamp
        };

        // Cache locally so UI is updated immediately even if network or RLS is blocked
        try {
            const cached = JSON.parse(localStorage.getItem('mystra_local_audit_logs') || '[]');
            cached.unshift(localEntry);
            if (cached.length > 100) cached.length = 100;
            localStorage.setItem('mystra_local_audit_logs', JSON.stringify(cached));
        } catch (e) {
            console.warn("Could not cache audit log locally:", e);
        }

        // Write to Supabase table
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('interceptor_audit_logs')
                    .insert([{
                        registration_code: registrationCode,
                        requesting_ota: requestingOta,
                        is_valid_pass: isValidPass,
                        checked_nights_snapshot: checkedNightsSnapshot,
                        timestamp: timestamp
                    }])
                    .select();
                if (error) {
                    console.warn("⚠️ Supabase audit log write notice (saved locally):", error.message);
                }
                return { data: data || [localEntry], error: null };
            } catch (err) {
                console.warn("Supabase audit log insert network error:", err);
            }
        }
        return { data: [localEntry], error: null };
    },

    async createRegistrationCode(codeString, maxLimitCap = 180, propertyId = null, ownerId = null) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        const initialStatus = propertyId ? 'ACTIVE' : 'PENDING_REGISTRATION';

        // Auto-resolve ownerId from active session if not explicitly provided
        let resolvedOwnerId = ownerId;
        if (!resolvedOwnerId) {
            try {
                const { user } = await this.getCurrentUser();
                if (user) resolvedOwnerId = user.id;
            } catch (e) {
                console.warn("Could not retrieve current user for code creation:", e);
            }
        }

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
        if (resolvedOwnerId) {
            payload.owner_id = resolvedOwnerId;
        }

        // 1. Insert into mystra_codes
        const { data, error } = await supabaseClient
            .from('mystra_codes')
            .insert([payload])
            .select();

        if (error) return { data, error };

        // 2. Automatically log State Transition: TOKEN_CREATED in interceptor_audit_logs
        await this.recordAuditLog({
            registrationCode: codeString,
            requestingOta: 'MySTRA Core Engine [TOKEN_CREATED]',
            isValidPass: true,
            checkedNightsSnapshot: 0,
            actionDetails: `[TOKEN_CREATED] Token ${codeString} generated in registry (Pending property binding).`
        });

        return { data, error: null };
    },

    async verifyRegistrationCode(codeString) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('mystra_codes')
            .select(`
                registration_code,
                property_id,
                owner_id,
                code_status,
                booked_nights,
                max_limit_cap,
                properties (
                    id,
                    title,
                    city,
                    state,
                    address
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

        // 2. Assign property owner in properties table if current code has an owner_id
        try {
            const codeObj = Array.isArray(data) ? data[0] : data;
            const ownerId = codeObj?.owner_id;
            if (ownerId && propertyId) {
                await supabaseClient
                    .from('properties')
                    .update({ owner_id: ownerId })
                    .eq('id', propertyId);
            }
        } catch (propErr) {
            console.warn("Could not update property owner:", propErr);
        }

        // 3. Automatically log State Transition: PROPERTY_BOUND_ACTIVE in interceptor_audit_logs
        await this.recordAuditLog({
            registrationCode: codeString,
            requestingOta: `${otaName} [PROPERTY_BOUND_ACTIVE]`,
            isValidPass: true,
            checkedNightsSnapshot: 0,
            actionDetails: `[ACTIVATION] Code ${codeString} bound to property ID ${propertyId} and activated.`
        });

        return { data, error: null };
    },

    // 📋 INTERCEPTOR AUDIT LOGS (MERGED SUPABASE + LOCAL CACHE)
    async getAuditLogs(limit = 50) {
        let remoteLogs = [];
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('interceptor_audit_logs')
                    .select('*')
                    .order('timestamp', { ascending: false })
                    .limit(limit);
                if (!error && data) {
                    remoteLogs = data;
                }
            } catch (e) {
                console.warn("Error fetching Supabase audit logs:", e);
            }
        }

        // Merge with local logs to ensure newly generated / bound actions are always visible
        let localLogs = [];
        try {
            localLogs = JSON.parse(localStorage.getItem('mystra_local_audit_logs') || '[]');
        } catch (e) {}

        const combined = [...localLogs, ...remoteLogs];
        const seen = new Set();
        const deduplicated = [];

        for (const item of combined) {
            const code = item.registration_code || '';
            const ota = item.requesting_ota || '';
            const timeSlice = (item.timestamp || '').substring(0, 16);
            const key = `${code}_${ota}_${timeSlice}`;
            if (!seen.has(key)) {
                seen.add(key);
                deduplicated.push(item);
            }
        }

        deduplicated.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return { data: deduplicated.slice(0, limit), error: null };
    },

    async logInterceptorCheck({ registrationCode, requestingOta, isValidPass, checkedNightsSnapshot }) {
        return await this.recordAuditLog({
            registrationCode,
            requestingOta,
            isValidPass,
            checkedNightsSnapshot,
            actionDetails: `[OTA_CHECK] ${requestingOta} verified code ${registrationCode} (${checkedNightsSnapshot} nights recorded).`
        });
    },

    // 📄 COMPLIANCE DOCUMENTS
    async getComplianceDocuments() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('compliance_documents')
            .select('*')
            .order('uploaded_at', { ascending: false });
    },

    // 👤 GET CURRENT LOGGED-IN USER SESSION
    async getCurrentUser() {
        if (!supabaseClient) return { user: null, error: new Error("Supabase not initialized") };
        const { data, error } = await supabaseClient.auth.getUser();
        return { user: data?.user || null, error };
    },

    // 👤 PROFILES — get by logged-in user's auth session
    async getProfile(profileId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        let targetId = profileId;
        if (!targetId) {
            // Always resolve to the currently authenticated user
            const { data: sessionData } = await supabaseClient.auth.getUser();
            targetId = sessionData?.user?.id;
        }
        if (!targetId) return { data: null, error: new Error("No authenticated user found") };
        return await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', targetId)
            .single();
    },

    async updateProfile(profileId, updates) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('profiles')
            .update(updates)
            .eq('id', profileId)
            .select();
    },
    
    async getAllUsers() {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
            .from('profiles')
            .select('id, full_name, business_name, business_ssm, phone_no, is_verified, role, created_at')
            .order('full_name', { ascending: true });
    },

async getUserProfile(userId) {
    if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
    return await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
},

async getPropertyByOwner(userId) {
    if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
    return await supabaseClient
        .from('properties')
        .select('*')
        .eq('owner_id', userId)
        .limit(1)
        .maybeSingle();
},
    async createProperty(propertyData) {
    if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
    return await supabaseClient
        .from('properties')
        .insert([propertyData])
        .select()
        .single();
},

async updateProperty(propertyId, updates) {
    if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
    return await supabaseClient
        .from('properties')
        .update(updates)
        .eq('id', propertyId)
        .select()
        .single();
},

    // ==============================================================================
    // 📄 COMPLIANCE DOCUMENTS (MODULE 3 - LESTER)
    // ==============================================================================

    async uploadDocument(file, documentType, documentName, userId, propertyId, gpsLatitude, gpsLongitude) {
    if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    
    // 1. Upload file to Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('compliance-document')
        .upload(fileName, file);
    
    if (uploadError) return { data: null, error: uploadError };
    
    // 2. Get public URL
    const { data: urlData } = supabaseClient.storage
        .from('compliance-document')
        .getPublicUrl(fileName);
    
    // 3. Insert into DB - user_id is now REQUIRED
    const payload = {
        user_id: userId,
        property_id: propertyId,
        document_type: documentType,
        document_name: documentName || documentType,
        file_name: file.name,
        file_path: urlData.publicUrl,
        file_size: file.size,
        file_type: file.type,
        gps_latitude: gpsLatitude,
        gps_longitude: gpsLongitude,
        review_status: 'PENDING',   
        status: 'PENDING',           
        uploaded_at: new Date().toISOString()
    };
    
    const { data, error } = await supabaseClient
        .from('compliance_documents')
        .insert([payload])
        .select();
    
    return { data, error };
},

    async getDocumentsByUser(userId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
        .from('compliance_documents')
        .select('*')
        .eq('user_id', userId)
        .order('uploaded_at', { ascending: false });
    },
    
    async getDocumentById(documentId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
        .from('compliance_documents')
        .select('*')
        .eq('id', documentId)
        .single();
    },
    
    async updateDocument(documentId, updates) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        if (updates.review_status) updates.status = updates.review_status;
        return await supabaseClient
        .from('compliance_documents')
        .update(updates)
        .eq('id', documentId)
        .select();
    },

    async deleteDocument(documentId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
        .from('compliance_documents')
        .delete()
        .eq('id', documentId);
    },
    
    // 📍 LOCATION / GPS HELPERS

    async getPropertyCoordinates(propertyId) {
        if (!supabaseClient) return { data: null, error: new Error("Supabase not initialized") };
        return await supabaseClient
        .from('properties')
        .select('latitude, longitude, address')
        .eq('id', propertyId)
        .single();
    },
    
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
              return R * c; // Distance in meters
              },

};





window.MySTRA_API = MySTRA_API;
console.log("⚡ MySTRA Supabase Client Layer configured for:", SUPABASE_URL);



