/// <reference types="vite/client" />

interface IpcRenderer {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => (() => void);
    off: (channel: string, listener: (...args: any[]) => void) => void;
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
}

interface Window {
    ipcRenderer: IpcRenderer;
}
