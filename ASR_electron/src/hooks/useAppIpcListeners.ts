import { useEffect } from 'react';
import { AlertType } from '../components/AlertOverlay';

// Define the type locally to avoid circular dependency with App.tsx
// Ideally this should be in a shared `types.ts` file
export type ProcessingStatus = 'idle' | 'recording' | 'processing' | 'finalizing' | 'done';

interface UseAppIpcListenersProps {
    setStatus: (status: 'connected' | 'disconnected' | 'error' | 'connecting') => void;
    setProcessingStatus: (status: ProcessingStatus) => void;
    setQueueCount: (value: number | ((prev: number) => number)) => void;
    setSegments: (value: string[] | ((prev: string[]) => string[])) => void;
    setInterimText: (text: string) => void;
    setAlertState: (state: { type: AlertType; title?: string; description?: string } | null) => void;
    toggleRecording: () => void;
    vad: { isRecording: boolean }; // Minimal interface for what we need
    autoPaste: boolean;
    maxTextHistory?: number; // Optional as it was used in commented out code, but let's keep it safe
}

export function useAppIpcListeners({
    setStatus,
    setProcessingStatus,
    setQueueCount,
    setSegments,
    setInterimText,
    setAlertState,
    toggleRecording,
    vad,
    autoPaste
}: UseAppIpcListenersProps) {

    useEffect(() => {
        // Ensure window.ipcRenderer exists (it should in Electron)
        if (!window.ipcRenderer) {
            console.warn('IPC Renderer not found - running in browser mode?');
            return;
        }

        const cleanupStatus = window.ipcRenderer.on('asr-status', (_event, s: string) => {
            // Cast string to union type safely
            if (['connected', 'disconnected', 'error', 'connecting'].includes(s)) {
                setStatus(s as any);
            } else {
                console.warn('Unknown status received:', s);
            }
        });

        const cleanupResult = window.ipcRenderer.on('asr-result', (_event, data: any) => {
            // Handle final result first - MUST decrement queue even if text is empty
            if (data.is_final) {


                // Update Queue - Use chunk_count from backend if available
                const processedCount = data.chunk_count || 1;
                setQueueCount(prev => Math.max(0, prev - processedCount));
                setProcessingStatus('done');

                // Only add to segments/history if there's actual text
                if (data.text) {

                    // 1. Add to segments
                    setSegments(prev => [...prev, data.text]);

                    // 2. Add to History
                    // REMOVED logic in original file, keeping it removed here

                    // 3. Clear interim
                    setInterimText('');

                    if (autoPaste) {
                        window.ipcRenderer.invoke('insert-text', data.text);
                    }

                } else {
                    // Empty result - just clear interim
                    setInterimText('');
                }
            } else if (data.text) {
                // INTERIM RESULT (only if there's text)

                setInterimText(data.text);
            }
        });

        const cleanupProcessing = window.ipcRenderer.on('asr-processing', (_event, data: any) => {
            if (data.status) {
                setProcessingStatus(data.status as ProcessingStatus);
            }
        });

        // Recording state sync from Main Process (e.g. global shortcut stop)
        const cleanupState = window.ipcRenderer.on('recording-state', (_event, state: boolean) => {
            // If main process says "not recording" but VAD thinks it is, toggle it off.
            // This handles the case where Global Shortcut stops recording.
            if (!state && vad.isRecording) {
                toggleRecording();
            }
        });

        const cleanupError = window.ipcRenderer.on('asr-error', (_event, msg: string) => {
            setProcessingStatus('idle');
            setQueueCount(prev => Math.max(0, prev - 1));
            setAlertState({
                type: 'error',
                title: 'Backend Error',
                description: msg
            });
        });

        return () => {
            cleanupStatus();
            cleanupResult();
            cleanupProcessing();
            cleanupState();
            cleanupError();
        };
    }, [toggleRecording, autoPaste, vad, setStatus, setProcessingStatus, setQueueCount, setSegments, setInterimText, setAlertState]);
}
