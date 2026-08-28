
// --- Global State for Documents ---
let docState = {
    documents: [],
    selectedDocument: null,
    isRevisionMode: false
};

// --- Render Document Status Dashboard (UC-M3-03) ---
function renderDocumentStatus(documents) {
    const container = document.getElementById('documents-status-container');
    if (!container) return;

    if (!documents || documents.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="text-align: center; padding: 40px; color: #6B7280;">
                <p style="font-size: 40px; margin-bottom: 16px;">📄</p>
                <h3 style="font-weight: 600; color: #1E293B;">No Documents Uploaded</h3>
                <p style="font-size: 14px;">Upload your compliance documents to get verified.</p>
                <button class="btn-primary" onclick="switchToTab('upload')" style="margin-top: 16px;">
                    📤 Upload Documents
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Document Type</th>
                    <th>File Name</th>
                    <th>Uploaded</th>
                    <th>Status</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
                ${documents.map(doc => {
                    const statusBadge = getStatusBadge(doc.review_status);
                    const actionBtn = doc.review_status === 'Rejected' || doc.review_status === 'Needs Revision'
                        ? `<button class="btn-secondary" onclick="openRevisionModal('${doc.id}')">✏️ Revise</button>`
                        : `<button class="btn-secondary" onclick="viewDocument('${doc.id}')">👁️ View</button>`;
                    
                    return `
                        <tr>
                            <td><strong>${doc.document_type}</strong></td>
                            <td>${doc.file_name}</td>
                            <td>${new Date(doc.uploaded_at).toLocaleDateString()}</td>
                            <td>${statusBadge}</td>
                            <td>${actionBtn}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

// --- Helper: Status Badge HTML ---
function getStatusBadge(status) {
    const statusMap = {
        'Pending': { class: 'badge-pending', label: '🟡 Pending' },
        'Approved': { class: 'badge-approved', label: '🟢 Approved' },
        'Rejected': { class: 'badge-rejected', label: '🔴 Rejected' },
        'Needs Revision': { class: 'badge-revision', label: '🟠 Needs Revision' }
    };
    const s = statusMap[status] || statusMap['Pending'];
    return `<span class="${s.class}">${s.label}</span>`;
}

// --- Render Location Registry Map (UC-M3-05) ---
function renderLocationRegistry(propertyId, userGPS) {
    const container = document.getElementById('location-registry-container');
    if (!container) return;

    // Fetch property coordinates from Supabase
    MySTRA_API.getPropertyCoordinates(propertyId).then(({ data: property, error }) => {
        if (error || !property) {
            container.innerHTML = `
                <div class="widget-card" style="text-align: center; color: #6B7280;">
                    <p>📍 Property location not registered.</p>
                    <p style="font-size: 13px;">Please contact support to update your property address.</p>
                </div>
            `;
            return;
        }

        const distance = MySTRA_API.calculateDistance(
            userGPS.lat, userGPS.lng,
            property.latitude, property.longitude
        );
        const isWithinZone = distance <= 500;

        container.innerHTML = `
            <div class="widget-card">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                    <!-- Map Visualization -->
                    <div style="background: #F1F5F9; border-radius: 12px; padding: 20px; text-align: center; min-height: 200px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <div style="position: relative; width: 180px; height: 180px; margin: 0 auto;">
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 60px; height: 60px; border-radius: 50%; background: #2563EB; opacity: 0.15; border: 2px solid #2563EB;"></div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 120px; height: 120px; border-radius: 50%; background: #2563EB; opacity: 0.08; border: 2px dashed #2563EB;"></div>
                            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #2563EB; width: 16px; height: 16px; border-radius: 50%;"></div>
                            <div style="position: absolute; top: 30%; left: 70%; background: #22C55E; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.3);"></div>
                            <span style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); font-size: 11px; color: #6B7280;">⭕ 500m Geofence</span>
                        </div>
                        <p style="font-size: 12px; color: #6B7280; margin-top: 8px;">📍 Your Location  🏠 Property</p>
                    </div>

                    <!-- GPS Details -->
                    <div>
                        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">📍 Location Details</h4>
                        <div style="display: grid; gap: 8px; font-size: 13px;">
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9;">
                                <span style="color: #6B7280;">Property Address</span>
                                <span style="font-weight: 500;">${property.address || 'N/A'}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9;">
                                <span style="color: #6B7280;">Property GPS</span>
                                <span style="font-family: monospace;">${property.latitude.toFixed(4)}°, ${property.longitude.toFixed(4)}°</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9;">
                                <span style="color: #6B7280;">Your GPS</span>
                                <span style="font-family: monospace;">${userGPS.lat.toFixed(4)}°, ${userGPS.lng.toFixed(4)}°</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                                <span style="color: #6B7280;">Distance</span>
                                <span style="font-weight: 600;">${Math.round(distance)} meters</span>
                            </div>
                            <div style="padding: 12px; border-radius: 8px; text-align: center; margin-top: 8px; ${isWithinZone ? 'background: #DCFCE7; color: #15803D;' : 'background: #FEE2E2; color: #991B1B;'}">
                                ${isWithinZone ? '✅ Within 500m Zone' : '❌ Outside 500m Zone'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
}

// --- Open Revision Modal (UC-M3-04) ---
function openRevisionModal(documentId) {
    const modal = document.getElementById('revision-modal');
    if (!modal) return;

    // Fetch document details
    MySTRA_API.getDocumentById(documentId).then(({ data: doc, error }) => {
        if (error || !doc) {
            alert('Error loading document details.');
            return;
        }

        docState.selectedDocument = doc;
        docState.isRevisionMode = true;

        // Populate modal
        document.getElementById('revision-doc-type').textContent = doc.document_type;
        document.getElementById('revision-previous-file').textContent = doc.file_name;
        document.getElementById('revision-rejection-reason').textContent = doc.admin_feedback || 'No specific reason provided.';

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    });
}

// --- Close Revision Modal ---
function closeRevisionModal() {
    const modal = document.getElementById('revision-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    docState.isRevisionMode = false;
}

// --- Submit Revision (UC-M3-04) ---
async function submitRevision() {
    const fileInput = document.getElementById('revision-file-input');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    if (!docState.selectedDocument) {
        alert('No document selected for revision.');
        return;
    }

    // Validate file
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        alert('Invalid file format. Please upload PDF, JPEG, or PNG.');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit.');
        return;
    }

    // Get GPS
    const gps = await getCurrentGPS();
    if (!gps) {
        alert('GPS location required. Please enable location services.');
        return;
    }

    // Check if within 500m geofence
    const { data: property } = await MySTRA_API.getPropertyCoordinates(docState.selectedDocument.property_id);
    if (property) {
        const distance = MySTRA_API.calculateDistance(
            gps.lat, gps.lng,
            property.latitude, property.longitude
        );
        if (distance > 500) {
            alert('You must be within 500m of the property to re-upload documents.');
            return;
        }
    }

    // Upload new file
    const { data, error } = await MySTRA_API.uploadDocument(
        file,
        docState.selectedDocument.document_type,
        docState.selectedDocument.user_id,
        docState.selectedDocument.property_id,
        gps.lat,
        gps.lng
    );

    if (error) {
        alert(`Upload failed: ${error.message}`);
        return;
    }

    // Update old document status to "Pending" and deactivate old one
    await MySTRA_API.updateDocument(docState.selectedDocument.id, {
        review_status: 'Replaced',
        replaced_by: data[0].id
    });

    alert('✅ Document revised successfully! Awaiting admin review.');
    closeRevisionModal();
    loadDocumentData();
}

// --- Get Current GPS Position ---
function getCurrentGPS() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            () => resolve(null)
        );
    });
}

