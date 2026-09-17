document.addEventListener('DOMContentLoaded', () => {
    window.reportsApp = new GovReportsModule();

    const generateBtn = document.getElementById('btn-generate-report');
    if (generateBtn) {
        generateBtn.removeAttribute('onclick');
        generateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.reportsApp.generateReport();
        });
    }
});

class GovReportsModule {
    constructor() {
        this.initDefaultDates();
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

    // 🔧 Normalize document status from either column
    getDocStatus(doc) {
        return (doc.review_status || doc.status || 'PENDING').toUpperCase();
    }

    initDefaultDates() {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const formatDateStr = (dateObj) => {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const endDateInput = document.getElementById('report-end-date');
        const startDateInput = document.getElementById('report-start-date');
        if (endDateInput) endDateInput.value = formatDateStr(today);
        if (startDateInput) startDateInput.value = formatDateStr(thirtyDaysAgo);
    }

    async generateReport() {
        const startDate = document.getElementById('report-start-date')?.value;
        const endDate = document.getElementById('report-end-date')?.value;
        const state = document.getElementById('report-state')?.value || 'ALL';
        const status = document.getElementById('report-status')?.value || 'ALL';
        const format = document.getElementById('report-format')?.value || 'CSV';
        const alertBanner = document.getElementById('report-alert-banner');

        if (alertBanner) alertBanner.style.display = 'none';

        if (!startDate || !endDate) { this.showAlert('⚠️ Please specify both Start Date and End Date.'); return; }
        if (new Date(startDate) > new Date(endDate)) { this.showAlert('⚠️ Start Date cannot be later than End Date.'); return; }

        const diffInDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
        if (diffInDays > 365) { this.showAlert('⚠️ Date range exceeds maximum allowed limit (maximum 365 days).'); return; }

        const btn = document.getElementById('btn-generate-report');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Compiling Records..."; }

        try {
            // Fetch — filter state server-side (real column), status client-side (may be in either column)
            let query = window.supabaseClient.from('compliance_documents').select('*');
            if (state !== 'ALL') query = query.eq('state', state);

            const { data: records, error } = await query;
            if (error) throw error;

            const filtered = (records || []).filter(r => {
                // Date window
                if (!r.uploaded_at) return false;
                const uploadedDate = new Date(r.uploaded_at).toISOString().split('T')[0];
                if (uploadedDate < startDate || uploadedDate > endDate) return false;

                // Status filter (client-side, using normalized value)
                if (status !== 'ALL' && this.getDocStatus(r) !== status) return false;

                return true;
            });

            if (format === 'CSV') this.exportCSV(filtered);
            else this.exportPDF(filtered, startDate, endDate);

            // Audit trail (non-blocking)
            if (window.GovAuditLogDirectory) {
                const currentAdmin = window.currentAdminName
                    || localStorage.getItem('current_admin_name')
                    || window.currentAdminEmail
                    || 'Executive Officer';
                try {
                    await window.GovAuditLogDirectory.logAction({
                        performerName: currentAdmin,
                        registrationCode: null,
                        targetDocId: null,
                        actionDetails: `Generated ${format} Compliance Report (${filtered.length} records, Range: ${startDate} to ${endDate}, State: ${state}, Status: ${status})`,
                        isValidPass: true,
                        requestingOta: 'REPORTS_MODULE'
                    });
                } catch (auditErr) {
                    console.warn('⚠️ [Reports] Non-blocking audit log failure:', auditErr);
                }
            }
        } catch (err) {
            console.error('Report Generation Error:', err);
            this.showAlert("❌ Error compiling report: " + err.message);

            if (window.GovAuditLogDirectory) {
                try {
                    const currentAdmin = window.currentAdminName
                        || localStorage.getItem('current_admin_name')
                        || window.currentAdminEmail
                        || 'Executive Officer';
                    await window.GovAuditLogDirectory.logAction({
                        performerName: currentAdmin,
                        actionDetails: `Failed to Generate ${format} Report: ${err.message}`,
                        isValidPass: false,
                        requestingOta: 'REPORTS_MODULE'
                    });
                } catch (auditErr) {
                    console.warn('Failed to log error action:', auditErr);
                }
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = "📥 Generate & Export Report"; }
        }
    }

    showAlert(message) {
        const alertBanner = document.getElementById('report-alert-banner');
        if (alertBanner) { alertBanner.innerText = message; alertBanner.style.display = 'block'; }
        else alert(message);
    }

    exportCSV(data) {
        if (!data || data.length === 0) {
            this.showAlert("ℹ️ No records match the selected parameters and date range.");
            return;
        }

        const headers = ["Document ID", "Document Type", "State", "District", "Status", "Uploaded Date", "Feedback"];
        const rows = data.map(r => [
            r.id,
            `"${(r.document_type || 'N/A').replace(/"/g, '""')}"`,
            `"${(r.state || 'N/A').replace(/"/g, '""')}"`,
            `"${(r.district || 'N/A').replace(/"/g, '""')}"`,
            `"${this.getDocStatus(r).replace(/"/g, '""')}"`,
            r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'N/A',
            `"${(r.admin_feedback || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `MySTRA_Compliance_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    exportPDF(data, startDate, endDate) {
        if (!data || data.length === 0) {
            this.showAlert("ℹ️ No records match the selected parameters and date range.");
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) { alert('⚠️ Popup blocked! Please allow popups for this site to export PDF.'); return; }

        const rows = data.map(r => `
            <tr>
                <td style="padding:8px; border:1px solid #CBD5E1;">#${this.escapeHtml(String(r.id)).substring(0, 8)}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(r.document_type || 'N/A')}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(r.state || 'N/A')} / ${this.escapeHtml(r.district || 'N/A')}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(this.getDocStatus(r))}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'N/A'}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>MySTRA Audit Summary Report</title>
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #0F172A; }
                    h2 { margin-bottom: 8px; color: #1E293B; }
                    p { font-size: 13px; color: #475569; margin: 4px 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background-color: #1E293B; color: #FFFFFF; padding: 10px; text-align: left; font-size: 13px; }
                    td { font-size: 12px; }
                </style>
            </head>
            <body>
                <h2>🏛️ MySTRA Compliance & Audit Summary Report</h2>
                <p><strong>Date Range:</strong> ${this.escapeHtml(startDate)} to ${this.escapeHtml(endDate)}</p>
                <p><strong>Total Records Evaluated:</strong> ${data.length}</p>
                <table>
                    <thead>
                        <tr><th>ID</th><th>Document Category</th><th>Region</th><th>Status</th><th>Uploaded Date</th></tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </body>
            </html>
        `);

        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => printWindow.print(), 250);
    }
}

