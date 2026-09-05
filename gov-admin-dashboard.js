document.addEventListener('DOMContentLoaded', () => {
    window.govAdminDashboardModule = new GovAdminDashboardModule();
});

class GovAdminDashboardModule {
    constructor() {
        this.statusChartInstance = null;
        this.stateChartInstance = null;
        this.currentStatusChartType = 'doughnut'; // 'doughnut' or 'bar'
        this.currentStateChartType = 'bar'; // 'bar' or 'doughnut'
        this.cachedStatusCounts = null;
        this.cachedStateData = null;
        this.init();
    }

    async init() {
        if (!window.supabaseClient) {
            setTimeout(() => this.init(), 300);
            return;
        }
        await this.loadDashboardMetrics();
    }

    async loadDashboardMetrics() {
        try {
            // 1. 获取所有 Compliance Documents 用于 Document Audit Status (UC-M5-01)
            const { data: docs, error: docError } = await window.supabaseClient
                .from('compliance_documents')
                .select('*');

            if (docError) {
                console.error("Error fetching compliance_documents:", docError.message);
            }

            const allDocs = docs || [];
            const totalDocs = allDocs.length;

            const pendingDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'PENDING').length;
            const approvedDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'APPROVED').length;
            const rejectedDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'REJECTED').length;
            const revisionDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'REUPLOAD_REQUESTED').length;

            // 2. 独立查询 profiles 中所有已验证的 operator 账号 (与 Verified Directory 保持一致)
            const { data: verifiedProfiles, error: profErr } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('role', 'operator')
                .eq('is_verified', true);

            if (profErr) {
                console.error("Error fetching verified profiles:", profErr.message);
            }

            const verifiedOperators = verifiedProfiles || [];
            const verifiedCount = verifiedOperators.length; // 真实已验证 Operator 账号总数
            const verifiedOperatorIds = new Set(verifiedOperators.map(p => p.id));

            // 3. 独立查询 properties 表，获取这些已验证 Operator 名下的房产，并按 State 进行统计 (UC-M5-03)
            const { data: properties, error: propErr } = await window.supabaseClient
                .from('properties')
                .select('id, owner_id, state');

            if (propErr) {
                console.error("Error fetching properties for state stats:", propErr.message);
            }

            let stateCounts = {};
            (properties || []).forEach(prop => {
                // 仅统计属于已验证 Operator 的房产
                if (prop.owner_id && verifiedOperatorIds.has(prop.owner_id)) {
                    const stateName = prop.state || 'WPKL';
                    stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
                }
            });

            // 4. 更新 UI 顶部 Metric 卡片
            this.setCardValue(['metric-total', 'metric-total-docs'], totalDocs);
            this.setCardValue(['metric-pending', 'metric-pending-docs'], pendingDocs);
            this.setCardValue(['metric-approved', 'metric-approved-docs'], approvedDocs);
            this.setCardValue(['metric-rejected'], rejectedDocs);
            this.setCardValue(['metric-revision'], revisionDocs);
            this.setCardValue(['metric-verified', 'metric-verified-operators'], verifiedCount);

            // 缓存数据供图表切换与渲染使用
            this.cachedStatusCounts = {
                pending: pendingDocs,
                approved: approvedDocs,
                rejected: rejectedDocs,
                revision: revisionDocs
            };
            this.cachedStateData = stateCounts;

            // 5. 渲染图表
            this.renderDocumentStatusChart(this.cachedStatusCounts, this.currentStatusChartType);
            this.renderStateAccommodationChart(this.cachedStateData, this.currentStateChartType);

        } catch (err) {
            console.error("Unexpected error in loadDashboardMetrics:", err);
        }
    }

    setCardValue(ids, val) {
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = val;
                return;
            }
        }
    }

    toggleStatusChartType() {
        this.currentStatusChartType = this.currentStatusChartType === 'doughnut' ? 'bar' : 'doughnut';
        if (this.cachedStatusCounts) {
            this.renderDocumentStatusChart(this.cachedStatusCounts, this.currentStatusChartType);
        }
    }

    toggleStateChartType() {
        this.currentStateChartType = this.currentStateChartType === 'bar' ? 'doughnut' : 'bar';
        if (this.cachedStateData) {
            this.renderStateAccommodationChart(this.cachedStateData, this.currentStateChartType);
        }
    }

    // UC-M5-01: Document Audit Overview Chart
    renderDocumentStatusChart(statusCounts, chartType = 'doughnut') {
        const canvas = document.getElementById('statusDoughnutChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');

        if (this.statusChartInstance) {
            this.statusChartInstance.destroy();
        }

        const labels = ['Pending', 'Approved', 'Rejected', 'Revision Needed'];
        const dataValues = [
            statusCounts.pending,
            statusCounts.approved,
            statusCounts.rejected,
            statusCounts.revision
        ];
        const colors = ['#F59E0B', '#10B981', '#EF4444', '#6366F1'];
        const isBar = chartType === 'bar';

        this.statusChartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Document Count',
                    data: dataValues,
                    backgroundColor: colors,
                    borderRadius: isBar ? 6 : 0,
                    borderWidth: isBar ? 0 : 2,
                    borderColor: '#ffffff',
                    barThickness: isBar ? 45 : undefined,
                    maxBarThickness: isBar ? 55 : undefined
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: !isBar,
                        position: 'bottom',
                        labels: { font: { family: 'Inter', size: 12 }, padding: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const val = context.raw || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${val} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: isBar ? 0 : '68%',
                scales: isBar ? {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                } : {}
            }
        });
    }

    // UC-M5-03: State Accommodation Statistics Chart
    renderStateAccommodationChart(stateCounts, chartType = 'bar') {
        const canvas = document.getElementById('stateBarChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');

        if (this.stateChartInstance) {
            this.stateChartInstance.destroy();
        }

        const labels = Object.keys(stateCounts);
        const dataValues = Object.values(stateCounts);
        const colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];
        const isDoughnut = chartType === 'doughnut';

        this.stateChartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: labels.length > 0 ? labels : ['No Data'],
                datasets: [{
                    label: 'Registered Accommodations',
                    data: dataValues.length > 0 ? dataValues : [0],
                    backgroundColor: isDoughnut ? colors : '#2563EB',
                    borderRadius: isDoughnut ? 0 : 6,
                    borderWidth: isDoughnut ? 2 : 0,
                    borderColor: '#ffffff',
                    barThickness: isDoughnut ? undefined : 50,
                    maxBarThickness: isDoughnut ? undefined : 60
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: isDoughnut,
                        position: 'bottom',
                        labels: { font: { family: 'Inter', size: 12 }, padding: 15 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const val = context.raw || 0;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ${val} properties (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: isDoughnut ? '65%' : 0,
                scales: isDoughnut ? {} : {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1 } }
                }
            }
        });
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