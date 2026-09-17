// ==============================================================================
// 🧭 SIDEBAR AND MAIN WORKSPACE PANEL SWITCHER
// ==============================================================================

const sidebarItems = {
    'nav-home': { panel: document.getElementById('view-home'), title: "Home Command Hub" },
    'nav-manager': { panel: document.getElementById('view-dashboard'), title: "MySTRA Code Control Centre" },
    'nav-docs': { panel: document.getElementById('view-docs'), title: "System Documentation" },
    'nav-settings': { panel: document.getElementById('view-settings'), title: "Account Settings Control" }
};

const managerSubTabs = {
    'tab-dashboard': document.getElementById('view-dashboard'),
    'tab-listings': document.getElementById('view-listings'),
    'tab-logs': document.getElementById('view-logs')
};

const sidebarButtons = document.querySelectorAll('.nav-links .nav-item');
const tabButtons = document.querySelectorAll('.tab-btn');
const managerTabsContainer = document.getElementById('manager-tabs');
const mainPageTitle = document.getElementById('page-main-title');
const dbStatusBadge = document.getElementById('db-status-badge');
const btnGenerate = document.getElementById('btn-generate-code');
const codeField = document.getElementById('generated-code-field');
const btnCopy = document.getElementById('btn-copy-code');
const tokenStatusHint = document.getElementById('token-status-hint');

// Global cache
let state = {
    profile: null,
    properties: [],
    codes: [],
    logs: [],
    documents: [],
    pendingCode: null
};

// ==============================================================================
// 📜 HARDCODED AUDIT LOG HISTORY (always shown, survives logout/login)
// ==============================================================================
const SEED_AUDIT_LOGS = [
    { timestamp: '2026-01-04T09:12:44.000Z', registration_code: 'MYSTRA-KL-2026-A1F3', requesting_ota: 'PROPERTY_BOUND_ACTIVE by Agoda Gateway', is_valid_pass: true, checked_nights_snapshot: 0 },
    { timestamp: '2026-01-06T14:03:11.000Z', registration_code: 'MYSTRA-KL-2026-A1F3', requesting_ota: 'LIVE_LISTING_ACTIVE by Booking.com', is_valid_pass: true, checked_nights_snapshot: 42 },
    { timestamp: '2026-01-09T22:47:05.000Z', registration_code: 'MYSTRA-KL-2026-B7C9', requesting_ota: 'TOKEN_CREATED', is_valid_pass: true, checked_nights_snapshot: 0 },
    { timestamp: '2026-01-11T08:20:31.000Z', registration_code: 'MYSTRA-KL-2026-B7C9', requesting_ota: 'VERIFICATION by Mock Agoda Sandbox', is_valid_pass: true, checked_nights_snapshot: 0 },
    { timestamp: '2026-01-14T17:55:18.000Z', registration_code: 'MYSTRA-KL-2026-C4D2', requesting_ota: 'PROPERTY_BOUND_ACTIVE by Agoda Gateway', is_valid_pass: true, checked_nights_snapshot: 12 },
    { timestamp: '2026-01-18T03:11:49.000Z', registration_code: 'MYSTRA-KL-2026-C4D2', requesting_ota: 'SUSPENDED — 180-night municipal cap reached', is_valid_pass: false, checked_nights_snapshot: 180 },
    { timestamp: '2026-01-22T11:38:02.000Z', registration_code: 'MYSTRA-KL-2026-D8E1', requesting_ota: 'LIVE_LISTING_ACTIVE by Airbnb', is_valid_pass: true, checked_nights_snapshot: 67 }
];

// Reset function to switch panels cleanly
function resetAllViews() {
    Object.values(sidebarItems).forEach(item => item.panel.classList.add('hidden'));
    Object.values(managerSubTabs).forEach(panel => panel.classList.add('hidden'));
    sidebarButtons.forEach(btn => btn.classList.remove('active-nav'));
}

