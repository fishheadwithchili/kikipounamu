import { exec } from 'child_process';
import { clipboard } from 'electron';

export function insertTextAtCursor(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const platform = process.platform;

        if (platform === 'win32') {
            // Windows: Use clipboard + PowerShell to simulate Ctrl+V
            clipboard.writeText(text);

            // PowerShell script to send Ctrl+V using .NET SendKeys
            // We need to add a small delay to ensure clipboard is ready
            const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Start-Sleep -Milliseconds 100
[System.Windows.Forms.SendKeys]::SendWait('^v')
`;
            // Execute PowerShell with the script
            const command = `powershell -NoProfile -NonInteractive -Command "${psScript.replace(/\n/g, '; ').replace(/"/g, '\\"')}"`;

            exec(command, (error) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    reject(error);
                    return;
                }
                resolve();
            });
        } else if (platform === 'linux') {
            // Linux: Use xdotool (original implementation)
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
        } else if (platform === 'darwin') {
            // macOS: Use clipboard + AppleScript to simulate Cmd+V
            clipboard.writeText(text);

            const command = `osascript -e 'tell application "System Events" to keystroke "v" using command down'`;

            exec(command, (error) => {
                if (error) {
                    console.error(`exec error: ${error}`);
                    reject(error);
                    return;
                }
                resolve();
            });
        } else {
            // Unsupported platform
            reject(new Error(`Unsupported platform: ${platform}`));
        }
    });
}
