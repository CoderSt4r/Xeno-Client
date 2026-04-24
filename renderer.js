let profiles = JSON.parse(localStorage.getItem('xc-profiles') || '[]');
let activeProfileId = localStorage.getItem('xc-active-profile') || null;
let settings = JSON.parse(localStorage.getItem('xc-settings') || '{}');
let currentModPage = 0;
let currentModQuery = '';
let selectedModData = null;
let editingProfileId = null;
let selectedColor = '#6366f1';
let mcVersions = [];
let xcSession = JSON.parse(localStorage.getItem('xc-session') || 'null'); 
if (profiles.length === 0) {
    profiles = [{ id: 'default', name: 'Vanilla 1.20.1', version: '1.20.1', loader: 'vanilla', color: '#6366f1', mods: [] }];
    activeProfileId = 'default';
    saveProfiles();
}
if (!activeProfileId) { activeProfileId = profiles[0]?.id; localStorage.setItem('xc-active-profile', activeProfileId); }
function saveProfiles() {
    localStorage.setItem('xc-profiles', JSON.stringify(profiles));
    localStorage.setItem('xc-active-profile', activeProfileId);
}
function getActiveProfile() { return profiles.find(p => p.id === activeProfileId) || profiles[0]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmtNum(n) { if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(0)+'K'; return n; }
function fmtDate(s) { return new Date(s).toLocaleDateString(); }
document.getElementById('minimize-btn').onclick = () => window.electronAPI.windowMinimize();
document.getElementById('maximize-btn').onclick = () => window.electronAPI.windowMaximize();
document.getElementById('close-btn').onclick = () => window.electronAPI.windowClose();
document.querySelectorAll('.nav-icon[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-icon').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('page-' + btn.dataset.page).classList.add('active');
        if (btn.dataset.page === 'home') renderHome();
        if (btn.dataset.page === 'profiles') renderProfilesPage();
        if (btn.dataset.page === 'mods') { renderModPage(); fetchMods(); }
        if (btn.dataset.page === 'library') renderLibrary();
        if (btn.dataset.page === 'skins') renderSkinsPage();
        if (btn.dataset.page === 'social') renderSocialPage();
        if (btn.dataset.page === 'settings') loadSettingsUI();
    });
});
function navTo(page) {
    document.querySelector(`.nav-icon[data-page="${page}"]`)?.click();
}
function renderHome() {
    const p = getActiveProfile();
    if (!p) return;
    document.getElementById('home-username').textContent = getDisplayName();
    document.getElementById('active-profile-name').textContent = p.name;
    document.getElementById('active-profile-version').innerHTML = `<i class="ph ph-tag"></i> ${p.version}`;
    document.getElementById('active-profile-type').innerHTML = `<i class="ph ph-cube"></i> ${p.loader}`;
    document.getElementById('active-profile-mods').innerHTML = `<i class="ph ph-puzzle-piece"></i> ${(p.mods||[]).length} mods`;
    document.getElementById('active-profile-card').querySelector('.profile-card-icon').style.background = p.color || '#6366f1';
    document.getElementById('home-account-name').textContent = getDisplayName();
    document.getElementById('home-account-type').textContent = (settings.accountType === 'microsoft' && settings.msUsername) ? 'Microsoft (Premium)' : 'Offline';
    const list = document.getElementById('home-profiles-list');
    list.innerHTML = '';
    profiles.forEach(pr => {
        const row = document.createElement('div');
        row.className = 'profile-row' + (pr.id === activeProfileId ? ' active-row' : '');
        row.innerHTML = `
            <div class="profile-row-icon" style="background:${pr.color||'#6366f1'}"><i class="ph-fill ph-cube"></i></div>
            <div class="profile-row-info">
                <div class="profile-row-name">${pr.name}</div>
                <div class="profile-row-meta">${pr.version} • ${pr.loader} • ${(pr.mods||[]).length} mods</div>
            </div>
            <div class="profile-row-actions">
                <button class="btn-secondary btn-sm set-active-btn" data-id="${pr.id}">Select</button>
            </div>`;
        list.appendChild(row);
    });
    list.querySelectorAll('.set-active-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            activeProfileId = btn.dataset.id;
            saveProfiles();
            renderHome();
        });
    });
}
document.getElementById('change-profile-btn').onclick = () => navTo('profiles');
document.getElementById('new-profile-shortcut-btn').onclick = () => openProfileModal();
document.getElementById('link-modrinth').onclick = (e) => { e.preventDefault(); navTo('mods'); };
document.getElementById('link-settings').onclick = (e) => { e.preventDefault(); navTo('settings'); };
document.getElementById('link-new-profile').onclick = (e) => { e.preventDefault(); openProfileModal(); };
const launchBtn = document.getElementById('launch-btn');
const launchStatusText = document.getElementById('launch-status-text');
const launchProgressTrack = document.getElementById('launch-progress-track');
const launchProgressFill = document.getElementById('launch-progress-fill');
launchBtn.addEventListener('click', () => {
    if (launchBtn.disabled) return;
    const p = getActiveProfile();
    const s = settings;
    const launchSettings = {
        accountType: s.accountType || 'offline',
        username: s.username || 'Player',
        profileName: p.name,
        version: p.version || '1.20.1',
        ramMax: Math.round((s.ramMax || 4096) / 1024),
        ramMin: Math.round((s.ramMin || 2048) / 1024),
        javaPath: s.javaPath || '',
        jvmArgs: s.jvmArgs || '',
        width: s.resWidth || 1280,
        height: s.resHeight || 720
    };
    window.electronAPI.launchGame(launchSettings);
    launchBtn.disabled = true;
    launchBtn.innerHTML = '<i class="ph ph-spinner"></i> Launching...';
    launchProgressTrack.classList.remove('hidden');
    launchProgressFill.style.width = '5%';
});
window.electronAPI.onLauncherStatus((data) => {
    launchStatusText.textContent = data.message;
    if (data.type === 'progress') {
        const cur = parseFloat(launchProgressFill.style.width) || 5;
        if (cur < 90) launchProgressFill.style.width = (cur + 1.5) + '%';
    } else if (data.type === 'launching') {
        launchProgressFill.style.width = '100%';
        setTimeout(() => { launchProgressTrack.classList.add('hidden'); launchStatusText.textContent = 'Game is running'; }, 1200);
    } else if (data.type === 'close') {
        resetLaunch(); launchStatusText.textContent = 'Ready to play';
    } else if (data.type === 'error') {
        resetLaunch(); launchStatusText.textContent = 'Error: ' + data.message;
    }
});
function resetLaunch() {
    launchBtn.disabled = false;
    launchBtn.innerHTML = '<i class="ph-fill ph-play"></i> Play';
    launchProgressFill.style.width = '0%';
    setTimeout(() => launchProgressTrack.classList.add('hidden'), 500);
}
function renderProfilesPage() {
    const grid = document.getElementById('profiles-grid');
    grid.innerHTML = '';
    profiles.forEach(p => {
        const card = document.createElement('div');
        card.className = 'profile-card' + (p.id === activeProfileId ? ' active-profile' : '');
        card.innerHTML = `
            ${p.id === activeProfileId ? '<div class="profile-card-badge">Active</div>' : ''}
            <div class="pc-icon" style="background:${p.color||'#6366f1'}"><i class="ph-fill ph-cube"></i></div>
            <div class="pc-name">${p.name}</div>
            <div class="pc-meta">${p.version} • ${p.loader} • ${(p.mods||[]).length} mods</div>
            <div class="pc-actions">
                <button class="btn-secondary btn-sm play-profile-btn" data-id="${p.id}"><i class="ph-fill ph-play"></i> Play</button>
                <button class="btn-secondary btn-sm edit-profile-btn" data-id="${p.id}"><i class="ph ph-pencil"></i></button>
                <button class="btn-secondary btn-sm delete-profile-btn" data-id="${p.id}"><i class="ph ph-trash"></i></button>
            </div>`;
        grid.appendChild(card);
    });
    const addCard = document.createElement('div');
    addCard.className = 'profile-card add-profile-card';
    addCard.innerHTML = '<i class="ph ph-plus-circle"></i><span>New Profile</span>';
    addCard.onclick = () => openProfileModal();
    grid.appendChild(addCard);
    grid.querySelectorAll('.play-profile-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation(); activeProfileId = btn.dataset.id; saveProfiles(); renderHome(); navTo('home');
    }));
    grid.querySelectorAll('.edit-profile-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation(); openProfileModal(btn.dataset.id);
    }));
    grid.querySelectorAll('.delete-profile-btn').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (profiles.length === 1) return alert("Can't delete the last profile.");
        profiles = profiles.filter(p => p.id !== btn.dataset.id);
        if (activeProfileId === btn.dataset.id) activeProfileId = profiles[0].id;
        saveProfiles(); renderProfilesPage();
    }));
}
function openProfileModal(id = null) {
    editingProfileId = id;
    selectedColor = '#6366f1';
    const modal = document.getElementById('profile-modal-backdrop');
    modal.classList.remove('hidden');
    const verSel = document.getElementById('profile-version-input');
    verSel.innerHTML = '';
    if (mcVersions.length) {
        let lastType = '';
        mcVersions.forEach(v => {
            if (v.type !== lastType) {
                const og = document.createElement('optgroup');
                og.label = v.type === 'release' ? '✦ Releases' : '⚡ Snapshots';
                verSel.appendChild(og);
                lastType = v.type;
            }
            const opt = document.createElement('option');
            opt.value = v.id; opt.textContent = v.id;
            verSel.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.textContent = 'Loading versions...';
        verSel.appendChild(opt);
    }
    if (id) {
        const p = profiles.find(pr => pr.id === id);
        document.getElementById('profile-modal-title').textContent = 'Edit Profile';
        document.getElementById('profile-name-input').value = p.name;
        verSel.value = p.version;
        document.getElementById('profile-loader-input').value = p.loader;
        document.getElementById('save-profile-btn').textContent = 'Save Changes';
        selectedColor = p.color || '#6366f1';
    } else {
        document.getElementById('profile-modal-title').textContent = 'Create Profile';
        document.getElementById('profile-name-input').value = '';
        document.getElementById('profile-loader-input').value = 'vanilla';
        document.getElementById('save-profile-btn').textContent = 'Create Profile';
    }
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === selectedColor);
    });
}
document.querySelectorAll('.color-swatch').forEach(s => s.addEventListener('click', () => {
    selectedColor = s.dataset.color;
    document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('active'));
    s.classList.add('active');
}));
function closeProfileModal() { document.getElementById('profile-modal-backdrop').classList.add('hidden'); }
document.getElementById('close-profile-modal').onclick = closeProfileModal;
document.getElementById('cancel-profile-modal').onclick = closeProfileModal;
document.getElementById('save-profile-btn').addEventListener('click', () => {
    const name = document.getElementById('profile-name-input').value.trim();
    const verSel = document.getElementById('profile-version-input');
    const version = verSel.value || verSel.options[verSel.selectedIndex]?.value || '';
    const loader = document.getElementById('profile-loader-input').value;
    if (!name || !version) { alert('Please fill in a name and select a version.'); return; }
    if (editingProfileId) {
        const p = profiles.find(pr => pr.id === editingProfileId);
        if (p) { p.name = name; p.version = version; p.loader = loader; p.color = selectedColor; }
    } else {
        const newP = { id: uid(), name, version, loader, color: selectedColor, mods: [] };
        profiles.push(newP);
        activeProfileId = newP.id;
    }
    saveProfiles(); closeProfileModal(); renderProfilesPage(); renderHome();
});
function renderModPage() {
    updateModInstallProfileSelect();
    populateLibrarySelect();
}
async function fetchMods() {
    const grid = document.getElementById('mods-grid');
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Fetching mods...</p></div>';
    const q = currentModQuery;
    const cat = document.getElementById('mod-category-filter').value;
    const loader = document.getElementById('mod-loader-filter').value;
    const ver = document.getElementById('mod-version-filter').value;
    const sort = document.getElementById('mod-sort-filter').value;
    const offset = currentModPage * 20;
    
    let facetList = [["project_type:mod"]];
    if (cat) facetList.push([`categories:${cat}`]);
    if (loader) facetList.push([`categories:${loader}`]);
    if (ver) facetList.push([`versions:${ver}`]);
    
    try {
        const data = await window.electronAPI.searchMods({
            query: q,
            facets: facetList,
            limit: 20,
            offset: offset,
            index: sort
        });
        renderMods(data.hits || []);
        document.getElementById('page-indicator').textContent = `Page ${currentModPage + 1}`;
        document.getElementById('mods-prev-btn').disabled = currentModPage === 0;
        document.getElementById('mods-next-btn').disabled = (data.hits||[]).length < 20;
    } catch(e) {
        console.error('Modrinth fetch error:', e);
        grid.innerHTML = '<div class="loading-state"><i class="ph ph-wifi-slash"></i><p>Connection error.</p></div>';
    }
}
function renderMods(hits) {
    const grid = document.getElementById('mods-grid');
    grid.innerHTML = '';
    if (!hits.length) { grid.innerHTML = '<div class="loading-state"><i class="ph ph-magnifying-glass"></i><p>No results.</p></div>'; return; }
    hits.forEach(mod => {
        const card = document.createElement('div');
        card.className = 'mod-card';
        const loaders = (mod.categories||[]).filter(c => ['fabric','forge','quilt','neoforge'].includes(c));
        card.innerHTML = `
            <div class="mod-card-header">
                <div class="mod-card-icon">${mod.icon_url ? `<img src="${mod.icon_url}" alt="">` : '<i class="ph ph-puzzle-piece"></i>'}</div>
                <div>
                    <div class="mod-card-title">${mod.title}</div>
                    <div class="mod-card-author">by ${mod.author}</div>
                </div>
            </div>
            <div class="mod-card-desc">${mod.description}</div>
            <div class="mod-card-footer">
                <div class="mod-stats">
                    <div class="mod-stat"><i class="ph ph-download-simple"></i> ${fmtNum(mod.downloads)}</div>
                    <div class="mod-stat"><i class="ph ph-heart"></i> ${fmtNum(mod.follows)}</div>
                </div>
                <div class="mod-loaders">${loaders.map(l => `<span class="loader-chip ${l}">${l}</span>`).join('')}</div>
            </div>`;
        card.addEventListener('click', () => openModModal(mod));
        grid.appendChild(card);
    });
}
let debounceTimer;
document.getElementById('mod-search-input').addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { currentModQuery = e.target.value; currentModPage = 0; fetchMods(); }, 400);
});
['mod-category-filter','mod-loader-filter','mod-version-filter','mod-sort-filter'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => { currentModPage = 0; fetchMods(); });
});
document.getElementById('mods-prev-btn').onclick = () => { if(currentModPage > 0) { currentModPage--; fetchMods(); } };
document.getElementById('mods-next-btn').onclick = () => { currentModPage++; fetchMods(); };
function openModModal(mod) {
    selectedModData = mod;
    document.getElementById('mod-modal-name').textContent = mod.title;
    document.getElementById('mod-modal-author').textContent = 'by ' + mod.author;
    document.getElementById('mod-modal-downloads').textContent = fmtNum(mod.downloads) + ' downloads';
    document.getElementById('mod-modal-followers').textContent = fmtNum(mod.follows) + ' followers';
    document.getElementById('mod-modal-updated').textContent = 'Updated ' + fmtDate(mod.date_modified||mod.date_created);
    document.getElementById('mod-modal-desc').textContent = mod.description;
    const iconEl = document.getElementById('mod-modal-icon');
    iconEl.innerHTML = mod.icon_url ? `<img src="${mod.icon_url}" alt="">` : '<i class="ph ph-puzzle-piece"></i>';
    const loaders = (mod.categories||[]).filter(c => ['fabric','forge','quilt','neoforge'].includes(c));
    document.getElementById('mod-modal-loaders').innerHTML = loaders.map(l => `<span class="chip chip-loader">${l}</span>`).join('');
    document.getElementById('mod-modal-versions').innerHTML = (mod.versions||[]).slice(0,8).map(v=>`<span class="chip chip-version">${v}</span>`).join('');
    updateModInstallProfileSelect();
    document.getElementById('mod-modal-backdrop').classList.remove('hidden');
}
function closeModModal() { document.getElementById('mod-modal-backdrop').classList.add('hidden'); }
document.getElementById('close-mod-modal').onclick = closeModModal;
document.getElementById('close-mod-modal-btn').onclick = closeModModal;
document.getElementById('install-mod-btn').addEventListener('click', async () => {
    if (!selectedModData) return;
    const profileId = document.getElementById('mod-install-profile').value;
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;
    if (!profile.mods) profile.mods = [];
    if (profile.mods.find(m => m.id === selectedModData.project_id)) return alert('Mod already added!');
    const installBtn = document.getElementById('install-mod-btn');
    installBtn.disabled = true;
    installBtn.innerHTML = '<i class="ph ph-spinner"></i> Downloading...';
    const result = await window.electronAPI.downloadMod({
        modId: selectedModData.project_id,
        profileName: profile.name,
        profileVersion: profile.version,
        profileLoader: profile.loader
    });
    installBtn.disabled = false;
    installBtn.innerHTML = '<i class="ph ph-download-simple"></i> Add to Profile';
    if (!result.success) return alert('Download failed: ' + result.error);
    profile.mods.push({
        id: selectedModData.project_id,
        name: selectedModData.title,
        author: selectedModData.author,
        icon: selectedModData.icon_url || '',
        filename: result.filename || 'unknown.jar',
        version: profile.version
    });
    saveProfiles();
    closeModModal();
    renderHome();
});
function updateModInstallProfileSelect() {
    const sel = document.getElementById('mod-install-profile');
    sel.innerHTML = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.value = activeProfileId;
}
function populateLibrarySelect() {
    const sel = document.getElementById('library-profile-select');
    sel.innerHTML = profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.value = activeProfileId;
    renderLibrary();
}
function renderLibrary() {
    const profileId = document.getElementById('library-profile-select').value || activeProfileId;
    const profile = profiles.find(p => p.id === profileId);
    const list = document.getElementById('installed-mods-list');
    const mods = profile?.mods || [];
    if (!mods.length) {
        list.innerHTML = '<div class="empty-state"><i class="ph ph-puzzle-piece"></i><p>No mods installed.</p></div>';
        return;
    }
    list.innerHTML = '';
    mods.forEach((mod, idx) => {
        const row = document.createElement('div');
        row.className = 'installed-mod-row';
        row.innerHTML = `
            <div class="installed-mod-icon">${mod.icon ? `<img src="${mod.icon}" alt="">` : '<i class="ph ph-puzzle-piece"></i>'}</div>
            <div class="installed-mod-info">
                <div class="installed-mod-name">${mod.name}</div>
                <div class="installed-mod-meta">by ${mod.author} • ${mod.version}</div>
            </div>
            <button class="btn-icon-danger remove-mod-btn" data-idx="${idx}"><i class="ph ph-trash"></i></button>`;
        list.appendChild(row);
    });
    list.querySelectorAll('.remove-mod-btn').forEach(btn => btn.addEventListener('click', () => {
        profile.mods.splice(parseInt(btn.dataset.idx), 1);
        saveProfiles(); renderLibrary(); renderHome();
    }));
}
document.getElementById('library-profile-select').addEventListener('change', renderLibrary);
document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});
function loadSettingsUI() {
    const s = settings;
    document.getElementById('username-input').value = s.username || 'Player';
    document.getElementById('java-path-input').value = s.javaPath || '';
    document.getElementById('jvm-args-input').value = s.jvmArgs || '';
    document.getElementById('ram-min-input').value = s.ramMin || 2048;
    document.getElementById('ram-max-input').value = s.ramMax || 4096;
    document.getElementById('res-width-input').value = s.resWidth || 1280;
    document.getElementById('res-height-input').value = s.resHeight || 720;
    document.getElementById('toggle-hide-launcher').checked = s.hideLauncher !== false;
    document.getElementById('toggle-close-launcher').checked = !!s.closeLauncher;
    document.getElementById('toggle-restore-launcher').checked = s.restoreLauncher !== false;
    updateSliderLabels();
    const accountType = s.accountType || 'offline';
    document.getElementById(accountType === 'microsoft' ? 'type-microsoft' : 'type-offline').checked = true;
    toggleAccountSections(accountType);
    if (accountType === 'microsoft' && s.msUsername) {
        document.getElementById('ms-status-name').textContent = s.msUsername;
        document.getElementById('ms-status-sub').textContent = 'Linked Account';
        document.getElementById('ms-login-btn').textContent = 'Sign Out';
    }
}
function updateSliderLabels() {
    const minV = parseInt(document.getElementById('ram-min-input').value);
    const maxV = parseInt(document.getElementById('ram-max-input').value);
    document.getElementById('ram-min-val').textContent = minV >= 1024 ? (minV/1024).toFixed(1)+' GB' : minV+' MB';
    document.getElementById('ram-max-val').textContent = maxV >= 1024 ? (maxV/1024).toFixed(1)+' GB' : maxV+' MB';
}
document.getElementById('ram-min-input').addEventListener('input', updateSliderLabels);
document.getElementById('ram-max-input').addEventListener('input', updateSliderLabels);
function toggleAccountSections(type) {
    document.getElementById('offline-section').classList.toggle('hidden', type !== 'offline');
    document.getElementById('microsoft-section').classList.toggle('hidden', type !== 'microsoft');
}
document.querySelectorAll('input[name="account-type"]').forEach(r => {
    r.addEventListener('change', () => toggleAccountSections(r.value));
});
document.getElementById('save-settings-btn').addEventListener('click', () => {
    settings.accountType = document.querySelector('input[name="account-type"]:checked').value;
    settings.username = document.getElementById('username-input').value || 'Player';
    settings.javaPath = document.getElementById('java-path-input').value;
    settings.jvmArgs = document.getElementById('jvm-args-input').value;
    settings.ramMin = parseInt(document.getElementById('ram-min-input').value);
    settings.ramMax = parseInt(document.getElementById('ram-max-input').value);
    settings.resWidth = parseInt(document.getElementById('res-width-input').value);
    settings.resHeight = parseInt(document.getElementById('res-height-input').value);
    settings.hideLauncher = document.getElementById('toggle-hide-launcher').checked;
    settings.closeLauncher = document.getElementById('toggle-close-launcher').checked;
    settings.restoreLauncher = document.getElementById('toggle-restore-launcher').checked;
    localStorage.setItem('xc-settings', JSON.stringify(settings));
    const msg = document.getElementById('settings-saved-msg');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 2500);
    renderHome();
});
const MOJANG_API = 'https://api.mojang.com/users/profiles/minecraft/';
const CRAFATAR = 'https://crafatar.com';
async function fetchMojang(username) {
    const res = await fetch(MOJANG_API + encodeURIComponent(username));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('API error');
    return res.json();
}
function skinUrl(uuid, type = 'avatars', size = 80) {
    const param = type.includes('render') ? 'scale' : 'size';
    const val = param === 'scale' ? Math.max(1, Math.min(10, Math.round(size / 40))) : size;
    return `${CRAFATAR}/${type}/${uuid}?${param}=${val}&overlay=true&default=MHF_Steve`;
}
function renderSocialPage() {
    const session = xcSession;
    const nameEl = document.getElementById('my-profile-username');
    if (session) nameEl.textContent = session.username || 'User';
    document.getElementById('stat-profiles').textContent = profiles.length;
    const totalMods = profiles.reduce((s, p) => s + (p.mods || []).length, 0);
    document.getElementById('stat-mods').textContent = totalMods;
    const accounts = JSON.parse(localStorage.getItem('xc-accounts') || '{}');
    const acct = session ? accounts[session.username?.toLowerCase()] : null;
    if (acct?.createdAt) {
        document.getElementById('stat-member-since').textContent = new Date(acct.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    const linked = JSON.parse(localStorage.getItem('xc-mc-link') || 'null');
    const linkInfo = document.getElementById('mc-link-info');
    if (linked) {
        linkInfo.innerHTML = `<img src="${skinUrl(linked.id, 'avatars', 28)}" alt=""> ${linked.name}`;
        linkInfo.classList.add('linked');
        document.getElementById('my-skin-render').innerHTML = `<img src="${skinUrl(linked.id, 'renders/body', 90)}" alt="skin">`;
    } else {
        linkInfo.innerHTML = '<i class="ph ph-link-break"></i> Not linked';
        linkInfo.classList.remove('linked');
    }
    document.getElementById('link-mc-btn').onclick = () => {
        document.getElementById('mc-link-overlay').classList.remove('hidden');
        document.getElementById('mc-link-input').value = '';
        document.getElementById('mc-link-preview').classList.add('hidden');
        document.getElementById('mc-link-err').classList.add('hidden');
        document.getElementById('mc-confirm-btn').classList.add('hidden');
    };
    document.getElementById('close-mc-link').onclick = () => {
        document.getElementById('mc-link-overlay').classList.add('hidden');
    };
    document.getElementById('mc-lookup-btn').onclick = async () => {
        const username = document.getElementById('mc-link-input').value.trim();
        const errEl = document.getElementById('mc-link-err');
        const previewEl = document.getElementById('mc-link-preview');
        const confirmBtn = document.getElementById('mc-confirm-btn');
        errEl.classList.add('hidden'); previewEl.classList.add('hidden'); confirmBtn.classList.add('hidden');
        if (!username) return;
        try {
            const data = await fetchMojang(username);
            if (!data) { errEl.textContent = 'Not found.'; errEl.classList.remove('hidden'); return; }
            document.getElementById('mc-link-avatar').src = skinUrl(data.id, 'avatars', 48);
            document.getElementById('mc-link-found-name').textContent = data.name;
            document.getElementById('mc-link-found-uuid').textContent = data.id;
            previewEl.classList.remove('hidden'); confirmBtn.classList.remove('hidden');
            confirmBtn.onclick = () => {
                localStorage.setItem('xc-mc-link', JSON.stringify(data));
                document.getElementById('mc-link-overlay').classList.add('hidden');
                renderSocialPage();
            };
        } catch(e) {
            errEl.textContent = 'Error.'; errEl.classList.remove('hidden');
        }
    };
}
function renderSkinsPage() {
    const linked = JSON.parse(localStorage.getItem('xc-mc-link') || 'null');
    const previewEl = document.getElementById('current-skin-render');
    if (linked) {
        previewEl.innerHTML = `<img src="${skinUrl(linked.id, 'renders/body', 300)}" alt="skin">`;
    } else {
        previewEl.innerHTML = '<i class="ph ph-user" style="font-size:64px;color:var(--text3)"></i>';
    }
    loadSkinGallery();
}
const FEATURED_SKINS = [
    { name: 'Dream', id: 'ec70bc6c-7473-4c50-bb02-e4421508d208' },
    { name: 'Technoblade', id: 'b0231908-16e6-42d8-9442-99933758a099' },
    { name: 'Mumbo Jumbo', id: 'c3562a01-447a-4293-8472-353272f7d391' },
    { name: 'Grian', id: '0d481f14-04f7-4180-87a7-5f725350325d' },
    { name: 'DanTDM', id: '71626002-c971-460d-8547-0e6d6232e0e0' },
    { name: 'CaptainSparklez', id: 'b757e841-f62f-4886-9041-f9c49ca52825' }
];
function loadSkinGallery() {
    const grid = document.getElementById('skin-gallery-grid');
    grid.innerHTML = '';
    FEATURED_SKINS.forEach(skin => {
        const card = document.createElement('div');
        card.className = 'skin-item-card';
        card.innerHTML = `
            <div class="skin-item-preview">
                <img src="${skinUrl(skin.id, 'renders/body', 150)}" alt="${skin.name}">
            </div>
            <div class="skin-item-name">${skin.name}</div>
        `;
        card.onclick = () => {
            document.getElementById('current-skin-render').innerHTML = `<img src="${skinUrl(skin.id, 'renders/body', 300)}" alt="skin">`;
        };
        grid.appendChild(card);
    });
}
document.getElementById('upload-skin-btn').onclick = () => document.getElementById('skin-file-input').click();
document.getElementById('skin-file-input').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('current-skin-render').innerHTML = `<img src="${event.target.result}" style="image-rendering:pixelated; object-fit:contain; width:80%; height:80%;" alt="skin">`;
        };
        reader.readAsDataURL(file);
    }
};
document.getElementById('player-search-btn').addEventListener('click', searchPlayers);
document.getElementById('player-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') searchPlayers(); });
async function searchPlayers() {
    const q = document.getElementById('player-search-input').value.trim();
    const resultsEl = document.getElementById('player-results');
    if (!q) return;
    resultsEl.innerHTML = '<div class="player-not-found"><div class="spinner"></div></div>';
    try {
        const data = await fetchMojang(q);
        if (!data) { resultsEl.innerHTML = '<div class="player-not-found"><p>No results.</p></div>'; return; }
        const accounts = JSON.parse(localStorage.getItem('xc-accounts') || '{}');
        const xcAcct = Object.values(accounts).find(a => a.username?.toLowerCase() === data.name.toLowerCase());
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="player-card-skin"><img src="${skinUrl(data.id, 'renders/body', 52)}" alt="skin"></div>
            <div class="player-card-info">
                <div class="player-card-name">${data.name}</div>
                <div class="player-card-uuid">${data.id}</div>
                <div class="player-card-badges">
                    <span class="player-badge badge-mc">Minecraft</span>
                    ${xcAcct ? '<span class="player-badge badge-xeno">XenoClient</span>' : ''}
                </div>
            </div>
            <a href="https://namemc.com/profile/${data.id}" target="_blank" class="btn-secondary btn-sm">NameMC</a>`;
        resultsEl.innerHTML = '';
        resultsEl.appendChild(card);
    } catch(e) {
        resultsEl.innerHTML = '<div class="player-not-found"><p>Search error.</p></div>';
    }
}
document.getElementById('sidebar-avatar').addEventListener('click', () => navTo('social'));
document.getElementById('ms-login-btn').addEventListener('click', () => {
    if (settings.msUsername) {
        delete settings.msUsername; settings.accountType = 'offline';
        document.getElementById('type-offline').checked = true;
        toggleAccountSections('offline');
        document.getElementById('ms-status-name').textContent = 'Not logged in';
        document.getElementById('ms-status-sub').textContent = 'Sign in with Microsoft';
        document.getElementById('ms-login-btn').textContent = 'Sign In';
    } else {
        document.getElementById('ms-status-sub').textContent = 'Opening login...';
        window.electronAPI.msLogin();
    }
});
window.electronAPI.onMsLogin((data) => {
    if (data.success) {
        settings.msUsername = data.username; settings.accountType = 'microsoft';
        localStorage.setItem('xc-settings', JSON.stringify(settings));
        document.getElementById('ms-status-name').textContent = data.username;
        document.getElementById('ms-status-sub').textContent = 'Linked Account';
        document.getElementById('ms-login-btn').textContent = 'Sign Out';
        renderHome();
    } else {
        document.getElementById('ms-status-sub').textContent = 'Error: ' + data.error;
    }
});
function getDisplayName() {
    if (settings.accountType === 'microsoft' && settings.msUsername) return settings.msUsername;
    return settings.username || 'Player';
}
renderHome();
loadSettingsUI();
window.electronAPI.onSession((session) => {
    xcSession = session;
    localStorage.setItem('xc-session', JSON.stringify(session));
    updateSessionUI();
});
function updateSessionUI() {
    if (!xcSession) return;
    const name = xcSession.username || 'User';
    const avatar = document.getElementById('sidebar-avatar');
    if (avatar) avatar.title = name;
}
updateSessionUI();
window.electronAPI.getVersions().then(versions => {
    mcVersions = versions || [];
    const vf = document.getElementById('mod-version-filter');
    if (vf && mcVersions.length) {
        vf.innerHTML = '<option value="">All Versions</option>';
        mcVersions.filter(v => v.type === 'release').forEach(v => {
            const o = document.createElement('option');
            o.value = v.id; o.textContent = v.id;
            vf.appendChild(o);
        });
    }
}).catch(console.error);
const updateNotif = document.getElementById('update-notification');
const updateSub = document.getElementById('update-sub');
const restartBtn = document.getElementById('restart-button');
window.electronAPI.onUpdateAvailable(() => {
    updateNotif.classList.remove('hidden');
    updateSub.textContent = 'Downloading update...';
});
window.electronAPI.onUpdateDownloaded(() => {
    updateSub.textContent = 'Update ready.';
    restartBtn.classList.remove('hidden');
});
restartBtn.addEventListener('click', () => {
    window.electronAPI.restartApp();
});
