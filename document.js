// ==============================================================================
// 📄 DOCUMENT STATE & HELPERS
// ==============================================================================

const DOC_STATE = {
    documents: [],
    selectedDocument: null,
    isRevisionMode: false,
    userId: '550e8400-e29b-41d4-a716-446655440000', // Default user
    propertyId: null,
    propertyGPS: null
};

let currentGPS = null;

// ==============================================================================
// 👤 USER MANAGEMENT (Mock Auth for Testing)
// ==============================================================================

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
    return MOCK_USERS[DOC_STATE.userId] || MOCK_USERS['550e8400-e29b-41d4-a716-446655440000'];
}

function switchUser(userId) {
    DOC_STATE.userId = userId;
    const user = getCurrentUser();
    
    const footerName = document.querySelector('.sidebar-footer span:first-child');
    const footerRole = document.querySelector('.sidebar-footer span:last-child');
    if (footerName) footerName.textContent = user.name;
    if (footerRole) footerRole.textContent = `${user.role} ${user.verified ? '✅' : '⏳ Pending Verification'}`;
    
    loadDocumentData();
    initGPSDetection();
    updateUserVerificationStatus();
}

// ==============================================================================
// 📍 GPS & GEOFENCE LOGIC
// ==============================================================================

function getCurrentGPS() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.warn('GPS: Browser does not support geolocation.');
            resolve(null);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                console.warn('GPS Error:', error.message);
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ==============================================================================
// 📄 DOCUMENT CRUD OPERATIONS (UC-M3-01)
// ==============================================================================

async function uploadDocument(file, documentType, userId, propertyId, gpsLat, gpsLng) {
    if (!window.MySTRA_API) {
        console.error('MySTRA_API not available');
        return { data: null, error: new Error('API not initialized') };
    }
    return await MySTRA_API.uploadDocument(file, documentType, userId, propertyId, gpsLat, gpsLng);
}

async function getDocumentsByUser(userId) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.getDocumentsByUser(userId);
}

async function getDocumentById(documentId) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.getDocumentById(documentId);
}

async function updateDocument(documentId, updates) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.updateDocument(documentId, updates);
}

async function deleteDocument(documentId) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.deleteDocument(documentId);
}

// ==============================================================================
// 📋 RENDER DOCUMENT STATUS DASHBOARD (UC-M3-03)
// ==============================================================================

function getStatusBadge(status) {
    const map = {
        'Pending': { class: 'badge-pending', label: '🟡 Pending' },
        'Approved': { class: 'badge-approved', label: '🟢 Approved' },
        'Rejected': { class: 'badge-rejected', label: '🔴 Rejected' },
        'Needs Revision': { class: 'badge-revision', label: '🟠 Needs Revision' },
        'Replaced': { class: 'badge-replaced', label: '⚪ Replaced' }
    };
    const s = map[status] || map['Pending'];
    return `<span class="${s.class}">${s.label}</span>`;
}

function updateDocumentStats(documents) {
    const stats = { total: 0, pending: 0, approved: 0, rejected: 0 };

    if (documents && documents.length > 0) {
        stats.total = documents.length;
        stats.pending = documents.filter(d => d.review_status === 'Pending').length;
        stats.approved = documents.filter(d => d.review_status === 'Approved').length;
        stats.rejected = documents.filter(d => d.review_status === 'Rejected' || d.review_status === 'Needs Revision').length;
    }

    const statTotal = document.getElementById('stat-total');
    const statPending = document.getElementById('stat-pending');
    const statApproved = document.getElementById('stat-approved');
    const statRejected = document.getElementById('stat-rejected');
    
    if (statTotal) statTotal.textContent = stats.total;
    if (statPending) statPending.textContent = stats.pending;
    if (statApproved) statApproved.textContent = stats.approved;
    if (statRejected) statRejected.textContent = stats.rejected;
}

