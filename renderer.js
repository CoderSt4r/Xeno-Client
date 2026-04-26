window.onerror = function(m, u, l) { alert("ERR: " + m + " @ " + l); };
window.onunhandledrejection = function(e) { alert("ASYNC ERR: " + e.reason); };
let xcSession = JSON.parse(localStorage.getItem('xc-session') || 'null');
let profiles = JSON.parse(localStorage.getItem('xc-profiles') || '[]');
let activeProfileId = localStorage.getItem('xc-active-profile') || null;
let settings = JSON.parse(localStorage.getItem('xc-settings') || '{}');
let currentModPage = 0;
let currentModQuery = '';
let selectedModData = null;
let editingProfileId = null;
let selectedColor = '#6366f1';
let mcVersions = [];
let skinViewer = null;
let currentSkinDataUrl = null;
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
        const targetPage = document.getElementById("page-" + btn.dataset.page);
        if (targetPage) targetPage.classList.add("active");
        btn.classList.add('active');
        if (btn.dataset.page === "home") renderHome();
        if (btn.dataset.page === "profiles") renderProfilesPage();
        if (btn.dataset.page === "mods") { renderModPage(); fetchMods(); }
        if (btn.dataset.page === "library") renderLibrary();
        if (btn.dataset.page === "skins") renderSkinsPage();
        if (btn.dataset.page === "servers") { console.log("Calling renderServersPage..."); renderServersPage(); }
        if (btn.dataset.page === "social") renderSocialPage();
        if (btn.dataset.page === "settings") loadSettingsUI();
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
function renderProfileVersions() {
    const verSel = document.getElementById('profile-version-input');
    const showSnapshots = document.getElementById('show-snapshots-toggle').checked;
    const currentVal = verSel.value;
    verSel.innerHTML = '';
    
    if (mcVersions.length) {
        const releases = mcVersions.filter(v => v.type === 'release');
        const snapshots = mcVersions.filter(v => v.type !== 'release');
        
        if (releases.length > 0) {
            const relGroup = document.createElement('optgroup');
            relGroup.label = '✦ Releases';
            releases.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id; opt.textContent = v.id;
                relGroup.appendChild(opt);
            });
            verSel.appendChild(relGroup);
        }
        
        if (showSnapshots && snapshots.length > 0) {
            const snapGroup = document.createElement('optgroup');
            snapGroup.label = '⚡ Snapshots';
            snapshots.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id; opt.textContent = v.id;
                snapGroup.appendChild(opt);
            });
            verSel.appendChild(snapGroup);
        }
        
        if (Array.from(verSel.options).some(o => o.value === currentVal)) {
            verSel.value = currentVal;
        }
    } else {
        const opt = document.createElement('option');
        opt.textContent = 'No versions found. Try restarting.';
        verSel.appendChild(opt);
        if (!mcVersions.length) loadVersions();
    }
}
document.getElementById('show-snapshots-toggle').addEventListener('change', renderProfileVersions);

