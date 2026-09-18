// ==============================================================================
// 📄 STATE
// ==============================================================================

const DOC_STATE = {
    documents: [],
    selectedDocument: null,
    userId: null,
    propertyId: null,
    propertyGPS: null,
    myProperties: [],           // User's properties (from DB)
    selectedPropertyId: null    // Currently active for uploads
};

let currentGPS = null;
let currentFilter = 'ALL';   
let currentSearch = '';
let CURRENT_USER = null;
let profileSubscription = null;
let profilePollInterval = null;

// ==============================================================================
// 🔄 STATUS MAPPING
// ==============================================================================

const STATUS_MAP = {
    'PENDING':           { label: 'Pending',        class: 'badge-pending',  icon: '🟡' },
    'APPROVED':          { label: 'Approved',       class: 'badge-approved', icon: '🟢' },
    'REJECTED':          { label: 'Rejected',       class: 'badge-rejected', icon: '🔴' },
    'REUPLOAD_REQUESTED':{ label: 'Needs Revision', class: 'badge-revision', icon: '🟠' },
    'REPLACED':          { label: 'Replaced',       class: 'badge-replaced', icon: '⚪' }
};

function getStatusInfo(status) {
    return STATUS_MAP[status] || STATUS_MAP['PENDING'];
}

function getStatusBadge(status) {
    const s = getStatusInfo(status);
    return `<span class="${s.class}">${s.icon} ${s.label}</span>`;
}

// ==============================================================================
// 👤 USER SESSION
// ==============================================================================

async function getSessionUser() {
    if (!window.supabaseClient) return null;

    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (!user) return null;

        const profile = await fetchProfileById(user.id);
        if (profile) return profile;
    } catch (e) {
        console.warn('Session lookup failed:', e);
    }

    // No valid session — redirect to login
    return null;
}

// ==============================================================================
// 🔐 AUTH GUARD — Redirect to login if not signed in
// ==============================================================================

function showNotLoggedInScreen() {
    // Save the current page so we can come back after login
    const currentPage = window.location.pathname.split('/').pop();
    sessionStorage.setItem('mystra_redirect_after_login', currentPage);

    // Replace the page content with a clean message
    document.body.innerHTML = `
        <div style="
            display: flex; justify-content: center; align-items: center;
            height: 100vh; background: #F3F4F6;
            font-family: 'Inter', sans-serif;
        ">
            <div style="
                text-align: center; background: white; padding: 48px;
                border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);
                max-width: 420px;
            ">
                <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
                <h2 style="
                    font-size: 20px; font-weight: 700; color: #1E293B;
                    margin-bottom: 8px;
                ">Not Logged In</h2>
                <p style="
                    font-size: 14px; color: #6B7280; margin-bottom: 24px;
                    line-height: 1.5;
                ">
                    You need to sign in to access the Document Intake Portal.<br>
                    Redirecting you to the login page...
                </p>
                <a href="login.html" style="
                    display: inline-block; background: #2563EB; color: white;
                    padding: 12px 24px; border-radius: 8px; text-decoration: none;
                    font-weight: 600; font-size: 14px;
                ">→ Go to Login</a>
                <p style="
                    font-size: 12px; color: #9CA3AF; margin-top: 16px;
                ">Redirecting in <span id="redirect-countdown">5</span>s...</p>
            </div>
        </div>
    `;

    // Countdown then redirect
    let seconds = 5;
    const counter = document.getElementById('redirect-countdown');
    const interval = setInterval(() => {
        seconds--;
        if (counter) counter.textContent = seconds;
        if (seconds <= 0) {
            clearInterval(interval);
            window.location.href = 'login.html';
        }
    }, 1000);
}

// log out
async function logoutUser() {
    if (confirm('Log out of MySTRA?')) {
        // Clear Supabase session
        if (window.supabaseClient) {
            try { await window.supabaseClient.auth.signOut(); } catch (e) {}
        }
        // Clear localStorage
        localStorage.removeItem('mystra_user_id');
        // Redirect
        window.location.href = 'login.html';
    }
}



async function fetchProfileById(userId) {
    try {
        const { data, error } = await MySTRA_API.getUserProfile(userId);
        if (error || !data) return null;
        return data;
    } catch (e) { return null; }
}

async function initializeUserSession() {
    const profile = await getSessionUser();

    if (!profile) {
        // ✅ Show a friendly "redirecting" state, then go to login
        showNotLoggedInScreen();
        return null;
    }

    CURRENT_USER = profile;
    DOC_STATE.userId = profile.id;

    renderUserFooter(profile);
    setupProfileRealtime();

    await updatePropertyInfo(profile);
    updateUserVerificationStatus();
    return profile;
}

async function updatePropertyInfo(profile) {
    try {
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('upload-operator-name', profile.full_name || 'N/A');

        if (!DOC_STATE.selectedPropertyId) {
            setTxt('upload-property-id', 'No property selected');
            setTxt('upload-property-address', 'Go to Settings to add a property');
            DOC_STATE.propertyGPS = null;
            DOC_STATE.propertyId = null;
            return;
        }

        // Find the active property from the loaded list
        const property = (DOC_STATE.myProperties || []).find(p => p.id === DOC_STATE.selectedPropertyId);

        if (!property) {
            setTxt('upload-property-id', 'Property not found');
            setTxt('upload-property-address', 'Please select another property');
            DOC_STATE.propertyGPS = null;
            return;
        }

        DOC_STATE.propertyId = property.id;
        DOC_STATE.propertyGPS = { lat: property.latitude, lng: property.longitude };

        setTxt('upload-property-id', property.title || property.id);
        setTxt('upload-property-address', property.address || 'N/A');
    } catch (err) {
        console.warn('Property info error:', err);
    }
}

function updateUserVerificationStatus() {
    const statusEl = document.getElementById('user-verification-status');
    if (!statusEl) return;

    if (!CURRENT_USER) {
        statusEl.textContent = '⏳ Not logged in';
        statusEl.className = 'badge-pending';
        return;
    }

    if (CURRENT_USER.is_verified) {
        statusEl.textContent = '✅ Verified';
        statusEl.className = 'badge-approved';
    } else {
        statusEl.textContent = '⏳ Pending Verification';
        statusEl.className = 'badge-pending';
    }
}