function renderDocumentStatus(documents) {
    const container = document.getElementById('documents-status-container');
    if (!container) return;

    updateDocumentStats(documents);

    if (!documents || documents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📄</div>
                <h3>No Documents Uploaded</h3>
                <p>Upload your compliance documents to get verified.</p>
                <button class="btn-primary" onclick="switchDocTab('upload')">📤 Upload Documents</button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="overflow-x: auto;">
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
                        const isRejected = doc.review_status === 'Rejected' || doc.review_status === 'Needs Revision';
                        const isPending = doc.review_status === 'Pending';
                        
                        const fileLink = doc.file_path && doc.file_path !== '#'
                            ? `<a href="${doc.file_path}" target="_blank" style="color: #2563EB; text-decoration: underline; font-size: 13px;">${doc.file_name}</a>`
                            : `<span style="font-size: 13px;">${doc.file_name}</span>`;
                        
                        const actionBtn = isRejected
                            ? `<button class="action-btn revise" onclick="openRevisionModal('${doc.id}')">✏️ Revise</button>`
                            : isPending
                            ? `<div style="display: flex; gap: 4px; align-items: center;">
                                <span style="font-size: 12px; color: #6B7280;">⏳ Awaiting review</span>
                                <button class="action-btn" onclick="deleteDocument('${doc.id}')" style="background: #FEE2E2; color: #991B1B;">🗑️</button>
                               </div>`
                            : `<button class="action-btn" onclick="viewDocument('${doc.id}')">👁️ View</button>`;
                        
                        return `
                            <tr>
                                <td><strong>${doc.document_type}</strong></td>
                                <td>${fileLink}</td>
                                <td style="font-size: 13px;">${new Date(doc.uploaded_at).toLocaleDateString()}</td>
                                <td>${getStatusBadge(doc.review_status)}</td>
                                <td>${actionBtn}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function loadDocumentData() {
    const container = document.getElementById('documents-status-container');
    if (container) {
        container.innerHTML = '<p style="color: #6B7280; text-align: center; padding: 20px;">Loading your documents...</p>';
    }

    try {
        const userId = DOC_STATE.userId || '550e8400-e29b-41d4-a716-446655440000';
        const { data, error } = await getDocumentsByUser(userId);
        
        if (error) {
            console.warn('Error loading documents:', error);
            renderDocumentStatus(null);
            return;
        }
        
        DOC_STATE.documents = data || [];
        renderDocumentStatus(DOC_STATE.documents);
        
    } catch (err) {
        console.warn('Error in loadDocumentData:', err);
        renderDocumentStatus(null);
    }
}

// ==============================================================================
// 👁️ VIEW DOCUMENT
// ==============================================================================

function viewDocument(documentId) {
    const doc = DOC_STATE.documents.find(d => d.id === documentId);
    if (!doc) {
        alert('Document not found.');
        return;
    }
    
    if (doc.file_path && doc.file_path !== '#') {
        window.open(doc.file_path, '_blank');
    } else {
        alert(`📄 Document: ${doc.document_type}\nFile: ${doc.file_name}\nStatus: ${doc.review_status}\nUploaded: ${new Date(doc.uploaded_at).toLocaleDateString()}`);
    }
}

// ==============================================================================
// ✏️ REVISION MODAL (UC-M3-04)
// ==============================================================================

function openRevisionModal(documentId) {
    const modal = document.getElementById('revision-modal');
    if (!modal) return;

    const doc = DOC_STATE.documents.find(d => d.id === documentId);
    if (!doc) {
        alert('Document not found.');
        return;
    }

    // Check if demo document
    if (doc.id && doc.id.startsWith('demo-')) {
        alert('📄 This is a demo document for UI preview.\n\nTo test the full revision flow, please upload a real document first.');
        return;
    }

    DOC_STATE.selectedDocument = doc;
    DOC_STATE.isRevisionMode = true;

    document.getElementById('revision-doc-type').textContent = doc.document_type;
    document.getElementById('revision-previous-file').textContent = doc.file_name;
    document.getElementById('revision-rejection-reason').textContent = doc.admin_feedback || 'No specific reason provided.';
    document.getElementById('revision-file-input').value = '';

    modal.classList.add('show');
    checkRevisionGPS();
}

function closeRevisionModal() {
    const modal = document.getElementById('revision-modal');
    if (modal) modal.classList.remove('show');
    DOC_STATE.isRevisionMode = false;
    DOC_STATE.selectedDocument = null;
}

async function checkRevisionGPS() {
    const badge = document.getElementById('revision-gps-badge');
    const details = document.getElementById('revision-gps-details');
    if (!badge || !details) return;

    badge.textContent = '⏳ Detecting...';
    badge.className = 'badge-pending';

    const gps = await getCurrentGPS();
    if (!gps) {
        badge.textContent = '❌ GPS Unavailable';
        badge.className = 'badge-rejected';
        details.textContent = 'Please enable location services.';
        return;
    }

    try {
        const { data: properties } = await MySTRA_API.getProperties();
        if (properties && properties.length > 0) {
            const property = properties[0];
            const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
            details.textContent = `Distance: ${Math.round(dist)}m`;

            if (dist <= 500) {
                badge.textContent = '✅ Within 500m Zone';
                badge.className = 'badge-approved';
            } else {
                badge.textContent = '❌ Outside 500m Zone';
                badge.className = 'badge-rejected';
            }
        }
    } catch (err) {
        details.textContent = 'Error checking location';
    }
}

async function submitRevision() {
    const fileInput = document.getElementById('revision-file-input');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a new file to upload.');
        return;
    }

    if (!DOC_STATE.selectedDocument) {
        alert('No document selected for revision.');
        return;
    }

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        alert('Invalid file format. Please upload PDF, JPEG, or PNG.');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit.');
        return;
    }

    const gps = await getCurrentGPS();
    if (!gps) {
        alert('GPS location required. Please enable location services.');
        return;
    }

    try {
        const { data: properties } = await MySTRA_API.getProperties();
        if (properties && properties.length > 0) {
            const property = properties[0];
            const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
            if (dist > 500) {
                alert('You must be within 500m of the property to re-upload documents.');
                return;
            }
        }
    } catch (err) {
        alert('Error checking location: ' + err.message);
        return;
    }

    const doc = DOC_STATE.selectedDocument;
    const { data, error } = await uploadDocument(
        file,
        doc.document_type,
        doc.user_id,
        doc.property_id,
        gps.lat,
        gps.lng
    );

    if (error) {
        alert('Upload failed: ' + error.message);
        return;
    }

    if (data && data.length > 0 && data[0]) {
        await updateDocument(doc.id, {
            review_status: 'Replaced',
            replaced_by: data[0].id
        });
        alert('✅ Document revised successfully! Awaiting admin review.');
    } else {
        alert('⚠️ Document uploaded but could not update status. Please contact admin.');
    }

    closeRevisionModal();
    await loadDocumentData();
    switchDocTab('status');
}

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

// ==============================================================================
// 🧭 TAB SWITCHER
// ==============================================================================

function switchDocTab(tab) {
    const panels = ['doc-upload-panel', 'doc-status-panel', 'doc-location-panel'];
    const tabs = ['tab-doc-upload', 'tab-doc-status', 'tab-doc-location'];
    const panelMap = { upload: 'doc-upload-panel', status: 'doc-status-panel', location: 'doc-location-panel' };
    const tabMap = { upload: 'tab-doc-upload', status: 'tab-doc-status', location: 'tab-doc-location' };

    panels.forEach(p => {
        const el = document.getElementById(p);
        if (el) el.classList.add('hidden');
    });
    tabs.forEach(t => {
        const el = document.getElementById(t);
        if (el) el.classList.remove('active');
    });

    const panel = document.getElementById(panelMap[tab]);
    if (panel) panel.classList.remove('hidden');

    const tabBtn = document.getElementById(tabMap[tab]);
    if (tabBtn) tabBtn.classList.add('active');

    if (tab === 'status') loadDocumentData();
    if (tab === 'location') loadLocationData();
    if (tab === 'upload') initGPSDetection();
}

// ==============================================================================
// 📍 RENDER LOCATION REGISTRY MAP (UC-M3-05)
// ==============================================================================

async function loadLocationData() {
    const container = document.getElementById('location-registry-container');
    if (!container) return;

    container.innerHTML = '<p style="color: #6B7280; text-align: center; padding: 20px;">Loading location data...</p>';

    try {
        const gps = await getCurrentGPS();
        if (!gps) {
            container.innerHTML = `
                <div class="widget-card" style="text-align: center; color: #6B7280;">
                    <p style="font-size: 40px;">📍</p>
                    <h3>GPS Location Unavailable</h3>
                    <p style="font-size: 14px;">Please enable location services to check your proximity.</p>
                </div>
            `;
            return;
        }

        const { data: properties, error } = await MySTRA_API.getProperties();
        if (error || !properties || properties.length === 0) {
            container.innerHTML = `
                <div class="widget-card" style="text-align: center; color: #6B7280;">
                    <p style="font-size: 40px;">🏠</p>
                    <h3>No Property Registered</h3>
                    <p style="font-size: 14px;">Please register a property first.</p>
                </div>
            `;
            return;
        }

        const property = properties[0];
        const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
        const isWithin = dist <= 500;

        container.innerHTML = `
            <div class="widget-card">
                <h2>📍 Location Registry</h2>
                <p style="color: #6B7280; margin-bottom: 20px;">Verify you are at the property location before uploading documents.</p>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">
                    <div class="map-visual">
                        <div class="geofence-container">
                            <div class="outer-circle"></div>
                            <div class="inner-circle"></div>
                            <div class="property-marker"></div>
                            <div class="user-marker ${isWithin ? '' : 'outside'}"></div>
                            <span style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); font-size: 11px; color: #6B7280; white-space: nowrap;">
                                ⭕ 500m Geofence
                            </span>
                        </div>
                        <p style="font-size: 12px; color: #6B7280; margin-top: 8px;">
                            📍 Your Location &nbsp;&nbsp; 🏠 Property
                        </p>
                    </div>

                    <div>
                        <div style="display: grid; gap: 8px; font-size: 14px;">
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
                                <span style="font-family: monospace;">${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F1F5F9;">
                                <span style="color: #6B7280;">Distance</span>
                                <span style="font-weight: 600;">${Math.round(dist)} meters</span>
                            </div>
                            <div style="padding: 16px; border-radius: 8px; text-align: center; margin-top: 8px; background: ${isWithin ? '#DCFCE7' : '#FEE2E2'}; color: ${isWithin ? '#15803D' : '#991B1B'};">
                                ${isWithin ? '✅ Within 500m Zone — You can upload documents' : '❌ Outside 500m Zone — Please move closer to the property'}
                            </div>
                        </div>
                    </div>
                </div>

                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn-secondary" onclick="switchDocTab('upload')">📤 Back to Upload</button>
                </div>
            </div>
        `;
    } catch (err) {
        console.warn('Error loading location:', err);
        container.innerHTML = `
            <div class="widget-card" style="text-align: center; color: #6B7280;">
                <p>⚠️ Error loading location data. Please try again later.</p>
            </div>
        `;
    }
}

// ==============================================================================
// 📤 INIT GPS DETECTION
// ==============================================================================

async function initGPSDetection() {
    const gpsBadge = document.getElementById('gps-status-badge');
    const gpsCoords = document.getElementById('gps-coords');
    const gpsDistance = document.getElementById('gps-distance');
    const gpsMessage = document.getElementById('gps-message');
    const gpsContainer = document.getElementById('gps-status');

    if (!gpsBadge || !gpsCoords || !gpsDistance) return;

    gpsBadge.textContent = '⏳ Detecting...';
    gpsBadge.className = 'badge-pending';

    const gps = await getCurrentGPS();
    if (!gps) {
        gpsBadge.textContent = '❌ GPS Unavailable';
        gpsBadge.className = 'badge-rejected';
        gpsCoords.textContent = 'Please enable location services';
        gpsMessage.textContent = 'GPS location is required to verify you are at the property.';
        return;
    }

    currentGPS = gps;
    gpsCoords.textContent = `Lat: ${gps.lat.toFixed(4)}°, Lng: ${gps.lng.toFixed(4)}°`;

    try {
        const { data: properties, error } = await MySTRA_API.getProperties();
        if (error || !properties || properties.length === 0) {
            gpsDistance.textContent = 'No property found';
            gpsMessage.textContent = 'Please register a property first.';
            return;
        }

        const property = properties[0];
        DOC_STATE.propertyId = property.id;
        DOC_STATE.propertyGPS = { lat: property.latitude, lng: property.longitude };

        const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
        gpsDistance.textContent = `Distance: ${Math.round(dist)}m`;
        gpsMessage.textContent = '';

        if (dist <= 500) {
            gpsBadge.textContent = '✅ Within 500m Zone';
            gpsBadge.className = 'badge-approved';
            gpsContainer.className = 'within-zone';
        } else {
            gpsBadge.textContent = '❌ Outside 500m Zone';
            gpsBadge.className = 'badge-rejected';
            gpsContainer.className = 'outside-zone';
            gpsMessage.textContent = 'You must be within 500m of the property to upload documents.';
        }
    } catch (err) {
        console.warn('Error fetching property:', err);
        gpsDistance.textContent = 'Error loading property';
    }
}

// ==============================================================================
// 📤 HANDLE DOCUMENT UPLOAD FORM (UC-M3-01)
// ==============================================================================

async function handleDocumentUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('doc-file-input');
    const docType = document.getElementById('doc-type-select').value;
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a file to upload.');
        return;
    }

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        alert('Invalid file format. Please upload PDF, JPEG, or PNG.');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit.');
        return;
    }

    const gps = await getCurrentGPS();
    if (!gps) {
        alert('GPS location required. Please enable location services.');
        return;
    }

    try {
        const { data: properties } = await MySTRA_API.getProperties();
        if (properties && properties.length > 0) {
            const property = properties[0];
            const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
            if (dist > 500) {
                alert('You must be within 500m of the property to upload documents.');
                return;
            }
            DOC_STATE.propertyId = property.id;
        } else {
            alert('No property found. Please register a property first.');
            return;
        }
    } catch (err) {
        alert('Error checking location: ' + err.message);
        return;
    }

    const userId = DOC_STATE.userId || '550e8400-e29b-41d4-a716-446655440000';
    const propertyId = DOC_STATE.propertyId;

    const { data, error } = await uploadDocument(
        file,
        docType,
        userId,
        propertyId,
        gps.lat,
        gps.lng
    );

    if (error) {
        alert('Upload failed: ' + error.message);
        return;
    }

    alert('✅ Document uploaded successfully! Awaiting admin verification.');
    fileInput.value = '';
    await loadDocumentData();
    switchDocTab('status');
}

// ==============================================================================
// 👤 UPDATE USER VERIFICATION STATUS
// ==============================================================================

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

// ==============================================================================
// 🚀 INITIALIZATION
// ==============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    const badge = document.getElementById('db-status-badge');
    if (window.MySTRA_API) {
        try {
            const { data } = await MySTRA_API.getProperties();
            if (data) {
                badge.textContent = '🟢 SUPABASE LIVE';
                badge.className = 'status-badge';
                badge.style.backgroundColor = '#DCFCE7';
                badge.style.color = '#15803D';
            }
        } catch (e) {
            badge.textContent = '🟡 SUPABASE CONNECTED';
        }
    }

    // Setup user selector
    const selector = document.getElementById('user-selector');
    if (selector) {
        selector.value = DOC_STATE.userId || '550e8400-e29b-41d4-a716-446655440000';
        selector.addEventListener('change', (e) => {
            switchUser(e.target.value);
        });
    }

    await loadDocumentData();
    initGPSDetection();
    updateUserVerificationStatus();

    const form = document.getElementById('document-upload-form');
    if (form) {
        form.addEventListener('submit', handleDocumentUpload);
    }

    document.getElementById('revision-modal').addEventListener('click', function(e) {
        if (e.target === this) closeRevisionModal();
    });
});