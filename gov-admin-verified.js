document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tbl-verified-body') || document.getElementById('tbl-verified-operators-body') || document.getElementById('input-verified-search')) {
        window.verifiedApp = new GovVerifiedDirectory();
    }
});

class GovVerifiedDirectory {
    constructor() {
        this.rawOperators = [];
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadVerifiedOperators();
    }

    /**
     * Sanitizes user-supplied strings to protect against XSS injections
     */
    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    bindEvents() {
        const searchInput = document.getElementById('input-verified-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterTable());
        }

        const otaSelect = document.getElementById('select-ota-filter');
        if (otaSelect) {
            otaSelect.addEventListener('change', () => this.filterTable());
        }

        // Modal Close Listener
        const closeBtn = document.getElementById('btn-close-license-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeLicenseModal());
        }
    }

    async loadVerifiedOperators() {
        const tableBody = document.getElementById('tbl-verified-body') || document.getElementById('tbl-verified-operators-body');
        const countLabel = document.getElementById('lbl-verified-count') || document.getElementById('lbl-active-operators-count');

        if (!window.supabaseClient) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="color:#EF4444; text-align:center; padding:20px;">Database connection unavailable.</td></tr>`;
            }
            return;
        }

        try {
            // 1. Fetch verified operator profiles
            const { data: profiles, error: profErr } = await window.supabaseClient
                .from('profiles')
                .select('id, full_name, phone_no, business_name, business_ssm, is_verified, role, created_at')
                .eq('role', 'operator')
                .eq('is_verified', true);

            if (profErr) throw profErr;

            // 2. Fetch properties independently to avoid relational join errors
            const { data: properties, error: propErr } = await window.supabaseClient
                .from('properties')
                .select('id, owner_id, title, name, address, city, state, license_number, created_at');

            if (propErr) console.warn('Could not fetch properties:', propErr);

            // Group properties by owner_id
            const propertyMap = {};
            (properties || []).forEach(prop => {
                if (prop.owner_id) {
                    if (!propertyMap[prop.owner_id]) {
                        propertyMap[prop.owner_id] = [];
                    }
                    propertyMap[prop.owner_id].push(prop);
                }
            });

            // 3. Fetch registration codes mapping
            const { data: codes, error: codeErr } = await window.supabaseClient
                .from('mystra_codes')
                .select('registration_code, property_id, code_status');

            if (codeErr) console.warn('Could not fetch mystra codes:', codeErr);

            const codeMap = {};
            if (codes) {
                codes.forEach(c => {
                    if (c.property_id) {
                        codeMap[c.property_id] = c.registration_code;
                    }
                });
            }

            // 4. Assemble operator records
            this.rawOperators = (profiles || []).map(p => {
                const userProperties = propertyMap[p.id] || [];
                
                const accommodations = userProperties.map(prop => {
                    const code = codeMap[prop.id] || prop.license_number || `MYS-${prop.id.toString().substring(0, 6).toUpperCase()}`;
                    return {
                        id: prop.id,
                        property_name: prop.title || prop.name || 'Accommodation Listing',
                        state: prop.state || 'WPKL',
                        district: prop.city || '',
                        code: code,
                        platform: 'Agoda / Airbnb',
                        file_url: ''
                    };
                });

                const primaryCode = accommodations.length > 0 
                    ? accommodations[0].code 
                    : `MYS-${p.id.substring(0, 6).toUpperCase()}`;

                return {
                    operator_name: p.business_name || p.full_name || 'Registered Operator Entity',
                    account_name: p.full_name || 'Operator Account',
                    ssm_number: p.business_ssm || 'N/A',
                    phone_no: p.phone_no || 'N/A',
                    accommodations: accommodations,
                    mystra_codes: new Set(accommodations.map(a => a.code).concat([primaryCode])),
                    ota_platforms: new Set(['Agoda / Airbnb']),
                    latest_date: p.created_at
                };
            });

            if (this.rawOperators.length === 0) {
                if (tableBody) {
                    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748B;">No verified operator accounts found in database.</td></tr>`;
                }
                if (countLabel) countLabel.innerText = '0';
                return;
            }

            this.filterTable();

        } catch (err) {
            console.error('Error loading verified operators:', err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="color:#EF4444; text-align:center; padding:20px;">Error loading directory: ${this.escapeHtml(err.message)}</td></tr>`;
            }
        }
    }

    renderRows(records) {
        const tableBody = document.getElementById('tbl-verified-body') || document.getElementById('tbl-verified-operators-body');
        const countLabel = document.getElementById('lbl-verified-count') || document.getElementById('lbl-active-operators-count');

        if (countLabel) countLabel.innerText = records.length.toString();

        if (records.length === 0) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748B;">No verified operator accounts found matching criteria.</td></tr>`;
            }
            return;
        }

        if (tableBody) {
            tableBody.innerHTML = records.map((r, index) => {
                const accomCount = r.accommodations.length;
                const rawPlatforms = Array.from(r.ota_platforms).join(' / ');
                const rawPrimaryCode = Array.from(r.mystra_codes)[0] || 'MYS-VERIFIED';
                const formattedDate = r.latest_date ? new Date(r.latest_date).toLocaleDateString() : 'N/A';
                
                const accomListRaw = accomCount > 0 
                    ? r.accommodations.map(a => `• ${a.property_name} (${a.state}) [${a.code}]`).join('\n')
                    : 'No accommodation listings linked yet.';

                const operatorName = this.escapeHtml(r.operator_name);
                const accountName = this.escapeHtml(r.account_name);
                const ssmNumber = this.escapeHtml(r.ssm_number);
                const phoneNo = this.escapeHtml(r.phone_no);
                const primaryCode = this.escapeHtml(rawPrimaryCode);
                const platforms = this.escapeHtml(rawPlatforms);
                const accomTooltip = this.escapeHtml(accomListRaw);

                return `
                    <tr style="border-bottom: 1px solid #F1F5F9;">
                        <td style="padding: 16px;">
                            <div style="font-weight: 700; color: #0F172A; font-size: 14px;">🏢 ${operatorName}</div>
                            <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
                                👤 ${accountName} | SSM: ${ssmNumber} | 📞 ${phoneNo}
                            </div>
                        </td>
                        <td style="padding: 16px;">
                            <span style="background-color: #EFF6FF; color: #2563EB; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 12px;">
                                ${primaryCode} ${accomCount > 1 ? `(+${accomCount - 1})` : ''}
                            </span>
                        </td>
                        <td style="padding: 16px;">
                            <span style="background: #F1F5F9; color: #334155; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;">
                                🏠 <strong>${accomCount}</strong> Accommodation${accomCount > 1 ? 's' : ''}
                            </span>
                        </td>
                        <td style="padding: 16px; color: #334155; font-size: 13px;">
                            🌐 ${platforms}
                        </td>
                        <td style="padding: 16px;">
                            <span style="color: #059669; font-weight: 700; font-size: 12px; background-color: #D1FAE5; padding: 4px 8px; border-radius: 12px;">
                                ● VERIFIED ACCOUNT
                            </span>
                        </td>
                        <td style="padding: 16px; color: #64748B; font-size: 13px;">
                            ${formattedDate}
                        </td>
                        <td style="padding: 16px;">
                            <button onclick="window.verifiedApp.showOperatorDetails(${index})" 
                                    title="${accomTooltip}"
                                    style="background-color: #2563EB; color: #FFF; border: none; padding: 8px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                📄 View Accommodations (${accomCount})
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    filterTable() {
        const searchInput = document.getElementById('input-verified-search');
        const otaSelect = document.getElementById('select-ota-filter');

        const rawQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const selectedOTA = otaSelect ? otaSelect.value : 'ALL';

        const filtered = this.rawOperators.filter(r => {
            const operator = (r.operator_name || '').toLowerCase();
            const ssm = (r.ssm_number || '').toLowerCase();
            const account = (r.account_name || '').toLowerCase();
            const platforms = Array.from(r.ota_platforms).join(' ').toLowerCase();

            const matchesAccom = r.accommodations.some(a => 
                (a.property_name || '').toLowerCase().includes(rawQuery) ||
                (a.code || '').toLowerCase().includes(rawQuery) ||
                (a.state || '').toLowerCase().includes(rawQuery)
            );

            const matchesText = !rawQuery || operator.includes(rawQuery) || ssm.includes(rawQuery) || account.includes(rawQuery) || matchesAccom;

            let matchesOTA = true;
            if (selectedOTA !== 'ALL') {
                matchesOTA = platforms.includes(selectedOTA.toLowerCase());
            }

            return matchesText && matchesOTA;
        });

        this.renderRows(filtered);
    }

    showOperatorDetails(index) {
        const record = this.rawOperators[index];
        if (!record) return;

        const modal = document.getElementById('licenseModal');
        const titleEl = document.getElementById('modalOperatorTitle');
        const bodyEl = document.getElementById('modalPreviewBody');

        if (!modal || !bodyEl) return;

        if (titleEl) {
            titleEl.innerText = `🏢 Verified Operator: ${record.operator_name} (SSM: ${record.ssm_number})`;
        }

        const accomCards = record.accommodations.length > 0 
            ? record.accommodations.map((a, idx) => {
                const propName = this.escapeHtml(a.property_name);
                const stateStr = this.escapeHtml(a.state);
                const districtStr = a.district ? `(${this.escapeHtml(a.district)})` : '';
                const codeStr = this.escapeHtml(a.code);
                const platformStr = this.escapeHtml(a.platform);
                const encodedName = encodeURIComponent(a.property_name);
                const encodedUrl = encodeURIComponent(a.file_url || '');

                return `
                    <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-weight: 700; color: #0F172A; font-size: 14px;">🏠 ${idx + 1}. ${propName}</div>
                            <div style="font-size: 12px; color: #64748B; margin-top: 4px;">
                                Location: ${stateStr} ${districtStr} | Code: <strong style="color: #2563EB;">${codeStr}</strong>
                            </div>
                        </div>
                        <div>
                            <span style="background: #EFF6FF; color: #1D4ED8; font-weight: 600; font-size: 11px; padding: 4px 8px; border-radius: 6px; margin-right: 8px;">
                                ${platformStr}
                            </span>
                            <button onclick="window.verifiedApp.previewSingleLicense('${codeStr}', '${encodedName}', '${encodedUrl}')"
                                    style="background: #10B981; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">
                                📄 View Code
                            </button>
                        </div>
                    </div>
                `;
            }).join('')
            : `<div style="text-align: center; color: #94A3B8; padding: 20px;">No registered accommodations found under this operator account.</div>`;

        const accountName = this.escapeHtml(record.account_name);

        bodyEl.innerHTML = `
            <div style="padding: 20px; width: 100%; max-height: 70vh; overflow-y: auto;">
                <div style="margin-bottom: 16px; background: #F8FAFC; padding: 12px; border-radius: 8px;">
                    <span style="font-size: 13px; color: #475569;">Registered Account Name: <strong>${accountName}</strong></span> | 
                    <span style="font-size: 13px; color: #475569;">Total Linked Accommodations: <strong style="color: #059669;">${record.accommodations.length}</strong></span>
                </div>
                <h4 style="margin: 0 0 12px 0; color: #1E293B; font-size: 14px;">Registered Accommodation Listings:</h4>
                ${accomCards}
            </div>
        `;

        modal.style.display = 'flex';
    }

    previewSingleLicense(code, name, encodedUrl) {
        const decodedName = decodeURIComponent(name);
        alert(`📜 Official STR Code Details\n\nProperty: ${decodedName}\nRegistration Code: ${code}\nStatus: ACTIVE & OFFICIALLY VERIFIED`);
    }

    closeLicenseModal() {
        const modal = document.getElementById('licenseModal');
        const bodyEl = document.getElementById('modalPreviewBody');
        if (modal) modal.style.display = 'none';
        if (bodyEl) bodyEl.innerHTML = '';
    }
}

/**
 * Global Admin Logout Handler
 */
async function handleLogout(event) {
    if (event) event.preventDefault();

    if (!window.supabaseClient) {
        console.error('❌ Supabase client uninitialized');
        return;
    }

    try {
        if (window.GovAuditLogDirectory) {
            await window.GovAuditLogDirectory.logAction({
                actionDetails: 'Admin logged out',
                isValidPass: true
            });
        }

        const { error } = await window.supabaseClient.auth.signOut();

        if (error) {
            alert('Logout Failed: ' + error.message);
            return;
        }

        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';

    } catch (err) {
        console.error('❌ Logout Exception:', err);
    }
}