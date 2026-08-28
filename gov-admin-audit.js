document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we are on the Audit Log page
    if (document.getElementById('tbl-audit-body') || document.getElementById('input-audit-search')) {
        window.auditApp = new GovAuditLogDirectory();
    }
});

class GovAuditLogDirectory {
    constructor() {
        this.rawLogs = [];
        this.init();
    }

    async init() {
        if (!window.supabaseClient) {
            setTimeout(() => this.init(), 300);
            return;
        }
        this.bindEvents();
        await this.loadAuditLogs();
    }

    bindEvents() {
        // 1. 绑定搜索输入框
        const searchInput = document.getElementById('input-audit-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterLogs());
        }

        // 2. 绑定下拉筛选菜单（自动识别常见 ID 或页面中的 select 元素）
        const selectFilter = document.getElementById('select-audit-action') || 
                             document.getElementById('select-action-filter') || 
                             document.getElementById('select-audit-status') ||
                             document.getElementById('select-status-filter') ||
                             document.querySelector('select');

        if (selectFilter) {
            selectFilter.addEventListener('change', () => this.filterLogs());
        }
    }

    async loadAuditLogs() {
        const tableBody = document.getElementById('tbl-audit-body');
        const countLabel = document.getElementById('lbl-audit-count') || document.getElementById('total-recorded-logs');

        try {
            let { data: logs, error } = await window.supabaseClient
                .from('interceptor_audit_logs')
                .select('*')
                .ilike('requesting_ota', '%GOV_ADMIN%')
                .order('timestamp', { ascending: false });

            if (error) {
                console.warn('Audit query fallback activated:', error.message);
                const fallback = await window.supabaseClient
                    .from('interceptor_audit_logs')
                    .select('*')
                    .order('timestamp', { ascending: false });
                logs = fallback.data;
            }

            this.rawLogs = logs || [];

            if (this.rawLogs.length === 0) {
                if (tableBody) tableBody.innerHTML = '';
                this.toggleEmptyState(true);
                if (countLabel) countLabel.innerText = '0';
                return;
            }

            this.toggleEmptyState(false);
            this.renderRows(this.rawLogs);

        } catch (err) {
            console.error('Error loading audit logs:', err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="color:#EF4444; text-align:center; padding:20px;">Error loading logs: ${err.message}</td></tr>`;
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
                const formattedDate = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A';
                const rawActor = log.requesting_ota || 'GOV_ADMIN [ADM-MYSTRA-2026]';
                const docRef = log.registration_code ? `#${log.registration_code.toString().substring(0, 12)}` : 'N/A';

                const officerMatch = rawActor.match(/\[(.*?)\]/);
                const officerId = officerMatch ? officerMatch[1] : 'ADM-MYSTRA-2026';

                let actionText = 'Application Audit Update';
                let statusBadge = '';

                if (rawActor.includes('APPROVED') || log.is_valid_pass === true) {
                    actionText = 'Application Approved & Verified';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #D1FAE5; color: #065F46;">APPROVED</span>`;
                } else if (rawActor.includes('REJECTED')) {
                    actionText = 'Application Rejected';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEE2E2; color: #991B1B;">REJECTED</span>`;
                } else if (rawActor.includes('REUPLOAD') || rawActor.includes('REVISION')) {
                    actionText = 'Re-upload Requested';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEF3C7; color: #92400E;">REVISION REQ</span>`;
                } else {
                    actionText = 'Application Flagged / Action Required';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEF3C7; color: #92400E;">ACTION REQ</span>`;
                }

                return `
                    <tr style="border-bottom: 1px solid #E2E8F0;">
                        <td style="font-family: monospace; color: #475569; white-space: nowrap; padding: 12px;">
                            ${formattedDate}
                        </td>
                        <td style="font-weight: 600; color: #0F172A; padding: 12px;">
                            🛡️ ${officerId}
                        </td>
                        <td style="font-family: monospace; color: #2563EB; font-weight: 600; padding: 12px;">
                            ${docRef}
                        </td>
                        <td style="color: #334155; padding: 12px;">
                            ${actionText}
                        </td>
                        <td style="padding: 12px;">
                            ${statusBadge}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    filterLogs() {
        const searchInput = document.getElementById('input-audit-search');
        const selectFilter = document.getElementById('select-audit-action') || 
                             document.getElementById('select-action-filter') || 
                             document.getElementById('select-audit-status') ||
                             document.getElementById('select-status-filter') ||
                             document.querySelector('select');

        const rawQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cleanQuery = rawQuery.replace(/^#/, '');

        // 获取下拉框当前选中的值或文字
        let selectedVal = '';
        if (selectFilter) {
            const opt = selectFilter.options[selectFilter.selectedIndex];
            selectedVal = (opt ? (opt.value || opt.text) : '').toLowerCase();
        }

        const filtered = this.rawLogs.filter(log => {
            const targetDocId = (log.target_doc_id || '').toLowerCase();
            const regCode = (log.registration_code || '').toLowerCase();
            const actor = (log.requesting_ota || log.officer_id || '').toLowerCase();
            const details = (log.action_details || '').toLowerCase();
            const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString().toLowerCase() : '';

            // 1. 检查文本搜索匹配
            const matchesSearch = !rawQuery || 
                targetDocId.includes(cleanQuery) ||
                regCode.includes(cleanQuery) ||
                actor.includes(rawQuery) ||
                details.includes(rawQuery) ||
                dateStr.includes(rawQuery);

            // 2. 检查下拉菜单状态匹配
            let matchesStatus = true;
            if (selectedVal && !selectedVal.includes('all')) {
                if (selectedVal.includes('pass') || selectedVal.includes('approved')) {
                    matchesStatus = log.is_valid_pass === true || actor.includes('approved');
                } else if (selectedVal.includes('fail') || selectedVal.includes('reject')) {
                    matchesStatus = actor.includes('rejected');
                } else if (selectedVal.includes('upload') || selectedVal.includes('reupload') || selectedVal.includes('request')) {
                    matchesStatus = actor.includes('reupload') || actor.includes('revision');
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
}