// ==============================================================================
// 👤 FOOTER + REALTIME
// ==============================================================================

function renderUserFooter(profile) {
    const nameEl = document.getElementById('sidebar-username');
    const bizEl = document.getElementById('sidebar-userbusiness');
    const statusEl = document.getElementById('sidebar-userstatus');
    const avatarEl = document.getElementById('footer-avatar');

    if (!profile) {
        if (nameEl) nameEl.textContent = 'Not logged in';
        if (bizEl) bizEl.textContent = 'Please sign in';
        if (statusEl) {
            statusEl.textContent = '❌ No Session';
            statusEl.style.background = '#FEE2E2';
            statusEl.style.color = '#991B1B';
        }
        if (avatarEl) avatarEl.textContent = '?';
        return;
    }

    const name = profile.full_name || 'Unnamed';
    if (nameEl) nameEl.textContent = name;
    if (bizEl) bizEl.textContent = profile.business_name || 'No business set';

    if (statusEl) {
        if (profile.is_verified) {
            statusEl.textContent = '✅ Verified';
            statusEl.style.background = '#DCFCE7';
            statusEl.style.color = '#15803D';
        } else {
            statusEl.textContent = '⏳ Pending';
            statusEl.style.background = '#FEF3C7';
            statusEl.style.color = '#92400E';
        }
    }

    if (avatarEl) {
        const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
        avatarEl.textContent = initials || '?';
        avatarEl.style.boxShadow = profile.is_verified ? '0 0 0 2px #22C55E' : '0 0 0 2px #EAB308';
    }
}

async function refreshUserFooter() {
    if (!DOC_STATE.userId) return;
    try {
        const { data: profile } = await MySTRA_API.getUserProfile(DOC_STATE.userId);
        if (!profile) return;

        const changed = !CURRENT_USER
            || CURRENT_USER.is_verified !== profile.is_verified
            || CURRENT_USER.full_name !== profile.full_name;

        if (changed) {
            CURRENT_USER = profile;
            renderUserFooter(profile);
            updateUserVerificationStatus();
            renderRequiredDocuments(DOC_STATE.documents);
        }
    } catch (e) { console.warn(e); }
}

function setupProfileRealtime() {
    if (!window.supabaseClient || !DOC_STATE.userId) return startProfilePolling();
    if (profileSubscription) profileSubscription.unsubscribe();

    try {
        profileSubscription = window.supabaseClient
            .channel(`profile-${DOC_STATE.userId}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${DOC_STATE.userId}` },
                (payload) => {
                    CURRENT_USER = payload.new;
                    renderUserFooter(payload.new);
                    updateUserVerificationStatus();
                    renderRequiredDocuments(DOC_STATE.documents);
                })
            .subscribe((status) => {
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startProfilePolling();
            });
    } catch (e) { startProfilePolling(); }
}

function startProfilePolling() {
    if (profilePollInterval) return;
    profilePollInterval = setInterval(refreshUserFooter, 15000);
}
// ==============================================================================
// 📥 REFERENCE DOCUMENTS DOWNLOAD
// ==============================================================================

const REFERENCE_DOCS = {
    ssm: {
        label: 'Sample SSM Certificate',
        url: 'samples/ssm-certificate-sample.pdf'
    },
    tax: {
        label: 'Sample Tax Information File',
        url: 'samples/tax-info-sample.pdf'
    },
    safety: {
        label: 'Sample Safety Certificate',
        url: 'samples/safety-cert-sample.doc'
    },
};

function downloadReference(docKey) {
    const doc = REFERENCE_DOCS[docKey];
    if (!doc) {
        alert('Reference document not found.');
        return;
    }

    // If you have the actual file, this triggers the download
    // If the file doesn't exist yet, you'll get a 404 — that's fine for now
    const link = document.createElement('a');
    link.href = doc.url;
    link.download = doc.url.split('/').pop();
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`📥 Downloading: ${doc.label}`);
}

window.downloadReference = downloadReference;

// ==============================================================================
// 📍 GPS
// ==============================================================================

function getCurrentGPS() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ==============================================================================
// 📄 CRUD WRAPPERS
// ==============================================================================

async function uploadDocument(file, documentType, documentName, userId, propertyId, gpsLat, gpsLng) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.uploadDocument(file, documentType, documentName, userId, propertyId, gpsLat, gpsLng);
}

async function getDocumentsByUser(userId) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.getDocumentsByUser(userId);
}

async function updateDocument(documentId, updates) {
    if (!window.MySTRA_API) return { data: null, error: new Error('API not initialized') };
    return await MySTRA_API.updateDocument(documentId, updates);
}

// ==============================================================================
// 📋 STATS
// ==============================================================================

