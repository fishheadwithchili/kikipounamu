import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import { StatusBar } from './components/StatusBar';
import { HistoryList, AudioHistoryItem } from './components/HistoryList';
import { TranscriptionPane } from './components/TranscriptionPane';
import { SettingsPanel } from './components/SettingsPanel';
import { RecoveryModal } from './components/RecoveryModal';
import { useVADRecording, VADMode } from './hooks/useVADRecording';
import { arrayBufferToBase64 } from './utils/audioHelper';
import { storageService } from './services/storage';

type ProcessingStatus = 'idle' | 'recording' | 'processing' | 'finalizing' | 'done';

function App() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error' | 'connecting'>('connecting');
  const [history, setHistory] = useState<{ timestamp: string, text: string }[]>([]);
  const [audioHistory, setAudioHistory] = useState<AudioHistoryItem[]>([]);

  // Workspace State
  const [segments, setSegments] = useState<string[]>([]);
  const [interimText, setInterimText] = useState('');

  // Status State
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('idle');
  const [queueCount, setQueueCount] = useState(0);

  const [autoPaste] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [vadMode, setVadModeState] = useState<VADMode>('unlimited');
  const [timeLimit, setTimeLimit] = useState(180); // Default 3 minutes (180s)

  // New Settings
  const [maxTextHistory, setMaxTextHistory] = useState(100);
  const [maxAudioHistory, setMaxAudioHistory] = useState(10);
  const [savePath, setSavePath] = useState('');

  // Audio Buffering
  const recordingStartTimeRef = useRef<number>(0);

  // Crash Recovery State
  const [crashFiles, setCrashFiles] = useState<any[]>([]);
  const [showRecovery, setShowRecovery] = useState(false);

  // Use VAD Hook
  const vad = useVADRecording(vadMode, timeLimit * 1000);

  // --- Persistence Logic ---
  // Load state on mount
  useEffect(() => {
    const loadState = async () => {
      const savedSegments = await storageService.get<string[]>('segments');
      if (savedSegments) setSegments(savedSegments);

      const savedHistory = await storageService.get<any[]>('history');
      if (savedHistory) setHistory(savedHistory);

      const savedAudioHistory = await storageService.get<AudioHistoryItem[]>('audioHistory');
      if (savedAudioHistory) setAudioHistory(savedAudioHistory);
    };
    loadState();
  }, []);

  // Save state on changes
  useEffect(() => {
    storageService.set('segments', segments);
  }, [segments]);

  useEffect(() => {
    storageService.set('history', history);
  }, [history]);

  useEffect(() => {
    storageService.set('audioHistory', audioHistory);
  }, [audioHistory]);
  // -------------------------

  const handleModeChange = useCallback((mode: VADMode) => {
    if (mode === 'vad') {
      // Warning Dialog as requested
      const message =
        "⚠️ VAD Mode Warning / VAD 模式警告\n\n" +
        "Expectation / 期待:\n" +
        "Real-time audio segmentation whilst speaking.\n" +
        "用户说话时进行实时语音切分。\n\n" +
        "Bug Encountered / 遇到的问题:\n" +
        "The VAD model output dimension is 248 (raw logits), but the code expects 2 (probabilities). This mismatch causes the VAD to fail to detect speech.\n" +
        "VAD 模型输出维度是 248（原始 logits），但代码期望的是 2（概率）。这个不匹配导致 VAD 无法检测到语音。\n\n" +
        "Action Required / 需要的行动:\n" +
        "Needs a developer capable of fixing the ONNX tensor shape mismatch.\n" +
        "需要有能力的人来修复 ONNX 张量形状不匹配的问题。\n\n" +
        "The system will now revert to the previous mode.\n" +
        "系统将恢复到之前的模式。";

      window.alert(message);
      // Do not update state, effectively reverting/staying on previous mode
      return;
    }

    setVadModeState(mode);
    vad.setVadMode(mode);
  }, [vad]);

  // Update time limit in hook when UI changes
  useEffect(() => {
    vad.setTimeLimit(timeLimit * 1000);
  }, [timeLimit, vad]);

  // Handle Recording Toggle
  const toggleRecording = useCallback(async () => {
    if (isToggling) return;
    setIsToggling(true);

    try {
      if (vad.isRecording) {
        // --- STOPPING ---
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
        const currentSessionId = vad.sessionId;

        vad.stopRecording();
        await window.ipcRenderer.invoke('stop-recording');
        await window.ipcRenderer.invoke('log-message', 'info', 'Recording stopped by user.');

        // Queue count will be incremented when chunks are actually sent (see onChunkReady)

        // Save Audio File using Crash-Safe Temp File
        if (currentSessionId) {
          const result = await window.ipcRenderer.invoke('finalize-temp-recording', currentSessionId, savePath || null);

          if (result.success && result.filePath) {
            const newAudioItem = {
              timestamp: new Date().toLocaleString(),
              duration: Math.round(duration * 10) / 10,
              filePath: result.filePath
            };
            setAudioHistory(prev => [newAudioItem, ...prev].slice(0, maxAudioHistory));
          } else {
            await window.ipcRenderer.invoke('log-message', 'error', 'Failed to save audio: ' + result.error);
          }
        }
      } else {
        // --- STARTING ---
        recordingStartTimeRef.current = Date.now();

        await window.ipcRenderer.invoke('log-message', 'info', `User clicked record. Initializing VAD (Mode: ${vadMode})...`);

        const success = await vad.startRecording();

        if (success) {
          await window.ipcRenderer.invoke('start-recording');
          await window.ipcRenderer.invoke('log-message', 'info', 'Backend session started.');
        } else {
          await window.ipcRenderer.invoke('log-message', 'error', 'Failed to start local VAD. Backend session NOT started.');
        }
      }
    } catch (e) {
      console.error('Toggle recording failed:', e);
      window.ipcRenderer.invoke('log-message', 'error', `Toggle failed: ${e}`);
      window.ipcRenderer.invoke('write-debug-log', `[App-Error] Toggle Failed: ${e}`);
    } finally {
      setIsToggling(false);
    }
  }, [vad, isToggling, vadMode, savePath, maxAudioHistory]);

  // Handle Audio Chunks from VAD
  useEffect(() => {
    vad.onChunkReady((chunkIndex, audioData, _rawPCM) => {
      console.log(`Sending chunk #${chunkIndex}, size: ${audioData.byteLength}`);

      // LOG FLOW
      window.ipcRenderer.invoke('write-debug-log', `[App-Chunk] Received Chunk #${chunkIndex} from VAD. Size=${audioData.byteLength}. Sending to IPC...`);

      const base64 = arrayBufferToBase64(audioData);
      window.ipcRenderer.invoke('send-audio-chunk', base64);

      // Increment queue count when actually sending audio
      setQueueCount(prev => prev + 1);
    });
  }, [vad.onChunkReady]);

  // IPC Event Listeners
  useEffect(() => {
    const cleanupStatus = window.ipcRenderer.on('asr-status', (_event, s: string) => {
      setStatus(s as any);
    });

    const cleanupResult = window.ipcRenderer.on('asr-result', (_event, data: any) => {
      if (data.text) {
        if (data.is_final) {
          window.ipcRenderer.invoke('write-debug-log', `[App-Result] FINAL: "${data.text.substring(0, 50)}..."`);
          // FINAL RESULT
          const newItem = {
            timestamp: new Date().toLocaleTimeString(),
            text: data.text
          };

          // 1. Add to segments
          setSegments(prev => [...prev, data.text]);

          // 2. Add to History
          setHistory(prev => [newItem, ...prev].slice(0, maxTextHistory));

          // 3. Clear interim
          setInterimText('');

          // 4. Update Queue - Use chunk_count from backend if available
          const processedCount = data.chunk_count || 1;
          setQueueCount(prev => Math.max(0, prev - processedCount));
          setProcessingStatus('done');

          if (autoPaste) {
            window.ipcRenderer.invoke('insert-text', data.text);
          }
        } else {
          // INTERIM RESULT
          window.ipcRenderer.invoke('write-debug-log', `[App-Result] INTERIM: "${data.text.substring(0, 50)}..."`);
          setInterimText(data.text);
        }
      }
    });

    const cleanupProcessing = window.ipcRenderer.on('asr-processing', (_event, data: any) => {
      if (data.status) {
        setProcessingStatus(data.status as ProcessingStatus);
      }
    });

    const cleanupState = window.ipcRenderer.on('recording-state', (_event, state: boolean) => {
      if (!state && vad.isRecording) {
        toggleRecording();
      }
    });

    const cleanupError = window.ipcRenderer.on('asr-error', (_event, _msg: string) => {
      setProcessingStatus('idle');
      setQueueCount(prev => Math.max(0, prev - 1));
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.ctrlKey) {
        e.preventDefault();
        toggleRecording();
      }
      if (e.code === 'F9') {
        setShowSettings(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cleanupStatus();
      cleanupResult();
      cleanupProcessing();
      cleanupState();
      cleanupError();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleRecording, autoPaste, vad, maxTextHistory]);

  // Check for crash files on mount
  useEffect(() => {
    const checkCrashes = async () => {
      try {
        const res = await window.ipcRenderer.invoke('get-crash-files');
        if (res.success && res.files && res.files.length > 0) {
          console.log('Found crash files:', res.files);
          setCrashFiles(res.files);
          setShowRecovery(true);
        }
      } catch (e) {
        console.error('Failed to check for crashes:', e);
      }
    };
    checkCrashes();
  }, []);

  const handleRecoverFile = async (file: any) => {
    const res = await window.ipcRenderer.invoke('finalize-temp-recording', file.sessionId, savePath || null);
    if (res.success && res.filePath) {
      const newItem = {
        timestamp: new Date(file.time).toLocaleString() + ' (Recovered)',
        duration: 0,
        filePath: res.filePath
      };
      setAudioHistory(prev => [newItem, ...prev].slice(0, maxAudioHistory));
    } else {
      console.error('Failed to recover:', res.error);
      window.ipcRenderer.invoke('log-message', 'error', 'Recovery failed: ' + res.error);
    }
  };

  const handleDiscardFile = async (file: any) => {
    await window.ipcRenderer.invoke('discard-temp-recording', file.sessionId);
  };

  const handleInsert = (text: string) => {
    window.ipcRenderer.invoke('insert-text', text);
  };

  const handleClearWorkspace = async () => {
    // 1. Archive current segments to history if not empty
    if (segments.length > 0) {
      const fullText = segments.join('\n\n');
      const newHistoryItem = {
        timestamp: new Date().toLocaleString(),
        text: fullText
      };
      // We prepend to history (newest first)
      const updatedHistory = [newHistoryItem, ...history].slice(0, maxTextHistory);
      setHistory(updatedHistory);

      // Explicitly save immediately
      await storageService.set('history', updatedHistory);
    }

    // 2. Clear workspace
    setSegments([]);
    setInterimText('');
    setQueueCount(0);
    setProcessingStatus('idle');
    await storageService.set('segments', []);
  };

  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const [playingFilePath, setPlayingFilePath] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayAudio = async (filePath: string) => {
    if (playingFilePath === filePath && activeAudio) {
      if (isPlaying) {
        activeAudio.pause();
        setIsPlaying(false);
      } else {
        activeAudio.play().catch(e => console.error('Resume failed:', e));
        setIsPlaying(true);
      }
      return;
    }

    if (activeAudio) {
      activeAudio.pause();
      setActiveAudio(null);
      setPlayingFilePath(null);
      setIsPlaying(false);
    }

    console.log('Playing audio file:', filePath);
    const result = await window.ipcRenderer.invoke('read-audio-file', filePath);
    if (result.success && result.base64) {
      const audio = new Audio(`data:audio/wav;base64,${result.base64}`);

      audio.onended = () => {
        setIsPlaying(false);
      };
      audio.onpause = () => {
        setIsPlaying(false);
      };
      audio.onplay = () => {
        setIsPlaying(true);
      };

      try {
        await audio.play();
        setActiveAudio(audio);
        setPlayingFilePath(filePath);
        setIsPlaying(true);
      } catch (e) {
        console.error('Playback failed:', e);
      }
    } else {
      console.error('Failed to load audio:', result.error);
      window.ipcRenderer.invoke('log-message', 'error', `Playback failed: ${result.error}`);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column', position: 'relative' }}>
      {showSettings && (
        <SettingsPanel
          currentMode={vadMode}
          onModeChange={handleModeChange}
          timeLimit={timeLimit}
          setTimeLimit={setTimeLimit}
          maxTextHistory={maxTextHistory}
          setMaxTextHistory={setMaxTextHistory}
          maxAudioHistory={maxAudioHistory}
          setMaxAudioHistory={setMaxAudioHistory}
          savePath={savePath}
          setSavePath={setSavePath}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showRecovery && (
        <RecoveryModal
          files={crashFiles}
          onRecover={handleRecoverFile}
          onDiscard={handleDiscardFile}
          onClose={() => setShowRecovery(false)}
        />
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <HistoryList
          history={history}
          audioHistory={audioHistory}
          onInsert={handleInsert}
          onPlayAudio={handlePlayAudio}
          playingFilePath={playingFilePath}
          isPlaying={isPlaying}
          onOpenSettings={() => setShowSettings(true)}
        />
        <TranscriptionPane
          segments={segments}
          interimText={interimText}
          isRecording={vad.isRecording}
          onToggleRecording={toggleRecording}
          onClear={handleClearWorkspace}
          autoPaste={autoPaste}
          processingStatus={processingStatus}
          isLoading={isToggling}
          queueCount={queueCount}
          stream={vad.stream}
        />
      </div>
      <StatusBar status={status} />

      {vad.error && (
        <div style={{ position: 'absolute', bottom: 40, right: 10, background: 'red', color: 'white', padding: 5 }}>
          {vad.error}
        </div>
      )}
    </div>
  );
}

export default App;
