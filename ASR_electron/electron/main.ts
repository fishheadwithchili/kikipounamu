import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { createTray } from './tray';
import { setupIpc } from './ipc';
import { ASRClient } from './asrClient';

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public');

let win: BrowserWindow | null;
let asrClient: ASRClient | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    // Hide initially if you want tray-only start, but let's show it for now
    show: true
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST || '', 'index.html'));
  }

  // Initialize ASR Client
  asrClient = new ASRClient(win);
  asrClient.connect(); // Auto connect on start

  // Setup IPC
  setupIpc(asrClient);

  // Setup Tray
  createTray(win);

  // Register Shortcuts
  registerShortcuts(
    () => {
      // Start Recording Action
      console.log('Global Shortcut: Start Recording');
      asrClient?.startRecording();
      win?.webContents.send('recording-state', true);
    },
    () => {
      // Stop Recording Action
      console.log('Global Shortcut: Stop Recording');
      asrClient?.stopRecording();
      win?.webContents.send('recording-state', false);
    }
  );
}

app.on('window-all-closed', () => {
  win = null;
  // Don't quit if tray is active usually, but for this app we might want to stay alive.
  // However, often users expect close to quit unless configured.
  // Let's keep it running in background if tray exists.
  // app.quit(); 
});

app.on('will-quit', () => {
  unregisterShortcuts();
});

app.whenReady().then(createWindow);
