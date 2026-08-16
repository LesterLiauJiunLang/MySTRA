// ==========================================
// 🗂️ TAB ACTION INTERFACING VIEW CONTROLLER
// ==========================================
const tabs = {
    'tab-dashboard': document.getElementById('view-dashboard'),
    'tab-listings': document.getElementById('view-listings'),
    'tab-logs': document.getElementById('view-logs')
};

const tabButtons = document.querySelectorAll('.tab-btn');

tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        // Drop highlighting accents from all elements
        tabButtons.forEach(btn => btn.classList.remove('active'));
        Object.values(tabs).forEach(panel => panel.classList.add('hidden'));

        // Inject active rules onto clicked parameters
        button.classList.add('active');
        tabs[button.id].classList.remove('hidden');
    });
});

// ==========================================
// 🔑 SIMULATED JUST-IN-TIME TOKEN ENGINE
// ==========================================
const btnGenerate = document.getElementById('btn-generate-code');
const codeField = document.getElementById('generated-code-field');
const btnCopy = document.getElementById('btn-copy-code');

btnGenerate.addEventListener('click', () => {
    // Generate an unique identifier token string format
    const randomHex = Math.floor(Math.random() * 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    const newCode = `MYSTRA-KL-2026-${randomHex}`;
    
    codeField.value = newCode;
    console.log(`⚡ Engine updated. New active token slot initialized: ${newCode}`);
});

btnCopy.addEventListener('click', () => {
    if (codeField.value !== "CLICK GENERATE TO CREATE") {
        navigator.clipboard.writeText(codeField.value);
        alert(`📋 Copied: ${codeField.value}\nReady to paste into your Mock OTA (Agoda) Form Tab!`);
    }
});

// Mock link out hook for testing mock platform
document.getElementById('btn-test-code').addEventListener('click', () => {
    alert("🔗 Navigating towards Mock OTA Setup Sandbox Platform (Agoda Integration Test)...");
});