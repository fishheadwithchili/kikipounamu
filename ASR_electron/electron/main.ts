import { app, BrowserWindow, ipcMain } from 'electron';

// Disable hardware acceleration to fix rendering issues on Linux/WSL2
app.disableHardwareAcceleration();

// Additional Chromium flags for WSL2/Linux stability
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-gpu-compositing'); // Prevents GPU layer shifts
app.commandLine.appendSwitch('disable-software-rasterizer');
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
    width: 816,
    height: 600,
    resizable: false,
    maximizable: false,
    // useContentSize: true, // Disabled - can cause offset issues in WSL2
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    frame: false, // Custom frameless window
    backgroundColor: '#0f172a', // Solid dark background (matches app theme)
    show: false // Show after ready-to-show to prevent flash
  });

  // LINUX/WSL2 FIX: Force layout refresh by resetting bounds after ready
  win.once('ready-to-show', () => {
    // Force a bounds reset to fix Linux offset bug
    const bounds = win?.getBounds();
    if (bounds && win) {
      win.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width + 1,
        height: bounds.height
      });
      // Immediately set back to actual size
      setTimeout(() => {
        win?.setBounds(bounds);
        win?.show();
      }, 50);
    } else {
      win?.show();
    }
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

  // LINUX/WSL2 FIX: Allow renderer to trigger layout refresh
  ipcMain.handle('force-layout-refresh', () => {
    if (win) {
      const bounds = win.getBounds();
      win.setBounds({ ...bounds, width: bounds.width + 1 });
      setTimeout(() => win?.setBounds(bounds), 50);
    }
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