function updateDocumentStats(documents) {
    const stats = { total: 0, pending: 0, approved: 0, rejected: 0 };
    if (documents && documents.length > 0) {
        stats.total = documents.length;
        stats.pending = documents.filter(d => d.review_status === 'PENDING').length;
        stats.approved = documents.filter(d => d.review_status === 'APPROVED').length;
        stats.rejected = documents.filter(d =>
            d.review_status === 'REJECTED' || d.review_status === 'REUPLOAD_REQUESTED'
        ).length;
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-total', stats.total);
    set('stat-pending', stats.pending);
    set('stat-approved', stats.approved);
    set('stat-rejected', stats.rejected);
}

// ==============================================================================
// 📋 RENDER DOCUMENTS
// ==============================================================================

function renderDocumentStatus(documents) {
    const container = document.getElementById('documents-status-container');
    if (!container) return;

    DOC_STATE.documents = documents || [];
    const filtered = applyFiltersToDocuments(DOC_STATE.documents);

    updateDocumentStats(DOC_STATE.documents);
    renderRequiredDocuments(DOC_STATE.documents);

    if (!filtered.length) {
        const hasDocs = DOC_STATE.documents.length > 0;
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📄</div>
                <h3>${hasDocs ? 'No Results Found' : 'No Documents Uploaded'}</h3>
                <p>${hasDocs ? 'No documents match your filters.' : 'Upload your compliance documents to get verified.'}</p>
                ${hasDocs
                    ? `<button class="btn-secondary" onclick="applyFilter('ALL'); document.getElementById('doc-search-input').value='';">Reset Filters</button>`
                    : `<button class="btn-primary" onclick="window.location.href='mystra-document-portal.html'">📤 Upload Documents</button>`}
            </div>`;
        return;
    }

    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table class="data-table">
                <thead><tr>
                    <th>Document Name</th><th>Document Type</th><th>File Name</th>
                    <th>Uploaded</th><th>Status</th><th>Action</th>
                </tr></thead>
                <tbody>
                    ${filtered.map(doc => {
                        const status = doc.review_status;
                        const isRejected = status === 'REJECTED' || status === 'REUPLOAD_REQUESTED';
                        const isPending = status === 'PENDING';
                        const displayName = doc.document_name || doc.file_name || 'Untitled';
                        const fileLink = doc.file_path && doc.file_path !== '#'
                            ? `<a href="${doc.file_path}" target="_blank" style="color:#2563EB;text-decoration:underline;font-size:13px;">${doc.file_name}</a>`
                            : `<span style="font-size:13px;">${doc.file_name}</span>`;

                        let actionBtn = '';
                       if (isRejected) {
    // Rejected → Revise + Delete + (View if file exists)
    actionBtn = `
        <div class="action-row">
            ${fileLink !== '<span style="font-size:13px;">' ? `
                <button class="icon-btn view" title="View document"
                        onclick="viewDocument('${doc.id}')">👁️</button>` : ''}
            <button class="icon-btn revise" title="Revise & resubmit"
                    onclick="openRevisionModal('${doc.id}')">✏️</button>
            <button class="icon-btn delete" title="Delete document"
                    onclick="deleteDocument('${doc.id}')">🗑️</button>
        </div>
    `;
} else if (isPending) {
    // Pending → View + Delete (can't revise a pending doc)
    actionBtn = `
        <div class="action-row">
            <span class="pending-text">⏳ Awaiting</span>
            ${fileLink !== '<span style="font-size:13px;">' ? `
                <button class="icon-btn view" title="View document"
                        onclick="viewDocument('${doc.id}')">👁️</button>` : ''}
            <button class="icon-btn delete" title="Delete pending document"
                    onclick="deleteDocument('${doc.id}')">🗑️</button>
        </div>
    `;
} else {
    // Approved / Replaced → View only
    actionBtn = `
        <div class="action-row">
            <button class="icon-btn view" title="View document"
                    onclick="viewDocument('${doc.id}')">👁️</button>
        </div>
    `;
}
                                        

                        return `
                            <tr>
                                <td><strong>${displayName}</strong></td>
                                <td style="font-size:13px;">${doc.document_type}</td>
                                <td style="font-size:13px;">${fileLink}</td>
                                <td style="font-size:13px;">${new Date(doc.uploaded_at).toLocaleDateString()}</td>
                                <td>${getStatusBadge(status)}</td>
                                <td>${actionBtn}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function loadDocumentData() {
    const container = document.getElementById('documents-status-container');
    if (container) container.innerHTML = '<p style="color:#6B7280;text-align:center;padding:20px;">Loading...</p>';

    try {
        if (!DOC_STATE.userId) return renderDocumentStatus(null);
        const { data, error } = await getDocumentsByUser(DOC_STATE.userId);
        if (error) return renderDocumentStatus(null);
        DOC_STATE.documents = data || [];
        renderDocumentStatus(DOC_STATE.documents);
    } catch (e) { renderDocumentStatus(null); }
}

// ==============================================================================
// 👁️ VIEW / DELETE
// ==============================================================================

function viewDocument(id) {
    const doc = DOC_STATE.documents.find(d => d.id === id);
    if (!doc) return alert('Not found.');
    if (doc.file_path && doc.file_path !== '#') window.open(doc.file_path, '_blank');
    else alert(`📄 ${doc.document_type}\n${doc.file_name}`);
}

let docToDelete = null;

function deleteDocument(id) {
    const doc = DOC_STATE.documents.find(d => d.id === id);
    if (!doc) return alert('Document not found.');
    if (doc.review_status !== 'PENDING') {
        return alert('Only PENDING documents can be deleted.');
    }

    docToDelete = doc;

    const modal = document.getElementById('delete-modal');
    const nameEl = document.getElementById('delete-doc-name');
    if (nameEl) nameEl.textContent = doc.file_name || 'Untitled';

    if (modal) modal.classList.add('show');
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.remove('show');
    docToDelete = null;
}

async function confirmDelete() {
    if (!docToDelete) return;

    const { error } = await MySTRA_API.deleteDocument(docToDelete.id);
    if (error) {
        alert('Failed: ' + error.message);
        return;
    }

    alert('✅ Document deleted.');
    closeDeleteModal();
    await loadDocumentData();
}

// Wire up in DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const confirmBtn = document.getElementById('btn-confirm-delete');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmDelete);

    const deleteModal = document.getElementById('delete-modal');
    if (deleteModal) {
        deleteModal.addEventListener('click', (e) => {
            if (e.target === deleteModal) closeDeleteModal();
        });
    }
});

window.deleteDocument = deleteDocument;
window.closeDeleteModal = closeDeleteModal;

// ==============================================================================
// ✏️ REVISION
// ==============================================================================

function openRevisionModal(id) {
    const modal = document.getElementById('revision-modal');
    const doc = DOC_STATE.documents.find(d => d.id === id);
    if (!modal || !doc) return;

    DOC_STATE.selectedDocument = doc;

    document.getElementById('revision-doc-type').textContent = doc.document_type;
    document.getElementById('revision-previous-file').textContent = doc.file_name;
    document.getElementById('revision-rejection-reason').textContent = doc.admin_feedback || 'No reason provided.';
    document.getElementById('revision-file-input').value = '';

    modal.classList.add('show');
    checkRevisionGPS();
}

function closeRevisionModal() {
    const modal = document.getElementById('revision-modal');
    if (modal) modal.classList.remove('show');
    DOC_STATE.selectedDocument = null;
}

async function checkRevisionGPS() {
    const badge = document.getElementById('revision-gps-badge');
    const details = document.getElementById('revision-gps-details');
    if (!badge) return;

    badge.textContent = '⏳ Detecting...';
    badge.className = 'badge-pending';

    const gps = await getCurrentGPS();
    if (!gps) {
        badge.textContent = '❌ GPS Unavailable';
        badge.className = 'badge-rejected';
        if (details) details.textContent = 'Enable location services.';
        return;
    }

    // ✅ Use selected property
    const property = (DOC_STATE.myProperties || []).find(p => p.id === DOC_STATE.selectedPropertyId);

    if (!property) {
        badge.textContent = '❌ No Property Selected';
        badge.className = 'badge-rejected';
        if (details) details.textContent = 'Pick a property in Settings first.';
        return;
    }

    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    if (details) details.textContent = `Distance to ${property.title || 'property'}: ${Math.round(dist)}m`;

    if (dist <= 500) {
        badge.textContent = '✅ Within 500m';
        badge.className = 'badge-approved';
    } else {
        badge.textContent = '❌ Outside 500m';
        badge.className = 'badge-rejected';
    }
}

async function submitRevision() {
    const file = document.getElementById('revision-file-input').files[0];
    if (!file) return alert('Select a file.');
    if (!DOC_STATE.selectedDocument) return alert('No document.');

    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) return alert('Invalid format.');
    if (file.size > 10 * 1024 * 1024) return alert('Max 10MB.');

    const gps = await getCurrentGPS();
    if (!gps) return alert('GPS required.');

    // ✅ Use selected property
    const property = (DOC_STATE.myProperties || []).find(p => p.id === DOC_STATE.selectedPropertyId);
    if (!property) return alert('No property selected. Pick one in Settings.');

    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    if (dist > 500) return alert(`Must be within 500m of "${property.title}".\nCurrent distance: ${Math.round(dist)}m`);

    const doc = DOC_STATE.selectedDocument;
    const { data, error } = await uploadDocument(
        file, doc.document_type, doc.document_name || doc.document_type,
        doc.user_id, property.id, gps.lat, gps.lng
    );

    if (error) return alert('Upload failed: ' + error.message);

    if (data && data[0]) {
        await updateDocument(doc.id, {
            review_status: 'REPLACED',
            status: 'REPLACED',
            replaced_by: data[0].id
        });
        alert('✅ Revised! New version is PENDING admin review.');
    }

    closeRevisionModal();
    await loadDocumentData();
}


