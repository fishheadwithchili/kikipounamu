import { useEffect, useRef } from 'react';
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
    vadMode: 'vad' | 'time_limit' | 'unlimited';
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
    autoPaste,
    vadMode
}: UseAppIpcListenersProps) {

    // Keep track of chunks for the current session to merge them into one bubble
    const sessionChunksRef = useRef<Map<number, string>>(new Map());

    // Track the segment index for the CURRENT recording session
    // This is set when chunk 0 arrives, then used for all subsequent chunks
    const currentSessionIndexRef = useRef<number | null>(null);

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
            // --- TIME LIMIT MODE FIX ---
            // In time_limit mode, each chunk result is effectively final for that 10s slice.
            // We treat 'chunk_result' (is_final=false but has chunk_index) as a segment update.
            const isTimeLimitMode = vadMode === 'time_limit';

            if (isTimeLimitMode && typeof data.chunk_index === 'number' && !data.is_final) {
                // If it's the first chunk of a new recording session
                if (data.chunk_index === 0) {
                    sessionChunksRef.current.clear();
                    currentSessionIndexRef.current = null; // Will be set below when we append
                }

                // If we have text, update/append segment
                if (data.text) {
                    sessionChunksRef.current.set(data.chunk_index, data.text);

                    // Merge all chunks continuously
                    const sortedChunks = Array.from(sessionChunksRef.current.entries())
                        .sort((a, b) => a[0] - b[0])
                        .map(entry => entry[1]);

                    // Join logic: simple concatenation. 
                    const fullSessionText = sortedChunks.join('');

                    // For chunk 0: We need to APPEND. For others: UPDATE.
                    // CRITICAL: Check and set the ref SYNCHRONOUSLY to prevent race conditions.
                    // If null, this is the first chunk - claim it immediately with a placeholder.
                    const isFirstChunk = currentSessionIndexRef.current === null;
                    if (isFirstChunk) {
                        // Set to -1 as a "claiming" signal. Will be updated to real index inside setSegments.
                        currentSessionIndexRef.current = -1;
                    }

                    setSegments((prev: string[]) => {
                        const newSegments = [...prev];

                        if (isFirstChunk) {
                            // For chunk 0: APPEND and remember the actual index
                            const targetIndex = newSegments.length;
                            currentSessionIndexRef.current = targetIndex;
                            newSegments.push(fullSessionText);
                        } else {
                            // For subsequent chunks: UPDATE the existing segment
                            // Wait for actual index if still -1 (edge case, should be rare)
                            const idx = currentSessionIndexRef.current!;
                            if (idx >= 0) {
                                newSegments[idx] = fullSessionText;
                            }
                        }

                        return newSegments;
                    });
                    // Clear interim to avoid duplication/overwrite visual
                    setInterimText('');
                }

                // We also need to manage queue count here to show progress
                // Decrement queue count as this chunk is "processed"
                setQueueCount((prev: number) => Math.max(0, prev - 1));

                // Continue to allow other logic? 
                // We should RETURN here to prevent it falling through to the 'interim' logic below
                return;
            }

            // Handle final result first - MUST decrement queue even if text is empty
            if (data.is_final) {

                // Update Queue - Use chunk_count from backend if available
                const processedCount = data.chunk_count || 1;
                setQueueCount(prev => Math.max(0, prev - processedCount));
                setProcessingStatus('done');

                // TIME LIMIT MODE: Ignore final result text merging, as we already have segments.
                if (isTimeLimitMode) {
                    setInterimText('');
                    return;
                }

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
    }, [toggleRecording, autoPaste, vad, vadMode, setStatus, setProcessingStatus, setQueueCount, setSegments, setInterimText, setAlertState]);
}
