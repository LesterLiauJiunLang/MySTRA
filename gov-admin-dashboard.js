document.addEventListener('DOMContentLoaded', () => {
    window.govAdminDashboardModule = new GovAdminDashboardModule();
});

class GovAdminDashboardModule {
    constructor() {
        this.adminId = window.currentAdminEmail || "GOV_ADMIN";

        this.currentStatusChartType = 'doughnut';
        this.currentStateChartType = 'bar';
        this.cachedStatusCounts = null;
        this.cachedStateData = null;
        this.statusChartInstance = null;
        this.stateChartInstance = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadDashboardMetrics();
    }

    bindEvents() {
        const statusToggleBtn = document.getElementById('btn-toggle-status-chart');
        if (statusToggleBtn) {
            statusToggleBtn.addEventListener('click', () => this.toggleStatusChartType());
        }
        const stateToggleBtn = document.getElementById('btn-toggle-state-chart');
        if (stateToggleBtn) {
            stateToggleBtn.addEventListener('click', () => this.toggleStateChartType());
        }
    }

    // 🔧 Helper: normalize status from either column
    getDocStatus(doc) {
        return (doc.review_status || doc.status || 'PENDING').toUpperCase();
    }

     async loadDashboardMetrics() {
        try {
            const { data: docs, error: docError } = await window.supabaseClient
                .from('compliance_documents')
                .select('*');

            if (docError) console.error("Error fetching compliance_documents:", docError.message);

            const allDocs = docs || [];
            const totalDocs = allDocs.length;

            const pendingDocs  = allDocs.filter(d => this.getDocStatus(d) === 'PENDING').length;
            const approvedDocs = allDocs.filter(d => this.getDocStatus(d) === 'APPROVED').length;
            const rejectedDocs = allDocs.filter(d => this.getDocStatus(d) === 'REJECTED').length;
            const revisionDocs = allDocs.filter(d => this.getDocStatus(d) === 'REUPLOAD_REQUESTED').length;

            const { data: verifiedProfiles, error: profErr } = await window.supabaseClient
                .from('profiles')
                .select('id')
                .eq('role', 'operator')
                .eq('is_verified', true);

            if (profErr) console.error("Error fetching verified profiles:", profErr.message);

            const verifiedOperators = verifiedProfiles || [];
            const verifiedCount = verifiedOperators.length;
            const verifiedOperatorIds = new Set(verifiedOperators.map(p => p.id));

            // ⚠️ FIX: Only count properties that are THEMSELVES verified
            const { data: properties, error: propErr } = await window.supabaseClient
                .from('properties')
                .select('id, owner_id, state')
                .eq('is_verified', true);

            if (propErr) console.error("Error fetching properties for state stats:", propErr.message);

            let stateCounts = {};
            (properties || []).forEach(prop => {
                // Double protection: property must be verified AND owned by a verified operator
                if (prop.owner_id && verifiedOperatorIds.has(prop.owner_id)) {
                    const stateName = prop.state || 'WPKL';
                    stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
                }
            });

            this.setCardValue(['metric-total', 'metric-total-docs'], totalDocs);
            this.setCardValue(['metric-pending', 'metric-pending-docs'], pendingDocs);
            this.setCardValue(['metric-approved', 'metric-approved-docs'], approvedDocs);
            this.setCardValue(['metric-rejected'], rejectedDocs);
            this.setCardValue(['metric-revision'], revisionDocs);
            this.setCardValue(['metric-verified', 'metric-verified-operators'], verifiedCount);

            this.cachedStatusCounts = { pending: pendingDocs, approved: approvedDocs, rejected: rejectedDocs, revision: revisionDocs };
            this.cachedStateData = stateCounts;

            this.renderDocumentStatusChart(this.cachedStatusCounts, this.currentStatusChartType);
            this.renderStateAccommodationChart(this.cachedStateData, this.currentStateChartType);

        } catch (err) {
            console.error("Unexpected error in loadDashboardMetrics:", err);
        }
    }

    setCardValue(ids, val) {
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) { el.innerText = val; return; }
        }
    }

    toggleStatusChartType() {
        this.currentStatusChartType = this.currentStatusChartType === 'doughnut' ? 'bar' : 'doughnut';
        if (this.cachedStatusCounts) this.renderDocumentStatusChart(this.cachedStatusCounts, this.currentStatusChartType);
    }

    toggleStateChartType() {
        this.currentStateChartType = this.currentStateChartType === 'bar' ? 'doughnut' : 'bar';
        if (this.cachedStateData) this.renderStateAccommodationChart(this.cachedStateData, this.currentStateChartType);
    }

    renderDocumentStatusChart(statusCounts, chartType = 'doughnut') {
        const canvas = document.getElementById('statusDoughnutChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');
        if (this.statusChartInstance) this.statusChartInstance.destroy();

        const labels = ['Pending', 'Approved', 'Rejected', 'Revision Needed'];
        const dataValues = [statusCounts.pending, statusCounts.approved, statusCounts.rejected, statusCounts.revision];
        const colors = ['#F59E0B', '#10B981', '#EF4444', '#6366F1'];
        const isBar = chartType === 'bar';

        this.statusChartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels,
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
                    legend: { display: !isBar, position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 15 } },
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
                scales: isBar ? { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } : {}
            }
        });
    }

    renderStateAccommodationChart(stateCounts, chartType = 'bar') {
        const canvas = document.getElementById('stateBarChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');
        if (this.stateChartInstance) this.stateChartInstance.destroy();

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
                    legend: { display: isDoughnut, position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, padding: 15 } },
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
                scales: isDoughnut ? {} : { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0, stepSize: 1 } } }
            }
        });
    }
}