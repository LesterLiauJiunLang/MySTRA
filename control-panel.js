// ==========================================
// 🧭 SIDEBAR AND MAIN WORKSPACE PANEL SWITCHER
// ==========================================
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

// Master reset function to turn everything off before activating active element
function resetAllViews() {
    // Hide all main panel views
    Object.values(sidebarItems).forEach(item => item.panel.classList.add('hidden'));
    // Hide manager explicit sub-tabs
    Object.values(managerSubTabs).forEach(panel => panel.classList.add('hidden'));
    // Remove active styles from sidebar items
    sidebarButtons.forEach(btn => btn.classList.remove('active-nav'));
}

// Sidebar Buttons Click Handler
sidebarButtons.forEach(button => {
    button.addEventListener('click', () => {
        resetAllViews();
        button.classList.add('active-nav');
        
        const selection = sidebarItems[button.id];
        mainPageTitle.textContent = selection.title;

        // Special UI rule: Only show code inner sub-tabs if we are inside Code Manager View
        if (button.id === 'nav-manager') {
            managerTabsContainer.style.display = 'flex';
            // Default to showing sub-tab dashboard element
            document.getElementById('tab-dashboard').classList.add('active');
            document.getElementById('tab-listings').classList.remove('active');
            document.getElementById('tab-logs').classList.remove('active');
            selection.panel.classList.remove('hidden'); 
        } else {
            managerTabsContainer.style.display = 'none';
            selection.panel.classList.remove('hidden');
        }
    });
});

// Inner Manager Sub-Tabs Click Handler
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        Object.values(managerSubTabs).forEach(panel => panel.classList.add('hidden'));

        button.classList.add('active');
        managerSubTabs[button.id].classList.remove('hidden');
    });
});


// ==========================================
// 🔑 SIMULATED JUST-IN-TIME TOKEN ENGINE
// ==========================================
const btnGenerate = document.getElementById('btn-generate-code');
const codeField = document.getElementById('generated-code-field');
const btnCopy = document.getElementById('btn-copy-code');

btnGenerate.addEventListener('click', () => {
    const randomHex = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    const newCode = `MYSTRA-KL-2026-${randomHex}`;
    codeField.value = newCode;
    console.log(`⚡ Engine updated. New active token slot initialized: ${newCode}`);
});

btnCopy.addEventListener('click', () => {
    if (codeField.value !== "CLICK GENERATE TO CREATE") {
        navigator.clipboard.writeText(codeField.value);
        alert(`📋 Copied: ${codeField.value}\nReady to paste into your Mock OTA Form Tab!`);
    }
});

// Link out hook to take user from control panel over to Agoda layout
document.getElementById('btn-test-code').addEventListener('click', () => {
    window.location.href = 'mock-agoda.html';
});