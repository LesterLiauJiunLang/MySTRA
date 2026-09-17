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
        // STEP 7: 📝 LOGIN AUDIT — write a "logged in" entry once per session
        //
        //   Why "once per session"?
        //   The guard runs on every admin page (Dashboard, Documents,
        //   Reports, Verified, Audit). If we logged on every run, the
        //   audit trail would show dozens of "logged in" rows for a
        //   single admin session — one per page navigation — which is
        //   not what "logged in" means.
        //
        //   We use sessionStorage as the "already audited" flag. It:
        //     • Persists across page navigations in the same tab
        //     • Clears automatically on logout (sessionStorage.clear())
        //     • Is per-tab — a new tab = a new session = a new entry
        //
        //   Result: exactly one "Admin logged in" entry per real login.
        // ----------------------------------------------------------------
        const LOGIN_FLAG_KEY = 'mystra_admin_login_audited';

        if (sessionStorage.getItem(LOGIN_FLAG_KEY) !== '1') {
            try {
                if (window.GovAuditLogDirectory
                    && typeof window.GovAuditLogDirectory.logAction === 'function') {
                    // Preferred path — uses the shared audit writer
                    await window.GovAuditLogDirectory.logAction({
                        actionDetails: 'Admin user logged in successfully',
                        isValidPass: true,
                        requestingOta: 'ADMIN_PORTAL'
                    });
                } else {
                    // Fallback — direct insert with an explicit actor tag
                    await window.supabaseClient
                        .from('interceptor_audit_logs')
                        .insert([{
                            action_details: `[Actor: ${officerName}] Admin user logged in successfully`,
                            requesting_ota: 'ADMIN_PORTAL',
                            is_valid_pass: true,
                            checked_nights_snapshot: 0,
                            officer_id: session.user.id,
                            timestamp: new Date().toISOString()
                        }]);
                }
                console.log('✅ Login audit entry written.');

                // Mark this session as audited so subsequent page loads skip it
                sessionStorage.setItem(LOGIN_FLAG_KEY, '1');
            } catch (auditErr) {
                // Non-blocking: a failed login audit must not lock the admin out
                console.warn('⚠️ Non-blocking login audit failure:', auditErr);
            }
        } else {
            console.log('ℹ️ Login already audited for this session — skipping.');
        }

        // ----------------------------------------------------------------
        // STEP 8: Inject officer name into the header element
        // ----------------------------------------------------------------
        updateOfficerBadgeDisplay(officerName);

    } catch (err) {
        console.error('Auth Guard Exception:', err);
        window.location.replace('login.html');
    }
})();

/**
 * Injects the officer's display name into the header session badge.
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
 * Clears the login flag when signing out, so the next login
 * produces a fresh "Admin logged in" entry.
 */
async function handleLogout(event) {
    if (event) event.preventDefault();

    if (!window.supabaseClient) {
        console.error('❌ Supabase client uninitialized');
        window.location.replace('login.html');
        return;
    }

    try {
        if (window.GovAuditLogDirectory
            && typeof window.GovAuditLogDirectory.logAction === 'function') {
            await window.GovAuditLogDirectory.logAction({
                actionDetails: 'Admin user logged out successfully',
                isValidPass: true,
                requestingOta: 'ADMIN_PORTAL'
            });
        } else {
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
        console.warn('⚠️ Non-blocking logout audit log failure:', auditErr);
    }

    try {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) console.warn('Sign-out warning:', error.message);
    } catch (signOutErr) {
        console.warn('Sign-out exception:', signOutErr);
    }

    try {
        // ⚠️ sessionStorage.clear() also removes the login audit flag
        // — this is what makes the next login produce a new entry.
        localStorage.clear();
        sessionStorage.clear();
    } catch (storageErr) {
        console.warn('Storage clear warning:', storageErr);
    }

    window.location.replace('login.html');
}