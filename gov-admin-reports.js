document.addEventListener('DOMContentLoaded', () => {
    window.reportsApp = new GovReportsModule();
});

class GovReportsModule {
    constructor() {
        this.initDefaultDates();
    }

    initDefaultDates() {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);

        document.getElementById('report-end-date').value = today.toISOString().split('T')[0];
        document.getElementById('report-start-date').value = thirtyDaysAgo.toISOString().split('T')[0];
    }

    async generateReport() {
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        const state = document.getElementById('report-state').value;
        const status = document.getElementById('report-status').value;
        const format = document.getElementById('report-format').value;
        const alertBanner = document.getElementById('report-alert-banner');
        
        alertBanner.classList.add('hidden');

        if (!startDate || !endDate) {
            alert('⚠️ Please specify both Start Date and End Date.');
            return;
        }

        // UC-M5-06 A1: Timeout / Range Validation Check
        const diffInDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
        if (diffInDays > 365) {
            alertBanner.innerText = "⚠️ Report generation timed out. Please narrow down your filter date range.";
            alertBanner.classList.remove('hidden');
            return;
        }

        const btn = document.getElementById('btn-generate-report');
        btn.disabled = true;
        btn.innerText = "⏳ Compiling Records...";

        try {
            let query = window.supabaseClient.from('compliance_documents').select('*');

            if (state !== 'ALL') query = query.eq('state', state);
            if (status !== 'ALL') query = query.eq('status', status);

            const { data: records, error } = await query;

            if (error) throw error;

            // Filter by date range locally
            const filtered = (records || []).filter(r => {
                const uploadedDate = new Date(r.uploaded_at).toISOString().split('T')[0];
                return uploadedDate >= startDate && uploadedDate <= endDate;
            });

            if (format === 'CSV') {
                this.exportCSV(filtered);
            } else {
                this.exportPDF(filtered, startDate, endDate);
            }

        } catch (err) {
            alertBanner.innerText = "❌ Error compiling report: " + err.message;
            alertBanner.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.innerText = "📥 Generate & Export Report";
        }
    }

    exportCSV(data) {
        if (!data || data.length === 0) {
            alert("No records match the selected parameters.");
            return;
        }

        const headers = ["Document ID", "Document Type", "State", "District", "Status", "Uploaded Date", "Feedback"];
        const rows = data.map(r => [
            r.id,
            `"${r.document_type || 'N/A'}"`,
            `"${r.state || 'N/A'}"`,
            `"${r.district || 'N/A'}"`,
            r.status || 'PENDING',
            r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'N/A',
            `"${(r.admin_feedback || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `MySTRA_Compliance_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    exportPDF(data, startDate, endDate) {
        const printWindow = window.open('', '_blank');
        const rows = data.map(r => `
            <tr>
                <td style="padding:8px; border:1px solid #DDD;">#${r.id.toString().substring(0,8)}</td>
                <td style="padding:8px; border:1px solid #DDD;">${r.document_type || 'N/A'}</td>
                <td style="padding:8px; border:1px solid #DDD;">${r.state || 'N/A'} / ${r.district || 'N/A'}</td>
                <td style="padding:8px; border:1px solid #DDD;">${r.status || 'PENDING'}</td>
                <td style="padding:8px; border:1px solid #DDD;">${r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : 'N/A'}</td>
            </tr>
        `).join('');

        printWindow.document.write(`
            <html>
            <head>
                <title>MySTRA Audit Summary Report</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { background-color: #1E293B; color: white; padding: 10px; text-align: left; }
                </style>
            </head>
            <body>
                <h2>🏛️ MySTRA Compliance & Audit Summary Report</h2>
                <p><strong>Date Range:</strong> ${startDate} to ${endDate}</p>
                <p><strong>Total Records Evaluated:</strong> ${data.length}</p>
                <table>
                    <thead>
                        <tr><th>ID</th><th>Document Category</th><th>Region</th><th>Status</th><th>Uploaded Date</th></tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="5">No records found.</td></tr>'}</tbody>
                </table>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
}