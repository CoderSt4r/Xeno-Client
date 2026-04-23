const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync, exec } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const { autoUpdater } = require('electron-updater');

const launcher = new Client();
let mainWindow;
let cachedMsToken = null;

// ── Java auto-detection & download ──────────────────────────────────────────
const JAVA_DIR = path.join(app.getPath('userData'), 'java');
const ADOPTIUM_API = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?os=linux&architecture=x64&image_type=jre';

function findSystemJava() {
    const candidates = [
        '/usr/bin/java',
        '/usr/local/bin/java',
        '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
        '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
        '/usr/lib/jvm/java-21/bin/java',
        '/usr/lib/jvm/java-17/bin/java',
        '/usr/lib/jvm/default-java/bin/java',
        path.join(JAVA_DIR, 'bin', 'java')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    // Try `which java`
    try { return execSync('which java').toString().trim(); } catch (_) { }
    // Try update-alternatives
    try {
        const alt = execSync('update-alternatives --list java 2>/dev/null').toString().trim().split('\n')[0];
        if (alt && fs.existsSync(alt)) return alt;
    } catch (_) { }
    return null;
}

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const follow = (u) => {
            https.get(u, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return follow(res.headers.location);
                }
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', reject);
            }).on('error', reject);
        };
        follow(url);
    });
}

async function httpsGet(url) {
    return new Promise((resolve, reject) => {
        const follow = (u) => {
            https.get(u, { headers: { 'User-Agent': 'XenoClient/1.0' } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return follow(res.headers.location);
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        };
        follow(url);
    });
}

async function ensureJava(sendStatus) {
    const system = findSystemJava();
    if (system) { sendStatus(`Using Java at: ${system}`); return system; }

    sendStatus('Java not found. Downloading Java 21 (this may take a minute)...');
    const apiResp = await httpsGet(ADOPTIUM_API);
    const assets = JSON.parse(apiResp);
    const asset = assets[0];
    const dlUrl = asset.binary.package.link;
    const tarName = path.basename(dlUrl);
    const tarPath = path.join(JAVA_DIR, tarName);

    fs.mkdirSync(JAVA_DIR, { recursive: true });
    sendStatus(`Downloading ${tarName}...`);
    await downloadFile(dlUrl, tarPath);

    sendStatus('Extracting Java...');
    await new Promise((resolve, reject) => {
        exec(`tar -xf "${tarPath}" -C "${JAVA_DIR}" --strip-components=1`, (err) => {
            if (err) reject(err); else resolve();
        });
    });
    fs.unlinkSync(tarPath);

    const javaExe = path.join(JAVA_DIR, 'bin', 'java');
    fs.chmodSync(javaExe, 0o755);
    sendStatus('Java 21 installed!');
    return javaExe;
}

// ── Minecraft version list ───────────────────────────────────────────────────
const MC_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
// Versions older than 1.12 are excluded
const MIN_VERSION_NUM = [1, 12, 0];

function parseVer(v) {
    const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3] || 0)];
}

function verGte(a, b) {
    for (let i = 0; i < 3; i++) {
        if (a[i] > b[i]) return true;
        if (a[i] < b[i]) return false;
    }
    return true;
}

ipcMain.handle('get-versions', async () => {
    try {
        const raw = await httpsGet(MC_MANIFEST);
        const manifest = JSON.parse(raw);
        const filtered = manifest.versions.filter(v => {
            if (v.type !== 'release' && v.type !== 'snapshot') return false;
            const parsed = parseVer(v.id);
            if (!parsed) return false;
            return verGte(parsed, MIN_VERSION_NUM);
        });
        return filtered.map(v => ({ id: v.id, type: v.type }));
    } catch (e) {
        return [];
    }
});

// ── Mod download (Modrinth) ───────────────────────────────────────────────────
ipcMain.handle('download-mod', async (event, { modId, profileName, profileVersion, profileLoader }) => {
    try {
        const safeProfile = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const modsDir = path.join(app.getPath('userData'), 'profiles', safeProfile, 'mods');
        fs.mkdirSync(modsDir, { recursive: true });

        // Get latest version compatible with profile
        const loaderParam = profileLoader !== 'vanilla' ? `&loaders=["${profileLoader}"]` : '';
        const versionsUrl = `https://api.modrinth.com/v2/project/${modId}/version?game_versions=["${profileVersion}"]${loaderParam}`;
        const versionsRaw = await httpsGet(versionsUrl);
        const versions = JSON.parse(versionsRaw);

        if (!versions || !versions.length) {
            return { success: false, error: `No compatible version found for MC ${profileVersion} / ${profileLoader}` };
        }

        const latest = versions[0];
        const file = latest.files.find(f => f.primary) || latest.files[0];
        if (!file) return { success: false, error: 'No file found for this version.' };

        const destPath = path.join(modsDir, file.filename);
        if (fs.existsSync(destPath)) return { success: true, alreadyExists: true, filename: file.filename };

        event.sender.send('download-progress', { name: file.filename, status: 'Downloading...' });
        await downloadFile(file.url, destPath);
        return { success: true, filename: file.filename, destPath };
    } catch (e) {
        return { success: false, error: String(e) };
    }
});

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 820, height: 520,
        frame: false, transparent: true,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    mainWindow.loadFile('login.html');

    // Auto-update checking
    autoUpdater.checkForUpdatesAndNotify();
}

autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
});

autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// Window controls
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());

// Login -> Main transition
ipcMain.on('open-main', (event, sessionJson) => {
    // Resize to full launcher size
    mainWindow.setResizable(true);
    mainWindow.setSize(1100, 660);
    mainWindow.center();
    mainWindow.loadFile('index.html');
    mainWindow.once('ready-to-show', () => {
        mainWindow.webContents.send('session-data', JSON.parse(sessionJson));
    });
    // Also send after a short delay as a fallback (page may already be shown)
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('session-data', JSON.parse(sessionJson));
    });
});

// Microsoft login
ipcMain.on('ms-login', async (event) => {
    try {
        const authManager = new Auth('select_account');
        const xboxManager = await authManager.launch('electron');
        const token = await xboxManager.getMinecraft();
        cachedMsToken = token.mclc();
        event.sender.send('ms-login-reply', { success: true, username: cachedMsToken.name || 'Premium User' });
    } catch (error) {
        event.sender.send('ms-login-reply', { success: false, error: String(error) });
    }
});

// Launch game
ipcMain.on('launch-game', async (event, settings) => {
    const send = (type, message) => event.sender.send('launcher-status', { type, message });

    try {
        // Resolve Java
        const userJava = settings.javaPath && fs.existsSync(settings.javaPath) ? settings.javaPath : null;
        const javaPath = userJava || await ensureJava((msg) => send('progress', msg));

        // Auth
        let authorization;
        if (settings.accountType === 'microsoft') {
            if (!cachedMsToken) return send('error', 'Not logged in to Microsoft. Go to Settings → Account.');
            authorization = cachedMsToken;
        } else {
            authorization = Authenticator.getAuth(settings.username || 'Player');
        }

        // Copy profile mods to .minecraft/mods if needed
        const safeProfile = (settings.profileName || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
        const profileModsDir = path.join(app.getPath('userData'), 'profiles', safeProfile, 'mods');
        const mcRoot = path.join(app.getPath('appData'), '.xenoclient');
        const mcModsDir = path.join(mcRoot, 'mods');

        // Clear and re-sync mods for this profile
        if (fs.existsSync(mcModsDir)) fs.rmSync(mcModsDir, { recursive: true });
        if (fs.existsSync(profileModsDir)) {
            fs.mkdirSync(mcModsDir, { recursive: true });
            for (const f of fs.readdirSync(profileModsDir)) {
                fs.copyFileSync(path.join(profileModsDir, f), path.join(mcModsDir, f));
            }
            send('progress', `Synced ${fs.readdirSync(profileModsDir).length} mods...`);
        }

        const opts = {
            clientPackage: null,
            authorization,
            root: mcRoot,
            version: { number: settings.version || '1.20.1', type: 'release' },
            memory: {
                max: `${Math.max(1, settings.ramMax || 4)}G`,
                min: `${Math.max(1, settings.ramMin || 2)}G`
            },
            window: { width: settings.width || 1280, height: settings.height || 720 },
            javaPath,
            customArgs: settings.jvmArgs ? settings.jvmArgs.split(' ').filter(Boolean) : []
        };

        send('progress', 'Preparing Minecraft files...');

        launcher.on('debug', (e) => {
            if (typeof e === 'string' && (e.includes('Download') || e.includes('Extract') || e.includes('Start') || e.includes('version'))) {
                send('progress', e);
            }
        });
        launcher.on('data', (e) => send('progress', String(e).slice(0, 120)));
        launcher.on('close', () => { cachedMsToken = null; send('close', 'Game closed.'); });

        await launcher.launch(opts);
        send('launching', 'Minecraft is launching!');
    } catch (error) {
        console.error('Launch Error:', error);
        send('error', error.message);
    }
});
