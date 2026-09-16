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
        //
        //         IMPORTANT: 'role' is required here. Without it, the
        //         guard cannot distinguish a real admin from a regular
        //         operator. That distinction is what protects every
        //         admin page from unauthorised access.
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
        // STEP 5: 🔒 ROLE CHECK — reject any non-admin user.
        //
        //         This runs BEFORE any admin data is fetched or rendered.
        //         Without this check, a logged-in operator could simply
        //         type the admin URL and see the compliance dashboard,
        //         the document queue, and potentially approve documents.
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
        // STEP 6: Resolve the officer's display name.
        //         Multiple fallbacks ensure the badge always shows
        //         something meaningful even if the profile is partial.
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