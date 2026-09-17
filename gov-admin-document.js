document.addEventListener('DOMContentLoaded', () => {
    window.govAdminDocumentModule = new GovAdminDocumentModule();
});

class GovAdminDocumentModule {
    constructor() {
        this.adminId = window.currentAdminEmail || "GOV_ADMIN";

        // ----------------------------------------------------------------
        // Read the default filter from the currently-active tab in HTML.
        // ----------------------------------------------------------------
        const activeTab = document.querySelector('.gov-filter-btn.active');
        this.currentFilter = activeTab?.getAttribute('data-filter') || 'PENDING';

        this.selectedDocData = null;
        this.allDocuments = [];
        this.profileMap = {};
        this.propertyMap = {};

        this.init();
    }

    init() {
        this.bindEvents();
        this.fetchQueueDocuments();
    }

    /**
     * Sanitizes dynamic user strings to prevent XSS attacks
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
        // Tab Filter Buttons
        document.querySelectorAll('.gov-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.gov-filter-btn').forEach(b => b.classList.remove('active'));
                const target = e.currentTarget || e.target;
                target.classList.add('active');
                this.currentFilter = target.getAttribute('data-filter') || 'ALL';
                this.applyFilters();
            });
        });

        // Action Buttons
        document.getElementById('btn-action-approve')?.addEventListener('click', () => this.processDecision('APPROVED'));
        document.getElementById('btn-action-reject')?.addEventListener('click', () => this.processDecision('REJECTED'));
        document.getElementById('btn-action-reupload')?.addEventListener('click', () => this.processDecision('REUPLOAD_REQUESTED'));
        document.getElementById('btn-open-preview')?.addEventListener('click', () => this.openDocumentModal());
        document.getElementById('btn-close-modal')?.addEventListener('click', () => this.closeDocumentModal());

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
                queueContainer.innerHTML = `<p style="color:#EF4444; font-size:13px; text-align:center; padding:20px;">Error loading queue: ${this.escapeHtml(err.message)}</p>`;
            }
        }
    }

    applyFilters() {
        const queueContainer = document.getElementById('gov-doc-queue');
        if (!queueContainer) return;

        const searchQuery = (document.getElementById('gov-search-input')?.value || '').toLowerCase().trim();
        const stateFilter = document.getElementById('gov-state-filter')?.value || 'ALL';

        const filteredDocs = this.allDocuments.filter(doc => {
            const rawStatus = doc.review_status || doc.status || 'PENDING';
            const status = rawStatus.toUpperCase();

            const matchesTab = (this.currentFilter === 'ALL') || (status === this.currentFilter);

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
            const rawOperator = doc.operator_name || this.profileMap[userId] || 'Registered Operator';
            const rawProperty = this.propertyMap[doc.property_id] || 'Accommodation Listing';
            const rawDocType = doc.document_type || doc.document_name || 'Regulatory Document';

            const operator = this.escapeHtml(rawOperator);
            const propertyName = this.escapeHtml(rawProperty);
            const docType = this.escapeHtml(rawDocType);
            const location = doc.state ? ` (${this.escapeHtml(doc.state)})` : '';
            const isSelected = this.selectedDocData?.id === doc.id;
            const docIdStr = this.escapeHtml(doc.id.toString());

            const rawStatus = doc.review_status || doc.status || 'PENDING';
            const status = rawStatus.toUpperCase();

            // Store the doc in a global map to avoid JSON.stringify issues in the onclick attribute
            if (!window.__mystraDocCache) window.__mystraDocCache = {};
            window.__mystraDocCache[doc.id] = doc;

            return `
                <div class="gov-queue-item ${isSelected ? 'selected' : ''}" 
                     onclick="govAdminDocumentModule.selectDocument(window.__mystraDocCache['${docIdStr}'])" 
                     style="cursor:pointer; border:1px solid ${isSelected ? '#2563EB' : '#E2E8F0'}; background:${isSelected ? '#EFF6FF' : '#FFFFFF'}; padding:12px; border-radius:8px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13px; color:#0F172A;">
                        <span>📄 ${docType}</span>
                        <span style="color:#2563EB; font-family:monospace;">#${docIdStr.substring(0, 8)}</span>
                    </div>
                    <div style="font-size:12px; color:#1E293B; font-weight:600; margin-top:4px;">
                        👤 ${operator}${location}
                    </div>
                    <div style="font-size:11px; color:#475569; margin-top:2px;">
                        🏠 Property: <strong>${propertyName}</strong>
                    </div>
                    <div style="font-size:11px; color:#6B7280; margin-top:4px; display:flex; justify-content:space-between;">
                        <span>Uploaded: ${new Date(doc.uploaded_at || Date.now()).toLocaleDateString()}</span>
                        <span>Status: <strong style="color:${status === 'APPROVED' ? '#059669' : status === 'REJECTED' ? '#DC2626' : '#D97706'}">${this.escapeHtml(status)}</strong></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectDocument(doc) {
        if (!doc) return;
        this.selectedDocData = doc;

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

        const rawStatus = doc.review_status || doc.status || 'PENDING';
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

        const rawUrl = this.selectedDocData.file_path || this.selectedDocData.file_url || this.selectedDocData.document_url;

        if (!rawUrl || rawUrl.trim() === '') {
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px; border:2px dashed #CBD5E1; border-radius:8px; background:#F8FAFC;">
                    <div style="font-size:32px; margin-bottom:8px;">📄</div>
                    <h4 style="margin:0 0 4px 0; color:#334155; font-size:14px; font-weight:600;">No Document File Attached</h4>
                    <p style="margin:0; color:#64748B; font-size:12px;">The host submitted this entry without attaching a file link.</p>
                </div>
            `;
            return;
        }

        const fileUrl = this.escapeHtml(rawUrl.trim());
        const isPdf = fileUrl.toLowerCase().includes('.pdf');

        if (isPdf) {
            const viewerUrl = fileUrl.startsWith('http') ? `https://docs.google.com/gview?url=${encodeURIComponent(rawUrl)}&embedded=true` : fileUrl;
            container.innerHTML = `
                <iframe src="${this.escapeHtml(viewerUrl)}" style="width:100%; height:480px; border:1px solid #E2E8F0; border-radius:8px;" frameborder="0"></iframe>
                <div style="margin-top:10px; text-align:right;">
                    <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB; font-size:12px; font-weight:600; text-decoration:none;">↗ Open direct PDF file</a>
                </div>
            `;
        } else {
            container.innerHTML = `
                <img src="${fileUrl}" alt="Document Preview" 
                     style="max-width:100%; max-height:480px; border-radius:8px; display:block; margin:0 auto;" 
                     onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'text-align:center; padding:30px; color:#EF4444; font-size:13px;\\'>⚠️ File link broken or inaccessible.</div>';" />
                <div style="margin-top:10px; text-align:right;">
                    <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" style="color:#2563EB; font-size:12px; font-weight:600; text-decoration:none;">↗ View full image</a>
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
            const statusValue = decisionType.toUpperCase();

            // ================================================================
            // STEP 1: Update the compliance_documents table
            // ================================================================
            const { error: docError } = await window.supabaseClient
                .from('compliance_documents')
                .update({
                    status: statusValue,
                    review_status: statusValue,
                    admin_feedback: comments
                })
                .eq('id', docId);

            if (docError) throw docError;

            // ================================================================
            // STEP 2: Cascading verification updates upon approval
            //
            //   SCOPE NOTE: Property verification is NOT performed here.
            //   Property's `is_verified` flag is set to true in Module 4 when
            //   the operator generates a MySTRA code and binds it to the
            //   property via the Mock Agoda onboarding page.
            //
            //   Module 5's responsibility is limited to verifying the
            //   OPERATOR's identity (via SSM/Business document approval).
            // ================================================================
            if (statusValue === 'APPROVED' || statusValue === 'VERIFIED') {
                const targetUserId = this.selectedDocData?.user_id || this.selectedDocData?.operator_id;
                const rawDocType = this.selectedDocData?.document_type || this.selectedDocData?.document_name || '';
                const docType = rawDocType.toUpperCase();
                const ssmNumber = this.selectedDocData?.ssm_number;

                console.log('🔍 [Cascade] ===== Approval Cascade Start =====');
                console.log('🔍 [Cascade] targetUserId:', targetUserId);
                console.log('🔍 [Cascade] raw document_type:', rawDocType);
                console.log('🔍 [Cascade] docType (upper):', docType);
                console.log('🔍 [Cascade] ssmNumber:', ssmNumber);

                // ---- Update profile (SSM/Business only) ----
                const isBusinessDoc =
                    docType.includes('SSM') ||
                    docType.includes('BUSINESS') ||
                    docType.includes('COMPANY') ||
                    docType.includes('REGISTRATION') ||
                    docType.includes('SURUHANJAYA');   // Malay name for SSM

                console.log('🔍 [Cascade] isBusinessDoc?', isBusinessDoc, '| targetUserId?', !!targetUserId);

                if (isBusinessDoc && targetUserId) {
                    const profileUpdatePayload = { is_verified: true };
                    if (ssmNumber) profileUpdatePayload.business_ssm = ssmNumber;

                    console.log('🔧 [Cascade] UPDATE profiles SET', profileUpdatePayload, 'WHERE id =', targetUserId);

                    const { data: profRows, error: profErr } = await window.supabaseClient
                        .from('profiles')
                        .update(profileUpdatePayload)
                        .eq('id', targetUserId)
                        .select();

                    if (profErr) {
                        console.error('❌ [Cascade] Profile update FAILED:', profErr);
                        console.error('   Message:', profErr.message);
                        console.error('   Code:', profErr.code);
                        console.error('   Hint:', profErr.hint);

                        if (profErr.code === '42501') {
                            alert(
                                '⚠️ Document approved, but operator profile verification FAILED.\n\n' +
                                'Reason: Row-Level Security (RLS) policy blocked the update.\n\n' +
                                'Please contact your Supabase admin to review the profiles table RLS policies.'
                            );
                        } else {
                            alert(`⚠️ Document approved, but profile verification failed: ${profErr.message}`);
                        }
                    } else if (!profRows || profRows.length === 0) {
                        console.warn('⚠️ [Cascade] No profile matched id =', targetUserId);
                        alert(`⚠️ Document approved, but no profile was found with id:\n${targetUserId}`);
                    } else {
                        console.log('✅ [Cascade] Profile verified successfully:', profRows);
                    }
                } else if (!isBusinessDoc) {
                    console.log('ℹ️ [Cascade] Skipped profile update — not an SSM/Business document.');
                } else {
                    console.warn('⚠️ [Cascade] Skipped profile update — no targetUserId (user_id/operator_id missing).');
                }
            }

            // ================================================================
            // STEP 3: Write the audit log entry.
            // ================================================================
            try {
                if (window.GovAuditLogDirectory && typeof window.GovAuditLogDirectory.logAction === 'function') {
                    await window.GovAuditLogDirectory.logAction({
                        registrationCode: docId,
                        targetDocId: docId,
                        actionDetails: `Document ${statusValue} (${this.selectedDocData?.document_type || 'N/A'})`,
                        isValidPass: statusValue === 'APPROVED' || statusValue === 'VERIFIED',
                        requestingOta: 'GOV_ADMIN'
                    });
                } else {
                    let fallbackName = window.currentAdminName;
                    if (!fallbackName) {
                        try {
                            const { data: { user } } = await window.supabaseClient.auth.getUser();
                            if (user) {
                                const { data: profile } = await window.supabaseClient
                                    .from('profiles')
                                    .select('full_name, business_name')
                                    .eq('id', user.id)
                                    .maybeSingle();

                                fallbackName = profile?.full_name
                                    || profile?.business_name
                                    || user.user_metadata?.full_name
                                    || user.email?.split('@')[0]
                                    || null;
                            }
                        } catch (lookupErr) {
                            console.warn('⚠️ [Fallback] Could not resolve officer name:', lookupErr.message);
                        }
                    }
                    fallbackName = fallbackName || 'System Admin';

                    await window.supabaseClient.from('interceptor_audit_logs').insert([{
                        registration_code: docId,
                        target_doc_id: docId,
                        action_details: `[Actor: ${fallbackName}] Document ${statusValue} (${this.selectedDocData?.document_type || 'N/A'})`,
                        requesting_ota: 'GOV_ADMIN',
                        is_valid_pass: statusValue === 'APPROVED' || statusValue === 'VERIFIED',
                        checked_nights_snapshot: 0,
                        timestamp: new Date().toISOString()
                    }]);
                }
            } catch (auditErr) {
                console.warn("Audit log insert warning:", auditErr);
            }

            // ================================================================
            // STEP 4: Notify the user and refresh the queue
            // ================================================================
            alert(`✅ Verification decision successfully saved: ${statusValue}.`);
            this.resetForm();
            await this.fetchQueueDocuments();

        } catch (err) {
            console.error("Error processing decision:", err);
            alert('❌ Failed to update document status: ' + (err.message || err));
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
