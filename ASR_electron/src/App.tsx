import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';
import { HistoryList, AudioHistoryItem } from './components/HistoryList';
import { TranscriptionPane } from './components/TranscriptionPane';
import { SettingsPanel } from './components/SettingsPanel';
import { RecoveryModal } from './components/RecoveryModal';
import { AlertOverlay, AlertType } from './components/AlertOverlay';
import { TrafficLights } from './components/TrafficLights';
import { useVADRecording, VADMode } from './hooks/useVADRecording';
import { arrayBufferToBase64 } from './utils/audioHelper';
import { storageService } from './services/storage';

import { useAppIpcListeners, ProcessingStatus } from './hooks/useAppIpcListeners';
import welcomeVideo from './video/welcome.mp4';

// Removed local type definition in favor of imported one
// type ProcessingStatus = 'idle' | 'recording' | 'processing' | 'finalizing' | 'done';


function App() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'error' | 'connecting'>('connecting');
  const [history, setHistory] = useState<{ timestamp: string, text: string }[]>([]);
  const [audioHistory, setAudioHistory] = useState<AudioHistoryItem[]>([]);
  const [showWelcome, setShowWelcome] = useState(true);

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
  const [showHistory, setShowHistory] = useState(true);
  const [vadMode, setVadModeState] = useState<VADMode>('unlimited');
  const [timeLimit, setTimeLimit] = useState(180); // Default 3 minutes (180s)

  // New Settings
  const [maxTextHistory, setMaxTextHistory] = useState(100);
  const [maxAudioHistory, setMaxAudioHistory] = useState(10);
  const [savePath, setSavePath] = useState('');

  // Alert State
  const [alertState, setAlertState] = useState<{ type: AlertType, title?: string, description?: string } | null>(null);

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
      // Warning Dialog using new AlertOverlay
      setAlertState({
        type: 'warning',
        title: 'VAD Mode Warning',
        description: "The VAD model output dimension mismatch (248 vs 2) prevents speech detection. System will revert to previous mode."
      });
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
            setAlertState({
              type: 'error',
              title: 'Save Failed',
              description: `Failed to save audio: ${result.error}`
            });
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
          setAlertState({
            type: 'error',
            title: 'Initialization Failed',
            description: "Failed to start local VAD. Check microphone permissions."
          });
        }
      }
    } catch (e) {
      console.error('Toggle recording failed:', e);
      window.ipcRenderer.invoke('log-message', 'error', `Toggle failed: ${e}`);
      window.ipcRenderer.invoke('write-debug-log', `[App-Error] Toggle Failed: ${e}`);
      setAlertState({
        type: 'error',
        title: 'System Error',
        description: `An unexpected error occurred: ${e}`
      });
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

  // IPC Event Listeners - Extracted to Custom Hook
  useAppIpcListeners({
    setStatus,
    setProcessingStatus,
    setQueueCount,
    setSegments,
    setInterimText,
    setAlertState,
    toggleRecording,
    vad,
    autoPaste,
    maxTextHistory
  });

  useEffect(() => {
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
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleRecording]);


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
      setAlertState({
        type: 'error',
        title: 'Recovery Failed',
        description: res.error
      });
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
      setAlertState({
        type: 'error',
        title: 'Playback Error',
        description: result.error
      });
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900 text-white font-sans" style={{
      fontFamily: "'Inter', sans-serif"
    }}>
      {/* Ambient Background Blobs - Animated */}
      <div style={{
        position: 'absolute',
        top: '-20%',
        right: '-10%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(100px)',
        zIndex: 0,
        animation: 'ambientPulse 8s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        zIndex: 0,
        animation: 'ambientPulse 8s ease-in-out infinite 4s',
        pointerEvents: 'none'
      }} />

      {/* Global Drag Area - Top Bar */}
      {/* FIX: will-change and transform3d force isolated layer to prevent WSL2 offset bug */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '38px',
        zIndex: 100,
        willChange: 'transform', // Force isolated rendering layer
        transform: 'translate3d(0,0,0)', // Force GPU layer
        backfaceVisibility: 'hidden', // Prevent subpixel rendering issues
        ...({ WebkitAppRegion: 'drag' } as any)
      }} />

      {/* Traffic Lights - Window Level */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '14px',
        zIndex: 110,
        willChange: 'transform', // Isolated layer
        transform: 'translate3d(0,0,0)',
        ...({ WebkitAppRegion: 'no-drag' } as any)
      }}>
        <TrafficLights />
      </div>

      {/* Main Content - FIXED Positioning (Viewport Anchor) */}
      <div style={{
        position: 'fixed',
        top: '38px',
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
        zIndex: 10
      }}>
        {/* Sidebar - Fixed Left */}
        <div style={{
          position: 'fixed',
          top: '38px', // Below drag bar
          left: 0,
          width: showHistory ? '320px' : '0px',
          bottom: 0,
          zIndex: 20,
          opacity: showHistory ? 1 : 0,
          pointerEvents: showHistory ? 'auto' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden'
        }}>
          <HistoryList
            history={history}
            audioHistory={audioHistory}
            onInsert={handleInsert}
            onPlayAudio={handlePlayAudio}
            playingFilePath={playingFilePath}
            isPlaying={isPlaying}
            onOpenSettings={() => setShowSettings(true)}
            connectionStatus={status}
          />
        </div>

        {/* Workspace - Fixed Right */}
        <div style={{
          position: 'fixed',
          top: '38px', // Below drag bar
          left: showHistory ? '320px' : '0px',
          right: 0,
          bottom: 0,
          zIndex: 10,
          transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <TranscriptionPane
            segments={segments}
            interimText={interimText}
            isRecording={vad.isRecording}
            onToggleRecording={toggleRecording}
            onClear={handleClearWorkspace}
            processingStatus={processingStatus}
            isLoading={isToggling}
            queueCount={queueCount}
            stream={vad.stream}
            showHistory={showHistory}
            onToggleHistory={() => setShowHistory(!showHistory)}
          />
        </div>
      </div>

      {/* Modals & Overlays */}
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

      {/* Alert System */}
      {alertState && (
        <AlertOverlay
          type={alertState.type}
          title={alertState.title}
          description={alertState.description}
          onDismiss={() => setAlertState(null)}
        />
      )}

      {vad.error && !alertState && (
        /* Fallback for VAD errors if alertState is not set yet */
        <AlertOverlay
          type="error"
          title="VAD Error"
          description={vad.error}
          onDismiss={() => { }}
        />
      )}

      {/* Startup Animation */}
      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeOut 0.5s ease-out forwards',
          animationDelay: '99s' // Hack to only fade out when we change class or unmount? No, we just unmount.
        }}>
          {/* We can use CSS transition for fade out if we used opacity state, but simple removal is fine for MP4 end */}
          <video
            src={welcomeVideo}
            autoPlay
            muted
            style={{
              width: 'auto',
              height: '100%',
              minWidth: '100%',
              maxWidth: 'none',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              objectFit: 'cover'
            }}
            onEnded={() => {
              // Optional: Fade out logic could be better, but direct removal is requested "finally disappear"
              setShowWelcome(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default App;