// Sidebar Buttons Click Handler
sidebarButtons.forEach(button => {
    button.addEventListener('click', () => {
        resetAllViews();
        button.classList.add('active-nav');

        const selection = sidebarItems[button.id];
        if (selection) {
            mainPageTitle.textContent = selection.title;

            if (button.id === 'nav-manager') {
                managerTabsContainer.style.display = 'flex';
                document.getElementById('tab-dashboard').classList.add('active');
                document.getElementById('tab-listings').classList.remove('active');
                document.getElementById('tab-logs').classList.remove('active');
                selection.panel.classList.remove('hidden');
                applyVerificationGate(state.isVerified);
            } else {
                managerTabsContainer.style.display = 'none';
                selection.panel.classList.remove('hidden');
                const lockOverlay = document.getElementById('verification-lock-overlay');
                if (lockOverlay) lockOverlay.style.display = 'none';
                const viewport = document.querySelector('.workspace-viewport');
                if (viewport) viewport.classList.remove('blurred-content');
            }
        }
    });
});

// Inner Manager Sub-Tabs Click Handler
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        Object.values(managerSubTabs).forEach(panel => panel.classList.add('hidden'));

        button.classList.add('active');
        if (managerSubTabs[button.id]) {
            managerSubTabs[button.id].classList.remove('hidden');
        }

        // Re-render when switching tabs to ensure real-time accuracy
        if (button.id === 'tab-listings') {
            renderFullListings(state.properties, state.codes);
        } else if (button.id === 'tab-logs') {
            renderAuditLogs(state.logs);
        } else if (button.id === 'tab-dashboard') {
            renderSimplifiedListings(state.codes, state.properties);
            renderTerminalLogsHistory(state.logs);
        }
        applyVerificationGate(state.isVerified);
    });
});

// ==============================================================================
// 📊 RENDER METHODS: SUPABASE -> DOM
// ==============================================================================

function logToTerminal(message, type = 'info', timestamp = null) {
    const terminalBody = document.getElementById('terminal-body-logs');
    if (!terminalBody) return;

    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    let typeClass = 'text-blue';
    let label = 'INFO:';

    if (type === 'success' || type === 'created' || type === 'active') {
        typeClass = 'text-green';
        label = type === 'created' ? 'CREATED:' : 'SUCCESS:';
    } else if (type === 'error' || type === 'suspended') {
        typeClass = 'text-red';
        label = type === 'suspended' ? 'SUSPENDED:' : 'ERROR:';
    }

    const p = document.createElement('p');
    p.innerHTML = `<span class="text-gray">[${timeStr}]</span> <span class="${typeClass}">${label}</span> ${message}`;

    // Insert before prompt
    const prompt = terminalBody.querySelector('.cli-prompt');
    if (prompt) {
        terminalBody.insertBefore(p, prompt);
    } else {
        terminalBody.appendChild(p);
    }
}

function renderTerminalLogsHistory(logs) {
    const terminalBody = document.getElementById('terminal-body-logs');
    if (!terminalBody) return;

    // Reset terminal content except prompt
    terminalBody.innerHTML = `
        <p><span class="text-gray">[SYSTEM]</span> <span class="text-green">Supabase Real-Time Event Ledger Active</span></p>
        <p class="cli-prompt"><span class="text-blue">mystra-engine:~ $</span><span class="blinking-cursor">█</span></p>
    `;

    if (!logs || logs.length === 0) return;

    // Display logs chronologically (reverse sorted limit array)
    const reversedLogs = [...logs].reverse();
    reversedLogs.forEach(l => {
        const req = l.requesting_ota || '';
        let type = l.is_valid_pass ? 'success' : 'suspended';
        let msg = `Code ${l.registration_code}: ${req}`;

        if (req.includes('TOKEN_CREATED')) {
            type = 'created';
            msg = `[CREATION] Code ${l.registration_code} minted in registry (Pending property binding).`;
        } else if (req.includes('PROPERTY_BOUND_ACTIVE')) {
            type = 'active';
            msg = `[ACTIVATION] Code ${l.registration_code} bound to listing & verified by ${req.split(' ')[0]}.`;
        } else if (req.includes('SUSPENDED') || !l.is_valid_pass) {
            type = 'suspended';
            msg = `[SUSPENSION] Code ${l.registration_code} flagged: 180-night cap reached or verification failed.`;
        } else {
            msg = `[TELEMETRY] Code ${l.registration_code} verified by ${req} (${l.checked_nights_snapshot}/180 nights used).`;
        }

        logToTerminal(msg, type, l.timestamp);
    });
}

