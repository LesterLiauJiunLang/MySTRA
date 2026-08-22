document.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new GovDashboard();
});

class GovDashboard {
    constructor() {
        this.chartInstance = null;
        this.init();
    }

    init() {
        this.loadDashboardData();
    }

    async loadDashboardData() {
        const stateFilter = document.getElementById('filter-state')?.value || 'ALL';
        const districtFilter = document.getElementById('filter-district')?.value || 'ALL';
        const alertBanner = document.getElementById('gov-alert-banner');
        
        alertBanner?.classList.add('hidden');

        if (!window.supabaseClient) {
            this.showErrorBanner("Unable to retrieve dashboard statistics. Please try again later.");
            return;
        }

        let query = window.supabaseClient.from('compliance_documents').select('*');

        if (stateFilter !== 'ALL') query = query.eq('state', stateFilter);
        if (districtFilter !== 'ALL') query = query.eq('district', districtFilter);

        const { data: records, error } = await query;

        if (error) {
            this.showErrorBanner("Unable to retrieve dashboard statistics. Please try again later.");
            return;
        }

        if (!records || records.length === 0) {
            this.updateMetricsUI(0, 0, 0, 0);
            document.getElementById('chart-empty-state')?.classList.remove('hidden');
            document.getElementById('chart-wrapper')?.classList.add('hidden');
            return;
        }

        document.getElementById('chart-empty-state')?.classList.add('hidden');
        document.getElementById('chart-wrapper')?.classList.remove('hidden');

        const total = records.length;
        const verified = records.filter(r => r.status === 'APPROVED').length;
        const pending = records.filter(r => (r.status || 'PENDING') === 'PENDING').length;
        const rejected = records.filter(r => r.status === 'REJECTED' || r.status === 'REUPLOAD_REQUESTED').length;

        this.updateMetricsUI(total, verified, pending, rejected);

        const stateCounts = {};
        records.forEach(r => {
            const stateName = r.state || 'Unspecified Region';
            stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
        });

        this.renderChart(Object.keys(stateCounts), Object.values(stateCounts));
    }

    updateMetricsUI(total, verified, pending, rejected) {
        document.getElementById('metric-total-operators').innerText = total;
        document.getElementById('metric-verified-count').innerText = verified;
        document.getElementById('metric-pending-count').innerText = pending;
        document.getElementById('metric-rejected-count').innerText = rejected;
    }

    showErrorBanner(msg) {
        const banner = document.getElementById('gov-alert-banner');
        if (banner) {
            banner.innerText = msg;
            banner.classList.remove('hidden');
        }
    }

    resetFilters() {
        document.getElementById('filter-state').value = 'ALL';
        document.getElementById('filter-district').value = 'ALL';
        this.loadDashboardData();
    }

    renderChart(labels, dataCounts) {
        const ctx = document.getElementById('stateDistributionChart')?.getContext('2d');
        if (!ctx) return;

        if (this.chartInstance) this.chartInstance.destroy();

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Registered Accommodations',
                    data: dataCounts,
                    backgroundColor: '#2563EB',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }
}