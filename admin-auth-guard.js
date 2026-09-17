// admin-auth-guard.js
(async function initAdminAuthGuard() {
    // ----------------------------------------------------------------
    // STEP 1: Wait for Supabase client initialization (max ~3 seconds)
    // ----------------------------------------------------------------
    let tries = 0;
    while (!window.supabaseClient && tries < 60) {
        await new Promise(r => setTimeout(r, 50));
        tries++;
    }
    if (!window.supabaseClient) {
        console.error('Supabase client never initialized');
        window.location.replace('login.html');
        return;
    }

    try {
        // ----------------------------------------------------------------
        // STEP 2: Check for an authenticated session
        // ----------------------------------------------------------------
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();

        if (error || !session) {
            console.warn('🔒 Unauthenticated or expired session. Redirecting to login.html');
            window.location.replace('login.html');
            return;
        }

        // ----------------------------------------------------------------
        // STEP 3: Store base session details on window
        // ----------------------------------------------------------------
        window.currentAdminUser  = session.user;
        window.currentAdminEmail = session.user.email || session.user.id;

        // ----------------------------------------------------------------
        // STEP 4: Query profile name AND role from Supabase
        // ----------------------------------------------------------------
        const { data: profile, error: profileErr } = await window.supabaseClient
            .from('profiles')
            .select('full_name, business_name, role')
            .eq('id', session.user.id)
            .maybeSingle();

        if (profileErr) {
            console.error('Auth Guard: failed to load profile:', profileErr.message);
            window.location.replace('login.html');
            return;
        }

        // ----------------------------------------------------------------
        // STEP 5: 🔒 ROLE CHECK — reject any non-admin user
        // ----------------------------------------------------------------
        const userRole = profile?.role;
        const isAuthorised = userRole === 'admin' || userRole === 'gov_admin';

        if (!isAuthorised) {
            console.warn(`🚫 Access denied: role "${userRole}" is not permitted on admin pages.`);
            alert('Access Denied: You do not have permission to view the admin panel.');
            window.location.replace('index.html');
            return;
        }

        // ----------------------------------------------------------------
        // STEP 6: Resolve the officer's display name (multi-level fallback)
        // ----------------------------------------------------------------
        const officerName = profile?.full_name
            || profile?.business_name
            || session.user.user_metadata?.full_name
            || session.user.email?.split('@')[0]
            || 'Executive Officer';

        window.currentAdminName = officerName;

        // ----------------------------------------------------------------
        // STEP 7: Inject officer name into the header element
        // ----------------------------------------------------------------
        updateOfficerBadgeDisplay(officerName);

    } catch (err) {
        console.error('Auth Guard Exception:', err);
        window.location.replace('login.html');
    }
})();

/**
 * Injects the officer's display name into the header session badge.
 * Waits for DOMContentLoaded if the page is still loading.
 */
function updateOfficerBadgeDisplay(name) {
    const update = () => {
        const adminLabel = document.getElementById('lbl-admin-name');
        if (adminLabel) adminLabel.textContent = name;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', update);
    } else {
        update();
    }
}

/**
 * ================================================================
 * CONSOLIDATED ADMIN LOGOUT HANDLER
 * ================================================================
 *
 * This is the SINGLE source of truth for admin logout across all
 * admin pages. It replaces the five conflicting `handleLogout`
 * functions that previously lived in:
 *
 *   - gov-admin-audit.js
 *   - gov-admin-document.js
 *   - gov-admin-dashboard.js
 *   - gov-admin-verified.js
 *   - gov-admin-reports.js
 *
 * Those files MUST NOT define their own `handleLogout` — otherwise
 * the load order determines which version runs, causing unpredictable
 * behaviour (different audit logging, different redirect targets).
 *
 * Design notes:
 *   - Writes an audit log entry FIRST (while the session is alive)
 *   - Uses `GovAuditLogDirectory.logAction` if loaded on the page;
 *     otherwise falls back to a direct insert into interceptor_audit_logs
 *   - Never blocks logout on a failed audit write (best-effort)
 *   - performerName is omitted — logAction() resolves the officer's
 *     real name from the profiles table via the live session
 */
async function handleLogout(event) {
    if (event) event.preventDefault();

    if (!window.supabaseClient) {
        console.error('❌ Supabase client uninitialized');
        window.location.replace('login.html');
        return;
    }

    // ----------------------------------------------------------------
    // STEP 1: Best-effort audit log write, BEFORE the session is
    //         destroyed. Uses the shared GovAuditLogDirectory if
    //         present; otherwise falls back to a direct insert.
    // ----------------------------------------------------------------
    try {
        if (window.GovAuditLogDirectory
            && typeof window.GovAuditLogDirectory.logAction === 'function') {
            await window.GovAuditLogDirectory.logAction({
                actionDetails: 'Admin user logged out successfully',
                isValidPass: true,
                requestingOta: 'ADMIN_PORTAL'
            });
        } else {
            // Fallback — same pattern used in document decisions
            let performerName = window.currentAdminName;
            if (!performerName) {
                try {
                    const { data: { user } } = await window.supabaseClient.auth.getUser();
                    if (user) {
                        const { data: profile } = await window.supabaseClient
                            .from('profiles')
                            .select('full_name, business_name')
                            .eq('id', user.id)
                            .maybeSingle();

                        performerName = profile?.full_name
                            || profile?.business_name
                            || user.user_metadata?.full_name
                            || user.email?.split('@')[0]
                            || 'System Admin';
                    }
                } catch (lookupErr) {
                    console.warn('⚠️ [Logout] Could not resolve officer name:', lookupErr.message);
                }
            }
            performerName = performerName || 'System Admin';

            await window.supabaseClient
                .from('interceptor_audit_logs')
                .insert([{
                    action_details: `[Actor: ${performerName}] Admin user logged out successfully`,
                    requesting_ota: 'ADMIN_PORTAL',
                    is_valid_pass: true,
                    checked_nights_snapshot: 0,
                    timestamp: new Date().toISOString()
                }]);
        }
    } catch (auditErr) {
        // A failed audit write must NOT prevent the user from logging out.
        console.warn('⚠️ Non-blocking logout audit log failure:', auditErr);
    }

    // ----------------------------------------------------------------
    // STEP 2: Perform Supabase sign-out
    // ----------------------------------------------------------------
    try {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) {
            console.warn('Sign-out warning:', error.message);
            // Continue anyway — clear local state and redirect
        }
    } catch (signOutErr) {
        console.warn('Sign-out exception:', signOutErr);
    }

    // ----------------------------------------------------------------
    // STEP 3: Clear local + session storage and redirect to login
    // ----------------------------------------------------------------
    try {
        localStorage.clear();
        sessionStorage.clear();
    } catch (storageErr) {
        console.warn('Storage clear warning:', storageErr);
    }

    window.location.replace('login.html');
}