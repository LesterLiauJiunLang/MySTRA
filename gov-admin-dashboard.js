document.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new GovDashboardModule();
});

class GovDashboardModule {
    constructor() {
        this.chart = null;
        this.allRecords = [];
        this.loadDashboardData();
    }

    async loadDashboardData() {
        try {
            const { data, error } = await window.supabaseClient
                .from('compliance_documents')
                .select('*');

            if (error) throw error;

            this.allRecords = data || [];
            this.applyFilters();

        } catch (err) {
            console.error('Failed to load dashboard data:', err);
            const banner = document.getElementById('gov-alert-banner');
            if (banner) {
                banner.innerText = '❌ Failed to load dashboard data: ' + err.message;
                banner.style.display = 'block';
            }
        }
    }

    applyFilters() {
        const selectedState = document.getElementById('filter-state')?.value || 'ALL';
        const selectedDistrict = document.getElementById('filter-district')?.value || 'ALL';

        let filtered = this.allRecords;

        if (selectedState !== 'ALL') {
            filtered = filtered.filter(r => r.state === selectedState);
        }

        if (selectedDistrict !== 'ALL') {
            filtered = filtered.filter(r => r.district === selectedDistrict);
        }

        this.renderDashboard(filtered);
    }

    renderDashboard(records) {
        const total = records.length;
        const verified = records.filter(r => r.status === 'APPROVED' || r.status === 'VERIFIED').length;
        const pending = records.filter(r => r.status === 'PENDING').length;
        const rejected = records.filter(r => r.status === 'REJECTED').length;

        document.getElementById('metric-total-operators').innerText = total;
        document.getElementById('metric-verified-count').innerText = verified;
        document.getElementById('metric-pending-count').innerText = pending;
        document.getElementById('metric-rejected-count').innerText = rejected;

        const emptyStateEl = document.getElementById('chart-empty-state');
        const chartWrapper = document.getElementById('chart-wrapper');

        if (records.length === 0) {
            if (emptyStateEl) emptyStateEl.style.display = 'block';
            if (chartWrapper) chartWrapper.style.display = 'none';
            if (this.chart) this.chart.destroy();
            return;
        }

        if (emptyStateEl) emptyStateEl.style.display = 'none';
        if (chartWrapper) chartWrapper.style.display = 'block';

        this.renderChart(records);
    }

    renderChart(records) {
        const stateCounts = {};
        records.forEach(r => {
            const stateName = r.state || 'Unspecified Region';
            stateCounts[stateName] = (stateCounts[stateName] || 0) + 1;
        });

        const labels = Object.keys(stateCounts);
        const counts = Object.values(stateCounts);

        const canvas = document.getElementById('stateDistributionChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');

        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Registered Accommodations',
                    data: counts,
                    backgroundColor: '#2563EB',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }

    resetFilters() {
        const stateSelect = document.getElementById('filter-state');
        const districtSelect = document.getElementById('filter-district');

        if (stateSelect) stateSelect.value = 'ALL';
        if (districtSelect) districtSelect.value = 'ALL';

        this.applyFilters();
    }
}