// admin-auth-guard.js
(async function initAdminAuthGuard() {
    // 1. Wait for Supabase client initialization (max ~3 seconds)
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
        const { data: { session }, error } = await window.supabaseClient.auth.getSession();

        // 2. Redirect to login page if unauthenticated
        if (error || !session) {
            console.warn('🔒 Unauthenticated or expired session. Redirecting to login.html');
            window.location.replace('login.html');
            return;
        }

        // 3. Store base session details on window
        window.currentAdminUser = session.user;
        window.currentAdminEmail = session.user.email || session.user.id;

        // 4. Query profile name directly from Supabase
        const { data: profile } = await window.supabaseClient
            .from('profiles')
            .select('full_name, business_name')
            .eq('id', session.user.id)
            .maybeSingle();

        const officerName = profile?.full_name
            || profile?.business_name
            || session.user.user_metadata?.full_name
            || session.user.email?.split('@')[0]
            || 'Executive Officer';

        window.currentAdminName = officerName;

        // 5. Inject officer name into header element
        updateOfficerBadgeDisplay(officerName);

    } catch (err) {
        console.error('Auth Guard Exception:', err);
        window.location.replace('login.html');
    }
})();

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