// ==============================================================================
// 📍 LOCATION
// ==============================================================================

async function loadLocationData() {
    const container = document.getElementById('location-registry-container');
    if (!container) return;
    container.innerHTML = '<p style="color:#6B7280;text-align:center;padding:20px;">Loading location...</p>';

    // ✅ Load user's properties FIRST, then restore active selection
    await loadUserProperties();

    if (CURRENT_USER) {
        const storedActive = localStorage.getItem(`mystra_active_property_${CURRENT_USER.id}`);
        const props = DOC_STATE.myProperties || [];

        if (storedActive && props.some(p => p.id === storedActive)) {
            DOC_STATE.selectedPropertyId = storedActive;
        } else if (props.length > 0) {
            DOC_STATE.selectedPropertyId = props[0].id;
            localStorage.setItem(`mystra_active_property_${CURRENT_USER.id}`, DOC_STATE.selectedPropertyId);
        }

        DOC_STATE.propertyId = DOC_STATE.selectedPropertyId;
    }

    const gps = await getCurrentGPS();
    if (!gps) {
        container.innerHTML = `<div class="widget-card" style="text-align:center;color:#6B7280;"><p style="font-size:40px;">📍</p><h3>GPS Unavailable</h3></div>`;
        return;
    }

    // ✅ Use the SELECTED property (not the first one from DB)
    const property = (DOC_STATE.myProperties || []).find(p => p.id === DOC_STATE.selectedPropertyId);

    if (!property) {
        container.innerHTML = `
            <div class="widget-card" style="text-align:center;color:#6B7280;">
                <p style="font-size:40px;">🏠</p>
                <h3>No Property Selected</h3>
                <p style="font-size:14px;">Go to Settings to add or select a property.</p>
                <a href="mystra-settings.html" style="display:inline-block;margin-top:12px;background:#2563EB;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
                    ⚙️ Go to Settings
                </a>
            </div>`;
        return;
    }

    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    const within = dist <= 500;

    container.innerHTML = `
        <div class="widget-card">
            <h2>📍 Location Registry</h2>
            <p style="color:#6B7280;font-size:13px;margin-bottom:16px;">
                Checking your distance to <strong>${property.title || 'your property'}</strong>
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px;">
                <div class="map-visual">
                    <div class="geofence-container">
                        <div class="outer-circle"></div>
                        <div class="inner-circle"></div>
                        <div class="property-marker"></div>
                        <div class="user-marker ${within ? '' : 'outside'}"></div>
                    </div>
                </div>
                <div style="font-size:14px;">
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
                        <span style="color:#6B7280;">Property</span>
                        <span style="font-weight:500;">${property.title || 'N/A'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
                        <span style="color:#6B7280;">Address</span>
                        <span style="font-weight:500;text-align:right;">${property.address || 'N/A'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
                        <span style="color:#6B7280;">Your GPS</span>
                        <span style="font-family:monospace;">${gps.lat.toFixed(4)}°, ${gps.lng.toFixed(4)}°</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
                        <span style="color:#6B7280;">Distance</span>
                        <span style="font-weight:600;">${Math.round(dist)}m</span>
                    </div>
                    <div style="padding:16px;border-radius:8px;text-align:center;margin-top:8px;background:${within ? '#DCFCE7' : '#FEE2E2'};color:${within ? '#15803D' : '#991B1B'};">
                        ${within ? '✅ Within 500m Zone' : '❌ Outside 500m Zone'}
                    </div>
                </div>
            </div>
        </div>`;
}

