document.addEventListener('DOMContentLoaded', () => {
    // Initialize view management only on pages containing the Audit Log table or search input
    if (document.getElementById('tbl-audit-body') || document.getElementById('input-audit-search')) {
        window.auditApp = new GovAuditLogDirectory();
    }
});

class GovAuditLogDirectory {
    constructor() {
        this.rawLogs = [];
        this.initRetries = 0;
        this.maxRetries = 30; // Maximum polling retries (approx. 9 seconds)
        this.init();
    }

    async init() {
        if (!window.supabaseClient) {
            if (this.initRetries >= this.maxRetries) {
                console.error('❌ [Audit] Initialization timeout: window.supabaseClient not detected in time.');
                return;
            }
            this.initRetries++;
            setTimeout(() => this.init(), 300);
            return;
        }

        this.bindEvents();
        await this.loadAuditLogs();
    }

    /**
     * Audit log recorder: Writes action logs to the Supabase `interceptor_audit_logs` table.
     *
     * Actor resolution strategy (in priority order):
     *   1. Explicitly passed `performerName` argument (should be a real name, NOT an email)
     *   2. Live lookup from the `profiles` table using the authenticated user's UUID
     *   3. `window.currentAdminName` cache (set by the auth guard)
     *   4. Generic fallback: 'System Admin'
     *
     * IMPORTANT: This method NEVER uses `window.currentAdminEmail` as a name fallback,
     * because emails must not leak into the audit trail as actor identities.
     */
    static async logAction({
        performerName = null,
        registrationCode = null,
        targetDocId = null,
        actionDetails = '',
        isValidPass = true,
        requestingOta = 'GOV_ADMIN'
    }) {
        try {
            if (!window.supabaseClient) {
                console.error('❌ [Audit] Supabase client uninitialized. Cannot write audit log.');
                return { success: false, error: 'Supabase client missing' };
            }

            // ----------------------------------------------------------------
            // STEP 1: Resolve the current authenticated user UUID.
            //         Retry once after a short delay in case the session is
            //         mid-refresh when this method is invoked.
            // ----------------------------------------------------------------
            let officerUuid = null;
            let resolvedName = performerName || window.currentAdminName || null;

            for (let attempt = 0; attempt < 2 && !officerUuid; attempt++) {
                try {
                    const { data: { user } } = await window.supabaseClient.auth.getUser();

                    if (user) {
                        officerUuid = user.id;

                        // ----------------------------------------------------------------
                        // STEP 2: If we still do not have a display name, fetch it
                        //         fresh from the profiles table NOW. This eliminates
                        //         the race condition where the auth guard has not
                        //         finished loading the profile yet.
                        // ----------------------------------------------------------------
                        if (!resolvedName) {
                            const { data: profile } = await window.supabaseClient
                                .from('profiles')
                                .select('full_name, business_name')
                                .eq('id', user.id)
                                .maybeSingle();

                            resolvedName = profile?.full_name
                                || profile?.business_name
                                || user.user_metadata?.full_name
                                || user.email?.split('@')[0]
                                || null;
                        }
                    } else if (attempt === 0) {
                        // Session may be mid-refresh — wait briefly and retry once.
                        await new Promise(r => setTimeout(r, 200));
                    }
                } catch (authErr) {
                    console.warn(`⚠️ [Audit] getUser attempt ${attempt + 1} failed:`, authErr.message);
                }
            }

            // ----------------------------------------------------------------
            // STEP 3: Final fallback chain.
            //         NOTE: window.currentAdminEmail is intentionally EXCLUDED.
            //         An email must never appear as an actor identity.
            // ----------------------------------------------------------------
            const safePerformer = resolvedName
                || window.currentAdminName
                || 'System Admin';

            const formattedActionDetails = `[Actor: ${safePerformer}] ${actionDetails}`;

            // ----------------------------------------------------------------
            // STEP 4: Build the database payload
            // ----------------------------------------------------------------
            const insertPayload = {
                registration_code: registrationCode,
                target_doc_id: targetDocId,
                action_details: formattedActionDetails,
                is_valid_pass: isValidPass,
                requesting_ota: requestingOta
            };

            if (officerUuid) {
                insertPayload.officer_id = officerUuid;
            }

            // ----------------------------------------------------------------
            // STEP 5: Insert the audit record
            // ----------------------------------------------------------------
            const { data, error } = await window.supabaseClient
                .from('interceptor_audit_logs')
                .insert([insertPayload])
                .select();

            if (error) {
                console.error('❌ [Audit] Supabase database insertion failed:', error.message);
                return { success: false, error: error.message };
            }

            console.log('✅ [Audit] Log successfully written to Supabase:', data);

            // ----------------------------------------------------------------
            // STEP 6: Auto-refresh the audit table UI if it is currently open
            // ----------------------------------------------------------------
            if (window.auditApp && typeof window.auditApp.loadAuditLogs === 'function') {
                await window.auditApp.loadAuditLogs();
            }

            return { success: true, data };
        } catch (err) {
            console.error('❌ [Audit] Unexpected exception while logging audit:', err);
            return { success: false, error: err.message };
        }
    }

