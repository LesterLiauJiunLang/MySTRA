document.addEventListener('DOMContentLoaded', () => {
    window.govModule = new GovAdminModule();
});

class GovAdminModule {
    constructor() {
        this.adminId = "ADM-MYSTRA-2026";
        this.currentFilter = 'PENDING';
        this.selectedDocData = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.fetchQueueDocuments();
    }

    bindEvents() {
        document.querySelectorAll('.gov-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.gov-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentFilter = e.target.getAttribute('data-filter');
                this.fetchQueueDocuments();
            });
        });

        document.getElementById('btn-action-approve')?.addEventListener('click', () => this.processDecision('APPROVED'));
        document.getElementById('btn-action-reject')?.addEventListener('click', () => this.processDecision('REJECTED'));
        document.getElementById('btn-action-reupload')?.addEventListener('click', () => this.processDecision('REUPLOAD_REQUESTED'));
        document.getElementById('btn-open-preview')?.addEventListener('click', () => this.openDocumentModal());
    }

    async fetchQueueDocuments() {
        const queueContainer = document.getElementById('gov-doc-queue');
        if (!queueContainer || !window.supabaseClient) return;

        const { data: docs, error } = await window.supabaseClient
            .from('compliance_documents')
            .select('*')
            .order('uploaded_at', { ascending: false });

        if (error) {
            queueContainer.innerHTML = `<p style="color:red; font-size:13px;">Error fetching queue: ${error.message}</p>`;
            return;
        }

        const filteredDocs = (this.currentFilter === 'ALL') 
            ? docs 
            : docs.filter(doc => (doc.status || 'PENDING') === this.currentFilter);

        if (!filteredDocs || filteredDocs.length === 0) {
            queueContainer.innerHTML = `<p style="color:#6B7280; font-size:13px; text-align:center; padding:20px;">All host document applications have been reviewed.</p>`;
            return;
        }

        queueContainer.innerHTML = filteredDocs.map(doc => {
            const operator = doc.operator_name || 'Unassigned Operator';
            const location = doc.state ? ` (${doc.state})` : '';

            return `
                <div class="gov-queue-item" onclick='govModule.selectDocument(${JSON.stringify(doc)})'>
                    <div style="display:flex; justify-content:space-between; font-weight:600; font-size:13px;">
                        <span>📄 ${doc.document_type || 'Regulatory Document'}</span>
                        <span style="color:#2563EB;">#${doc.id.toString().substring(0, 8)}</span>
                    </div>
                    <div style="font-size:12px; color:#1F2937; font-weight:600; margin-top:4px;">
                        👤 ${operator}${location}
                    </div>
                    <div style="font-size:11px; color:#6B7280; margin-top:2px;">
                        Uploaded: ${new Date(doc.uploaded_at).toLocaleDateString()} | Status: <strong>${doc.status || 'PENDING'}</strong>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectDocument(doc) {
        this.selectedDocData = doc;
        document.getElementById('gov-selected-doc-id').value = doc.id;
        document.getElementById('gov-doc-ref-display').value = doc.id;
        document.getElementById('gov-doc-category-display').value = doc.document_type || 'N/A';
        document.getElementById('gov-official-remarks').value = doc.admin_feedback || '';
        
        const previewBtn = document.getElementById('btn-open-preview');
        if (previewBtn) previewBtn.disabled = false;

        document.querySelectorAll('.gov-queue-item').forEach(el => el.classList.remove('selected'));
        if (window.event && window.event.currentTarget) {
            window.event.currentTarget.classList.add('selected');
        }
    }

    openDocumentModal() {
    if (!this.selectedDocData) return;
    const modal = document.getElementById('document-preview-modal');
    const container = document.getElementById('modal-file-container');
    if (!modal || !container) return;

    modal.classList.remove('hidden');

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
        // Embeds PDF using Google Docs Viewer to bypass browser iframe blocking
        const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(fileUrl)}&embedded=true`;
        
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
        if (modal) modal.classList.add('hidden');
    }

    async processDecision(decisionType) {
        const docId = document.getElementById('gov-selected-doc-id').value;
        const comments = document.getElementById('gov-official-remarks').value.trim();

        if (!docId) {
            alert('⚠️ Please select a document from the queue.');
            return;
        }

        if ((decisionType === 'REJECTED' || decisionType === 'REUPLOAD_REQUESTED') && !comments) {
            alert(`⚠️ Mandatory feedback required for ${decisionType}.`);
            return;
        }

        const { error } = await window.supabaseClient
            .from('compliance_documents')
            .update({ status: decisionType, admin_feedback: comments })
            .eq('id', docId);

        if (error) {
            alert('❌ Failed to update decision: ' + error.message);
            return;
        }

        await window.supabaseClient.from('interceptor_audit_logs').insert([{
            registration_code: docId,
            requesting_ota: `GOV_ADMIN [${this.adminId}] - ${decisionType}`,
            is_valid_pass: decisionType === 'APPROVED',
            checked_nights_snapshot: 0,
            timestamp: new Date().toISOString()
        }]);

        alert(`✅ Decision recorded as ${decisionType}.`);
        this.resetForm();
        this.fetchQueueDocuments();
    }

    resetForm() {
        document.getElementById('gov-selected-doc-id').value = '';
        document.getElementById('gov-doc-ref-display').value = '';
        document.getElementById('gov-doc-category-display').value = '';
        document.getElementById('gov-official-remarks').value = '';
        const previewBtn = document.getElementById('btn-open-preview');
        if (previewBtn) previewBtn.disabled = true;
    }
}