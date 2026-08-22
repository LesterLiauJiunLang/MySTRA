document.addEventListener('DOMContentLoaded', () => {
    window.auditApp = new GovAuditLogDirectory();
});

class GovAuditLogDirectory {
    constructor() {
        this.rawLogs = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadAuditLogs();
    }

    bindEvents() {
        const searchInput = document.getElementById('input-audit-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterLogs());
        }
    }

    async loadAuditLogs() {
        const tableBody = document.getElementById('tbl-audit-body');
        const emptyState = document.getElementById('audit-empty-state');
        const countLabel = document.getElementById('lbl-audit-count');

        if (!window.supabaseClient) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center; padding:20px;">Database connection unavailable.</td></tr>`;
            }
            return;
        }

        try {
            // Filter query to ONLY load actions performed by GOV_ADMIN
            const { data: logs, error } = await window.supabaseClient
                .from('interceptor_audit_logs')
                .select('*')
                .ilike('requesting_ota', '%GOV_ADMIN%')
                .order('timestamp', { ascending: false });

            if (error) throw error;

            this.rawLogs = logs || [];

            if (this.rawLogs.length === 0) {
                if (tableBody) tableBody.innerHTML = '';
                emptyState?.classList.remove('hidden');
                if (countLabel) countLabel.innerText = '0';
                return;
            }

            emptyState?.classList.add('hidden');
            this.renderRows(this.rawLogs);

        } catch (err) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center; padding:20px;">Error loading logs: ${err.message}</td></tr>`;
            }
        }
    }

    renderRows(logs) {
        const tableBody = document.getElementById('tbl-audit-body');
        const countLabel = document.getElementById('lbl-audit-count');
        const emptyState = document.getElementById('audit-empty-state');

        if (countLabel) countLabel.innerText = logs.length.toString();

        if (logs.length === 0) {
            if (tableBody) tableBody.innerHTML = '';
            emptyState?.classList.remove('hidden');
            return;
        }

        emptyState?.classList.add('hidden');

        if (tableBody) {
            tableBody.innerHTML = logs.map(log => {
                const formattedDate = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A';
                const isPass = log.is_valid_pass === true;
                const rawActor = log.requesting_ota || 'GOV_ADMIN [ADM-MYSTRA-2026]';
                const docRef = log.registration_code ? `#${log.registration_code.toString().substring(0, 12)}` : 'N/A';

                // Extract officer ID cleanly from the text string
                const officerMatch = rawActor.match(/\[(.*?)\]/);
                const officerId = officerMatch ? officerMatch[1] : 'ADM-MYSTRA-2026';

                return `
                    <tr style="border-bottom: 1px solid #E2E8F0;">
                        <td style="font-family: monospace; color: #475569; white-space: nowrap;">
                            ${formattedDate}
                        </td>
                        <td style="font-weight: 600; color: #0F172A;">
                            🛡️ ${officerId}
                        </td>
                        <td style="font-family: monospace; color: #2563EB; font-weight:600;">
                            ${docRef}
                        </td>
                        <td style="color: #334155;">
                            ${isPass ? 'Application Approved & Verified' : 'Application Flagged / Re-upload Requested'}
                        </td>
                        <td>
                            <span class="badge ${isPass ? 'badge-pass' : 'badge-fail'}">
                                ${isPass ? 'APPROVED' : 'ACTION REQUIRED'}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    filterLogs() {
        const searchInput = document.getElementById('input-audit-search');
        if (!searchInput) return;

        const query = searchInput.value.toLowerCase();
        const filtered = this.rawLogs.filter(log => {
            const actor = (log.requesting_ota || '').toLowerCase();
            const docId = (log.registration_code || '').toLowerCase();
            const dateStr = (log.timestamp || '').toLowerCase();

            return actor.includes(query) || docId.includes(query) || dateStr.includes(query);
        });

        this.renderRows(filtered);
    }
}