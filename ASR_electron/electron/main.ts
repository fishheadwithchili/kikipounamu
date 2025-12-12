import { app, BrowserWindow, ipcMain } from 'electron';

// Disable hardware acceleration to fix rendering issues on Linux/WSL2
app.disableHardwareAcceleration();
import path from 'node:path';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { createTray } from './tray';
import { setupIpc } from './ipc';
import { ASRClient } from './asrClient';
import { logger } from './logger';

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
  logger.info('Creating application window');

  win = new BrowserWindow({
    width: 800,
    height: 600,
    useContentSize: true, // Fix for Linux frameless window offset
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    // frame: false, // Replaced with titleBarStyle for better Linux support
    titleBarStyle: 'hidden', // Standard cross-platform frameless mode
    // titleBarOverlay: true, // Optional: enable if native controls are desired on supported platforms
    backgroundColor: '#0f172a', // Solid dark background (matches app theme)
    show: false // Show after ready-to-show to prevent flash
  });

  // Show window when ready to prevent visual glitches
  win.once('ready-to-show', () => {
    win?.show();
  });

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    logger.info('Renderer process finished loading');
    win?.webContents.send('main-process-message', (new Date).toLocaleString());
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    logger.debug('Loading from dev server', { url: process.env.VITE_DEV_SERVER_URL });
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    logger.debug('Loading from production build');
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST || '', 'index.html'));
  }

  // Initialize ASR Client
  logger.info('Initializing ASR client');
  asrClient = new ASRClient(win);
  asrClient.connect(); // Auto connect on start

  // Setup IPC
  logger.info('Setting up IPC handlers');
  setupIpc(asrClient);

  // Window Controls IPC
  ipcMain.handle('window-minimize', () => {
    win?.minimize();
  });

  ipcMain.handle('window-maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle('window-close', () => {
    win?.close();
  });

  // Setup Tray
  logger.info('Creating system tray');
  createTray(win);

  // Register Shortcuts
  logger.info('Registering global shortcuts');
  registerShortcuts(
    () => {
      // Start Recording Action
      logger.info('Global shortcut triggered: Start Recording');
      asrClient?.startRecording();
      win?.webContents.send('recording-state', true);
    },
    () => {
      // Stop Recording Action
      logger.info('Global shortcut triggered: Stop Recording');
      asrClient?.stopRecording();
      win?.webContents.send('recording-state', false);
    }
  );

  logger.info('Application window created successfully');
}

app.on('window-all-closed', () => {
  logger.info('All windows closed');
  win = null;
  // Don't quit if tray is active usually, but for this app we might want to stay alive.
  // However, often users expect close to quit unless configured.
  // Let's keep it running in background if tray exists.
  // app.quit(); 
});

app.on('will-quit', () => {
  logger.info('Application will quit, cleaning up');
  unregisterShortcuts();
});

app.whenReady().then(() => {
  logger.info('Electron app is ready');
  createWindow();
});
