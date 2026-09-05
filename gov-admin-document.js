document.addEventListener('DOMContentLoaded', () => {
    window.govAdminDocumentModule = new GovAdminDocumentModule();
});

class GovAdminDocumentModule {
    constructor() {
        this.adminId = "ADM-MYSTRA-2026";
        this.currentFilter = 'PENDING';
        this.selectedDocData = null;
        this.allDocuments = [];
        this.profileMap = {};
        this.propertyMap = {};
        this.init();
    }

    init() {
        if (!window.supabaseClient) {
            setTimeout(() => this.init(), 300);
            return;
        }
        this.bindEvents();
        this.fetchQueueDocuments();
    }

    bindEvents() {
        // Tab Filter Buttons
        document.querySelectorAll('.gov-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.gov-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.getAttribute('data-filter');
                this.applyFilters();
            });
        });

        // Action Buttons
        document.getElementById('btn-action-approve')?.addEventListener('click', () => this.processDecision('APPROVED'));
        document.getElementById('btn-action-reject')?.addEventListener('click', () => this.processDecision('REJECTED'));
        document.getElementById('btn-action-reupload')?.addEventListener('click', () => this.processDecision('REUPLOAD_REQUESTED'));
        document.getElementById('btn-open-preview')?.addEventListener('click', () => this.openDocumentModal());

        // Search Input and State Select Dropdown
        document.getElementById('gov-search-input')?.addEventListener('input', () => this.applyFilters());
        document.getElementById('gov-state-filter')?.addEventListener('change', () => this.applyFilters());
    }

    async fetchQueueDocuments() {
        const queueContainer = document.getElementById('gov-doc-queue');
        if (!queueContainer || !window.supabaseClient) return;

        try {
            // 1. Fetch compliance document submissions
            const { data: docs, error } = await window.supabaseClient
                .from('compliance_documents')
                .select('*')
                .order('uploaded_at', { ascending: false });

            if (error) throw error;

            // 2. Fetch profiles and properties in parallel for entity name mapping
            const [profilesRes, propertiesRes] = await Promise.all([
                window.supabaseClient.from('profiles').select('id, full_name, business_name'),
                window.supabaseClient.from('properties').select('id, title, name')
            ]);

            this.profileMap = {};
            (profilesRes.data || []).forEach(p => {
                this.profileMap[p.id] = p.business_name || p.full_name || 'Operator Entity';
            });

            this.propertyMap = {};
            (propertiesRes.data || []).forEach(p => {
                this.propertyMap[p.id] = p.title || p.name || 'Accommodation Listing';
            });

            this.allDocuments = docs || [];
            this.applyFilters();

        } catch (err) {
            console.error("Error fetching queue documents:", err);
            if (queueContainer) {
                queueContainer.innerHTML = `<p style="color:#EF4444; font-size:13px; text-align:center; padding:20px;">Error loading queue: ${err.message}</p>`;
            }
        }
    }

    applyFilters() {
        const queueContainer = document.getElementById('gov-doc-queue');
        if (!queueContainer) return;

        const searchQuery = (document.getElementById('gov-search-input')?.value || '').toLowerCase().trim();
        const stateFilter = document.getElementById('gov-state-filter')?.value || 'ALL';

        const filteredDocs = this.allDocuments.filter(doc => {
            // Normalize status values to Uppercase for strict parity
            const rawStatus = doc.status || doc.review_status || 'PENDING';
            const status = rawStatus.toUpperCase();
            
            let matchesTab = (this.currentFilter === 'ALL') || (status === this.currentFilter);

            // Get mapped names for global search
            const userId = doc.user_id || doc.operator_id;
            const operator = (doc.operator_name || this.profileMap[userId] || '').toLowerCase();
            const property = (this.propertyMap[doc.property_id] || '').toLowerCase();
            const ssm = (doc.ssm_number || '').toLowerCase();
            const docType = (doc.document_type || doc.document_name || '').toLowerCase();
            const refId = (doc.id || '').toString().toLowerCase();

            const matchesSearch = !searchQuery || 
                operator.includes(searchQuery) || 
                property.includes(searchQuery) ||
                ssm.includes(searchQuery) || 
                docType.includes(searchQuery) || 
                refId.includes(searchQuery);

            const docState = doc.state || '';
            const matchesState = (stateFilter === 'ALL') || (docState.toLowerCase() === stateFilter.toLowerCase());

            return matchesTab && matchesSearch && matchesState;
        });

        if (filteredDocs.length === 0) {
            queueContainer.innerHTML = `<p style="color:#6B7280; font-size:13px; text-align:center; padding:20px;">No document records match your filter criteria.</p>`;
            return;
        }

        queueContainer.innerHTML = filteredDocs.map(doc => {
            const userId = doc.user_id || doc.operator_id;
            const operator = doc.operator_name || this.profileMap[userId] || 'Registered Operator';
            const propertyName = this.propertyMap[doc.property_id] || 'Accommodation Listing';
            const location = doc.state ? ` (${doc.state})` : '';
            const isSelected = this.selectedDocData?.id === doc.id;
            const docType = doc.document_type || doc.document_name || 'Regulatory Document';
            
            // Normalize status to Uppercase
            const rawStatus = doc.status || doc.review_status || 'PENDING';
            const status = rawStatus.toUpperCase();

            return `
                <div class="gov-queue-item ${isSelected ? 'selected' : ''}" onclick='govAdminDocumentModule.selectDocument(${JSON.stringify(doc)})' style="cursor:pointer; border:1px solid ${isSelected ? '#2563EB' : '#E2E8F0'}; background:${isSelected ? '#EFF6FF' : '#FFFFFF'}; padding:12px; border-radius:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13px; color:#0F172A;">
                        <span>📄 ${docType}</span>
                        <span style="color:#2563EB; font-family:monospace;">#${doc.id.toString().substring(0, 8)}</span>
                    </div>
                    <div style="font-size:12px; color:#1E293B; font-weight:600; margin-top:4px;">
                        👤 ${operator}${location}
                    </div>
                    <div style="font-size:11px; color:#475569; margin-top:2px;">
                        🏠 Property: <strong>${propertyName}</strong>
                    </div>
                    <div style="font-size:11px; color:#6B7280; margin-top:4px; display:flex; justify-content:space-between;">
                        <span>Uploaded: ${new Date(doc.uploaded_at || Date.now()).toLocaleDateString()}</span>
                        <span>Status: <strong style="color:${status === 'APPROVED' ? '#059669' : status === 'REJECTED' ? '#DC2626' : '#D97706'}">${status}</strong></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectDocument(doc) {
        this.selectedDocData = doc;
        
        // Populate evaluation panel
        const selectedIdInput = document.getElementById('gov-selected-doc-id');
        const refDisplayInput = document.getElementById('gov-doc-ref-display');
        const categoryDisplayInput = document.getElementById('gov-doc-category-display');
        const remarksInput = document.getElementById('gov-official-remarks');

        if (selectedIdInput) selectedIdInput.value = doc.id;
        if (refDisplayInput) refDisplayInput.value = `#${doc.id}`;
        if (categoryDisplayInput) categoryDisplayInput.value = doc.document_type || doc.document_name || 'N/A';
        if (remarksInput) remarksInput.value = doc.admin_feedback || '';
        
        const previewBtn = document.getElementById('btn-open-preview');
        if (previewBtn) previewBtn.disabled = false;

        const actionRow = document.getElementById('gov-action-row');
        const lockedNotice = document.getElementById('gov-locked-notice');
        
        // Normalize status to Uppercase
        const rawStatus = doc.status || doc.review_status || 'PENDING';
        const status = rawStatus.toUpperCase();

        if (status === 'PENDING') {
            if (actionRow) actionRow.classList.remove('hidden');
            if (lockedNotice) lockedNotice.classList.add('hidden');
        } else {
            if (actionRow) actionRow.classList.add('hidden');
            if (lockedNotice) {
                lockedNotice.classList.remove('hidden');
                
                if (status === 'APPROVED' || status === 'VERIFIED') {
                    lockedNotice.style.backgroundColor = '#D1FAE5';
                    lockedNotice.style.color = '#065F46';
                    lockedNotice.innerHTML = '🔒 SSM/Document Verified (Unlocked for Host Portal)';
                } else if (status === 'REJECTED') {
                    lockedNotice.style.backgroundColor = '#FEE2E2';
                    lockedNotice.style.color = '#991B1B';
                    lockedNotice.innerHTML = '❌ Application Rejected';
                } else if (status === 'REUPLOAD_REQUESTED') {
                    lockedNotice.style.backgroundColor = '#FEF3C7';
                    lockedNotice.style.color = '#92400E';
                    lockedNotice.innerHTML = '⏳ Awaiting Host Resubmission';
                }
            }
        }

        this.applyFilters();
    }

    openDocumentModal() {
        if (!this.selectedDocData) return;
        const modal = document.getElementById('document-preview-modal');
        const container = document.getElementById('modal-file-container');
        if (!modal || !container) return;

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        
        const fileUrl = this.selectedDocData.file_path || this.selectedDocData.file_url || this.selectedDocData.document_url;

        if (!fileUrl || fileUrl.trim() === '') {
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px; border:2px dashed #CBD5E1; border-radius:8px; background:#F8FAFC;">
                    <div style="font-size:32px; margin-bottom:8px;">📄</div>
                    <h4 style="margin:0 0 4px 0; color:#334155; font-size:14px; font-weight:600;">No Document File Attached</h4>
                    <p style="margin:0; color:#64748B; font-size:12px;">The host submitted this entry without attaching a file link.</p>
                </div>
            `;
            return;
        }

        const isPdf = fileUrl.toLowerCase().includes('.pdf');
        if (isPdf) {
            const viewerUrl = fileUrl.startsWith('http') ? `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true` : fileUrl;
            container.innerHTML = `
                <iframe src="${viewerUrl}" style="width:100%; height:480px; border:1px solid #E2E8F0; border-radius:8px;" frameborder="0"></iframe>
                <div style="margin-top:10px; text-align:right;">
                    <a href="${fileUrl}" target="_blank" style="color:#2563EB; font-size:12px; font-weight:600; text-decoration:none;">↗ Open direct PDF file</a>
                </div>
            `;
        } else {
            container.innerHTML = `
                <img src="${fileUrl}" alt="Document Preview" 
                     style="max-width:100%; max-height:480px; border-radius:8px; display:block; margin:0 auto;" 
                     onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'text-align:center; padding:30px; color:#EF4444; font-size:13px;\\'>⚠️ File link broken or inaccessible.</div>';" />
                <div style="margin-top:10px; text-align:right;">
                    <a href="${fileUrl}" target="_blank" style="color:#2563EB; font-size:12px; font-weight:600; text-decoration:none;">↗ View full image</a>
                </div>
            `;
        }
    }   

    closeDocumentModal() {
        const modal = document.getElementById('document-preview-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    }

    async processDecision(decisionType) {
        const docId = document.getElementById('gov-selected-doc-id')?.value;
        const remarksInput = document.getElementById('gov-official-remarks');
        const comments = remarksInput ? remarksInput.value.trim() : '';

        if (!docId) {
            alert('⚠️ Please select a document from the queue.');
            return;
        }

        if ((decisionType === 'REJECTED' || decisionType === 'REUPLOAD_REQUESTED') && !comments) {
            alert(`⚠️ Mandatory feedback required for ${decisionType}.`);
            return;
        }

        try {
            // Ensure status and review_status are synchronized in UPPERCASE
            const statusValue = decisionType.toUpperCase();
            const reviewStatusValue = statusValue;

            // 1. Update compliance_documents table
            const { error: docError } = await window.supabaseClient
                .from('compliance_documents')
                .update({ 
                    status: statusValue, 
                    review_status: reviewStatusValue, 
                    admin_feedback: comments 
                })
                .eq('id', docId);

            if (docError) throw docError;

            // 2. Synchronize verified status to related entities upon approval
            if (statusValue === 'APPROVED' || statusValue === 'VERIFIED') {
                const targetPropertyId = this.selectedDocData?.property_id;
                const targetUserId = this.selectedDocData?.user_id || this.selectedDocData?.operator_id;
                const docType = (this.selectedDocData?.document_type || this.selectedDocData?.document_name || '').toUpperCase();
                const ssmNumber = this.selectedDocData?.ssm_number;

                // Update property verification
                if (targetPropertyId) {
                    await window.supabaseClient
                        .from('properties')
                        .update({ is_verified: true })
                        .eq('id', targetPropertyId);
                }

                // Strictly update operator profile ONLY if document is SSM verification
                if (docType.includes('SSM') || docType.includes('BUSINESS')) {
                    if (targetUserId) {
                        const profileUpdatePayload = { is_verified: true };
                        if (ssmNumber) {
                            profileUpdatePayload.business_ssm = ssmNumber;
                        }

                        await window.supabaseClient
                            .from('profiles')
                            .update(profileUpdatePayload)
                            .eq('id', targetUserId);
                    }
                }
            }

            // 3. Write audit log entry
            try {
                await window.supabaseClient.from('interceptor_audit_logs').insert([{
                    registration_code: docId,
                    requesting_ota: `GOV_ADMIN [${this.adminId}] - ${statusValue}`,
                    is_valid_pass: statusValue === 'APPROVED' || statusValue === 'VERIFIED',
                    checked_nights_snapshot: 0,
                    timestamp: new Date().toISOString()
                }]);
            } catch (auditErr) {
                console.warn("Audit log insert warning:", auditErr);
            }

            alert(`✅ Verification decision successfully saved: ${statusValue}.`);
            this.resetForm();
            await this.fetchQueueDocuments();

        } catch (err) {
            console.error("Error processing decision:", err);
            alert('❌ Failed to update document status: ' + err.message);
        }
    }

    resetForm() {
        this.selectedDocData = null;
        
        const selectedIdInput = document.getElementById('gov-selected-doc-id');
        const refDisplayInput = document.getElementById('gov-doc-ref-display');
        const categoryDisplayInput = document.getElementById('gov-doc-category-display');
        const remarksInput = document.getElementById('gov-official-remarks');

        if (selectedIdInput) selectedIdInput.value = '';
        if (refDisplayInput) refDisplayInput.value = '';
        if (categoryDisplayInput) categoryDisplayInput.value = '';
        if (remarksInput) remarksInput.value = '';

        const previewBtn = document.getElementById('btn-open-preview');
        if (previewBtn) previewBtn.disabled = true;

        const actionRow = document.getElementById('gov-action-row');
        const lockedNotice = document.getElementById('gov-locked-notice');
        
        if (actionRow) actionRow.classList.remove('hidden');
        if (lockedNotice) lockedNotice.classList.add('hidden');
    }
}

/**
 * 独立的全局 Logout 函数，供 HTML onclick="handleLogout(event)" 调用
 */
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