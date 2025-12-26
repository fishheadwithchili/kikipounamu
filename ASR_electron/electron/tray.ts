import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
    try {
        // Use VITE_PUBLIC for correct path in both dev and prod
        // NOTE: On Linux, SVGs are often not supported for Tray icons. Using PNG.
        const iconPath = path.join(process.env.VITE_PUBLIC || '', 'icon.png');

        // Create native image
        let icon = nativeImage.createFromPath(iconPath);

        if (icon.isEmpty()) {
            console.warn("Tray icon not found or invalid at", iconPath);
            icon = nativeImage.createEmpty();
        } else {
            // Resize for tray (usually 16x16 or 24x24 is best for cross-platform)
            icon = icon.resize({ width: 24, height: 24 });
        }

        tray = new Tray(icon);

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show App',
                click: () => mainWindow.show()
            },
            {
                label: 'Start Recording',
                click: () => mainWindow.webContents.send('trigger-record') // Simplified trigger
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => app.quit()
            }
        ]);

        tray.setToolTip('ASR Electron Assistant');
        tray.setContextMenu(contextMenu);

        tray.on('click', () => {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        });
    } catch (error) {
        console.warn('Failed to create tray:', error);
        // Tray is optional, continue without it
    }
}