function openProfileModal(id = null) {
    editingProfileId = id;
    selectedColor = '#6366f1';
    const modal = document.getElementById('profile-modal-backdrop');
    modal.classList.remove('hidden');
    
    const p = id ? profiles.find(pr => pr.id === id) : null;
    const isSnapshot = p ? mcVersions.some(v => v.id === p.version && v.type !== 'release') : false;
    document.getElementById('show-snapshots-toggle').checked = isSnapshot;
    
    renderProfileVersions();

    const verSel = document.getElementById('profile-version-input');
    if (p) {
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
async function fetchMojang(username) {
    const res = await fetch(MOJANG_API + encodeURIComponent(username));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('API error');
    return res.json();
}
const MC_HEADS = 'https://mc-heads.net';
function skinUrl(uuid, type = 'body', size = 150, timestamp = null) {
    // type can be: avatar, body, head, skin
    if (type === 'renders/body') type = 'body'; // Fix for previous incorrect usage
    let url = `https://mc-heads.net/${type}/${uuid}/${size}`;
    if (type === 'skin') url = `https://mc-heads.net/skin/${uuid}`;
    if (timestamp) url += `?t=${timestamp}`;
    return url;
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
        const ts = Date.now();
        linkInfo.innerHTML = `<img src="${skinUrl(linked.id, 'avatar', 28, ts)}" alt=""> ${linked.name}`;
        linkInfo.classList.add('linked');
        document.getElementById('my-skin-render').innerHTML = `<img src="${skinUrl(linked.id, 'avatar', 90, ts)}" alt="skin">`;
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
            document.getElementById('mc-link-avatar').src = skinUrl(data.id, 'avatar', 48);
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
function initSkinViewer() {
    const container = document.getElementById('skin-viewer-3d');
    if (!container) return;
    if (skinViewer) return;
    
    container.innerHTML = '';
    skinViewer = new skinview3d.SkinViewer({
        canvas: document.createElement('canvas'),
        width: 300,
        height: 300,
        alpha: true,
        preserveDrawingBuffer: true
    });
    container.appendChild(skinViewer.canvas);
    skinViewer.autoRotate = false;
    skinViewer.autoRotateSpeed = 0.8;
    
    container.onmouseenter = () => { if (skinViewer) skinViewer.autoRotate = true; };
    container.onmouseleave = () => { if (skinViewer) skinViewer.autoRotate = false; };
}

function loadSkinToViewer(url, save = false) {
    if (!skinViewer) initSkinViewer();
    currentSkinDataUrl = url;
    skinViewer.loadSkin(url).then(() => {
        if (save) {
            setTimeout(() => {
                const thumbnail = skinViewer.canvas.toDataURL('image/png');
                let skins = JSON.parse(localStorage.getItem('xc-custom-skins') || '[]');
                if (!skins.find(s => s.id === url)) {
                    skins.unshift({ name: 'Saved', id: url, icon: thumbnail });
                    if (skins.length > 12) skins.pop();
                    localStorage.setItem('xc-custom-skins', JSON.stringify(skins));
                    loadSkinGallery();
                }
            }, 500);
        }
    }).catch(e => console.error('Failed to load skin:', e));
}

function renderSkinsPage() {
    const linked = JSON.parse(localStorage.getItem('xc-mc-link') || 'null');
    
    // Update login status display
    const statusEl = document.getElementById('skin-login-status');
    if (statusEl) {
        if (settings.accountType === 'microsoft') {
            statusEl.innerHTML = '<span style="color:#10b981"><i class="ph ph-check-circle"></i> Microsoft Linked</span>';
        } else {
            statusEl.innerHTML = '<span style="color:#f97316"><i class="ph ph-warning-circle"></i> Not Linked (Log in to apply)</span>';
        }
    }

    try {
        initSkinViewer();
        if (!currentSkinDataUrl) {
            if (linked) {
                loadSkinToViewer(skinUrl(linked.id, 'skin'));
            } else {
                loadSkinToViewer('https://mc-heads.net/skin/ec70bcaf702f4bb8b48d276fa52a780c'); // Default
            }
        } else {
            loadSkinToViewer(currentSkinDataUrl);
        }
    } catch (e) {
        console.error('Skin viewer error:', e);
        // Fallback placeholder if viewer fails
        const container = document.getElementById('skin-viewer-3d');
        if (container) container.innerHTML = '<i class="ph ph-user" style="font-size:64px;color:var(--text3)"></i>';
    }
    loadSkinGallery();
}
const FEATURED_SKINS = [
    { name: 'Dream', id: 'ec70bcaf702f4bb8b48d276fa52a780c' },
    { name: 'Technoblade', id: 'b876ec32e396476ba1158438d83c67d4' },
    { name: 'MumboJumbo', id: 'c7da90d56a054217b94a7d427cbbcad8' },
    { name: 'Grian', id: '5f8eb73b25be4c5aa50fd27d65e30ca0' },
    { name: 'DanTDM', id: '77cc85ae388a46eca5359e2ffef71b29' },
    { name: 'CaptainSparklez', id: '5f820c3958834392b1743125ac05e38c' }
];
function loadSkinGallery() {
    const grid = document.getElementById('skin-gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    let customSkins = JSON.parse(localStorage.getItem('xc-custom-skins') || '[]');
    customSkins = customSkins.filter(s => s && s.id && s.id.length > 20);

    const clearBtn = document.createElement('div');
    clearBtn.style = 'grid-column: 1/-1; text-align: right; margin-bottom: 8px;';
    clearBtn.innerHTML = '<button id="clear-skins-btn" style="background:none;border:none;color:var(--text3);font-size:11px;cursor:pointer;text-decoration:underline;">Clear History</button>';
    grid.appendChild(clearBtn);
    document.getElementById('clear-skins-btn').onclick = () => {
        if (confirm('Clear all uploaded skins from history?')) {
            localStorage.removeItem('xc-custom-skins');
            loadSkinGallery();
        }
    };
    
    customSkins.forEach(skin => {
        const card = document.createElement('div');
        card.className = 'skin-item-card custom-skin';
        const imgSrc = skin.icon || skin.id; 
        card.innerHTML = `
            <div class="skin-item-preview">
                <img src="${imgSrc}" alt="${skin.name}" style="${skin.icon ? 'height:110%;object-fit:contain;' : 'height:80%;object-fit:contain;'}">
            </div>
            <div class="skin-item-name">${skin.name}</div>
            <button class="delete-skin-btn" title="Remove"><i class="ph ph-trash"></i></button>
        `;
        card.onclick = (e) => {
            if (e.target.closest('.delete-skin-btn')) return;
            loadSkinToViewer(skin.id);
        };
        card.querySelector('.delete-skin-btn').onclick = (e) => {
            e.stopPropagation();
            let skins = JSON.parse(localStorage.getItem('xc-custom-skins') || '[]');
            skins = skins.filter(s => s.id !== skin.id);
            localStorage.setItem('xc-custom-skins', JSON.stringify(skins));
            loadSkinGallery();
        };
        grid.appendChild(card);
    });

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
            loadSkinToViewer(skinUrl(skin.id, 'skin'));
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
            const dataUrl = event.target.result;
            loadSkinToViewer(dataUrl, true);
        };
        reader.readAsDataURL(file);
    }
};
document.getElementById('save-skin-btn').onclick = () => {
    if (currentSkinDataUrl) {
        loadSkinToViewer(currentSkinDataUrl, true);
        alert('Skin saved to your gallery!');
    }
};
document.getElementById('apply-skin-btn').onclick = async () => {
    if (!currentSkinDataUrl) return alert('No skin loaded to apply.');
    
    const applyBtn = document.getElementById('apply-skin-btn');
    const oldText = applyBtn.innerHTML;
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<i class="ph ph-spinner"></i> Applying...';
    
    try {
        if (settings.accountType !== 'microsoft') {
            // Simulated apply for cracked accounts
            await new Promise(r => setTimeout(r, 1000));
            alert('Skin applied to launcher! For cracked accounts, you may need a "Skin Restorer" mod to see this skin in-game on multiplayer servers.');
            return;
        }

        let skinToApply = currentSkinDataUrl;
        if (skinToApply.startsWith('http')) {
            const resp = await fetch(skinToApply);
            const blob = await resp.blob();
            skinToApply = await new Promise(r => {
                const fr = new FileReader();
                fr.onload = () => r(fr.result);
                fr.readAsDataURL(blob);
            });
        }
        
        const result = await window.electronAPI.applySkin({ skinDataUrl: skinToApply, isSlim: false });
        if (result.success) {
            alert('Skin applied successfully to your Mojang account! (It may take a few minutes to update globally)');
            // Refresh social page to show new skin
            setTimeout(renderSocialPage, 2000);
        }
        else alert('Failed to apply skin: ' + result.error);
    } catch (e) {
        alert('Error applying skin: ' + e.message);
    } finally {
        applyBtn.disabled = false;
        applyBtn.innerHTML = oldText;
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
            <div class="player-card-skin"><img src="${skinUrl(data.id, 'avatar', 52)}" alt="skin"></div>
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
function loadVersions() {
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
        // Update profile version selector if it's open
        const verSel = document.getElementById('profile-version-input');
        if (verSel && !document.getElementById('profile-modal-backdrop').classList.contains('hidden') && mcVersions.length) {
            openProfileModal(editingProfileId); 
        }
    }).catch(e => {
        console.error('Failed to load versions:', e);
    });
}
loadVersions();
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
window.electronAPI.onUpdateNotAvailable(() => {
    alert('You are already on the latest version!');
});
restartBtn.addEventListener('click', () => {
    window.electronAPI.restartApp();
});
document.getElementById('manual-update-btn').onclick = () => {
    const btn = document.getElementById('manual-update-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Checking...';
    window.electronAPI.checkUpdates();
    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-arrows-clockwise"></i> Check for Updates';
    }, 3000);
};

// --- Server Browser Logic ---
let allServers = [];
let filteredServers = [];
let currentServerPage = 1;
const SERVERS_PER_PAGE = 20;
const serverStatusCache = {}; // Cache to prevent flickering and over-pinging

async function renderServersPage() {
    console.log('[Servers] renderServersPage starting...');
    if (allServers.length === 0) {
        document.getElementById('servers-grid').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading servers...</p></div>';
        try {
            console.log('[Servers] Fetching from main process...');
            allServers = await window.electronAPI.getServers();
            if (!allServers || !Array.isArray(allServers) || allServers.length === 0) {
                console.warn('[Servers] Empty or invalid response from main process. Using fallback list.');
                allServers = [
                    {"name":"Hypixel","ip":"mc.hypixel.net","categories":["minigames","bedwars","skyblock","pvp"],"description":"World's largest network with BedWars, SkyBlock and more.","version":"1.8-1.21","featured":true},
                    {"name":"CubeCraft","ip":"play.cubecraft.net","categories":["minigames","bedwars","ffa"],"description":"Huge network with EggWars, SkyWars and more.","version":"1.8-1.21","featured":true},
                    {"name":"Wynncraft","ip":"play.wynncraft.com","categories":["rpg","survival"],"description":"The largest MMORPG in Minecraft.","version":"1.16-1.21","featured":true},
                    {"name":"2b2t","ip":"2b2t.org","categories":["anarchy","survival"],"description":"The oldest anarchy server in Minecraft.","version":"1.12.2"},
                    {"name":"PvP Land","ip":"pvp.land","categories":["pvp","ffa"],"description":"Dedicated PvP server with ranked duels.","version":"1.8-1.21"},
                    {"name":"ManaCube","ip":"mc.manacube.com","categories":["minigames","skyblock","prison"],"description":"Popular network with Prison and more.","version":"1.8-1.21"}
                ];
            }
            console.log('[Servers] Final server count:', allServers.length);
        } catch (e) {
            console.error('[Servers] Critical failure in renderServersPage:', e);
            allServers = [];
        }
        filteredServers = [...allServers];
    }
    console.log('[Servers] Current filtered count:', filteredServers.length);
    applyServerFilters();
}

async function applyServerFilters() {
    const q = document.getElementById('server-search-input').value.toLowerCase();
    const activeChip = document.querySelector('.servers-sidebar .filter-chip.active');
    const activeCat = activeChip ? activeChip.dataset.cat : 'all';
    const sort = document.getElementById('server-sort-select').value;
    
    console.log('[Servers] Applying filters:', { q, activeCat, sort });

    if (activeCat === 'modrinth') {
        document.getElementById('servers-grid').innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Fetching from Modrinth...</p></div>';
        try {
            const resp = await fetch(`https://api.modrinth.com/v2/search?query=${q || 'server'}&facets=[["project_type:modpack"]]&limit=20`);
            const data = await resp.json();
            filteredServers = data.hits.map(h => ({
                name: h.title,
                ip: h.slug, 
                categories: ['modrinth', h.project_type],
                description: h.description,
                version: h.latest_version || 'Modpack',
                icon: h.icon_url,
                isModrinth: true
            }));
        } catch (e) {
            console.error('[Servers] Modrinth fetch error:', e);
            filteredServers = [];
        }
    } else {
        filteredServers = allServers.filter(s => {
            if (!s) return false;
            const matchQ = (s.name || '').toLowerCase().includes(q) || 
                           (s.ip || '').toLowerCase().includes(q) || 
                           (s.description || '').toLowerCase().includes(q);
            const matchCat = activeCat === 'all' || (s.categories && s.categories.includes(activeCat));
            return matchQ && matchCat;
        });
        
        if (sort === 'name') filteredServers.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        else if (sort === 'featured') filteredServers.sort((a,b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
    
    document.getElementById('server-count').textContent = filteredServers.length;
    currentServerPage = 1;
    renderServerGrid();
}

function renderServerGrid() {
    console.log('[Servers] renderServerGrid starting with', filteredServers.length, 'servers');
    const grid = document.getElementById('servers-grid');
    if (!grid) { console.error('[Servers] Grid element not found!'); return; }
    grid.innerHTML = '';
    
    if (filteredServers.length === 0) {
        grid.innerHTML = '<div class="loading-state"><p>No servers found matching your criteria.</p></div>';
        updateServerPagination();
        return;
    }
    
    const start = (currentServerPage - 1) * SERVERS_PER_PAGE;
    const end = start + SERVERS_PER_PAGE;
    const paginated = filteredServers.slice(start, end);
    
    // Clear and build grid
    paginated.forEach(s => {
        const d = document.createElement('div');
        d.className = 'server-card';
        const cacheId = s.ip;
        const cached = serverStatusCache[cacheId];
        
        d.innerHTML = `
            <div class="server-card-header">
                <div class="server-info">
                    <h3>${s.name}</h3>
                    <div class="server-ip" title="Click to copy IP" onclick="navigator.clipboard.writeText('${s.ip}')">${s.ip}</div>
                </div>
                <div class="server-status" id="status-${s.ip.replace(/\./g,'-')}">
                    <div class="status-dot ${cached?.online ? 'online' : ''}"></div> 
                    <span class="players">${cached ? (cached.online ? (fmtNum(cached.players?.online || 0) + ' on') : 'Offline') : 'Pinging...'}</span>
                </div>
            </div>
            <div class="server-cats">
                ${(s.categories || []).slice(0,3).map(c => `<span class="server-cat">${c}</span>`).join('')}
            </div>
            <p class="server-desc">${s.description || ''}</p>
        `;
        grid.appendChild(d);
    });

    // Staggered pinging to avoid HTTP 429
    let delay = 0;
    paginated.forEach(s => {
        const cacheId = s.ip;
        const cached = serverStatusCache[cacheId];
        const now = Date.now();
        
        if (!cached || (now - cached.timestamp > 120000)) {
            setTimeout(() => {
                window.electronAPI.checkServer(s.ip).then(st => {
                    serverStatusCache[cacheId] = { ...st, timestamp: Date.now() };
                    const el = document.getElementById(`status-${s.ip.replace(/\./g,'-')}`);
                    if(!el) return;
                    if (st && st.online) {
                        el.querySelector('.status-dot').classList.add('online');
                        el.querySelector('.players').textContent = fmtNum(st.players?.online || 0) + ' on';
                    } else {
                        el.querySelector('.status-dot').classList.remove('online');
                        el.querySelector('.players').textContent = 'Offline';
                    }
                }).catch(() => {
                    serverStatusCache[cacheId] = { online: false, timestamp: Date.now() };
                    const el = document.getElementById(`status-${s.ip.replace(/\./g,'-')}`);
                    if(el) el.querySelector('.players').textContent = 'Offline';
                });
            }, delay);
            delay += 800; // Ping one server every 500ms
        }
    });
    
    updateServerPagination();
}

function updateServerPagination() {
    const max = Math.ceil(filteredServers.length / SERVERS_PER_PAGE);
    document.getElementById('servers-prev-btn').disabled = currentServerPage <= 1;
    document.getElementById('servers-next-btn').disabled = currentServerPage >= max || max === 0;
    document.getElementById('servers-page-label').textContent = `Page ${currentServerPage} of ${max || 1}`;
}

document.getElementById('servers-prev-btn').onclick = () => { if(currentServerPage > 1) { currentServerPage--; renderServerGrid(); } };
document.getElementById('servers-next-btn').onclick = () => { if(currentServerPage < Math.ceil(filteredServers.length/SERVERS_PER_PAGE)) { currentServerPage++; renderServerGrid(); } };
document.getElementById('server-search-input').addEventListener('input', applyServerFilters);
document.getElementById('server-sort-select').addEventListener('change', applyServerFilters);

document.querySelectorAll('.servers-sidebar .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.servers-sidebar .filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyServerFilters();
    });
});
document.getElementById('refresh-servers-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-servers-btn');
    const oldHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner"></i> Refreshing...';
    
    try {
        allServers = await window.electronAPI.getServers();
        if (!allServers || !Array.isArray(allServers)) allServers = [];
        filteredServers = [...allServers];
        applyServerFilters();
    } catch (e) {
        console.error('Refresh error:', e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
    }
});
