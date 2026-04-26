console.log("--- XENO CLIENT BOOTING (FIXED V3) ---");
const { app, BrowserWindow, ipcMain } = require('electron');
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync, exec } = require('child_process');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { Auth } = require('msmc');
const { autoUpdater } = require('electron-updater');
const extract = require('extract-zip');
const launcher = new Client();
let mainWindow;
let cachedMsToken = null;
const MS_TOKEN_PATH = path.join(app.getPath('userData'), 'ms-token.json');
if (fs.existsSync(MS_TOKEN_PATH)) {
    try { cachedMsToken = JSON.parse(fs.readFileSync(MS_TOKEN_PATH, 'utf8')); } catch (e) { }
}
const JAVA_DIR = path.join(app.getPath('userData'), 'java');
function getAdoptiumApi() {
    const os = process.platform === 'win32' ? 'windows' : 'linux';
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
    return `https://api.adoptium.net/v3/assets/latest/21/hotspot?os=${os}&architecture=${arch}&image_type=jre`;
}
function findSystemJava() {
    const isWin = process.platform === 'win32';
    const javaExe = isWin ? 'javaw.exe' : 'java';
    const candidates = [
        path.join(JAVA_DIR, 'bin', javaExe)
    ];

    if (isWin) {
        const programFiles = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']];
        programFiles.forEach(pf => {
            if (!pf) return;
            const jDirs = [path.join(pf, 'Java'), path.join(pf, 'Eclipse Foundation'), path.join(pf, 'Adoptium')];
            jDirs.forEach(jd => {
                if (fs.existsSync(jd)) {
                    fs.readdirSync(jd).forEach(v => {
                        candidates.push(path.join(jd, v, 'bin', 'javaw.exe'));
                        candidates.push(path.join(jd, v, 'jre', 'bin', 'javaw.exe'));
                    });
                }
            });
        });
        if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'));
    } else {
        candidates.push('/usr/bin/java', '/usr/local/bin/java', '/usr/lib/jvm/default-java/bin/java');
        try {
            const which = execSync('which java').toString().trim();
            if (which) candidates.push(which);
        } catch (_) { }
    }

    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
    }
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
            const req = https.get(u, { headers: { "User-Agent": "XenoClient/1.0" } }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return follow(res.headers.location);
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
                let data = "";
                res.on("data", c => data += c);
                res.on("end", () => resolve(data));
            });
            req.on("error", reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error("Timeout"));
            });
        };
        follow(url);
    });
}
async function ensureJava(sendStatus) {
    const system = findSystemJava();
    if (system) { sendStatus(`Using Java at: ${system}`); return system; }
    sendStatus('Java not found. Downloading Java 21...');
    const apiResp = await httpsGet(getAdoptiumApi());
    const assets = JSON.parse(apiResp);
    const asset = assets[0];
    const dlUrl = asset.binary.package.link;
    const fileName = path.basename(dlUrl);
    const filePath = path.join(app.getPath('userData'), fileName);

    if (fs.existsSync(JAVA_DIR)) fs.rmSync(JAVA_DIR, { recursive: true, force: true });
    fs.mkdirSync(JAVA_DIR, { recursive: true });

    sendStatus(`Downloading ${fileName}...`);
    await downloadFile(dlUrl, filePath);
    sendStatus('Extracting Java...');

    if (fileName.endsWith('.zip')) {
        await extract(filePath, { dir: JAVA_DIR });
        const contents = fs.readdirSync(JAVA_DIR);
        if (contents.length === 1 && fs.statSync(path.join(JAVA_DIR, contents[0])).isDirectory()) {
            const sub = path.join(JAVA_DIR, contents[0]);
            for (const f of fs.readdirSync(sub)) {
                fs.renameSync(path.join(sub, f), path.join(JAVA_DIR, f));
            }
            fs.rmdirSync(sub);
        }
    } else {
        await new Promise((resolve, reject) => {
            exec(`tar -xf "${filePath}" -C "${JAVA_DIR}" --strip-components=1`, (err) => {
                if (err) reject(err); else resolve();
            });
        });
    }

    fs.unlinkSync(filePath);
    const javaExe = path.join(JAVA_DIR, 'bin', process.platform === 'win32' ? 'javaw.exe' : 'java');
    if (process.platform !== 'win32') fs.chmodSync(javaExe, 0o755);

    if (!fs.existsSync(javaExe)) throw new Error('Failed to find java executable after extraction.');
    sendStatus('Java 21 installed!');
    return javaExe;
}
const MC_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MIN_VERSION_NUM = [1, 12, 0];
function parseVer(v) {
    const m = v.match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) {
        const snap = v.match(/^(\d{2})w(\d{2})[a-z]/);
        if (snap) return [1, parseInt(snap[1]) + 10, parseInt(snap[2])];
        return null;
    }
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
ipcMain.handle('search-mods', async (event, { query, facets, offset, limit, index }) => {
    try {
        const facetStr = encodeURIComponent(JSON.stringify(facets));
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${facetStr}&offset=${offset}&limit=${limit}&index=${index}`;
        const raw = await httpsGet(url);
        return JSON.parse(raw);
    } catch (e) {
        console.error('Modrinth search error:', e);
        throw e;
    }
});
ipcMain.handle('download-mod', async (event, { modId, profileName, profileVersion, profileLoader }) => {
    try {
        const safeProfile = profileName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const modsDir = path.join(app.getPath('userData'), 'profiles', safeProfile, 'mods');
        fs.mkdirSync(modsDir, { recursive: true });
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
ipcMain.handle('get-servers', async () => {
    try {
        const p = path.join(__dirname, 'servers.json');
        console.log('[IPC] Reading servers from:', p);
        if (!fs.existsSync(p)) {
            console.error('[IPC] servers.json NOT FOUND at:', p);
            return [];
        }
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log('[IPC] Successfully read', data.length, 'servers');
        return data;
    } catch(e) { 
        console.error('[IPC] Error reading servers.json:', e);
        return []; 
    }
        const raw = fs.readFileSync(p, "utf8");
        console.log("[IPC] Raw file start:", raw.substring(0, 100));
});
ipcMain.handle("check-server", async (event, ip) => { try { console.log("[IPC] Pinging:", ip); const raw = await httpsGet(`https://api.mcstatus.io/v2/status/java/${ip}`); const data = JSON.parse(raw); console.log("[IPC] Result for", ip, ":", data.online ? "Online" : "Offline"); return data; } catch(e) { console.error("[IPC] Ping failed for", ip, ":", e.message); return { online: false }; } });
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
    mainWindow.webContents.on('did-finish-load', () => {
        setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
    });
}
autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
});
autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
});
autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update_not_available');
});
ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});
ipcMain.on('check_updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('window-close', () => mainWindow.close());
ipcMain.on('open-main', (event, sessionJson) => {
    mainWindow.setResizable(true);
    mainWindow.setSize(1100, 660);
    mainWindow.center();
    mainWindow.loadFile('index.html');
    mainWindow.once('ready-to-show', () => {
        mainWindow.webContents.send('session-data', JSON.parse(sessionJson));
    });
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('session-data', JSON.parse(sessionJson));
        setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 2000);
    });
});
ipcMain.on('ms-login', async (event) => {
    try {
        const authManager = new Auth('select_account');
        const xboxManager = await authManager.launch('electron');
        const token = await xboxManager.getMinecraft();
        cachedMsToken = token.mclc();
        fs.writeFileSync(MS_TOKEN_PATH, JSON.stringify(cachedMsToken));
        event.sender.send('ms-login-reply', { success: true, username: cachedMsToken.name || 'Premium User' });
    } catch (error) {
        event.sender.send('ms-login-reply', { success: false, error: String(error) });
    }
});
ipcMain.on('launch-game', async (event, settings) => {
    const send = (type, message) => event.sender.send('launcher-status', { type, message });
    try {
        const userJava = settings.javaPath && fs.existsSync(settings.javaPath) ? settings.javaPath : null;
        const javaPath = userJava || await ensureJava((msg) => send('progress', msg));
        let authorization;
        if (settings.accountType === 'microsoft') {
            if (!cachedMsToken) return send('error', 'Not logged in to Microsoft.');
            authorization = cachedMsToken;
        } else {
            authorization = Authenticator.getAuth(settings.username || 'Player');
        }
        const safeProfile = (settings.profileName || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
        const profileModsDir = path.join(app.getPath('userData'), 'profiles', safeProfile, 'mods');
        const mcRoot = path.join(app.getPath('appData'), '.xenoclient');
        if (!fs.existsSync(mcRoot)) fs.mkdirSync(mcRoot, { recursive: true });
        if (!fs.existsSync(path.join(mcRoot, 'cache', 'json'))) fs.mkdirSync(path.join(mcRoot, 'cache', 'json'), { recursive: true });
        const mcModsDir = path.join(mcRoot, 'mods');
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
        launcher.on('close', (code) => { 
            if (code !== 0) send('error', `Game crashed (Exit Code: ${code}). Wrong Java version or bad drivers?`);
            else send('close', 'Game closed.'); 
        });
        await launcher.launch(opts);
        send('launching', 'Minecraft is launching!');
    } catch (error) {
        console.error('Launch Error:', error);
        send('error', error.message);
    }
});
ipcMain.handle('apply-skin', async (event, { skinDataUrl, isSlim }) => {
    console.log('[Skin] Apply request. Token available:', !!cachedMsToken, cachedMsToken ? `(User: ${cachedMsToken.name})` : '');
    if (!cachedMsToken || !cachedMsToken.access_token) return { success: false, error: 'Not logged in with Microsoft.' };
    try {
        const base64Data = skinDataUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

        const payload = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${isSlim ? 'slim' : 'classic'}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`),
            buffer,
            Buffer.from(`\r\n--${boundary}--\r\n`)
        ]);

        return new Promise((resolve) => {
            const req = https.request({
                hostname: 'api.minecraftservices.com',
                path: '/minecraft/profile/skins',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${cachedMsToken.access_token}`,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': payload.length
                }
            }, (res) => {
                if (res.statusCode === 200 || res.statusCode === 204) resolve({ success: true });
                else resolve({ success: false, error: `Mojang API error: ${res.statusCode}` });
            });
            req.on('error', (e) => resolve({ success: false, error: e.message }));
            req.write(payload);
            req.end();
        });
    } catch (e) {
        return { success: false, error: String(e) };
    }
});
