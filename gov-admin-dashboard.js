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
            // 1. Fetch All Compliance Documents for Status Breakdown
            const { data: docs, error: docError } = await window.supabaseClient
                .from('compliance_documents')
                .select('*');

            if (docError) {
                console.error("Error fetching compliance_documents:", docError.message);
            }

            const allDocs = docs || [];
            const totalDocs = allDocs.length;

            // Strict document status calculations for Card Metrics & Status Chart
            const pendingDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'PENDING').length;
            const approvedDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'APPROVED').length;
            const rejectedDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'REJECTED').length;
            const revisionDocs = allDocs.filter(d => (d.status || '').toUpperCase() === 'REUPLOAD_REQUESTED').length;

            // 2. Fetch Verified Operators directly using the EXACT query from GovVerifiedDirectory
            const { data: verifiedDocs, error: verifiedError } = await window.supabaseClient
                .from('compliance_documents')
                .select('*')
                .or('status.eq.APPROVED,status.eq.VERIFIED,review_status.eq.APPROVED');

            if (verifiedError) {
                console.error("Error fetching verified docs:", verifiedError.message);
            }

            const activeVerifiedDocs = verifiedDocs || [];
            const verifiedCount = activeVerifiedDocs.length;

            // 3. Aggregate State Statistics from Verified Records
            let stateCounts = {};
            activeVerifiedDocs.forEach(item => {
                const stateName = item.state || 'Kuala Lumpur';
                stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
            });

            if (Object.keys(stateCounts).length === 0 && verifiedCount > 0) {
                stateCounts = { 'Kuala Lumpur': verifiedCount };
            }

            // 4. Update UI Metric Cards (6 Cards Total)
            this.setCardValue(['metric-total', 'metric-total-docs'], totalDocs);
            this.setCardValue(['metric-pending', 'metric-pending-docs'], pendingDocs);
            this.setCardValue(['metric-approved', 'metric-approved-docs'], approvedDocs);
            this.setCardValue(['metric-rejected'], rejectedDocs);
            this.setCardValue(['metric-revision'], revisionDocs);
            this.setCardValue(['metric-verified', 'metric-verified-operators'], verifiedCount);

            // Cache data for chart updates and toggling
            this.cachedStatusCounts = {
                pending: pendingDocs,
                approved: approvedDocs,
                rejected: rejectedDocs,
                revision: revisionDocs
            };
            this.cachedStateData = stateCounts;

            // 5. Render UC-M5-01 & UC-M5-03 Charts
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