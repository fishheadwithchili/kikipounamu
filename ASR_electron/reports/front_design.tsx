import React, { useState, useRef, useMemo, useCallback } from 'react';
import { 
  Mic, Square, Settings, History, FileAudio, Copy, Trash2, 
  MoreHorizontal, ChevronLeft, Search, Plus, Type, Check, 
  Play, Pause, Clock, X, FolderOpen, Loader2, AlertTriangle, 
  Users, Info, AlertCircle, Zap, Calendar, MoreVertical 
} from 'lucide-react';

/**
 * ==============================================================================
 * 📦 PROJECT DEPENDENCIES & CONFIGURATION
 * * Target Framework: React 18.2.0+
 * Styling: Tailwind CSS v3.3+
 * Icons: Lucide React v0.263+
 * * Key Features:
 * - Hydro-Dynamic Physics Interactions (Custom Hook/Component)
 * - Glassmorphism UI (Backdrop filters, translucent layers)
 * - React 18 Concurrent Features (Automatic Batching implicit)
 * - Chaos Monkey Testing Mode (Hidden feature on 'Select' button)
 * - Zero Layout Shift Selection Mode (Glow borders instead of checkboxes)
 * ==============================================================================
 */

// --- Constants ---
const ANIMATION_TIMING = {
  FAST: 50,   // ms for impact
  SLOW: 500,  // ms for release
  TOAST: 2000 // ms for copy feedback
};

// --- Types & Interfaces ---
type Tab = 'text' | 'audio';
type ViewMode = 'edit' | 'select';
type AppStatus = 'idle' | 'recording' | 'processing' | 'queued' | 'error' | 'warning' | 'info';

interface Session {
  id: number;
  text: string;
}

interface HydroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  className?: string;
}

// ==========================================
// 1. UI COMPONENT LIBRARY
// ==========================================

/**
 * HydroButton Component
 * * A specialized button that simulates fluid physics when pressed.
 * It calculates the mouse position relative to the button center
 * to apply a 3D tilt effect towards the finger/cursor.
 */
