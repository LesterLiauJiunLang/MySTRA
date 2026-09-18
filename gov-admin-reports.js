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

        // ----------------------------------------------------------------
        // Parameter validation
        // ----------------------------------------------------------------
        if (!startDate || !endDate) {
            this.showAlert('⚠️ Please specify both Start Date and End Date.');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            this.showAlert('⚠️ Start Date cannot be later than End Date.');
            return;
        }

        const diffInDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
        if (diffInDays > 365) {
            this.showAlert('⚠️ Date range exceeds maximum allowed limit (maximum 365 days).');
            return;
        }

        const btn = document.getElementById('btn-generate-report');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Compiling Records..."; }

        try {
            // ================================================================
            // STEP 1: Query compliance_documents
            //         Sorted by uploaded_at DESCENDING (newest first)
            // ================================================================
            let query = window.supabaseClient
                .from('compliance_documents')
                .select('*')
                .order('uploaded_at', { ascending: false });

            if (state !== 'ALL') query = query.eq('state', state);

            const { data: records, error } = await query;
            if (error) throw error;

            // ================================================================
            // STEP 2: Fetch related properties to fill in missing state/district
            //
            //   Some documents were uploaded before the app started writing
            //   state/district into the compliance_documents row. We look up
            //   the linked property's state + city as a fallback.
            // ================================================================
            const propertyIds = [...new Set(
                (records || []).map(r => r.property_id).filter(Boolean)
            )];

            const propertyMap = {};
            if (propertyIds.length > 0) {
                try {
                    const { data: props } = await window.supabaseClient
                        .from('properties')
                        .select('id, state, city, address')
                        .in('id', propertyIds);

                    (props || []).forEach(p => {
                        propertyMap[p.id] = {
                            state: p.state || null,
                            district: p.city || null,
                            address: p.address || null
                        };
                    });
                } catch (propErr) {
                    console.warn('⚠️ [Reports] Could not fetch related properties:', propErr);
                }
            }

            // ================================================================
            // STEP 3: Filter by date + status, backfill state/district,
            //         and re-sort by date (defense in depth)
            // ================================================================
            const filtered = (records || [])
                .map(r => {
                    const prop = propertyMap[r.property_id] || {};
                    return {
                        ...r,
                        // Prefer the document's own state; fall back to property's
                        state: r.state || prop.state || null,
                        district: r.district || prop.district || null
                    };
                })
                .filter(r => {
                    if (!r.uploaded_at) return false;

                    // ----------------------------------------------------------------
                    // Normalize to LOCAL date (YYYY-MM-DD) to avoid UTC boundary bugs.
                    // Without this, a document uploaded at 2 AM Malaysia time
                    // would appear to belong to the previous day (UTC offset issue).
                    // ----------------------------------------------------------------
                    const uploaded = new Date(r.uploaded_at);
                    const localDate = new Date(
                        uploaded.getTime() - uploaded.getTimezoneOffset() * 60000
                    ).toISOString().split('T')[0];

                    if (localDate < startDate || localDate > endDate) return false;
                    if (status !== 'ALL' && this.getDocStatus(r) !== status) return false;
                    return true;
                })
                .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

            // ================================================================
            // STEP 4: Export
            // ================================================================
            if (format === 'CSV') {
                this.exportCSV(filtered);
            } else {
                this.exportPDF(filtered, startDate, endDate);
            }

            // ================================================================
            // STEP 5: Audit trail (non-blocking)
            // ================================================================
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
            if (btn) {
                btn.disabled = false;
                btn.innerText = "📥 Generate & Export Report";
            }
        }
    }

    showAlert(message) {
        const alertBanner = document.getElementById('report-alert-banner');
        if (alertBanner) {
            alertBanner.innerText = message;
            alertBanner.style.display = 'block';
        } else {
            alert(message);
        }
    }

    // ================================================================
    // CSV EXPORT
    // ================================================================
    exportCSV(data) {
        if (!data || data.length === 0) {
            this.showAlert("ℹ️ No records match the selected parameters and date range.");
            return;
        }

        const headers = [
            "Document ID",
            "SSM Number",
            "Document Type",
            "State",
            "District",
            "Status",
            "Uploaded Date",
            "Feedback"
        ];

        const rows = data.map(r => [
            r.id,
            `"${(r.ssm_number || 'N/A').replace(/"/g, '""')}"`,
            `"${(r.document_type || 'N/A').replace(/"/g, '""')}"`,
            `"${(r.state || 'Unknown').replace(/"/g, '""')}"`,
            `"${(r.district || '').replace(/"/g, '""')}"`,
            `"${this.getDocStatus(r).replace(/"/g, '""')}"`,
            r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'N/A',
            `"${(r.admin_feedback || '').replace(/"/g, '""')}"`
        ]);

        // UTF-8 BOM (\uFEFF) ensures Excel opens the file with correct encoding
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

    // ================================================================
    // PDF EXPORT — printable HTML table
    // ================================================================
    exportPDF(data, startDate, endDate) {
        if (!data || data.length === 0) {
            this.showAlert("ℹ️ No records match the selected parameters and date range.");
            return;
        }

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('⚠️ Popup blocked! Please allow popups for this site to export PDF.');
            return;
        }

        const rows = data.map(r => `
            <tr>
                <td style="padding:8px; border:1px solid #CBD5E1;">#${this.escapeHtml(String(r.id)).substring(0, 8)}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(r.ssm_number || 'N/A')}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(r.document_type || 'N/A')}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(r.state || 'Unknown')}</td>
                <td style="padding:8px; border:1px solid #CBD5E1;">${this.escapeHtml(r.district || '—')}</td>
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
                    th { background-color: #1E293B; color: #FFFFFF; padding: 10px; text-align: left; font-size: 12px; }
                    td { font-size: 12px; }
                    tr:nth-child(even) { background-color: #F8FAFC; }
                </style>
            </head>
            <body>
                <h2>🏛️ MySTRA Compliance &amp; Audit Summary Report</h2>
                <p><strong>Date Range:</strong> ${this.escapeHtml(startDate)} to ${this.escapeHtml(endDate)}</p>
                <p><strong>Total Records Evaluated:</strong> ${data.length}</p>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>SSM Number</th>
                            <th>Document Category</th>
                            <th>State</th>
                            <th>District</th>
                            <th>Status</th>
                            <th>Uploaded Date</th>
                        </tr>
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