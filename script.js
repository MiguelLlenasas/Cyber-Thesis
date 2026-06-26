/**
 * SCRIPT.JS - The Connector
 * For Password Strategy Vulnerability Analysis System
 */

// 1. REAL-TIME UI FEEDBACK 
function checkPassword() {
    const password = document.getElementById('passwordInput').value;
    const strengthBar = document.getElementById('strengthResult');

    if (!password) {
        if (strengthBar) strengthBar.style.width = '0%';
        return;
    }

    // Simple visual scoring 
    let score = 0;
    if (password.length >= 8) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/\d/.test(password)) score += 25;
    if (/[^A-Za-z0-9]/.test(password)) score += 25;
}

// 2. MAIN ACTION: 
async function goToResults() {
    const passwordInput = document.getElementById('passwordInput');
    const password = passwordInput.value;

    if (!password.trim()) {
        alert('Please enter a password to analyze.');
        return;
    }

    const enterBtn = document.getElementById('enterBtn');
    const originalText = enterBtn.innerText;
    enterBtn.innerText = "Analyzing...";
    enterBtn.disabled = true;

    try {
        // TATAWAG NA SA BACKEND (SERVER.JS)
        const response = await fetch('http://localhost:3000/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });

        if (!response.ok) {
            throw new Error('Backend is not responding properly.');
        }

        const data = await response.json();

        sessionStorage.setItem('lastAnalysis', JSON.stringify(data));

        window.location.href = `results.html?password=${encodeURIComponent(password)}`;

    } catch (error) {
        console.error("Connection Error:", error);
        alert("CRITICAL ERROR: Cannot connect to the ML Backend.\n\nSiguraduhin na:\n1. Naka-on ang 'node server.js'\n2. Walang error sa terminal ng backend.");
    } finally {
        enterBtn.innerText = originalText;
        enterBtn.disabled = false;
    }
}

// 3. UI HELPERS (Show/Hide Password)
function togglePassword() {

            const passwordInput = document.getElementById("passwordInput");
            const toggleBtn = document.getElementById("toggleBtn");

            if (passwordInput.type === "password") {
                passwordInput.type = "text";
                toggleBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
            } else {
                passwordInput.type = "password";
                toggleBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
            }
        }

// Suporta para sa pag-pindot ng "Enter" key sa keyboard
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const activeId = document.activeElement.id;
        if (activeId === 'passwordInput') {
            goToResults();
        }
    }
});