function renderSimplifiedListings(codes, properties) {
    const tbody = document.getElementById('simplified-listings-rows');
    if (!tbody) return;

    if (!codes || codes.length === 0) {
        if (properties && properties.length > 0) {
            tbody.innerHTML = properties.map((p, idx) => {
                const codeObj = p.mystra_codes && p.mystra_codes[0];
                const codeStr = codeObj ? codeObj.registration_code : 'NO CODE ASSIGNED';
                const status = codeObj ? codeObj.code_status : 'PENDING';
                const isLive = status === 'ACTIVE';
                return `
                    <tr>
                        <td>${String(idx + 1).padStart(2, '0')}</td>
                        <td class="mono-text-blue">${codeStr}</td>
                        <td>${p.title}</td>
                        <td><span class="${isLive ? 'badge-green' : 'badge-red'}">${isLive ? '🟢 LIVE & ACTIVE' : '🔴 ' + status}</span></td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #6B7280; padding: 20px;">No registered properties or tokens found in database.</td></tr>`;
        }
        return;
    }

    tbody.innerHTML = codes.map((c, idx) => {
        const propTitle = c.properties?.title || (c.property_id ? 'Assigned Property' : '⚡ Unassigned (Pending Agoda Onboarding)');
        const isLive = c.code_status === 'ACTIVE' && c.property_id;
        const isPending = !c.property_id || c.code_status === 'PENDING_REGISTRATION';

        let statusBadge = `<span class="badge-green">🟢 LIVE & ACTIVE</span>`;
        if (isPending) {
            statusBadge = `<span style="background-color:#FEF3C7; color:#92400E; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600;">🟡 UNUSED / PENDING</span>`;
        } else if (c.code_status === 'SUSPENDED') {
            statusBadge = `<span class="badge-red">🔴 SUSPENDED (CAP REACHED)</span>`;
        } else if (c.code_status === 'EXPIRED') {
            statusBadge = `<span style="background-color:#F3F4F6; color:#4B5563; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600;">⚪ EXPIRED</span>`;
        }

        return `
            <tr>
                <td>${String(idx + 1).padStart(2, '0')}</td>
                <td class="mono-text-blue">${c.registration_code}</td>
                <td>${propTitle}</td>
                <td>${statusBadge}</td>
            </tr>
        `;
    }).join('');
}

function renderFullListings(properties = [], codes = []) {
    const container = document.getElementById('full-listings-container');
    if (!container) return;

    // Aggregate inventory items so every property and every code is visible
    const items = [];
    const seenPropIds = new Set();

    // 1. First, include all properties from properties list
    (properties || []).forEach(p => {
        if (p.id) seenPropIds.add(p.id);
        const codeObj = (p.mystra_codes && p.mystra_codes[0]) ||
            codes.find(c => c.property_id === p.id) ||
            { registration_code: 'UNASSIGNED', code_status: 'PENDING', booked_nights: 0, max_limit_cap: 180 };
        items.push({
            id: p.id,
            title: p.title,
            city: p.city,
            state: p.state,
            address: p.address,
            codeObj: codeObj,
            isPending: false
        });
    });

    // 2. Next, include any properties linked inside codes that weren't in properties
    (codes || []).forEach(c => {
        if (c.property_id && c.properties && !seenPropIds.has(c.property_id)) {
            seenPropIds.add(c.property_id);
            items.push({
                id: c.property_id,
                title: c.properties.title || 'Bound Property Listing',
                city: c.properties.city,
                state: c.properties.state,
                address: c.properties.address,
                codeObj: c,
                isPending: false
            });
        }
    });

    // 3. Include any unassigned / pending registration codes as pending listings
    (codes || []).forEach(c => {
        if (!c.property_id) {
            items.push({
                id: null,
                title: '⚡ Pending Accommodation Listing (Ready for Agoda)',
                city: 'Kuala Lumpur',
                state: 'Wilayah Persekutuan',
                address: 'Awaiting OTA Property Binding',
                codeObj: c,
                isPending: true
            });
        }
    });

    if (items.length === 0) {
        container.innerHTML = `<p style="color: #6B7280; padding: 16px;">No property inventory found for this account. Generate a code above to begin onboarding your accommodation!</p>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const p = item;
        const codeObj = item.codeObj;
        const booked = codeObj.booked_nights || 0;
        const maxCap = codeObj.max_limit_cap || 180;
        const pct = Math.min(Math.round((booked / maxCap) * 100), 100);
        const isLive = codeObj.code_status === 'ACTIVE' && booked < maxCap && !item.isPending;
        const isBreached = booked >= maxCap;
        const isPending = item.isPending || codeObj.code_status === 'PENDING_REGISTRATION';

        let badge = `<span class="${isLive ? 'badge-green' : 'badge-red'}">${isLive ? '🟢 Live & Active' : (isBreached ? '🔴 SUSPENDED (CAP REACHED)' : '🔴 ' + codeObj.code_status)}</span>`;
        if (isPending) {
            badge = `<span style="background-color:#FEF3C7; color:#92400E; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600;">🟡 UNUSED / PENDING ONBOARDING</span>`;
        }

        return `
            <div class="inventory-item" style="${isPending ? 'border-left: 4px solid #F59E0B;' : ''}">
                <div class="inventory-header">
                    <h3>${p.title}</h3>
                    ${badge}
                </div>
                <p>
                    <strong>Token ID:</strong> <span class="mono-text">${codeObj.registration_code}</span> | 
                    <strong>Location:</strong> ${p.city || ''}, ${p.state || ''} | 
                    <strong>Address:</strong> ${p.address || ''}
                </p>
                ${isPending ? `
                    <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between; background: #FFFBEB; padding: 10px 14px; border-radius: 8px; border: 1px solid #FDE68A;">
                        <span style="font-size: 13px; color: #92400E;">📌 Ready for deployment. Bind this token on Mock Agoda to verify and launch this listing.</span>
                        <a href="mock-agoda.html" class="btn-primary" style="padding: 6px 14px; font-size: 13px; text-decoration: none; white-space: nowrap;">⚡ Onboard on Mock Agoda →</a>
                    </div>
                ` : `
                    <div class="progress-container">
                        <div class="progress-label">
                            <span>${booked} / ${maxCap} Nights Allocated</span> 
                            <span class="${isBreached ? 'text-red' : ''}">${isBreached ? 'Cap Breached' : pct + '% Capacity'}</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill ${isBreached ? 'bg-danger' : ''}" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                `}
            </div>
        `;
    }).join('');
}

function renderAuditLogs(logs) {
    const tbody = document.getElementById('audit-logs-rows');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #6B7280; padding: 20px;">No telemetry audit logs recorded yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(l => {
        const rawTime = l.timestamp || l.created_at;
        const timeFormatted = rawTime ? new Date(rawTime).toLocaleString() : 'Just now';
        const isPass = l.is_valid_pass;
        const req = l.requesting_ota || 'API Gateway';

        let badgeHtml = '';
        if (req.includes('TOKEN_CREATED')) {
            badgeHtml = `<span style="background-color:#DBEAFE; color:#1E40AF; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600;">🟢 TOKEN CREATED</span> <span style="font-size:13px; color:#4B5563;">(Pending OTA Binding)</span>`;
        } else if (req.includes('PROPERTY_BOUND_ACTIVE')) {
            badgeHtml = `<span class="badge-green">🟢 BOUND & ACTIVATED</span> <span style="font-size:13px; color:#15803D;">[200 OK] Live on OTA</span>`;
        } else if (req.includes('LIVE_LISTING_ACTIVE')) {
            badgeHtml = `<span class="badge-green">🟢 OTA HANDSHAKE LIVE</span> <span style="font-size:13px; color:#15803D;">[200 OK] (${l.checked_nights_snapshot || 0}/180 nights)</span>`;
        } else if (req.includes('VERIFICATION')) {
            badgeHtml = `<span style="background-color:#E0F2FE; color:#0369A1; padding:4px 8px; border-radius:6px; font-size:12px; font-weight:600;">🔍 GATEWAY VERIFY</span> <span style="font-size:13px; color:#0369A1;">[200 OK]</span>`;
        } else if (!isPass || req.includes('SUSPENDED')) {
            badgeHtml = `<span class="badge-red">🔴 SUSPENDED / BLOCKED</span> <span style="font-size:13px; color:#991B1B;">[403 Forbidden]</span>`;
        } else {
            badgeHtml = `<span class="text-green">[🟢 200 OK] Validated (${l.checked_nights_snapshot || 0}/180 nights)</span>`;
        }

        return `
            <tr>
                <td>${timeFormatted}</td>
                <td class="mono-text-blue">${l.registration_code || 'N/A'}</td>
                <td><strong>${req}</strong></td>
                <td>${badgeHtml}</td>
            </tr>
        `;
    }).join('');
}

function renderDocuments(docs) {
    const container = document.getElementById('docs-list-container');
    if (!container) return;

    if (!docs || docs.length === 0) {
        container.innerHTML = `
            <li class="inventory-item" style="display:flex; justify-content:space-between; align-items:center;">
                <span>📄 Municipal STRA Guidelines 2026.pdf</span>
                <a class="btn-secondary" href="docs/Municipal-STRA-Guidelines-2026.pdf" download="Municipal-STRA-Guidelines-2026.pdf" style="text-decoration:none;">📥 Download</a>
            </li>
            <li class="inventory-item" style="display:flex; justify-content:space-between; align-items:center;">
                <span>📄 Operator Identity Certification Packet.pdf</span>
                <a class="btn-secondary" href="docs/Operator-Identity-Certification-Packet.pdf" download="Operator-Identity-Certification-Packet.pdf" style="text-decoration:none;">📥 Download</a>
            </li>
        `;
        return;
    }

    container.innerHTML = docs.map(d => `
        <li class="inventory-item" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong>📄 ${d.document_type}</strong>
                <span class="badge-green" style="margin-left: 8px;">${d.review_status || 'APPROVED'}</span>
                ${d.admin_feedback ? `<p style="font-size: 12px; color: #6B7280; margin-top: 4px;">Note: ${d.admin_feedback}</p>` : ''}
            </div>
            ${d.file_path
            ? `<a class="btn-secondary" href="${d.file_path}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">📥 Download</a>`
            : `<span class="btn-secondary" style="opacity:0.5; cursor:not-allowed;">📎 No File</span>`
        }
        </li>
    `).join('');
}

function renderProfile(profile, userEmail) {
    if (!profile && !userEmail) return;
    const nameEl = document.getElementById('setting-fullname');
    const bizEl = document.getElementById('setting-business');
    const phoneEl = document.getElementById('setting-phone');
    const welcomeEl = document.getElementById('home-welcome-title');
    const welcomeSubEl = document.getElementById('home-welcome-email');

    if (profile) {
        if (nameEl && profile.full_name) nameEl.value = profile.full_name;
        if (bizEl && profile.business_name) bizEl.value = profile.business_name;
        if (phoneEl && profile.phone_no) phoneEl.value = profile.phone_no;
    }

    // Welcome message: prefer full_name, fall back to email
    if (welcomeEl) {
        const displayName = profile?.full_name || userEmail || 'Operator';
        welcomeEl.textContent = `Welcome Back, ${displayName}`;
    }
    // Show email as subtitle if we have a name
    if (welcomeSubEl && userEmail) {
        welcomeSubEl.textContent = `Logged in as: ${userEmail}`;
        welcomeSubEl.style.display = 'block';
    }
}

function updatePortfolioMetrics(properties, codes) {
    const statsEl = document.getElementById('portfolio-stats-text');
    if (!statsEl) return;

    let activeCount = 0;
    let suspendedCount = 0;

    properties.forEach(p => {
        const code = (p.mystra_codes && p.mystra_codes[0]) || codes.find(c => c.property_id === p.id);
        if (code && code.code_status === 'ACTIVE' && (code.booked_nights || 0) < (code.max_limit_cap || 180)) {
            activeCount++;
        } else {
            suspendedCount++;
        }
    });

    statsEl.textContent = `Active properties: ${activeCount} | Suspended / Inactive: ${suspendedCount}`;
}

// Check and manage the single active unassigned code lock from database
function checkPendingCodeLock(codes) {
    if (!state.isVerified) {
        if (btnGenerate) {
            btnGenerate.disabled = true;
            btnGenerate.textContent = "🔒 Verification Required";
        }
        if (tokenStatusHint) {
            tokenStatusHint.innerHTML = `<span style="color: #DC2626; font-weight: 600;">🔒 Access restricted:</span> You must be verified to access this page.`;
        }
        return;
    }

    // Only verify real codes stored in Supabase where property_id is null or status is PENDING_REGISTRATION
    const pendingInDb = (codes || []).find(c => (!c.property_id || c.code_status === 'PENDING_REGISTRATION') && c.code_status !== 'EXPIRED');

    if (pendingInDb) {
        state.pendingCode = pendingInDb.registration_code;
        codeField.value = state.pendingCode;
        btnGenerate.disabled = true;
        if (tokenStatusHint) {
            tokenStatusHint.innerHTML = `⚠️ Pending token <strong class="mono-text-blue">${state.pendingCode}</strong> is in database waiting to be bound. Please use it in the <a href="mock-agoda.html" style="color: #2563EB; font-weight: 600; text-decoration: underline;">Mock Agoda Onboarding Page</a> before generating a new one.`;
        }
    } else {
        // No pending unassigned code in Supabase - unlock generator and reset field if it was a phantom code
        localStorage.removeItem('mystra_pending_code');
        state.pendingCode = null;
        if (codeField.value === 'MYSTRA-KL-2026-BA6D' || !codeField.value.startsWith('MYSTRA-')) {
            codeField.value = "CLICK GENERATE TO CREATE";
        }
        btnGenerate.disabled = false;
        if (tokenStatusHint) {
            tokenStatusHint.innerHTML = `🟢 Ready to generate a new municipal tracking token.`;
        }
    }
}

// ==============================================================================
// 🔒 OPERATOR VERIFICATION GATEWAY
// ==============================================================================

function applyVerificationGate(isVerified) {
    const lockOverlay = document.getElementById('verification-lock-overlay');
    const viewport = document.querySelector('.workspace-viewport');
    const btnTestCode = document.getElementById('btn-test-code');

    if (isVerified) {
        // UNLOCKED: verified operator
        if (lockOverlay) lockOverlay.style.display = 'none';
        if (viewport) viewport.classList.remove('blurred-content');
        if (btnGenerate && !state.pendingCode) {
            btnGenerate.disabled = false;
            btnGenerate.textContent = "Generate New Unique Code";
        }
        if (btnTestCode) {
            btnTestCode.disabled = false;
            btnTestCode.style.opacity = '1';
            btnTestCode.style.cursor = 'pointer';
        }
    } else {
        // LOCKED: unverified operator
        if (lockOverlay) lockOverlay.style.display = 'flex';
        if (viewport) viewport.classList.add('blurred-content');
        if (btnGenerate) {
            btnGenerate.disabled = true;
            btnGenerate.textContent = "🔒 Verification Required";
        }
        if (btnTestCode) {
            btnTestCode.disabled = true;
            btnTestCode.style.opacity = '0.5';
            btnTestCode.style.cursor = 'not-allowed';
        }
        if (tokenStatusHint) {
            tokenStatusHint.innerHTML = `<span style="color: #DC2626; font-weight: 600;">🔒 Access restricted:</span> You must be verified to access this page.`;
        }
    }
}

// ==============================================================================
// 🔄 SUPABASE DATA SYNCHRONIZATION ENGINE (USER-SCOPED)
// ==============================================================================

async function loadSupabaseData() {
    if (!window.supabaseClient) {
        if (dbStatusBadge) {
            dbStatusBadge.textContent = "🔴 SUPABASE SDK NOT LOADED";
            dbStatusBadge.style.backgroundColor = "#FEE2E2";
            dbStatusBadge.style.color = "#991B1B";
        }
        return;
    }

    // --- 1. AUTH SESSION CHECK: redirect to login if not authenticated ---
    const { user, error: authErr } = await MySTRA_API.getCurrentUser();
    if (authErr || !user) {
        window.location.href = 'login.html';
        return;
    }

    const userId = user.id;
    const userEmail = user.email;
    state.user = user;
    state.userId = userId;

    try {
        // 2. Fetch only THIS user's properties
        const { data: properties, error: propErr } = await MySTRA_API.getPropertiesByOwner(userId);
        if (propErr) throw propErr;
        state.properties = properties || [];

        // 3. Fetch only THIS user's codes
        const { data: codes, error: codeErr } = await MySTRA_API.getCodesByOwner(userId);
        if (!codeErr && codes) state.codes = codes;

        // 4. Fetch audit logs — prepend live session logs, always append hardcoded history
        let liveLogs = [];
        try {
            const { data: logs, error: logErr } = await MySTRA_API.getAuditLogs();
            if (!logErr && logs) liveLogs = logs;
        } catch (e) { /* ignore */ }
        state.logs = [...liveLogs, ...SEED_AUDIT_LOGS];

        // 5. Fetch documents
        const { data: docs } = await MySTRA_API.getComplianceDocuments();
        if (docs) state.documents = docs;

        // 6. Fetch THIS user's profile (by session user ID)
        const { data: profile } = await MySTRA_API.getProfile(userId);
        if (profile) state.profile = profile;

        // 7. Check verification status (profile is_verified OR auth metadata is_verified)
        const isVerified = Boolean(
            (profile && profile.is_verified === true) ||
            (user.user_metadata && user.user_metadata.is_verified === true)
        );
        state.isVerified = isVerified;
        applyVerificationGate(isVerified);

        // Update connection badge
        if (dbStatusBadge) {
            dbStatusBadge.textContent = "🟢 SUPABASE LIVE";
            dbStatusBadge.style.backgroundColor = "#DCFCE7";
            dbStatusBadge.style.color = "#15803D";
        }

        renderSimplifiedListings(state.codes, state.properties);
        renderFullListings(state.properties, state.codes);
        renderAuditLogs(state.logs);
        renderTerminalLogsHistory(state.logs);
        renderDocuments(state.documents);
        renderProfile(state.profile, userEmail);
        updatePortfolioMetrics(state.properties, state.codes);
        checkPendingCodeLock(state.codes);

    } catch (err) {
        console.warn("⚠️ Supabase Fetch Alert:", err);
        if (dbStatusBadge) {
            dbStatusBadge.textContent = "🟡 SUPABASE CONNECTED (EMPTY TABLES/RLS)";
            dbStatusBadge.style.backgroundColor = "#FEF3C7";
            dbStatusBadge.style.color = "#92400E";
        }
    }
}

// ==============================================================================
// 🔑 JUST-IN-TIME TOKEN ENGINE (SUPABASE WRITES & AUDIT LOGGING)
// ==============================================================================

if (btnGenerate) {
    btnGenerate.addEventListener('click', async () => {
        if (!state.isVerified) {
            alert("⚠️ Access Blocked:\nYou must be verified to access this page and generate MySTRA registration codes.\n\nPlease submit your verification documents first.");
            return;
        }

        if (state.pendingCode) {
            alert(`⚠️ Action Blocked:\nYou already have an active unused token: ${state.pendingCode}.\n\nPlease bind this token on the Mock Agoda page before creating a new one.`);
            return;
        }

        const randomHex = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
        const newCode = `MYSTRA-KL-2026-${randomHex}`;

        codeField.value = newCode;
        btnGenerate.disabled = true;
        btnGenerate.textContent = "Minting in Supabase...";

        try {
            // Register token in Supabase (which also logs State Transition: TOKEN_CREATED)
            const { data, error } = await MySTRA_API.createRegistrationCode(newCode, 180, null, state.userId);

            if (error) {
                console.error("❌ Supabase Insert Error:", error);
                const isRlsError = error.code === '42501' || (error.message && error.message.includes('row-level security'));

                if (isRlsError) {
                    alert(`⚠️ Supabase Permission Error (RLS Policy Active):\n\nSupabase blocked the write with code 42501:\n"${error.message}"\n\n👉 Solution: Open Supabase Dashboard > SQL Editor, run the script 'fix-supabase.sql' to grant public access policies!`);
                } else {
                    alert(`⚠️ Supabase Write Failed:\n${error.message || 'Database error'}\n\nPlease check your Supabase tables.`);
                }
                logToTerminal(`[ERROR] Supabase insert blocked: ${error.message}`, 'error');
            } else {
                logToTerminal(`[TOKEN_CREATED] Token ${newCode} saved to database 'mystra_codes' & audit log recorded.`, 'created');
                alert(`✅ New Municipal Token Generated & Saved to Supabase!\n\nCode: ${newCode}\nStatus: PENDING_REGISTRATION\n\n📌 You cannot generate another code until you use this code on the Mock Agoda onboarding page.`);
            }

            // Lock generator until this code is used
            localStorage.setItem('mystra_pending_code', newCode);
            state.pendingCode = newCode;

            // Reload database state to refresh logs and listings immediately
            await loadSupabaseData();

        } catch (dbErr) {
            console.error("Token generation exception:", dbErr);
            localStorage.setItem('mystra_pending_code', newCode);
            state.pendingCode = newCode;
            logToTerminal(`Token generated: ${newCode} (Offline fallback)`, 'info');
            alert(`⚠️ Note: ${dbErr.message}\nToken generated locally: ${newCode}`);
            checkPendingCodeLock(state.codes);
        }

        btnGenerate.textContent = "Generate New Unique Code";
    });
}

if (btnCopy) {
    btnCopy.addEventListener('click', () => {
        if (codeField.value && codeField.value !== "CLICK GENERATE TO CREATE") {
            navigator.clipboard.writeText(codeField.value);
            alert(`📋 Copied: ${codeField.value}\nReady to paste into your Mock Agoda Form!`);
        }
    });
}

// Settings Form Submission
const settingsForm = document.getElementById('settings-form');
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const full_name = document.getElementById('setting-fullname').value;
        const business_name = document.getElementById('setting-business').value;
        const phone_no = document.getElementById('setting-phone').value;

        if (state.profile && state.profile.id) {
            const { error } = await MySTRA_API.updateProfile(state.profile.id, { full_name, business_name, phone_no });
            if (error) {
                alert(`Error saving profile: ${error.message}`);
            } else {
                alert(`✅ Profile updated in Supabase!`);
                loadSupabaseData();
            }
        } else {
            alert(`✅ Preferences saved locally! (Run schema.sql to enable persistent profile updates)`);
        }
    });
}

// Link out hook to take user from control panel over to Agoda layout
const btnTestCode = document.getElementById('btn-test-code');
if (btnTestCode) {
    btnTestCode.addEventListener('click', () => {
        if (!state.isVerified) {
            alert("⚠️ Access Blocked:\nYou must be verified to access this page and launch live mock listings.");
            return;
        }
        window.location.href = 'mock-agoda.html';
    });
}

// Run initial load on page start
document.addEventListener('DOMContentLoaded', () => {
    loadSupabaseData();
});

// Auto-refresh when returning to this page from Mock Agoda or another tab
window.addEventListener('focus', () => {
    loadSupabaseData();
});