export const storageService = {
    get: async <T>(key: string): Promise<T | null> => {
        try {
            // @ts-ignore - ipcRenderer exposed in preload
            return await window.ipcRenderer.invoke('store-get', key);
        } catch (error) {
            console.error('Failed to get from store:', error);
            return null;
        }
    },

    set: async (key: string, value: any): Promise<void> => {
        try {
            // @ts-ignore
            await window.ipcRenderer.invoke('store-set', key, value);
        } catch (error) {
            console.error('Failed to set to store:', error);
        }
    },

    delete: async (key: string): Promise<void> => {
        try {
            // @ts-ignore
            await window.ipcRenderer.invoke('store-delete', key);
        } catch (error) {
            console.error('Failed to delete from store:', error);
        }
    }
};