async function initGPSDetection() {
    const badge = document.getElementById('gps-status-badge');
    const coords = document.getElementById('gps-coords');
    const distEl = document.getElementById('gps-distance');
    const msg = document.getElementById('gps-message');
    const container = document.getElementById('gps-status');
    if (!badge) return;

    badge.textContent = '⏳ Detecting...';
    badge.className = 'badge-pending';

    const gps = await getCurrentGPS();
    if (!gps) {
        badge.textContent = '❌ GPS Unavailable';
        badge.className = 'badge-rejected';
        if (coords) coords.textContent = 'Enable location';
        return;
    }

    currentGPS = gps;
    if (coords) coords.textContent = `Lat: ${gps.lat.toFixed(4)}°, Lng: ${gps.lng.toFixed(4)}°`;

    // Use the SELECTED property (not the first one)
    const property = (DOC_STATE.myProperties || []).find(p => p.id === DOC_STATE.selectedPropertyId);

    if (!property) {
        if (distEl) distEl.textContent = 'No property selected';
        if (msg) msg.textContent = 'Please pick a property in Settings first.';
        return;
    }

    DOC_STATE.propertyId = property.id;
    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    if (distEl) distEl.textContent = `Distance: ${Math.round(dist)}m`;

    if (dist <= 500) {
        badge.textContent = '✅ Within 500m Zone';
        badge.className = 'badge-approved';
        if (container) container.className = 'within-zone';
    } else {
        badge.textContent = '❌ Outside 500m Zone';
        badge.className = 'badge-rejected';
        if (container) container.className = 'outside-zone';
        if (msg) msg.textContent = 'Must be within 500m of the property.';
    }
}

// ==============================================================================
// 📤 UPLOAD HANDLER
// ==============================================================================

async function handleDocumentUpload(e) {
    e.preventDefault();

    const fileInput = document.getElementById('doc-file-input');
    const docTypeSelect = document.getElementById('doc-type-select');
    const docNameInput = document.getElementById('doc-name-input');
    const file = fileInput.files[0];
    const docType = docTypeSelect.value;

    if (!docType) return alert('Select a document type.');

    let documentName = docType;
    if (docType === 'Other') {
        documentName = docNameInput ? docNameInput.value.trim() : '';
        if (!documentName) return alert('Enter a custom name.');
    }

    if (!file) return alert('Select a file.');
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) return alert('Invalid format.');
    if (file.size > 10 * 1024 * 1024) return alert('Max 10MB.');

    const gps = await getCurrentGPS();
    if (!gps) return alert('GPS required.');

    // ✅ Use the selected property
    const property = (DOC_STATE.myProperties || []).find(p => p.id === DOC_STATE.selectedPropertyId);
    if (!property) return alert('No property selected. Please pick one in Settings.');

    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    if (dist > 500) return alert(`Must be within 500m of "${property.title}".\nCurrent distance: ${Math.round(dist)}m`);

    const { error } = await uploadDocument(
        file, docType, documentName,
        DOC_STATE.userId, property.id, gps.lat, gps.lng
    );

    if (error) return alert('Upload failed: ' + error.message);

    alert('✅ Document uploaded! Awaiting admin verification.');
    fileInput.value = '';
    if (docNameInput) docNameInput.value = '';
    docTypeSelect.value = '';
    document.getElementById('document-name-container').style.display = 'none';

    window.location.href = 'mystra-mydocuments.html';
}

// ==============================================================================
// 📋 CHECKLIST (Uses REAL DB document types)
// ==============================================================================

const REQUIRED_DOCUMENTS = [
    { type: 'SSM Certificate',       matchTypes: ['SSM Certificate', 'SSM License Verification'], icon: '📜', description: 'Business registration', isPrimary: true },
    { type: 'Tax Information File',  matchTypes: ['Tax Information File', 'Tax Clearance (LHDN)'], icon: '💲', description: 'LHDN tax registration', isPrimary: false },
    { type: 'Safety Certificate',    matchTypes: ['Safety Certificate', 'Fire Safety Inspection Certificate'], icon: '🛡️', description: 'Fire safety', isPrimary: false },
    { type: 'Municipal Permit',      matchTypes: ['Municipal Permit', 'Local Council STR Operating Permit'], icon: '🏛️', description: 'Council approval', isPrimary: false },
    { type: 'Business License',      matchTypes: ['Business License'], icon: '📋', description: 'Operating license', isPrimary: false }
];

function renderRequiredDocuments(documents) {
    const container = document.getElementById('required-documents-checklist');
    if (!container) return;

    container.innerHTML = REQUIRED_DOCUMENTS.map(req => {
        // Find ANY document matching this requirement's type list
        const doc = documents ? documents.find(d =>
            req.matchTypes.includes(d.document_type) && d.review_status !== 'REPLACED'
        ) : null;

        let icon = '⬜', badge = '<span class="badge-pending" style="font-size:11px;">⬜ Missing</span>';
        if (doc) {
            if (doc.review_status === 'APPROVED') {
                icon = '✅';
                badge = '<span class="badge-approved" style="font-size:11px;">✅ Verified</span>';
            } else if (doc.review_status === 'REJECTED' || doc.review_status === 'REUPLOAD_REQUESTED') {
                icon = '❌';
                badge = '<span class="badge-rejected" style="font-size:11px;">🔴 Rejected</span>';
            } else {
                icon = '⏳';
                badge = '<span class="badge-pending" style="font-size:11px;">🟡 Pending</span>';
            }
        }

        return `
            <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;background:white;border:1px solid #E5E7EB;margin-bottom:6px;">
                <span style="font-size:20px;">${icon}</span>
                <div style="flex:1;">
                    <strong style="font-size:13px;">${req.icon} ${req.type}</strong>
                    ${req.isPrimary ? '<span style="font-size:10px;background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;margin-left:6px;">REQUIRED</span>' : ''}
                    <p style="font-size:11px;color:#6B7280;margin:2px 0 0 0;">${req.description}</p>
                </div>
                ${badge}
            </div>`;
    }).join('');

    // SSM check
    const ssmApproved = documents && documents.find(d =>
        (d.document_type === 'SSM Certificate' || d.document_type === 'SSM License Verification')
        && d.review_status === 'APPROVED'
    );

    const hint = document.getElementById('code-generation-hint');
    if (hint) {
        hint.innerHTML = ssmApproved
            ? `<div style="background:#DCFCE7;color:#15803D;padding:12px;border-radius:8px;margin-top:12px;font-size:13px;">✅ <strong>You can now generate your MySTRA Code!</strong></div>`
            : `<div style="background:#FEF3C7;color:#92400E;padding:12px;border-radius:8px;margin-top:12px;font-size:13px;">⏳ <strong>Code generation locked.</strong> Get your SSM Certificate verified first.</div>`;
    }
}

// ==============================================================================
// 🔍 FILTERS (Uses UPPERCASE DB values)
// ==============================================================================