const HydroButton = React.memo(({ children, className = '', onClick, disabled, ...props }: HydroButtonProps) => {
  const [transformStyle, setTransformStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate distance from center to determine tilt angle
    const x = e.clientX - rect.left - centerX; 
    const y = e.clientY - rect.top - centerY;
    
    // Max tilt set to 12 degrees for visible but subtle effect
    const rotateX = -1 * ((y / centerY) * 12); 
    const rotateY = (x / centerX) * 12;

    setTransformStyle({
      // Fast transition (0.05s) for immediate "impact" feel
      transition: `transform ${ANIMATION_TIMING.FAST}ms ease-out`, 
      transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(0.96) translateY(4px)`,
    });
  }, [disabled]);

  const handleMouseUp = useCallback(() => {
    setTransformStyle({
      // Slower, elastic bezier curve for "buoyant" release feel
      transition: `transform ${ANIMATION_TIMING.SLOW}ms cubic-bezier(0.34, 1.56, 0.64, 1)`, 
      transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1) translateY(0)',
    });
  }, []);

  return (
    <button
      ref={buttonRef}
      className={`${className} transition-shadow duration-300`} 
      style={transformStyle}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
});

/**
 * Logo3D Component
 * * A purely decorative component representing the app brand.
 * Features a continuous 3D float animation using CSS keyframes.
 * Wrapped in React.memo to prevent re-renders during app state changes.
 */
const Logo3D = React.memo(() => (
  <div className="relative group cursor-pointer" style={{ perspective: '800px' }} aria-label="App Logo">
    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center shadow-lg animate-float3d relative z-10" style={{ transformStyle: 'preserve-3d' }}>
      <div className="text-white drop-shadow-md"><Zap size={18} fill="currentColor"/></div>
      {/* Glossy Overlay */}
      <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-white/40 via-transparent to-transparent opacity-80 pointer-events-none"></div>
      <div className="absolute inset-0 rounded-lg border border-white/20 pointer-events-none"></div>
    </div>
    {/* Dynamic Shadow */}
    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-1 bg-indigo-500/30 blur-md rounded-full animate-shadow-breathe"></div>
  </div>
));

/**
 * AlertOverlay Component
 * * A modal system for displaying critical states (Error, Warning, Info).
 * Features a glassmorphism backdrop blur and specific animations per type.
 */
interface AlertOverlayProps {
  type: 'error' | 'warning' | 'info';
  onDismiss: () => void;
}

const AlertOverlay = ({ type, onDismiss }: AlertOverlayProps) => {
  const config = useMemo(() => ({
    error: { icon: <AlertTriangle size={36}/>, color: 'bg-red-500', title: 'Device Conflict', desc: 'Audio device busy.', button: 'bg-red-500 hover:bg-red-600', animation: 'animate-float-error' },
    warning: { icon: <AlertCircle size={36}/>, color: 'bg-orange-500', title: 'System Overload', desc: 'Slow down interaction.', button: 'bg-orange-500 hover:bg-orange-600', animation: 'animate-float-warning' },
    info: { icon: <Info size={36}/>, color: 'bg-blue-500', title: 'Calibrated', desc: 'Sensitivity adjusted.', button: 'bg-blue-500 hover:bg-blue-600', animation: 'animate-float-info' }
  }[type]), [type]);
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300 select-none" role="dialog" aria-modal="true">
      <div className={`relative w-full max-w-sm mx-4 p-1 rounded-[2rem] bg-gradient-to-b from-white/10 to-transparent shadow-2xl scale-100 animate-in zoom-in-95 duration-300`}>
        <div className="bg-[#161922] rounded-[1.8rem] border border-white/10 p-8 flex flex-col items-center text-center overflow-hidden relative">
          <div className={`absolute top-0 inset-x-0 h-32 ${config.color} blur-3xl rounded-full -translate-y-1/2 opacity-20`}></div>
          {/* Animated Icon Container */}
          <div className={`relative w-20 h-20 rounded-3xl ${config.color} flex items-center justify-center shadow-2xl mb-6 ${config.animation} text-white`}>
              {config.icon}
              <div className="absolute inset-0 rounded-3xl border border-white/20"></div>
          </div>
          <h3 className="text-xl font-bold text-white mb-3">{config.title}</h3>
          <p className="text-slate-400 text-sm mb-8">{config.desc}</p>
          <HydroButton onClick={onDismiss} className={`w-full py-3.5 rounded-xl font-semibold text-white ${config.button}`}>Understood</HydroButton>
        </div>
      </div>
    </div>
  );
};

/**
 * SettingsModal Component
 * * Displays app configuration. Re-integrated detailed UI elements.
 */
const SettingsModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-300" role="dialog" aria-label="Settings">
    <div className="relative bg-gray-900/60 backdrop-blur-2xl w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        {/* Decorative Top Glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-70"></div>
        
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <HydroButton onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-white" aria-label="Close Settings"><X size={20} /></HydroButton>
        </div>
        
        {/* Configuration Options */}
        <div className="p-6 space-y-6">
          {/* VAD Selection */}
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">VAD Mode</label>
            <div className="grid grid-cols-1 gap-3">
              <HydroButton className="relative p-4 rounded-2xl bg-blue-500/20 border border-blue-400/30 cursor-pointer hover:bg-blue-500/30 transition-all group shadow-[0_0_15px_rgba(59,130,246,0.15)] w-full text-left">
                <div className="flex items-start gap-3">
                  <div className="mt-1 w-4 h-4 rounded-full border-2 border-blue-400 bg-blue-500 flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                    <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                  </div>
                  <div>
                    <h3 className="text-white font-medium">Unlimited (No Auto-Cut)</h3>
                    <p className="text-blue-200/70 text-sm mt-1">Best for long stream dictation.</p>
                  </div>
                </div>
              </HydroButton>
              <HydroButton className="relative p-4 rounded-2xl bg-white/5 border border-white/5 cursor-pointer hover:border-white/10 hover:bg-white/10 transition-all group w-full text-left">
                 <div className="flex items-start gap-3">
                  <div className="mt-1 w-4 h-4 rounded-full border-2 border-white/20 group-hover:border-white/40 transition-colors"></div>
                  <div>
                    <h3 className="text-white/80 font-medium">Time Limit</h3>
                    <p className="text-white/40 text-sm mt-1">Forces a cut after a set duration.</p>
                  </div>
                </div>
              </HydroButton>
            </div>
          </div>
          {/* Path & Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Max Text Items</label>
              <input type="number" defaultValue={100} className="w-full bg-black/20 border border-white/10 rounded-xl p-2.5 text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all backdrop-blur-md" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Max Audio Items</label>
              <input type="number" defaultValue={10} className="w-full bg-black/20 border border-white/10 rounded-xl p-2.5 text-white focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all backdrop-blur-md" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">Audio Storage Path</label>
            <div className="flex gap-2">
              <input type="text" defaultValue="/home/tiger/ASR_Recordings" className="flex-1 bg-black/20 border border-white/10 rounded-xl p-2.5 text-white/70 font-mono text-sm focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all backdrop-blur-md" />
              <HydroButton className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 transition-all" aria-label="Choose Folder"><FolderOpen size={18} /></HydroButton>
            </div>
          </div>
        </div>

        <div className="p-4 bg-black/20 border-t border-white/5 flex justify-end gap-3">
          <HydroButton onClick={onClose} className="px-4 py-2 text-white/60 hover:text-white transition-colors text-sm font-medium">Cancel</HydroButton>
          <HydroButton onClick={onClose} className="px-6 py-2 bg-white text-black hover:bg-gray-200 rounded-full font-semibold shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all text-sm">Save Changes</HydroButton>
        </div>
    </div>
  </div>
);

// ==========================================
// 2. LOGIC SERVICE LAYER (Custom Hooks)
// ==========================================

/**
 * useAudioSession Hook
 * * Manages the state machine for audio recording:
 * Idle -> Recording -> Queued -> Processing -> Idle
 */
const useAudioSession = (onNewTranscription: (text: string) => void) => {
  const [status, setStatus] = useState<AppStatus>('idle');
  const [queuePosition, setQueuePosition] = useState(0);
  const processTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Safely clear any pending timeouts
  const clearTimers = useCallback(() => {
    if (processTimerRef.current) {
      clearTimeout(processTimerRef.current);
      processTimerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    clearTimers();
    if (status === 'idle') {
      setStatus('recording');
    } else if (status === 'recording') {
      // Simulate backend queue and processing delay
      setStatus('queued');
      setQueuePosition(2);
      processTimerRef.current = setTimeout(() => {
        setQueuePosition(1);
        processTimerRef.current = setTimeout(() => {
          setStatus('processing');
          processTimerRef.current = setTimeout(() => {
            // Callback to add mock data
            onNewTranscription('This is the new text you just recorded. It appears as a new block at the top.');
            setStatus('idle');
            processTimerRef.current = null;
          }, 2000); 
        }, 1000); 
      }, 1000); 
    }
  }, [status, onNewTranscription, clearTimers]);

  const forceStop = useCallback(() => {
    clearTimers();
  }, [clearTimers]);

  return { status, queuePosition, startRecording, setStatus, forceStop };
};

/**
 * useTranscriptionData Hook
 * * Manages the list of transcription sessions.
 */
const useTranscriptionData = () => {
  const [sessions, setSessions] = useState<Session[]>([
    { id: 1, text: "Okay, looking at the scrollbar design now. It needs to be subtle but interactive." },
    { id: 2, text: "The client mentioned they want the blocks to be distinct. Each recording session should be its own island." },
    { id: 3, text: "What if the logo floats? Like in water? We need to implement that physics effect." },
    { id: 4, text: "Don't forget to check the error states. The red popup needs to be modal." },
    { id: 5, text: "This is a stress test for the scrolling mechanism. We need to ensure that when there is a lot of text, the performance remains smooth." },
    { id: 6, text: "测试中文内容的显示效果。这里是一段关于人工智能发展的简短讨论，旨在测试字体渲染和行高是否合适。" },
    { id: 7, text: "Another short clip. Just checking the spacing." },
    { id: 8, text: "I'm thinking about the padding again. Maybe 8px vertical is perfect." },
    { id: 9, text: "这里是另一个中文测试块。我们需要确保中英文混排的时候，界面的整洁度依然能够保持。" },
    { id: 10, text: "Scrolling down... scrolling down... The mask gradient at the bottom should be visible now." },
    { id: 11, text: "Meeting notes: 1. Launch date confirmed. 2. Assets are ready." },
    { id: 12, text: "Technical discussion: We need to optimize the React rendering cycle." },
    { id: 13, text: "Short thought." },
    { id: 14, text: "A slightly longer thought that spans maybe two or three lines." },
    { id: 15, text: "Final check on the physics engine. The buttons feel great." }
  ]);

  const addSession = useCallback((text: string) => {
    setSessions(prev => [{ id: Date.now(), text }, ...prev]);
  }, []);

  return { sessions, addSession };
};

/**
 * useChaosMonkey Hook
 * * A fun testing utility. Triggers random errors if a button is clicked too rapidly.
 * Useful for testing error boundary UIs or toast notifications.
 */
const useChaosMonkey = (onTrigger: (type: 'error' | 'warning' | 'info') => void, onSafeAction: () => void) => {
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);

  const handleClick = useCallback(() => {
    const now = Date.now();
    // Reset count if clicks are more than 1s apart
    if (now - lastClickTimeRef.current > 1000) clickCountRef.current = 0;
    clickCountRef.current += 1;
    lastClickTimeRef.current = now;

    // Trigger chaos on 4th rapid click
    if (clickCountRef.current > 3) {
      if (window.getSelection) window.getSelection()?.removeAllRanges(); 
      const random = Math.random();
      const type = random < 0.33 ? 'error' : random < 0.66 ? 'warning' : 'info';
      onTrigger(type);
      clickCountRef.current = 0;
    } else {
      onSafeAction();
    }
  }, [onTrigger, onSafeAction]);

  return handleClick;
};

// ==========================================
// 3. FEATURE COMPONENTS
// ==========================================

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onSettings: () => void;
}

const Sidebar = React.memo(({ activeTab, setActiveTab, onSettings }: SidebarProps) => {
  const [copiedId, setCopiedId] = useState<number | null>(null);
  
  // Memoized list items to prevent re-generation on render
  const items = useMemo(() => Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    label: activeTab === 'text' 
      ? (i === 0 ? 'Scroll down to see the sidebar scrollbar...' : `History Item #${i + 1}...`)
      : `Recording_${1000 + i}.wav`,
    meta: activeTab === 'text' ? '4:30 PM' : '00:45'
  })), [activeTab]);

  const handleCopy = useCallback((id: number) => {
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), ANIMATION_TIMING.TOAST);
  }, []);

  return (
    <div className={`relative z-10 flex flex-col border-r border-white/10 bg-gray-900/30 backdrop-blur-xl w-80 h-full`}>
      {/* Sidebar Header */}
      <div className="p-5 space-y-5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Logo3D />
          <div>
            <h2 className="font-semibold text-white/90 tracking-wide">ASR Pro</h2>
            <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase">Version 2.0</p>
          </div>
        </div>
        {/* Tab Switcher */}
        <div className="flex bg-black/20 p-1 rounded-lg border border-white/5 backdrop-blur-md" role="tablist">
          {(['text', 'audio'] as const).map(tab => (
            <HydroButton 
              key={tab} 
              onClick={() => setActiveTab(tab)} 
              role="tab"
              aria-selected={activeTab === tab}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === tab ? 'bg-white/10 text-white shadow-sm ring-1 ring-white/10' : 'text-white/50 hover:text-white/80'}`}
            >
              {tab === 'text' ? <Type size={14} /> : <FileAudio size={14} />} 
              {tab === 'text' ? 'Text' : 'Audio'}
            </HydroButton>
          ))}
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto px-3 space-y-1.5 custom-scrollbar pr-1">
        {items.map((item) => (
          <div key={item.id} className="group p-3.5 rounded-xl cursor-pointer hover:bg-white/10 border border-transparent transition-all relative backdrop-blur-sm btn-hydro">
            <div className="flex justify-between items-start mb-1.5">
              <div className="flex flex-col"><span className="text-xs font-medium text-white/60">{item.meta}</span></div>
              {/* Copy Button with Fixed Width to prevent Layout Shift */}
              <HydroButton onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleCopy(item.id); }} className={`text-[10px] border h-6 w-16 rounded-full transition-all flex items-center justify-center gap-1 ${copiedId === item.id ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-white/30 border-white/10 hover:text-blue-300 hover:border-blue-500/30 hover:bg-blue-500/10'}`}>
                {copiedId === item.id ? <Check size={10} /> : <Copy size={10} />}
                {copiedId === item.id ? 'Copied' : 'Copy'}
              </HydroButton>
            </div>
            <p className="text-sm text-white/80 line-clamp-2 leading-relaxed group-hover:text-white transition-colors mt-1">{item.label}</p>
          </div>
        ))}
      </div>
      
      {/* Sidebar Footer */}
      <div className="p-4 border-t border-white/5 bg-black/10 backdrop-blur-md flex-shrink-0">
        <HydroButton onClick={onSettings} className="flex items-center gap-3 w-full p-2.5 rounded-xl text-white/60 hover:bg-white/10 hover:text-white transition-all text-sm font-medium"><Settings size={18} /> Settings</HydroButton>
      </div>
    </div>
  );
});

