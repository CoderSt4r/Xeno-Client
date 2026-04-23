const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    windowMinimize: () => ipcRenderer.send('window-minimize'),
    windowMaximize: () => ipcRenderer.send('window-maximize'),
    windowClose: () => ipcRenderer.send('window-close'),

    // Login -> Main transition
    openMain: (sessionJson) => ipcRenderer.send('open-main', sessionJson),

    // Game launching
    launchGame: (settings) => ipcRenderer.send('launch-game', settings),
    onLauncherStatus: (cb) => ipcRenderer.on('launcher-status', (_e, v) => cb(v)),

    // Microsoft auth
    msLogin: () => ipcRenderer.send('ms-login'),
    onMsLogin: (cb) => ipcRenderer.on('ms-login-reply', (_e, v) => cb(v)),

    // Minecraft versions
    getVersions: () => ipcRenderer.invoke('get-versions'),

    // Mod downloading
    downloadMod: (opts) => ipcRenderer.invoke('download-mod', opts),
    onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (_e, v) => cb(v)),

    // Session info passed from login
    onSession: (cb) => ipcRenderer.on('session-data', (_e, v) => cb(v)),

    // Auto-update
    onUpdateAvailable: (cb) => ipcRenderer.on('update_available', () => cb()),
    onUpdateDownloaded: (cb) => ipcRenderer.on('update_downloaded', () => cb()),
    restartApp: () => ipcRenderer.send('restart_app'),
});