function applyFiltersToDocuments(documents) {
    if (!documents) return [];
    let filtered = [...documents];
    if (currentFilter !== 'ALL') {
        if (currentFilter === 'REUPLOAD_REQUESTED') {
            // "Needs Revision" filter matches both REJECTED and REUPLOAD_REQUESTED
            filtered = filtered.filter(d => d.review_status === 'REJECTED' || d.review_status === 'REUPLOAD_REQUESTED');
        } else {
            filtered = filtered.filter(d => d.review_status === currentFilter);
        }
    }
    if (currentSearch && currentSearch.trim()) {
        const s = currentSearch.toLowerCase().trim();
        filtered = filtered.filter(d =>
            (d.document_name || '').toLowerCase().includes(s) ||
            (d.document_type || '').toLowerCase().includes(s) ||
            (d.file_name || '').toLowerCase().includes(s)
        );
    }
    return filtered;
}

function applyFilter(status) {
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === status);
    });
    renderDocumentStatus(DOC_STATE.documents);
}

// ==============================================================================
// ⚙️ SETTINGS
// ==============================================================================

function populateSettingsForm() {
    if (!CURRENT_USER) return;
    const f = id => document.getElementById(id);
    if (f('setting-fullname')) f('setting-fullname').value = CURRENT_USER.full_name || '';
    if (f('setting-business')) f('setting-business').value = CURRENT_USER.business_name || '';
    if (f('setting-phone')) f('setting-phone').value = CURRENT_USER.phone_no || '';
    if (f('setting-ssm')) f('setting-ssm').value = CURRENT_USER.business_ssm || '';
    if (f('setting-email')) f('setting-email').value = CURRENT_USER.email || '(not set)';

    const statusEl = f('setting-status');
    if (statusEl) {
        statusEl.innerHTML = CURRENT_USER.is_verified
            ? '<span class="badge-approved">✅ Verified Operator</span>'
            : '<span class="badge-pending">⏳ Pending Verification</span>';
    }
}

async function saveSettings(e) {
    e.preventDefault();
    if (!CURRENT_USER) return alert('Please log in first.');

    const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const fullName = getVal('setting-fullname');
    const businessName = getVal('setting-business');
    const phoneNo = getVal('setting-phone');

    if (!fullName) return alert('Full name cannot be empty.');
    if (!businessName) return alert('Business name cannot be empty.');

    const updates = {
        full_name: fullName,
        business_name: businessName,
        phone_no: phoneNo
    };

    const { error } = await MySTRA_API.updateProfile(CURRENT_USER.id, updates);
    if (error) return alert('Failed: ' + error.message);

    alert('✅ Profile updated!');
    CURRENT_USER = { ...CURRENT_USER, ...updates };
    renderUserFooter(CURRENT_USER);
}

// ==============================================================================
// 🚀 INIT
// ==============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    await initializeUserSession();

    const badge = document.getElementById('db-status-badge');
    if (badge) {
        badge.textContent = '🟢 SUPABASE LIVE';
        badge.style.background = '#DCFCE7';
        badge.style.color = '#15803D';
    }

    const searchInput = document.getElementById('doc-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentSearch = searchInput.value;
            renderDocumentStatus(DOC_STATE.documents);
        });
    }

    const docTypeSelect = document.getElementById('doc-type-select');
    const docNameContainer = document.getElementById('document-name-container');
    if (docTypeSelect && docNameContainer) {
        docTypeSelect.addEventListener('change', () => {
            docNameContainer.style.display = docTypeSelect.value === 'Other' ? 'block' : 'none';
        });
    }

    if (document.getElementById('documents-status-container')) {
        await loadDocumentData();
    }

    if (document.getElementById('gps-status')) {
    // Load user's properties + restore active choice BEFORE GPS detection
    await loadUserProperties();

    if (CURRENT_USER) {
        const storedActive = localStorage.getItem(`mystra_active_property_${CURRENT_USER.id}`);
        const props = DOC_STATE.myProperties || [];

        if (storedActive && props.some(p => p.id === storedActive)) {
            DOC_STATE.selectedPropertyId = storedActive;
        } else if (props.length > 0) {
            DOC_STATE.selectedPropertyId = props[0].id;
            localStorage.setItem(`mystra_active_property_${CURRENT_USER.id}`, DOC_STATE.selectedPropertyId);
        }

        DOC_STATE.propertyId = DOC_STATE.selectedPropertyId;
    }

    await updatePropertyInfo(CURRENT_USER);
    initGPSDetection();
}

    if (document.getElementById('location-registry-container')) {
        await loadLocationData();
    }

    const form = document.getElementById('document-upload-form');
    if (form) form.addEventListener('submit', handleDocumentUpload);

    const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', saveSettings);
    populateSettingsForm();   
}

const propertyForm = document.getElementById('property-form');
if (propertyForm) {
    propertyForm.addEventListener('submit', handleSaveProperty);
    await loadPropertyIntoForm();

    const addBtn = document.getElementById('btn-add-new-property');
    if (addBtn) addBtn.addEventListener('click', resetPropertyForm);
}

    const revModal = document.getElementById('revision-modal');
    if (revModal) revModal.addEventListener('click', e => { if (e.target === revModal) closeRevisionModal(); });
});

// ==============================================================================
// 🏠 MULTI-PROPERTY REGISTRATION (DB-backed)
// ==============================================================================

// ==============================================================================
// 🌐 ADDRESS GEOCODING — MULTI-STRATEGY FALLBACK
// ==============================================================================

