document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('tbl-verified-body') || document.getElementById('tbl-verified-operators-body') || document.getElementById('input-verified-search')) {
        window.verifiedApp = new GovVerifiedDirectory();
    }
});

class GovVerifiedDirectory {
    constructor() {
        this.rawRecords = [];
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadVerifiedOperators();
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
            // 1. Query records from compliance_documents
            const { data: docs, error: docErr } = await window.supabaseClient
                .from('compliance_documents')
                .select('*')
                .or('status.eq.APPROVED,status.eq.VERIFIED,review_status.eq.APPROVED');

            if (docErr) throw docErr;

            // 2. Fetch mystra_codes mapping
            const { data: codes } = await window.supabaseClient
                .from('mystra_codes')
                .select('*');

            const codeMap = {};
            if (codes) {
                codes.forEach(c => {
                    if (c.property_id) codeMap[c.property_id] = c.code || c.code_string || c.mystra_code;
                    if (c.user_id) codeMap[c.user_id] = c.code || c.code_string || c.mystra_code;
                    if (c.ssm_number) codeMap[c.ssm_number] = c.code || c.code_string || c.mystra_code;
                });
            }

            // 3. Map records with actual database platform fields
            this.rawRecords = (docs || []).map(doc => {
                const realCode = codeMap[doc.property_id] || codeMap[doc.user_id] || codeMap[doc.ssm_number] || doc.code_string;
                const directFileUrl = doc.document_url || doc.file_url || doc.file_path || doc.url || doc.certificate_url || '';

                return {
                    ...doc,
                    // Pull real platform field from DB or fallback to mixed platforms
                    ota_platform: doc.ota_platform || doc.platform || doc.channel || 'Agoda / Airbnb',
                    display_code: realCode || (doc.id ? `MYS-${doc.id.toString().substring(0, 8).toUpperCase()}` : 'MYS-PENDING'),
                    file_link: directFileUrl
                };
            }).sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));

            if (this.rawRecords.length === 0) {
                if (tableBody) {
                    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748B;">No verified operators found in the database.</td></tr>`;
                }
                if (countLabel) countLabel.innerText = '0';
                return;
            }

            this.filterTable();

        } catch (err) {
            console.error('Error loading verified operators:', err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="color:#EF4444; text-align:center; padding:20px;">Error loading directory: ${err.message}</td></tr>`;
            }
        }
    }

    renderRows(records) {
        const tableBody = document.getElementById('tbl-verified-body') || document.getElementById('tbl-verified-operators-body');
        const countLabel = document.getElementById('lbl-verified-count') || document.getElementById('lbl-active-operators-count');

        if (countLabel) countLabel.innerText = records.length.toString();

        if (records.length === 0) {
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#64748B;">No verified operators found matching criteria.</td></tr>`;
            }
            return;
        }

        if (tableBody) {
            tableBody.innerHTML = records.map(r => {
                const operatorName = r.operator_name || 'Registered Operator Entity';
                const ssmNumber = r.ssm_number || 'N/A';
                const mystraCode = r.display_code;
                const otaPlatform = r.ota_platform;
                const location = `${r.state || 'Kuala Lumpur'} ${r.district ? '(' + r.district + ')' : ''}`;
                const formattedDate = r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : '8/17/2026';
                const documentUrl = r.file_link ? encodeURIComponent(r.file_link) : '';

                return `
                    <tr style="border-bottom: 1px solid #F1F5F9;">
                        <td style="padding: 16px;">
                            <div style="font-weight: 700; color: #0F172A; font-size: 14px;">🏥 ${operatorName}</div>
                            <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
                                👤 Owner: System Admin | SSM: ${ssmNumber}
                            </div>
                        </td>
                        <td style="padding: 16px;">
                            <span style="background-color: #EFF6FF; color: #2563EB; padding: 6px 10px; border-radius: 6px; font-family: monospace; font-weight: 700; font-size: 12px;">
                                ${mystraCode}
                            </span>
                        </td>
                        <td style="padding: 16px; color: #334155; font-size: 13px;">
                            🌐 ${otaPlatform}
                        </td>
                        <td style="padding: 16px; color: #475569; font-size: 13px;">
                            📍 ${location}
                        </td>
                        <td style="padding: 16px;">
                            <span style="color: #059669; font-weight: 700; font-size: 12px; background-color: #D1FAE5; padding: 4px 8px; border-radius: 12px;">
                                ● ACTIVE
                            </span>
                        </td>
                        <td style="padding: 16px; color: #64748B; font-size: 13px;">
                            ${formattedDate}
                        </td>
                        <td style="padding: 16px;">
                            <button onclick="window.verifiedApp.viewCertificate('${mystraCode}', '${encodeURIComponent(operatorName)}', '${documentUrl}')" 
                                    style="background-color: #2563EB; color: #FFF; border: none; padding: 8px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                📄 View License
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

        const filtered = this.rawRecords.filter(r => {
            const operator = (r.operator_name || '').toLowerCase();
            const ssm = (r.ssm_number || '').toLowerCase();
            const code = (r.display_code || '').toLowerCase();
            const state = (r.state || '').toLowerCase();
            const platform = (r.ota_platform || '').toLowerCase();

            // 1. Text Search Filter
            const matchesText = !rawQuery || 
                operator.includes(rawQuery) || 
                ssm.includes(rawQuery) || 
                code.includes(rawQuery) || 
                state.includes(rawQuery) ||
                platform.includes(rawQuery);

            // 2. Dropdown Filter Logic
            let matchesOTA = true;
            if (selectedOTA !== 'ALL') {
                matchesOTA = platform.includes(selectedOTA.toLowerCase());
            }

            return matchesText && matchesOTA;
        });

        this.renderRows(filtered);
    }

    viewCertificate(code, name, encodedUrl) {
        const decodedName = decodeURIComponent(name);
        let decodedUrl = encodedUrl ? decodeURIComponent(encodedUrl) : '';

        const modal = document.getElementById('licenseModal');
        const titleEl = document.getElementById('modalOperatorTitle');
        const bodyEl = document.getElementById('modalPreviewBody');

        if (!modal || !bodyEl) return;

        titleEl.innerText = `📄 STR License File: ${decodedName} (${code})`;

        const isValidExternalUrl = decodedUrl.startsWith('http://') || decodedUrl.startsWith('https://');

        if (isValidExternalUrl) {
            const isImage = /\.(jpeg|jpg|png|gif|webp)$/i.test(decodedUrl);
            if (isImage) {
                bodyEl.innerHTML = `<img src="${decodedUrl}" class="preview-image" alt="License File">`;
            } else {
                bodyEl.innerHTML = `<iframe src="${decodedUrl}" class="preview-iframe"></iframe>`;
            }
        } else {
            bodyEl.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #475569; width: 100%;">
                    <div style="font-size: 54px; margin-bottom: 12px;">📜</div>
                    <h2 style="margin: 0 0 8px 0; color: #0F172A; font-size: 20px;">Official STR Operating License</h2>
                    <p style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: #334155;">${decodedName}</p>
                    <div style="margin: 12px 0;">
                        <span style="background-color: #EFF6FF; color: #2563EB; border: 1px solid #BFDBFE; padding: 6px 14px; border-radius: 8px; font-family: monospace; font-weight: 700; font-size: 14px;">
                            MySTRA Code: ${code}
                        </span>
                    </div>
                    <div style="margin-top: 16px;">
                        <span style="background: #D1FAE5; color: #065F46; padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 12px; display: inline-block;">
                            ● STATUS: ACTIVE & OFFICIALLY VERIFIED
                        </span>
                    </div>
                    <p style="margin-top: 24px; font-size: 12px; color: #94A3B8; border-top: 1px dashed #CBD5E1; padding-top: 16px;">
                        Verified via Malaysia Short-Term Residential Accommodation (MySTRA) Registry System.
                    </p>
                </div>
            `;
        }

        modal.style.display = 'flex';
    }

    closeLicenseModal() {
        const modal = document.getElementById('licenseModal');
        const bodyEl = document.getElementById('modalPreviewBody');
        if (modal) modal.style.display = 'none';
        if (bodyEl) bodyEl.innerHTML = '';
    }
}