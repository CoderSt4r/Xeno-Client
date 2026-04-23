async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'xenoclient-salt-v1');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
function getAccounts() {
    return JSON.parse(localStorage.getItem('xc-accounts') || '{}');
}
function saveAccounts(accounts) {
    localStorage.setItem('xc-accounts', JSON.stringify(accounts));
}
function showError(msg) {
    const el = document.getElementById('auth-error');
    document.getElementById('auth-error-msg').textContent = msg;
    el.classList.remove('hidden');
}
function clearError() {
    document.getElementById('auth-error').classList.add('hidden');
}
const savedSession = localStorage.getItem('xc-session');
if (savedSession) {
    window.electronAPI.openMain(savedSession);
}
document.getElementById('min-btn').onclick = () => window.electronAPI.windowMinimize();
document.getElementById('close-btn').onclick = () => window.electronAPI.windowClose();
const tabLogin = document.getElementById('tab-login');
const tabReg = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formReg = document.getElementById('form-register');
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active'); tabReg.classList.remove('active');
    formLogin.classList.add('active'); formReg.classList.remove('active');
    clearError();
});
tabReg.addEventListener('click', () => {
    tabReg.classList.add('active'); tabLogin.classList.remove('active');
    formReg.classList.add('active'); formLogin.classList.remove('active');
    clearError();
});
function setupToggle(btnId, inputId) {
    document.getElementById(btnId).addEventListener('click', () => {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId).querySelector('i');
        if (input.type === 'password') {
            input.type = 'text';
            btn.className = 'ph ph-eye-slash';
        } else {
            input.type = 'password';
            btn.className = 'ph ph-eye';
        }
    });
}
setupToggle('toggle-login-pw', 'login-password');
setupToggle('toggle-reg-pw', 'reg-password');
document.getElementById('reg-password').addEventListener('input', (e) => {
    const pw = e.target.value;
    const strengthEl = document.getElementById('pw-strength');
    const fill = document.getElementById('strength-fill');
    const label = document.getElementById('strength-label');
    if (!pw) { strengthEl.classList.add('hidden'); return; }
    strengthEl.classList.remove('hidden');
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    const levels = [
        { pct: '20%', color: '#ef4444', text: 'Weak' },
        { pct: '40%', color: '#f97316', text: 'Fair' },
        { pct: '60%', color: '#eab308', text: 'Good' },
        { pct: '80%', color: '#84cc16', text: 'Strong' },
        { pct: '100%', color: '#10b981', text: 'Excellent' },
    ];
    const lvl = levels[Math.min(score, 4)];
    fill.style.width = lvl.pct;
    fill.style.background = lvl.color;
    label.textContent = lvl.text;
    label.style.color = lvl.color;
});
formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('login-remember').checked;
    if (!username || !password) { showError('Please fill in all fields.'); return; }
    const btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Signing in...';
    const accounts = getAccounts();
    const account = accounts[username.toLowerCase()];
    if (!account) { showError('No account found with that username.'); btn.disabled = false; btn.querySelector('span').textContent = 'Sign In'; return; }
    const hash = await hashPassword(password);
    if (hash !== account.passwordHash) { showError('Incorrect password.'); btn.disabled = false; btn.querySelector('span').textContent = 'Sign In'; return; }
    const session = { username: account.username, email: account.email, loginTime: Date.now() };
    if (remember) localStorage.setItem('xc-session', JSON.stringify(session));
    window.electronAPI.openMain(JSON.stringify(session));
});
formReg.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const username = document.getElementById('reg-username').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!username || !email || !password || !confirm) { showError('Please fill in all fields.'); return; }
    if (username.length < 3) { showError('Username must be at least 3 characters.'); return; }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { showError('Please enter a valid email.'); return; }
    if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { showError('Passwords do not match.'); return; }
    const accounts = getAccounts();
    if (accounts[username.toLowerCase()]) { showError('That username is already taken.'); return; }
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Creating account...';
    const hash = await hashPassword(password);
    accounts[username.toLowerCase()] = { username, email, passwordHash: hash, createdAt: Date.now() };
    saveAccounts(accounts);
    const session = { username, email, loginTime: Date.now() };
    localStorage.setItem('xc-session', JSON.stringify(session));
    window.electronAPI.openMain(JSON.stringify(session));
});