// --- Load all document data ---
async function loadDocumentData() {
    const userId = 'your-user-id'; // Replace with actual user ID from auth
    const { data: documents, error } = await MySTRA_API.getDocumentsByUser(userId);
    if (!error && documents) {
        docState.documents = documents;
        renderDocumentStatus(documents);
    }
}

// ==============================================================================
// 👤 USER MANAGEMENT (Mock Auth for Testing)
// ==============================================================================

// User profiles for testing
const MOCK_USERS = {
    '550e8400-e29b-41d4-a716-446655440000': {
        name: 'John Doe',
        role: 'Property Owner',
        verified: true,
        properties: ['MYSTRA-KL-2026-897F']
    },
    '660e8400-e29b-41d4-a716-446655440001': {
        name: 'Jane Smith',
        role: 'Property Owner',
        verified: false,
        properties: ['MYSTRA-KL-2026-34AC']
    },
    '770e8400-e29b-41d4-a716-446655440002': {
        name: 'Bob Lee',
        role: 'Property Owner',
        verified: true,
        properties: ['MYSTRA-KL-2026-56BD']
    }
};

function getCurrentUser() {
    const userId = DOC_STATE.userId || '550e8400-e29b-41d4-a716-446655440000';
    return MOCK_USERS[userId] || MOCK_USERS['550e8400-e29b-41d4-a716-446655440000'];
}

function switchUser(userId) {
    DOC_STATE.userId = userId;
    const user = getCurrentUser();
    
    // Update sidebar footer
    const footerName = document.querySelector('.sidebar-footer span:first-child');
    const footerRole = document.querySelector('.sidebar-footer span:last-child');
    if (footerName) footerName.textContent = user.name;
    if (footerRole) footerRole.textContent = `${user.role} ${user.verified ? '✅' : '⏳ Pending Verification'}`;
    
    // Reload documents for new user
    loadDocumentData();
    initGPSDetection();
}

// Add event listener for user selector
document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('user-selector');
    if (selector) {
        selector.addEventListener('change', (e) => {
            switchUser(e.target.value);
        });
    }
});

function updateUserVerificationStatus() {
    const statusEl = document.getElementById('user-verification-status');
    if (!statusEl) return;
    
    const user = getCurrentUser();
    if (user.verified) {
        statusEl.textContent = '✅ Verified';
        statusEl.className = 'badge-approved';
    } else {
        statusEl.textContent = '⏳ Pending Verification';
        statusEl.className = 'badge-pending';
    }
}

// Call this in DOMContentLoaded
updateUserVerificationStatus();

// ==============================================================================
// 🗑️ DELETE DOCUMENT
// ==============================================================================

async function deleteDocument(documentId) {
    const doc = DOC_STATE.documents.find(d => d.id === documentId);
    if (!doc) {
        alert('Document not found.');
        return;
    }
    
    if (doc.review_status !== 'Pending') {
        alert('Only pending documents can be deleted. Please contact admin for approved/rejected documents.');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete "${doc.file_name}"? This action cannot be undone.`)) {
        return;
    }
    
    try {
        const { error } = await MySTRA_API.deleteDocument(documentId);
        if (error) {
            alert('Delete failed: ' + error.message);
            return;
        }
        alert('✅ Document deleted successfully.');
        await loadDocumentData();
    } catch (err) {
        alert('Error deleting document: ' + err.message);
    }
}