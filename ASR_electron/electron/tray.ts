import { Tray, Menu, app, BrowserWindow, nativeImage } from 'electron';
import path from 'node:path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
    try {
        // Use VITE_PUBLIC for correct path in both dev and prod
        const iconPath = path.join(process.env.VITE_PUBLIC || '', 'vite.svg');

        // Create native image
        let icon = nativeImage.createFromPath(iconPath);
        if (icon.isEmpty()) {
            console.warn("Tray icon not found at", iconPath, "- using empty icon");
            // Create a simple 16x16 transparent icon as fallback
            icon = nativeImage.createEmpty();
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