interface WorkspaceProps {
  sessions: Session[];
  viewMode: ViewMode;
  selectedIds: number[];
  onToggleSelect: (id: number) => void;
}

// Workspace Component: Renders session blocks and handles selection logic
const Workspace = React.memo(({ sessions, viewMode, selectedIds, onToggleSelect }: WorkspaceProps) => (
  <main className="flex-1 overflow-y-auto p-4 md:p-8 relative custom-scrollbar mask-gradient">
    <div className="max-w-4xl mx-auto space-y-2 pb-40 pt-4">
      {sessions.map((session) => {
        const isSelected = selectedIds.includes(session.id);
        const isSelectMode = viewMode === 'select';
        
        return (
          <div 
            key={session.id} 
            onClick={() => isSelectMode && onToggleSelect(session.id)}
            className={`group relative border rounded-2xl px-4 py-2 transition-all duration-300 
              ${isSelectMode ? 'cursor-pointer' : 'hover:bg-white/10 hover:border-white/10'}
              ${isSelected 
                ? 'bg-blue-500/10 border-blue-400/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]' // Active: Glow + Blue Tint
                : 'bg-white/5 border-white/5'}
            `}
          >
            {/* Active Indicator Bar (Left Side) 
              - Slides in from left when selected
              - Adds a physical "charging" feel
            */}
            <div className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-blue-400/80 shadow-[0_0_10px_rgba(59,130,246,0.8)] transition-all duration-300
              ${isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}
            `}></div>

            {/* Content Container
              - 'pl-2' adds breathing room for the indicator bar
              - 'select-text' allows native text selection for copying
            */}
            <div className="text-lg leading-relaxed text-white/90 font-light tracking-wide whitespace-pre-wrap select-text cursor-text flex-1 pl-2">
              {session.text}
            </div>
          </div>
        );
      })}
    </div>
  </main>
));

interface ControlDockProps {
  status: AppStatus;
  queuePosition: number;
  onRecordToggle: () => void;
}

const ControlDock = React.memo(({ status, queuePosition, onRecordToggle }: ControlDockProps) => (
  <div className="pointer-events-auto flex items-center gap-6 bg-gray-900/50 backdrop-blur-2xl border border-white/10 px-8 py-4 rounded-[2rem] shadow-[0_10px_40px_rgba(0,0,0,0.3)] hover:bg-gray-900/60 transition-colors w-full max-w-2xl">
    {/* Main Record Button */}
    <HydroButton onClick={onRecordToggle} aria-label={status === 'recording' ? "Stop Recording" : "Start Recording"} className={`relative group flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-300 select-none ${status === 'recording' ? 'bg-red-500 hover:bg-red-600' : 'bg-white hover:bg-gray-200'}`}>
      {status === 'recording' && <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-30 animate-ping"></span>}
      {status === 'recording' ? <Square fill="currentColor" className="text-white relative z-10" size={20} /> : <Mic className="text-black relative z-10" size={24} />}
    </HydroButton>
    
    {/* Audio Visualizer Area */}
    <div className="flex-1 h-10 flex items-center justify-between">
      {status === 'recording' ? (
        <div className="flex items-center justify-center gap-1.5 h-full w-full px-4">{[...Array(25)].map((_, i) => (<div key={i} className="w-1.5 bg-gradient-to-t from-blue-500 to-purple-500 rounded-full animate-wave" style={{height: `${Math.random() * 80 + 20}%`, animationDuration: `${Math.random() * 0.4 + 0.4}s`}}></div>))}</div>
      ) : (
        <div className="w-full text-center text-white/50 text-sm">Tap microphone to speak</div>
      )}
    </div>
    
    {/* Status Indicators (Simple text + dot) */}
    <div className="flex items-center gap-3 min-w-[80px] justify-end">
        <span className={`w-1.5 h-1.5 rounded-full ${status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}></span>
        <span className="text-xs font-medium text-white/40 tracking-wider uppercase font-mono">
          {status === 'recording' ? '00:04' : 'Ready'}
        </span>
    </div>
  </div>
));

interface SelectionDockProps {
  selectedCount: number;
  onCancel: () => void;
  onDelete: () => void;
}

const SelectionDock = React.memo(({ selectedCount, onCancel, onDelete }: SelectionDockProps) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(() => {
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, ANIMATION_TIMING.TOAST);
  }, []);

  return (
    <div className="pointer-events-auto flex items-center gap-2 bg-gray-900/90 backdrop-blur-2xl border border-white/10 px-4 py-2 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-10 fade-in duration-300">
      <div className="px-4 text-sm font-semibold text-white border-r border-white/10 mr-1">
        {selectedCount} Selected
      </div>
      
      {/* Copy Button with Fixed Width to prevent Layout Shift */}
      <HydroButton 
        onClick={handleCopy}
        className={`flex items-center justify-center gap-2 w-28 px-4 py-2 rounded-full transition-all text-sm font-medium
          ${isCopied ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'hover:bg-white/10 text-white/90 hover:text-white'}
        `}
      >
        {isCopied ? <Check size={16} /> : <Copy size={16} />} 
        {isCopied ? 'Copied' : 'Copy'}
      </HydroButton>
      
      <HydroButton onClick={onDelete} className="flex items-center gap-2 px-4 py-2 hover:bg-red-500/20 hover:text-red-400 rounded-full text-white/90 transition-all text-sm font-medium group">
        <Trash2 size={16} className="group-hover:animate-bounce" /> Delete
      </HydroButton>
      <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
      <HydroButton onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-all">
        <X size={18} />
      </HydroButton>
    </div>
  );
});

// ==========================================
// 4. MAIN APP COMPONENT (Orchestrator)
// ==========================================

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const [showHistory, setShowHistory] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Initialize Custom Hooks
  const { sessions, addSession } = useTranscriptionData();
  const { status, queuePosition, startRecording, setStatus, forceStop } = useAudioSession(addSession);
  
  // Chaos Monkey for 'Select' Button
  const handleSelectClick = useChaosMonkey(
    (type) => {
      forceStop();
      setStatus(type as AppStatus);
    },
    () => {
      // Toggle Selection Mode Logic
      if (viewMode === 'edit') {
        setViewMode('select');
        setSelectedIds([]);
      } else {
        setViewMode('edit');
        setSelectedIds([]);
      }
    }
  );

  const toggleSessionSelect = useCallback((id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  return (
    <div className="relative flex h-screen w-full bg-black text-white font-sans selection:bg-blue-500/30 overflow-hidden">
      
      {/* Background Ambient Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-blue-900/30 blur-[120px] pointer-events-none animate-pulse"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] rounded-full bg-purple-900/30 blur-[120px] pointer-events-none animate-pulse" style={{animationDelay: '1s'}}></div>
      
      {/* Modals & Alerts */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {['error', 'warning', 'info'].includes(status) && <AlertOverlay type={status as any} onDismiss={() => setStatus('idle')} />}

      {/* Left Sidebar */}
      <div className={`transition-all duration-300 ${showHistory ? 'w-80' : 'w-0 opacity-0 overflow-hidden'}`}>
         <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onSettings={() => setShowSettings(true)} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative h-full z-10">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-6 z-10 mt-2 flex-shrink-0">
          <div className="flex items-center gap-4 bg-gray-900/40 backdrop-blur-xl border border-white/10 px-2 py-2 rounded-full shadow-lg">
            <HydroButton onClick={() => setShowHistory(!showHistory)} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-white transition-all">{showHistory ? <ChevronLeft size={20} /> : <History size={20} />}</HydroButton>
            <div className="h-4 w-[1px] bg-white/10"></div>
            <div className="px-2 pr-4 text-white/90 font-medium text-sm">
              {viewMode === 'select' ? 'Select Items' : 'Workspace'}
            </div>
          </div>
          <div className="flex items-center gap-3">
             <HydroButton 
               onClick={handleSelectClick} 
               className={`flex items-center gap-2 px-4 py-1.5 text-sm rounded-full transition-all border select-none
                 ${viewMode === 'select' ? 'bg-white text-black font-medium border-white hover:bg-gray-200' : 'text-white/70 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'}
               `}
             >
               {viewMode === 'select' ? <X size={16} /> : <Check size={16} />} 
               {viewMode === 'select' ? 'Cancel' : 'Select'}
             </HydroButton>
             {viewMode === 'edit' && (
                <HydroButton className="flex items-center gap-2 bg-white text-black hover:bg-gray-200 px-5 py-1.5 rounded-full text-sm font-semibold shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all">
                  <Plus size={16} /> New
                </HydroButton>
             )}
          </div>
        </header>

        {/* Dynamic Workspace */}
        <Workspace 
          sessions={sessions} 
          viewMode={viewMode} 
          selectedIds={selectedIds}
          onToggleSelect={toggleSessionSelect} 
        />

        {/* Footer Dock Switching Logic */}
        <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col items-center justify-end z-20 pointer-events-none">
          {viewMode === 'select' ? (
            <SelectionDock 
              selectedCount={selectedIds.length} 
              onCancel={() => { setViewMode('edit'); setSelectedIds([]); }} 
              onDelete={() => { /* Delete logic would go here */ }} 
            />
          ) : (
            <>
              {/* Queue/Processing Status Pill */}
              <div className={`mb-4 pointer-events-auto transition-all duration-500 transform ${['processing', 'queued'].includes(status) ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                  <div className="flex items-center gap-3 px-5 py-2.5 bg-gray-800/80 backdrop-blur-xl border border-white/10 rounded-full shadow-lg">
                    {status === 'queued' ? (
                        <><Users size={16} className="text-yellow-400" /><span className="text-sm text-white/90 font-medium">In Queue: <span className="text-yellow-400">{queuePosition} people ahead</span></span></>
                    ) : (
                        <><Loader2 size={16} className="text-blue-400 animate-spin" /><span className="text-sm text-white/90 font-medium">Processing transcription...</span></>
                    )}
                  </div>
              </div>
              <ControlDock status={status} queuePosition={queuePosition} onRecordToggle={startRecording} />
            </>
          )}
        </div>
      </div>

      {/* Global Styles */}
      <style>{`
        /* Thin, glassy scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 20px; border: 2px solid transparent; background-clip: content-box; transition: background 0.2s ease; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); border: 1px solid transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb:active { background: rgba(255, 255, 255, 0.5); border: 0px solid transparent; }
        
        /* Fade mask for scroll areas */
        .mask-gradient { mask-image: linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%); }
        
        /* Animation Keyframes */
        @keyframes wave { 0%, 100% { transform: scaleY(0.4); opacity: 0.5; } 50% { transform: scaleY(1.2); opacity: 1; } }
        .animate-wave { animation: wave 1s infinite ease-in-out; }
        @keyframes float3d { 0%, 100% { transform: translateY(0px) rotateX(0deg) rotateY(0deg); } 25% { transform: translateY(-4px) rotateX(3deg) rotateY(2deg); } 50% { transform: translateY(0px) rotateX(0deg) rotateY(0deg); } 75% { transform: translateY(4px) rotateX(-3deg) rotateY(-2deg); } }
        .animate-float3d { animation: float3d 6s ease-in-out infinite; }
        @keyframes shadowBreathe { 0%, 100% { transform: translateX(-50%) scaleX(1); opacity: 0.3; } 25% { transform: translateX(-50%) scaleX(0.8); opacity: 0.2; } 50% { transform: translateX(-50%) scaleX(1); opacity: 0.3; } 75% { transform: translateX(-50%) scaleX(1.1); opacity: 0.4; } }
        .animate-shadow-breathe { animation: shadowBreathe 6s ease-in-out infinite; }
        @keyframes float-info { 0%, 100% { transform: translateY(0px) rotate3d(0, 1, 0, 0deg); } 50% { transform: translateY(-12px) rotate3d(0, 1, 0, 15deg); } }
        .animate-float-info { animation: float-info 6s ease-in-out infinite; }
        @keyframes float-warning { 0%, 100% { transform: translateY(0px) rotateZ(-3deg); } 50% { transform: translateY(-8px) rotateZ(3deg); } }
        .animate-float-warning { animation: float-warning 2.5s ease-in-out infinite; }
        @keyframes float-error { 0%, 100% { transform: translateY(0px) scale(1) skewX(0deg); } 40% { transform: translateY(-5px) scale(1.02) skewX(2deg); } 60% { transform: translateY(2px) scale(0.98) skewX(-2deg); } }
        .animate-float-error { animation: float-error 1.5s ease-in-out infinite; }
      `}</style>
    </div>
  );
}