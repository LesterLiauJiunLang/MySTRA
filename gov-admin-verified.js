document.addEventListener('DOMContentLoaded', () => {
    window.verifiedApp = new GovVerifiedDirectory();
});

class GovVerifiedDirectory {
    constructor() {
        this.rawRecords = [];
        this.loadVerifiedOperators();
    }

    async loadVerifiedOperators() {
        const tableBody = document.getElementById('tbl-verified-body');
        const emptyState = document.getElementById('verified-empty-state');
        const countLabel = document.getElementById('lbl-verified-count');

        try {
            // UC-M5-07 Step 2: Query records where verification status is APPROVED
            const { data: records, error } = await window.supabaseClient
                .from('compliance_documents')
                .select('*')
                .eq('status', 'APPROVED');

            if (error) throw error;

            this.rawRecords = records || [];

            // UC-M5-07 A1: No Verified Operators Found
            if (this.rawRecords.length === 0) {
                tableBody.innerHTML = '';
                emptyState.classList.remove('hidden');
                countLabel.innerText = '0';
                return;
            }

            emptyState.classList.add('hidden');
            this.renderRows(this.rawRecords);

        } catch (err) {
            tableBody.innerHTML = `<tr><td colspan="5" style="color:red; text-align:center; padding:20px;">Error loading directory: ${err.message}</td></tr>`;
        }
    }

    renderRows(records) {
        const tableBody = document.getElementById('tbl-verified-body');
        const countLabel = document.getElementById('lbl-verified-count');
        const emptyState = document.getElementById('verified-empty-state');

        countLabel.innerText = records.length.toString();

        if (records.length === 0) {
            tableBody.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        tableBody.innerHTML = records.map(r => `
            <tr style="border-bottom: 1px solid #E2E8F0;">
                <td style="padding:12px; font-weight:600;">
                    ${r.document_type || 'Registered Operator'}
                    <div style="font-size:11px; color:#6B7280;">ID: #${r.id.toString().substring(0,8)}</div>
                </td>
                <td style="padding:12px; font-family:monospace; color:#1E293B;">
                    ${r.ssm_number || 'SSM-' + r.id.toString().substring(0,6).toUpperCase()}
                </td>
                <td style="padding:12px;">
                    ${r.state || 'N/A'} (${r.district || 'N/A'})
                </td>
                <td style="padding:12px;">
                    ${r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'N/A'}
                </td>
                <td style="padding:12px;">
                    <span style="background-color:#D1FAE5; color:#065F46; font-size:11px; font-weight:700; padding:4px 8px; border-radius:12px;">
                        VERIFIED
                    </span>
                </td>
            </tr>
        `).join('');
    }

    // UC-M5-07 Step 4: Live Client-Side Search
    filterTable() {
        const query = document.getElementById('input-verified-search').value.toLowerCase();
        const filtered = this.rawRecords.filter(r => {
            const name = (r.document_type || '').toLowerCase();
            const ssm = (r.ssm_number || 'ssm-' + r.id).toLowerCase();
            const state = (r.state || '').toLowerCase();
            const district = (r.district || '').toLowerCase();

            return name.includes(query) || ssm.includes(query) || state.includes(query) || district.includes(query);
        });

        this.renderRows(filtered);
    }
}