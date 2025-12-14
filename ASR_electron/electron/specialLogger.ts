import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
// Retaining import to avoid breaking if it was used for getPath, but logic changed to process.cwd per plan.
// Actually, linter says it is unused. Let's remove it if I am sure. 
// Wait, I am using process.cwd() instead.

export class SpecialLogger {
    private static instance: SpecialLogger;
    private logDirectory: string;

    private constructor() {
        // Use a fixed path relative to project root for easier access during dev, 
        // or app.getPath('userData')/test/special for production safety.
        // Given the request said "electron/test/special", let's try to resolve that relative to CWD.
        // In dev, CWD is usually the project root.
        this.logDirectory = path.join(process.cwd(), 'test', 'special');
        if (!fs.existsSync(this.logDirectory)) {
            try {
                fs.mkdirSync(this.logDirectory, { recursive: true });
            } catch (e) {
                console.error('Failed to create special log directory:', e);
            }
        }
    }

    public static getInstance(): SpecialLogger {
        if (!SpecialLogger.instance) {
            SpecialLogger.instance = new SpecialLogger();
        }
        return SpecialLogger.instance;
    }

    public initLog(logId: string): boolean {
        const filePath = path.join(this.logDirectory, `${logId}_log.txt`);
        try {
            fs.writeFileSync(filePath, `[${new Date().toISOString()}] === LOG STARTED ===\nID: ${logId}\n`);
            return true;
        } catch (e) {
            console.error(`Failed to init log ${logId}:`, e);
            return false;
        }
    }

    public appendLog(logId: string, message: string): void {
        const filePath = path.join(this.logDirectory, `${logId}_log.txt`);
        // If file doesn't exist, we skip or try to create? VAD might spam, so let's check briefly or just append (append creates if missing usually, but we want structured start)
        // Using appendFileSync is efficient enough for this debug mode.
        try {
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] ${message}\n`;
            fs.appendFileSync(filePath, logLine);
        } catch (e) {
            console.error(`Failed to append to log ${logId}:`, e);
        }
    }
}

export const specialLogger = SpecialLogger.getInstance();