    // Instance wrapper for logAction
    async recordAudit(params) {
        return await GovAuditLogDirectory.logAction(params);
    }

    bindEvents() {
        const searchInput = document.getElementById('input-audit-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => this.filterLogs(), 200));
        }

        const selectFilter = document.getElementById('select-audit-filter') ||
                             document.getElementById('select-audit-action') ||
                             document.querySelector('select');

        if (selectFilter) {
            selectFilter.addEventListener('change', () => this.filterLogs());
        }
    }

    async loadAuditLogs() {
        const tableBody = document.getElementById('tbl-audit-body');
        const countLabel = document.getElementById('lbl-audit-count') || document.getElementById('total-recorded-logs');

        try {
            // 1. Query raw audit logs ordered descending by timestamp directly from DB
            const { data: logs, error: logErr } = await window.supabaseClient
                .from('interceptor_audit_logs')
                .select('*')
                .order('timestamp', { ascending: false });

            if (logErr) {
                throw new Error(logErr.message);
            }

            let logData = logs || [];

            // 2. Extract unique officer_ids to batch query user profiles
            const officerIds = [...new Set(logData.map(l => l.officer_id).filter(Boolean))];
            const profileMap = {};

            if (officerIds.length > 0) {
                try {
                    const { data: profiles } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, role')
                        .in('id', officerIds);

                    if (profiles && Array.isArray(profiles)) {
                        profiles.forEach(p => {
                            if (p && p.id) {
                                profileMap[p.id] = p;
                            }
                        });
                    }
                } catch (pErr) {
                    console.warn('⚠️ [Audit] Failed to load profiles list. Fallback to [Actor: xxx] tag parsing:', pErr);
                }
            }

            // 3. Map profile details to logs
            this.rawLogs = logData.map(log => ({
                ...log,
                profiles: log.officer_id ? (profileMap[log.officer_id] || null) : null
            }));

            if (this.rawLogs.length === 0) {
                if (tableBody) tableBody.innerHTML = '';
                this.toggleEmptyState(true);
                if (countLabel) countLabel.innerText = '0';
                return;
            }

            this.toggleEmptyState(false);
            this.renderRows(this.rawLogs);

        } catch (err) {
            console.error('❌ [Audit] Exception while loading audit logs:', err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="color:#EF4444; text-align:center; padding:20px;">Failed to load audit logs: ${this.escapeHtml(err.message)}</td></tr>`;
            }
        }
    }

    renderRows(logs) {
        const tableBody = document.getElementById('tbl-audit-body');
        const countLabel = document.getElementById('lbl-audit-count') || document.getElementById('total-recorded-logs');

        if (countLabel) countLabel.innerText = logs.length.toString();

        if (logs.length === 0) {
            if (tableBody) tableBody.innerHTML = '';
            this.toggleEmptyState(true);
            return;
        }

        this.toggleEmptyState(false);

        if (tableBody) {
            tableBody.innerHTML = logs.map(log => {
                const logTime = log.timestamp || log.created_at;
                const formattedDate = logTime ? new Date(logTime).toLocaleString() : 'N/A';

                let rawDetails = String(log.action_details || 'Application Audit Update');

                // 1. Prioritize full_name from the profiles table (set via officer_id lookup)
                let adminName = log.profiles?.full_name;

                // 2. Extract [Actor: xxx] prefix and sanitize raw details
                const actorMatch = rawDetails.match(/^\[Actor:\s*([^\]]+)\]\s*(.*)$/);
                if (actorMatch) {
                    if (!adminName) {
                        adminName = actorMatch[1];
                    }
                    rawDetails = actorMatch[2]; // Restore original description text
                }

                // 3. Default fallback value
                if (!adminName) {
                    adminName = 'System Admin';
                }

                const officerUuid = log.officer_id
                    ? `#${String(log.officer_id).substring(0, 8)}`
                    : (log.requesting_ota || 'GOV_ADMIN');

                const docRef = log.registration_code
                    ? `#${String(log.registration_code).substring(0, 12)}`
                    : (log.target_doc_id ? `#${String(log.target_doc_id).substring(0, 8)}` : 'N/A');

                let actionText = rawDetails;
                let statusBadge = '';

                const searchContent = `${adminName} ${officerUuid} ${rawDetails} ${log.status || ''}`.toUpperCase();

                if (searchContent.includes('APPROVED') || log.is_valid_pass === true) {
                    actionText = rawDetails || 'Application Approved & Verified';
                    statusBadge = `<span class="badge-pass" style="background:#D1FAE5; color:#065F46; padding:4px 8px; border-radius:4px; font-weight:700; font-size:11px;">APPROVED</span>`;
                } else if (searchContent.includes('REJECTED') || searchContent.includes('FAIL')) {
                    actionText = rawDetails || 'Application Rejected';
                    statusBadge = `<span class="badge-fail" style="background:#FEE2E2; color:#991B1B; padding:4px 8px; border-radius:4px; font-weight:700; font-size:11px;">REJECTED</span>`;
                } else if (searchContent.includes('REUPLOAD') || searchContent.includes('REVISION')) {
                    actionText = rawDetails || 'Re-upload Requested';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEF3C7; color: #92400E;">REVISION REQ</span>`;
                } else {
                    actionText = rawDetails || 'Application Flagged / Action Required';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEF3C7; color: #92400E;">ACTION REQ</span>`;
                }

                const safeAdminName = this.escapeHtml(adminName);
                const safeOfficerUuid = this.escapeHtml(officerUuid);
                const safeDocRef = this.escapeHtml(docRef);
                const safeActionText = this.escapeHtml(actionText);
                const safeFormattedDate = this.escapeHtml(formattedDate);

                return `
                    <tr style="border-bottom: 1px solid #E2E8F0;">
                        <td style="font-family: monospace; color: #475569; white-space: nowrap; padding: 12px 16px;">
                            ${safeFormattedDate}
                        </td>
                        <td style="padding: 12px 16px;">
                            <div style="font-weight: 600; color: #0F172A;">🛡️ ${safeAdminName}</div>
                            <div style="font-size: 11px; color: #64748B; font-family: monospace;">ID: ${safeOfficerUuid}</div>
                        </td>
                        <td style="font-family: monospace; color: #2563EB; font-weight: 600; padding: 12px 16px;">
                            ${safeDocRef}
                        </td>
                        <td style="color: #334155; padding: 12px 16px;">
                            ${safeActionText}
                        </td>
                        <td style="padding: 12px 16px;">
                            ${statusBadge}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    filterLogs() {
        const searchInput = document.getElementById('input-audit-search');
        const selectFilter = document.getElementById('select-audit-filter') ||
                             document.getElementById('select-audit-action') ||
                             document.querySelector('select');

        const rawQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cleanQuery = rawQuery.replace(/^#/, '');

        const selectedVal = selectFilter ? selectFilter.value.toUpperCase() : 'ALL';

        const filtered = this.rawLogs.filter(log => {
            const targetDocId = (log.target_doc_id || '').toLowerCase();
            const regCode = (log.registration_code || '').toLowerCase();
            const officerId = (log.officer_id || '').toLowerCase();
            const rawDetails = String(log.action_details || '');

            let adminName = (log.profiles?.full_name || '').toLowerCase();
            let cleanedDetails = rawDetails.toLowerCase();

            const actorMatch = rawDetails.match(/^\[Actor:\s*([^\]]+)\]\s*(.*)$/);
            if (actorMatch) {
                if (!adminName) {
                    adminName = actorMatch[1].toLowerCase();
                }
                cleanedDetails = actorMatch[2].toLowerCase();
            }

            if (!adminName) {
                adminName = 'system admin';
            }

            const logTime = log.timestamp || log.created_at;
            const dateStr = logTime ? new Date(logTime).toLocaleString().toLowerCase() : '';

            const matchesSearch = !rawQuery ||
                targetDocId.includes(cleanQuery) ||
                regCode.includes(cleanQuery) ||
                officerId.includes(rawQuery) ||
                adminName.includes(rawQuery) ||
                cleanedDetails.includes(rawQuery) ||
                dateStr.includes(rawQuery);

            let matchesStatus = true;
            const fullLogStr = `${adminName} ${officerId} ${rawDetails} ${log.status || ''}`.toUpperCase();

            if (selectedVal !== 'ALL') {
                if (selectedVal === 'APPROVED') {
                    matchesStatus = log.is_valid_pass === true || fullLogStr.includes('APPROVED');
                } else if (selectedVal === 'REJECTED') {
                    matchesStatus = fullLogStr.includes('REJECTED') || fullLogStr.includes('FAIL');
                } else if (selectedVal === 'REUPLOAD_REQUESTED' || selectedVal === 'REVISION') {
                    matchesStatus = fullLogStr.includes('REUPLOAD') || fullLogStr.includes('REVISION');
                }
            }

            return matchesSearch && matchesStatus;
        });

        this.renderRows(filtered);
    }

    toggleEmptyState(show) {
        const emptyState = document.getElementById('audit-empty-state') || document.getElementById('no-audit-logs-msg');
        if (!emptyState) return;

        if (show) {
            emptyState.classList.remove('hidden');
            emptyState.style.display = 'block';
        } else {
            emptyState.classList.add('hidden');
            emptyState.style.display = 'none';
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
}

window.GovAuditLogDirectory = GovAuditLogDirectory;

/**
 * Global Admin Logout Handler
 * Captures active logged-in officer identity, logs audit action, and signs out.
 *
 * NOTE: performerName is intentionally OMITTED from the logAction call.
 *       The logAction method resolves the officer's real name from the
 *       profiles table using the live authenticated session — which is
 *       always accurate and never falls back to the email.
 */
async function handleLogout(event) {
    if (event) event.preventDefault();

    if (!window.supabaseClient) {
        console.error('❌ Supabase client uninitialized');
        return;
    }

    try {
        // 1. Write the logout audit entry FIRST, while the session is still active
        if (window.GovAuditLogDirectory && typeof window.GovAuditLogDirectory.logAction === 'function') {
            try {
                await window.GovAuditLogDirectory.logAction({
                    actionDetails: 'Admin user logged out successfully',
                    isValidPass: true,
                    requestingOta: 'GOV_ADMIN'
                });
            } catch (auditErr) {
                console.warn('⚠️ Non-blocking logout audit log failure:', auditErr);
            }
        }

        // 2. Perform Supabase Sign Out
        const { error } = await window.supabaseClient.auth.signOut();

        if (error) {
            alert('Logout Failed: ' + error.message);
            return;
        }

        // 3. Clear local/session storage and redirect to login
        localStorage.clear();
        sessionStorage.clear();
        window.location.replace('login.html');

    } catch (err) {
        console.error('❌ Logout Exception:', err);
    }
}