async function geocodeAddress(address) {
    if (!address || !address.trim()) {
        return { success: false, error: 'Address is empty' };
    }

    const city = document.getElementById('prop-city')?.value.trim() || '';
    const state = document.getElementById('prop-state')?.value.trim() || '';

    const strategies = [
        {
            label: 'Structured',
            params: {
                street: address,
                city: city || 'Kuala Lumpur',
                state: state || '',
                country: 'Malaysia',
                format: 'json',
                limit: '1',
                addressdetails: '1'
            }
        },
        {
            label: 'Street + City',
            params: {
                q: [address, city, 'Malaysia'].filter(Boolean).join(', '),
                format: 'json',
                limit: '1'
            }
        },
        {
            label: 'City + State',
            params: {
                q: [city || 'Kuala Lumpur', state || 'Wilayah Persekutuan Kuala Lumpur', 'Malaysia'].filter(Boolean).join(', '),
                format: 'json',
                limit: '1'
            }
        },
        {
            label: 'Fallback City',
            params: {
                q: (city || 'Kuala Lumpur') + ', Malaysia',
                format: 'json',
                limit: '1'
            }
        }
    ];

    for (const strategy of strategies) {
        try {
            const params = new URLSearchParams(strategy.params).toString();
            const url = `https://nominatim.openstreetmap.org/search?${params}`;

            console.log(`🔍 [Geocode] Trying "${strategy.label}"...`);

            const res = await fetch(url, {
                headers: { 'Accept-Language': 'en', 'User-Agent': 'MySTRA-App' }
            });

            const results = await res.json();

            if (results && results.length > 0) {
                console.log(`✅ [Geocode] Success with "${strategy.label}"`);
                return {
                    success: true,
                    lat: parseFloat(results[0].lat),
                    lng: parseFloat(results[0].lon),
                    displayName: results[0].display_name,
                    strategy: strategy.label,
                    isApproximate: strategy.label !== 'Structured' && strategy.label !== 'Street + City'
                };
            }

            // Nominatim rate limit: 1 request per second
            await new Promise(r => setTimeout(r, 1100));

        } catch (err) {
            console.warn(`⚠️ [Geocode] "${strategy.label}" failed:`, err);
        }
    }

    return {
        success: false,
        error: 'Could not find this address. Try including the city or postcode.\ne.g., "Jalan Bukit Bintang, 55100 Kuala Lumpur"'
    };
}

// ==============================================================================
// 📋 LOAD USER'S PROPERTIES FROM DB
// ==============================================================================

async function loadUserProperties() {
    if (!CURRENT_USER) return [];

    const { data, error } = await MySTRA_API.getPropertiesByOwner(CURRENT_USER.id);
    if (error) {
        console.warn('Could not load properties:', error);
        DOC_STATE.myProperties = [];
        return [];
    }
    DOC_STATE.myProperties = data || [];
    return DOC_STATE.myProperties;
}





// ==============================================================================
// 📋 RENDER PROPERTIES LIST
// ==============================================================================

