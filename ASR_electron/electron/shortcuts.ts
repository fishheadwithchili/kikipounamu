import { globalShortcut } from 'electron';

export function registerShortcuts(startRecording: () => void, stopRecording: () => void) {
    let isRecording = false;

    // Use F9 as it's rarely used by systems
    const ret = globalShortcut.register('F9', () => {
        if (isRecording) {
            stopRecording();
            isRecording = false;
        } else {
            startRecording();
            isRecording = true;
        }
    });

    if (!ret) {
        console.error('Shortcut registration failed for F9');
    } else {
        console.log('Shortcut registered: F9 to toggle recording');
    }
}

export function unregisterShortcuts() {
    globalShortcut.unregisterAll();
}
