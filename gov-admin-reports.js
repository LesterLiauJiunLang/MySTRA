document.addEventListener('DOMContentLoaded', () => {
    window.reportsApp = new GovReportsModule();

    const generateBtn = document.getElementById('btn-generate-report');
    if (generateBtn) {
        // 移除内联 onclick，避免触发两次
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

    // 初始化默认日期（最近 30 天）
    initDefaultDates() {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);

        const formatDateStr = (dateObj) => {
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
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

        // 1. 基础非空校验
        if (!startDate || !endDate) {
            this.showAlert('⚠️ Please specify both Start Date and End Date.');
            return;
        }

        // 2. 日期逻辑校验（开始时间不能晚于结束时间）
        if (new Date(startDate) > new Date(endDate)) {
            this.showAlert('⚠️ Start Date cannot be later than End Date.');
            return;
        }

        // 3. 最大跨度校验
        const diffInDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
        if (diffInDays > 365) {
            this.showAlert('⚠️ Date range exceeds maximum allowed limit (maximum 365 days).');
            return;
        }

        const btn = document.getElementById('btn-generate-report');
        if (btn) {
            btn.disabled = true;
            btn.innerText = "⏳ Compiling Records...";
        }

        try {
            // 查 Supabase 数据库
            let query = window.supabaseClient.from('compliance_documents').select('*');

            if (state !== 'ALL') query = query.eq('state', state);
            if (status !== 'ALL') query = query.eq('status', status);

            const { data: records, error } = await query;

            if (error) throw error;

            // 过滤日期范围
            const filtered = (records || []).filter(r => {
                if (!r.uploaded_at) return false;
                const uploadedDate = new Date(r.uploaded_at).toISOString().split('T')[0];
                return uploadedDate >= startDate && uploadedDate <= endDate;
            });

            // 执行导出逻辑（无数据时内部会提示，但不会打断后面的 Audit Log 记录）
            if (format === 'CSV') {
                this.exportCSV(filtered);
            } else {
                this.exportPDF(filtered, startDate, endDate);
            }

            // ================= 记录审计日志 (即使 filtered.length 为 0 也记录) =================
            if (window.GovAuditLogDirectory) {
                const currentAdmin = localStorage.getItem('current_admin_name') || 'Executive Officer';

                await GovAuditLogDirectory.logAction({
                    performerName: currentAdmin,
                    registrationCode: null,
                    targetDocId: null,
                    actionDetails: `Generated ${format} Compliance Report (${filtered.length} records found, Range: ${startDate} to ${endDate}, State: ${state}, Status: ${status})`,
                    isValidPass: true,
                    requestingOta: 'REPORTS_MODULE'
                });
                console.log('✅ Audit log successfully recorded for Report Generation!');
            } else {
                console.warn('⚠️ GovAuditLogDirectory module is missing on this page!');
            }

        } catch (err) {
            console.error('Report Generation Error:', err);
            this.showAlert("❌ Error compiling report: " + err.message);

            // 异常失败日志
            if (window.GovAuditLogDirectory) {
                await GovAuditLogDirectory.logAction({
                    performerName: 'Executive Officer',
                    registrationCode: null,
                    targetDocId: null,
                    actionDetails: `Failed to Generate ${format} Report: ${err.message}`,
                    isValidPass: false,
                    requestingOta: 'REPORTS_MODULE'
                });
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

    exportCSV(data) {
        if (!data || data.length === 0) {
            this.showAlert("ℹ️ No records match the selected parameters and date range.");
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
                <td style="padding:8px; border:1px solid #DDD;">#${String(r.id).substring(0,8)}</td>
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
                    <tbody>${rows}</tbody>
                </table>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
}

async function handleLogout(event) {
    if (event) event.preventDefault();

    if (!window.supabaseClient) {
        console.error('❌ Supabase 客户端未初始化');
        return;
    }

    try {
        // 1. 记录登出审计日志（若 GovAuditLogDirectory 存在）
        if (window.GovAuditLogDirectory) {
            await window.GovAuditLogDirectory.logAction({
                actionDetails: 'Admin logged out',
                isValidPass: true
            });
        }

        // 2. 执行 Supabase Auth 注销
        const { error } = await window.supabaseClient.auth.signOut();

        if (error) {
            alert('Logout Failed: ' + error.message);
            return;
        }

        // 3. 清理 Session 并重定向
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';

    } catch (err) {
        console.error('❌ Logout Exception:', err);
    }
}