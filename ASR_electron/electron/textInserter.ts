import { exec } from 'child_process';

export function insertTextAtCursor(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Escape single quotes for shell
        const escapedText = text.replace(/'/g, "'\\''");

        // Command to type text safely using xdotool
        const command = `xdotool type --clearmodifiers --delay 0 '${escapedText}'`;

        exec(command, (error) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(error);
                return;
            }
            resolve();
        });
    });
}