function renderPropertiesList() {
    const container = document.getElementById('properties-list');
    if (!container) return;

    const props = DOC_STATE.myProperties || [];

    if (props.length === 0) {
        container.innerHTML = `
            <div style="background:#F8FAFC;color:#6B7280;padding:16px;border-radius:8px;font-size:13px;text-align:center;border:1px dashed #D1D5DB;">
                No properties registered yet. Click <strong>"+ Add New Property"</strong> to start.
            </div>`;
        return;
    }

    container.innerHTML = props.map(p => {
        const isActive = DOC_STATE.selectedPropertyId === p.id;
        const verifiedBadge = p.is_verified
            ? '<span class="badge-approved" style="font-size:11px;">✅ Verified</span>'
            : '<span class="badge-pending" style="font-size:11px;">⏳ Pending</span>';

        return `
            <div style="border:2px solid ${isActive ? '#2563EB' : '#E5E7EB'};background:${isActive ? '#EFF6FF' : 'white'};padding:12px;border-radius:8px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:14px;color:#1E293B;margin-bottom:2px;">
                            ${isActive ? '⭐ ' : ''}${p.title || 'Untitled'}
                        </div>
                        <div style="font-size:12px;color:#6B7280;margin-bottom:4px;">
                            📍 ${p.address || 'No address'}${p.city ? ', ' + p.city : ''}${p.state ? ', ' + p.state : ''}
                        </div>
                        <div style="font-size:11px;color:#9CA3AF;font-family:monospace;margin-bottom:6px;">
                            Lat: ${p.latitude?.toFixed(4) || 'N/A'}, Lng: ${p.longitude?.toFixed(4) || 'N/A'}
                        </div>
                        ${verifiedBadge}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;min-width:110px;">
                        ${!isActive ? `
                            <button onclick="setActiveProperty('${p.id}')" class="btn-secondary"
                                style="font-size:11px;padding:6px 12px;background:#DBEAFE;color:#1E40AF;cursor:pointer;white-space:nowrap;">
                                ⭐ Set Active
                            </button>` : `
                            <span style="font-size:11px;padding:6px 12px;background:#DCFCE7;color:#15803D;border-radius:6px;font-weight:600;text-align:center;white-space:nowrap;">
                                ✓ Active
                            </span>`}
                        <button onclick="editProperty('${p.id}')" class="btn-secondary"
                            style="font-size:11px;padding:6px 12px;cursor:pointer;">
                            ✏️ Edit
                        </button>
                        <button onclick="deletePropertyById('${p.id}')" class="btn-secondary"
                            style="font-size:11px;padding:6px 10px;background:#FEE2E2;color:#991B1B;cursor:pointer;">
                            🗑️ Delete
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// ==============================================================================
// ➕ ADD NEW / EDIT / DELETE
// ==============================================================================

function resetPropertyForm() {
    document.getElementById('property-form').reset();
    document.getElementById('prop-id').value = '';
    document.getElementById('prop-address').value = '';
    document.getElementById('prop-city').value = '';
    document.getElementById('prop-state').value = '';
    document.getElementById('prop-location-preview').style.display = 'none';

    const btn = document.getElementById('prop-submit-btn');
    if (btn) btn.textContent = '💾 Save New Property';

    document.getElementById('property-form-wrapper').style.display = 'block';
    document.getElementById('property-form').scrollIntoView({ behavior: 'smooth' });
}

function editProperty(propertyId) {
    const p = DOC_STATE.myProperties.find(x => x.id === propertyId);
    if (!p) return;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('prop-id', p.id);
    set('prop-title', p.title);
    set('prop-address', p.address);
    set('prop-city', p.city);
    set('prop-state', p.state);
    set('prop-description', p.description);
    set('prop-contact', p.contact_info);
    set('prop-license', p.license_number);

    // Show existing coords
    const preview = document.getElementById('prop-location-preview');
    const coords = document.getElementById('prop-coords-preview');
    if (preview && p.latitude && p.longitude) {
        preview.style.display = 'block';
        if (coords) coords.textContent = `Lat: ${p.latitude.toFixed(6)}, Lng: ${p.longitude.toFixed(6)}`;
    }

    const btn = document.getElementById('prop-submit-btn');
    if (btn) btn.textContent = '💾 Update Property';

    document.getElementById('property-form-wrapper').style.display = 'block';
    document.getElementById('property-form').scrollIntoView({ behavior: 'smooth' });
}

async function deletePropertyById(propertyId) {
    const p = DOC_STATE.myProperties.find(x => x.id === propertyId);
    if (!p) return;

    if (!confirm(`Delete "${p.title}"?\n\nThis cannot be undone.`)) return;

    const { error } = await MySTRA_API.deleteProperty(propertyId);
    if (error) return alert('Delete failed: ' + error.message);

    alert('✅ Property deleted.');

    if (DOC_STATE.selectedPropertyId === propertyId) {
        DOC_STATE.selectedPropertyId = null;
    }

    await loadUserProperties();
    renderPropertiesList();
    await updatePropertyInfo(CURRENT_USER);
}

// ==============================================================================
// ⭐ SET ACTIVE PROPERTY
// ==============================================================================

async function setActiveProperty(propertyId) {
    if (!CURRENT_USER) return;
    if (!propertyId) return;

    // Verify property belongs to user
    const exists = (DOC_STATE.myProperties || []).some(p => p.id === propertyId);
    if (!exists) {
        console.warn('Property not in your list:', propertyId);
        return;
    }

    // Update state
    DOC_STATE.selectedPropertyId = propertyId;
    DOC_STATE.propertyId = propertyId;

    // Persist
    localStorage.setItem(`mystra_active_property_${CURRENT_USER.id}`, propertyId);

    // Refresh UI
    renderPropertiesList();
    await updatePropertyInfo(CURRENT_USER);

    console.log(`✅ Active property set to: ${propertyId}`);
}

window.setActiveProperty = setActiveProperty;

// ==============================================================================
// 💾 SAVE (Insert or Update)
// ==============================================================================

async function handleSaveProperty(e) {
    e.preventDefault();
    if (!CURRENT_USER) return alert('Please log in first.');

    const getVal = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

    const title = getVal('prop-title');
    const address = getVal('prop-address');
    const city = getVal('prop-city');
    const state = getVal('prop-state');
    const description = getVal('prop-description');
    const contactInfo = getVal('prop-contact');
    const licenseNumber = getVal('prop-license');
    const existingId = getVal('prop-id');

    if (!title) return alert('Property title is required.');
    if (!address) return alert('Address is required.');

    const submitBtn = document.getElementById('prop-submit-btn');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
        submitBtn.textContent = '🔍 Finding GPS location...';
        submitBtn.disabled = true;
    }

    // ✅ Geocode the address
    const geo = await geocodeAddress(address);

    if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }

    if (!geo.success) {
        return alert('❌ ' + geo.error);
    }

    // Show location preview
    const preview = document.getElementById('prop-location-preview');
    const coords = document.getElementById('prop-coords-preview');
    if (preview) preview.style.display = 'block';
    if (coords) {
        coords.textContent = `Lat: ${geo.lat.toFixed(6)}, Lng: ${geo.lng.toFixed(6)}`;
    }

    const propertyData = {
        owner_id: CURRENT_USER.id,
        title: title,
        name: title,
        address: address,
        city: city,
        state: state,
        latitude: geo.lat,
        longitude: geo.lng,
        description: description,
        contact_info: contactInfo,
        license_number: licenseNumber,
        is_verified: false
    };

    if (submitBtn) {
        submitBtn.textContent = '💾 Saving...';
        submitBtn.disabled = true;
    }

    let result;
    if (existingId) {
        result = await MySTRA_API.updateProperty(existingId, propertyData);
    } else {
        result = await MySTRA_API.createProperty(propertyData);
    }

    if (submitBtn) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }

    if (result.error) {
        console.error('Save error:', result.error);
        return alert('Failed to save: ' + result.error.message);
    }

    const approxNote = geo.isApproximate
        ? `\n\n⚠️ Approximate location (strategy: "${geo.strategy}"). Exact street not in OpenStreetMap.`
        : '';

    alert(
        (existingId ? '✅ Property updated!' : '✅ Property added!') +
        `\n\n📍 ${address}\n📌 ${geo.lat.toFixed(6)}, ${geo.lng.toFixed(6)}` +
        approxNote
    );

    if (!DOC_STATE.selectedPropertyId) {
        DOC_STATE.selectedPropertyId = result.data.id;
    }

    // Hide the form
    document.getElementById('property-form-wrapper').style.display = 'none';
    await loadUserProperties();
    renderPropertiesList();
    await updatePropertyInfo(CURRENT_USER);
}

// ==============================================================================
// 📋 INITIAL LOAD
// ==============================================================================

async function loadPropertyIntoForm() {
    if (!CURRENT_USER) return;

    await loadUserProperties();

    // Hide the form initially
    const wrapper = document.getElementById('property-form-wrapper');
    if (wrapper) wrapper.style.display = 'none';

    const props = DOC_STATE.myProperties || [];

    // Try to restore the active property from localStorage
    const storedActive = localStorage.getItem(`mystra_active_property_${CURRENT_USER.id}`);

    if (storedActive && props.some(p => p.id === storedActive)) {
        // Stored property still exists → use it
        DOC_STATE.selectedPropertyId = storedActive;
    } else if (props.length > 0) {
        // No stored / stale → pick the first one
        DOC_STATE.selectedPropertyId = props[0].id;
        localStorage.setItem(`mystra_active_property_${CURRENT_USER.id}`, DOC_STATE.selectedPropertyId);
    } else {
        // No properties at all
        DOC_STATE.selectedPropertyId = null;
        localStorage.removeItem(`mystra_active_property_${CURRENT_USER.id}`);
    }

    DOC_STATE.propertyId = DOC_STATE.selectedPropertyId;

    renderPropertiesList();
    await updatePropertyInfo(CURRENT_USER);
}

// Expose to inline HTML onclick
window.resetPropertyForm = resetPropertyForm;
window.editProperty = editProperty;
window.deletePropertyById = deletePropertyById;


window.addEventListener('beforeunload', () => {
    if (profileSubscription) profileSubscription.unsubscribe();
    if (profilePollInterval) clearInterval(profilePollInterval);
});