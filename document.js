// ==============================================================================
// 📄 STATE
// ==============================================================================

const DOC_STATE = {
    documents: [],
    selectedDocument: null,
    userId: null,
    propertyId: null,
    propertyGPS: null
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
    // 1. Try real Supabase Auth session
    if (window.supabaseClient) {
        try {
            const { data: { user } } = await window.supabaseClient.auth.getUser();
            if (user) {
                const profile = await fetchProfileById(user.id);
                if (profile) return profile;
            }
        } catch (e) { /* no session */ }
    }

    // 2. Try localStorage (set by your login page after successful login)
    const storedId = localStorage.getItem('mystra_user_id');
    if (storedId) {
        const profile = await fetchProfileById(storedId);
        if (profile) return profile;
        // Stale ID — clear it
        localStorage.removeItem('mystra_user_id');
    }

    // 3. No session — return null (causes redirect)
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
        const { data: property } = await MySTRA_API.getPropertyByOwner(profile.id);
        if (property) {
            DOC_STATE.propertyId = property.id;
            DOC_STATE.propertyGPS = { lat: property.latitude, lng: property.longitude };

            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setTxt('upload-operator-name', profile.full_name || 'N/A');
            setTxt('upload-property-id', property.title || property.id);
            setTxt('upload-property-address', property.address || 'N/A');
        }
    } catch (err) { console.warn('Property error:', err); }
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
                            actionBtn = `<button class="action-btn revise" onclick="openRevisionModal('${doc.id}')">✏️ Revise</button>`;
                        } else if (isPending) {
                            actionBtn = `<div style="display:flex;gap:4px;align-items:center;">
                                <span style="font-size:12px;color:#6B7280;">⏳ Awaiting</span>
                                <button class="action-btn" onclick="deleteDocument('${doc.id}')" style="background:#FEE2E2;color:#991B1B;">🗑️</button>
                            </div>`;
                        } else {
                            actionBtn = `<button class="action-btn" onclick="viewDocument('${doc.id}')">👁️ View</button>`;
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

async function deleteDocument(id) {
    const doc = DOC_STATE.documents.find(d => d.id === id);
    if (!doc) return alert('Not found.');
    if (doc.review_status !== 'PENDING') return alert('Only PENDING documents can be deleted.');
    if (!confirm(`Delete "${doc.file_name}"?`)) return;

    const { error } = await MySTRA_API.deleteDocument(id);
    if (error) return alert('Failed: ' + error.message);
    alert('✅ Deleted.');
    await loadDocumentData();
}

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

    const { data: property } = await MySTRA_API.getPropertyByOwner(DOC_STATE.userId);
    if (property) {
        const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
        if (details) details.textContent = `Distance: ${Math.round(dist)}m`;
        if (dist <= 500) {
            badge.textContent = '✅ Within 500m';
            badge.className = 'badge-approved';
        } else {
            badge.textContent = '❌ Outside 500m';
            badge.className = 'badge-rejected';
        }
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

    const { data: property } = await MySTRA_API.getPropertyByOwner(DOC_STATE.userId);
    if (property) {
        const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
        if (dist > 500) return alert('Must be within 500m of property.');
    }

    const doc = DOC_STATE.selectedDocument;
    const { data, error } = await uploadDocument(
        file, doc.document_type, doc.document_name || doc.document_type,
        doc.user_id, doc.property_id, gps.lat, gps.lng
    );

    if (error) return alert('Upload failed: ' + error.message);

    if (data && data[0]) {
        // Old doc → REPLACED
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

    const gps = await getCurrentGPS();
    if (!gps) {
        container.innerHTML = `<div class="widget-card" style="text-align:center;color:#6B7280;"><p style="font-size:40px;">📍</p><h3>GPS Unavailable</h3></div>`;
        return;
    }

    const { data: property } = await MySTRA_API.getPropertyByOwner(DOC_STATE.userId);
    if (!property) {
        container.innerHTML = `<div class="widget-card" style="text-align:center;color:#6B7280;"><p style="font-size:40px;">🏠</p><h3>No Property</h3></div>`;
        return;
    }

    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    const within = dist <= 500;

    container.innerHTML = `
        <div class="widget-card">
            <h2>📍 Location Registry</h2>
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
                        <span style="color:#6B7280;">Address</span><span style="font-weight:500;">${property.address || 'N/A'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F1F5F9;">
                        <span style="color:#6B7280;">Distance</span><span style="font-weight:600;">${Math.round(dist)}m</span>
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

    const { data: property } = await MySTRA_API.getPropertyByOwner(DOC_STATE.userId);
    if (!property) {
        if (distEl) distEl.textContent = 'No property';
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

    const { data: property } = await MySTRA_API.getPropertyByOwner(DOC_STATE.userId);
    if (!property) return alert('No property found.');
    const dist = calculateDistance(gps.lat, gps.lng, property.latitude, property.longitude);
    if (dist > 500) return alert('Must be within 500m of property.');

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

    window.location.href = 'mystra-my-documents.html';
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

    const updates = {
        full_name: document.getElementById('setting-fullname').value,
        business_name: document.getElementById('setting-business').value,
        phone_no: document.getElementById('setting-phone').value
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
        initGPSDetection();
    }

    if (document.getElementById('location-registry-container')) {
        loadLocationData();
    }

    const form = document.getElementById('document-upload-form');
    if (form) form.addEventListener('submit', handleDocumentUpload);

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) settingsForm.addEventListener('submit', saveSettings);

    const revModal = document.getElementById('revision-modal');
    if (revModal) revModal.addEventListener('click', e => { if (e.target === revModal) closeRevisionModal(); });
});

window.addEventListener('beforeunload', () => {
    if (profileSubscription) profileSubscription.unsubscribe();
    if (profilePollInterval) clearInterval(profilePollInterval);
});