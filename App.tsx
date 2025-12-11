//Furqan
import React, { useState, useEffect, useRef } from 'react';
import { UserSettings, AppView, SessionState, Participant, AvatarId, PingEvent } from './types';
import { AVATARS, EMOJIS, MAX_USERS } from './constants';
import { Button } from './components/Button';
import { database } from './services/databaseService';
import { MonitoringService } from './components/MonitoringService';
import { CircleChart } from './components/CircleChart';
import { Activity, Radio, MousePointer, Keyboard, Share2, LogOut, Users, X, Loader2 } from 'lucide-react';

const App = () => {
    // --- Global State ---
    const [view, setView] = useState<AppView>('onboarding');
    const [userSettings, setUserSettings] = useState<UserSettings>({
        name: '',
        avatar: 'cyber-punk',
        monitoring: { camera: false, keyboard: false, mouse: false }
    });
    const [session, setSession] = useState<SessionState | null>(null);
    const [participants, setParticipants] = useState<Participant[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    // --- Workspace State ---
    const [elapsedTime, setElapsedTime] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [pingTargetId, setPingTargetId] = useState<string | null>(null);

    // Track visual overrides for pings (UserID -> Emoji)
    const [pingVisuals, setPingVisuals] = useState<Record<string, string>>({});
    // Track handled pings to avoid double sounds
    const processedPingIds = useRef<Set<string>>(new Set());
    
    // Track previous participants to detect joins/leaves
    const prevParticipantIds = useRef<string[]>([]);

    // --- Cleanup on tab close ---
    useEffect(() => {
        const cleanup = () => {
            if (currentUserId) {
                // Use sendBeacon with Blob for reliable cleanup on page unload. 
                // We send a POST with _method=DELETE because sendBeacon implies POST.
                const blob = new Blob([JSON.stringify({ _method: 'DELETE' })], { type: 'application/json' });
                navigator.sendBeacon(`/api/participants/${currentUserId}`, blob);
            }
        };

        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('pagehide', cleanup);

        return () => {
            window.removeEventListener('beforeunload', cleanup);
            window.removeEventListener('pagehide', cleanup);
        };
    }, [currentUserId]);

    // --- Audio Output (Sound Effects Only) ---
    const playTingSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
            osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.5);

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch (e) {
            console.error("Audio play failed", e);
        }
    };

    const playJoinSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            const now = ctx.currentTime;
            
            // Ascending Chime
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
            
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            
            osc.start();
            osc.stop(now + 0.4);
        } catch (e) {}
    };

    const playLeaveSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.type = 'sine';
            const now = ctx.currentTime;
            
            // Descending Chime
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
            
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            
            osc.start();
            osc.stop(now + 0.4);
        } catch (e) {}
    };

    // --- Onboarding Handlers ---
    const handleCreateUser = () => {
        // Validation
        const methodsCount = Object.values(userSettings.monitoring).filter(Boolean).length;
        if (methodsCount < 1) { // Relaxed to 1 for easier testing if desired, or keep 2
            alert("System Protocol: Require at least 1 monitoring module.");
            return;
        }
        if (!userSettings.name) {
            alert("Identify yourself, user.");
            return;
        }

        const newId = Math.random().toString(36).substring(2, 9);
        setCurrentUserId(newId);

        // Initial user state
        const myself: Participant = {
            id: newId,
            name: userSettings.name,
            avatar: userSettings.avatar,
            focusScore: 50,
            isSessionCreator: false,
            status: 'active',
            elapsedSeconds: 0
        };
        // Don't save yet, wait for session create/join
        setParticipants([myself]);
        setView('lobby');
    };

    const toggleMonitoring = (key: keyof UserSettings['monitoring']) => {
        setUserSettings(prev => ({
            ...prev,
            monitoring: { ...prev.monitoring, [key]: !prev.monitoring[key] }
        }));
    };

    // --- Session Handlers ---
    const handleCreateSession = async () => {
        if (isLoading) return;
        setIsLoading(true);

        const myself = participants.find(p => p.id === currentUserId);
        if (!myself) {
            console.error("User state missing");
            setIsLoading(false);
            return;
        }

        try {
            const newSession = await database.createSession();
            if (!newSession) throw new Error("Failed to create session");

            // Update local state temporarily before sync loop kicks in
            myself.isSessionCreator = true;

            await database.joinSession(newSession.id, myself);

            setSession(newSession);
            setElapsedTime(0);
            setView('workspace');
        } catch (e: any) {
            console.error(e);
            alert(e.message || "Failed to create session");
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoinSession = async () => {
        if (isLoading) return;
        setIsLoading(true);

        const myself = participants.find(p => p.id === currentUserId);
        if (!myself) {
            console.error("User state missing");
            setIsLoading(false);
            return;
        }

        try {
            const availableSessions = await database.getAvailableSessions();

            if (availableSessions.length === 0) {
                alert("No available sessions found. Please create a new session.");
                setIsLoading(false);
                return;
            }

            // Auto-join the most recent session
            const targetSession = availableSessions[0];
            const joinedSession = await database.joinSession(targetSession.id, myself);

            setSession(joinedSession);
            setElapsedTime(0);
            setView('workspace');
        } catch (e: any) {
            console.error(e);
            alert(e.message || "Failed to join session");
        } finally {
            setIsLoading(false);
        }
    };

    // --- Main Sync Loop ---
    // We need to write our state to DB and read others' state
    const stateRef = useRef({ participants, elapsedTime, isTimerRunning });
    useEffect(() => {
        stateRef.current = { participants, elapsedTime, isTimerRunning };
    }, [participants, elapsedTime, isTimerRunning]);

    useEffect(() => {
        if (view !== 'workspace' || !session) return;

        const interval = setInterval(async () => {
            const { participants, elapsedTime, isTimerRunning } = stateRef.current;
            if (!participants.length) return;

            const currentUserLocal = participants.find(p => p.id === currentUserId);
            if (!currentUserLocal) return;

            // 1. Prepare my updated state
            const updatedMe: Participant = {
                ...currentUserLocal,
                status: isTimerRunning ? 'active' : 'paused',
                elapsedSeconds: elapsedTime
                // focusScore is updated via MonitoringService -> handleMyActivityUpdate -> state -> here
            };

            // 2. Push my state to DB (HEARTBEAT)
            await database.updateParticipant(updatedMe);

            // 3. Fetch all participants
            const allParticipants = await database.getParticipants(session.id);

            // 4. Fetch incoming pings
            const pings = await database.getRecentPings(currentUserId);

            // 5. Handle Pings
            pings.forEach(ping => {
                if (!processedPingIds.current.has(ping.id)) {
                    // New Ping!
                    playTingSound();
                    processedPingIds.current.add(ping.id);

                    // Show emoji on the SENDER'S avatar
                    setPingVisuals(prev => ({
                        ...prev,
                        [ping.fromUserId]: ping.emoji
                    }));

                    // Clear visual after 3 seconds
                    setTimeout(() => {
                        setPingVisuals(prev => {
                            const next = { ...prev };
                            delete next[ping.fromUserId];
                            return next;
                        });
                    }, 3000);
                }
            });

            // 6. Merge remote data with local overrides
            const mergedParticipants = allParticipants.map(p => {
                if (p.id === currentUserId) return updatedMe;
                return p;
            });

            setParticipants(mergedParticipants);

        }, 1000);

        return () => clearInterval(interval);
    }, [view, session, currentUserId]);

    // --- Join/Leave Sound Effect Monitor ---
    useEffect(() => {
        if (view !== 'workspace') {
            prevParticipantIds.current = [];
            return;
        }

        const currentIds = participants.map(p => p.id);
        const prevIds = prevParticipantIds.current;

        // Skip sound on initial hydration of the list to prevent annoying blasts
        if (prevIds.length > 0) {
            const joined = currentIds.some(id => !prevIds.includes(id));
            const left = prevIds.some(id => !currentIds.includes(id));

            if (joined) playJoinSound();
            if (left) playLeaveSound();
        }

        prevParticipantIds.current = currentIds;
    }, [participants, view]);

    // --- Timer Loop ---
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isTimerRunning) {
            interval = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isTimerRunning]);

    const handleMyActivityUpdate = (newScore: number) => {
        setParticipants(prev => prev.map(p =>
            p.id === currentUserId ? { ...p, focusScore: newScore } : p
        ));
    };

    const handlePing = async (emoji: string) => {
        if (!pingTargetId) return;

        await database.sendPing(currentUserId, pingTargetId, emoji);

        const target = participants.find(p => p.id === pingTargetId);
        console.log(`Pinged ${target?.name}`);

        setPingTargetId(null);
    };

    // --- Views ---

    const renderOnboarding = () => (
        <div className="min-h-screen flex items-center justify-center relative p-4">
            {/* Background Grid */}
            <div className="absolute inset-0 z-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0a0a] to-black"></div>

            <div className="relative z-10 glass-panel p-8 md:p-12 rounded-2xl max-w-2xl w-full shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                <h1 className="text-5xl font-display font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-2">
                    WORKAHOLI
                </h1>
                <p className="text-slate-400 font-mono text-sm tracking-widest mb-10 border-b border-slate-800 pb-4">
                    DEPLOYMENT V1.0 // CACHE ACTIVE
                </p>

                <div className="space-y-8">
                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold text-cyan-500 tracking-wider">Codename</label>
                        <input
                            type="text"
                            value={userSettings.name}
                            onChange={(e) => setUserSettings({ ...userSettings, name: e.target.value })}
                            placeholder="ENTER_ID..."
                            className="w-full bg-slate-950 border border-slate-800 text-slate-100 p-4 rounded-lg focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono transition-all"
                        />
                    </div>

                    {/* Avatar Selection */}
                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold text-purple-500 tracking-wider">Avatar Manifest</label>
                        <div className="grid grid-cols-5 gap-4">
                            {(Object.keys(AVATARS) as AvatarId[]).map((id) => {
                                const AvatarData = AVATARS[id];
                                const Icon = AvatarData.icon;
                                const isSelected = userSettings.avatar === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => setUserSettings({ ...userSettings, avatar: id })}
                                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all duration-300 ${isSelected ? 'bg-slate-800 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-transparent border-slate-800 hover:border-slate-600'}`}
                                    >
                                        <Icon className={isSelected ? 'text-cyan-400' : 'text-slate-600'} size={24} />
                                        <span className={`text-[9px] mt-2 uppercase font-mono ${isSelected ? 'text-white' : 'text-slate-600'}`}>{AvatarData.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Monitoring Selection */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-end">
                            <label className="text-xs uppercase font-bold text-emerald-500 tracking-wider">Surveillance Modules</label>
                            <span className="text-[10px] text-slate-500">REQUIRED: 1+</span>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <button
                                onClick={() => toggleMonitoring('camera')}
                                className={`flex flex-col items-center justify-center space-y-2 p-4 rounded border transition-all ${userSettings.monitoring.camera ? 'bg-slate-900 border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-500 hover:bg-slate-900/50'}`}
                            >
                                <Radio size={24} />
                                <span className="font-mono text-xs">OPTICAL</span>
                            </button>
                            <button
                                onClick={() => toggleMonitoring('keyboard')}
                                className={`flex flex-col items-center justify-center space-y-2 p-4 rounded border transition-all ${userSettings.monitoring.keyboard ? 'bg-slate-900 border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-500 hover:bg-slate-900/50'}`}
                            >
                                <Keyboard size={24} />
                                <span className="font-mono text-xs">KEYS</span>
                            </button>
                            <button
                                onClick={() => toggleMonitoring('mouse')}
                                className={`flex flex-col items-center justify-center space-y-2 p-4 rounded border transition-all ${userSettings.monitoring.mouse ? 'bg-slate-900 border-emerald-500 text-emerald-400' : 'border-slate-800 text-slate-500 hover:bg-slate-900/50'}`}
                            >
                                <MousePointer size={24} />
                                <span className="font-mono text-xs">CURSOR</span>
                            </button>
                        </div>
                    </div>

                    <div className="pt-6">
                        <Button onClick={handleCreateUser} className="w-full" glow>Initialize Session</Button>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderLobby = () => (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-950 text-white relative overflow-hidden">
            {/* Animated Background Elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-900/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>

            {/* Content Container */}
            <div className="relative z-10 text-center space-y-8">
                <div className="mb-12">
                    <h2 className="text-3xl font-display font-bold">WELCOME, <span className="text-cyan-400">{userSettings.name}</span></h2>
                    <p className="text-slate-500 font-mono mt-2">SELECT OPERATION MODE</p>
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                    <div
                        onClick={handleCreateSession}
                        className={`group w-64 h-64 glass-panel rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${isLoading ? 'opacity-50 cursor-wait' : 'hover:border-cyan-500 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]'}`}
                    >
                        <div className="p-4 bg-slate-900 rounded-full mb-6 group-hover:scale-110 transition-transform">
                            {isLoading ? <Loader2 className="animate-spin text-cyan-400" size={40} /> : <Activity className="text-cyan-400" size={40} />}
                        </div>
                        <h3 className="text-xl font-bold font-display">NEW SESSION</h3>
                        <p className="text-xs text-slate-500 mt-2 font-mono text-center">INITIATE HOST PROTOCOLS</p>
                    </div>

                    <div
                        onClick={handleJoinSession}
                        className={`group w-64 h-64 glass-panel rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${isLoading ? 'opacity-50 cursor-wait' : 'hover:border-purple-500 hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]'}`}
                    >
                        <div className="p-4 bg-slate-900 rounded-full mb-6 group-hover:scale-110 transition-transform">
                             {isLoading ? <Loader2 className="animate-spin text-purple-400" size={40} /> : <Users className="text-purple-400" size={40} />}
                        </div>
                        <h3 className="text-xl font-bold font-display">JOIN SQUAD</h3>
                        <p className="text-xs text-slate-500 mt-2 font-mono text-center">AUTO-CONNECT SYSTEM</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderWorkspace = () => {
        const minutes = Math.floor(elapsedTime / 60);
        const seconds = elapsedTime % 60;

        return (
            <div className="min-h-screen bg-slate-950 relative overflow-hidden flex flex-col">
                <MonitoringService
                    settings={userSettings.monitoring}
                    isActive={isTimerRunning}
                    onActivityUpdate={handleMyActivityUpdate}
                />

                {/* Header / HUD */}
                <header className="p-6 grid grid-cols-3 items-center z-10 bg-slate-900/50 backdrop-blur-md border-b border-white/5 relative">
                    {/* Left: Branding */}
                    <div className="flex items-center space-x-4 justify-self-start">
                        <div className="w-10 h-10 bg-cyan-900/30 rounded flex items-center justify-center border border-cyan-500/30">
                            <Activity size={20} className="text-cyan-400" />
                        </div>
                        <div>
                            <h1 className="font-display font-bold text-lg tracking-widest text-slate-100">WORKAHOLI</h1>
                            <p className="text-[10px] font-mono text-slate-500">SESSION ID: <span className="text-cyan-400 select-all">{session?.id}</span></p>
                        </div>
                    </div>

                    {/* Center: Timer */}
                    <div className="justify-self-center">
                        <div className="bg-black/40 border border-slate-800 rounded px-6 py-2 font-mono text-2xl font-bold tracking-widest text-white shadow-inner min-w-[120px] text-center">
                            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center space-x-4 justify-self-end">
                        <Button
                            onClick={() => setIsTimerRunning(!isTimerRunning)}
                            variant={isTimerRunning ? 'danger' : 'primary'}
                            className="w-36"
                        >
                            {isTimerRunning ? 'PAUSE' : 'ACTIVATE'}
                        </Button>
                        <div className="flex items-center space-x-2 border-l border-slate-800 pl-4">
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(session?.id || '');
                                    alert("ID Copied to Clipboard");
                                }}
                                className="p-2 hover:text-cyan-400 transition-colors"
                            >
                                <Share2 size={20} />
                            </button>
                            <button onClick={() => setView('lobby')} className="p-2 hover:text-red-400 transition-colors"><LogOut size={20} /></button>
                        </div>
                    </div>
                </header>

                {/* Main Content Area */}
                <main className="flex-1 flex flex-col items-center justify-center relative p-8">
                    {/* Background Grid */}
                    <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.3)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>

                    {/* GLOBAL EMOJI BAR - Pops up when a user is selected */}
                    {pingTargetId && (
                        <div className="absolute top-40 left-1/2 -translate-x-1/2 z-30 animate-in slide-in-from-top-4 duration-300">
                            <div className="bg-slate-900/90 border border-cyan-500/50 rounded-full px-8 py-4 shadow-[0_0_50px_rgba(6,182,212,0.3)] backdrop-blur-xl flex items-center space-x-4">
                                <span className="text-xs font-mono text-cyan-400 mr-2 border-r border-slate-700 pr-4">
                                    SENDING SIGNAL TO: <span className="text-white font-bold">{participants.find(p => p.id === pingTargetId)?.name}</span>
                                </span>
                                <div className="flex space-x-2">
                                    {EMOJIS.map(emoji => (
                                        <button
                                            key={emoji}
                                            onClick={() => handlePing(emoji)}
                                            className="text-2xl hover:scale-125 transition-transform hover:bg-slate-800 rounded-full p-1"
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => setPingTargetId(null)}
                                    className="ml-4 text-slate-500 hover:text-red-400"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10 w-full max-w-[1400px]">
                        {participants.map(p => (
                            <div key={p.id} className="relative flex justify-center">
                                <CircleChart
                                    participant={p}
                                    isCurrentUser={p.id === currentUserId}
                                    onPingClick={(targetId) => setPingTargetId(targetId)}
                                    overrideStatus={p.id === currentUserId ? (isTimerRunning ? 'active' : 'paused') : undefined}
                                    overrideElapsedSeconds={p.id === currentUserId ? elapsedTime : undefined}
                                    pingEmojiOverride={pingVisuals[p.id]}
                                />
                            </div>
                        ))}

                        {/* Empty slots placeholders if less than 4 users */}
                        {Array.from({ length: Math.max(0, MAX_USERS - participants.length) }).map((_, i) => (
                            <div key={`empty-${i}`} className="flex flex-col items-center justify-center opacity-30">
                                <div className="w-[200px] h-[200px] rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
                                    <span className="font-mono text-xs text-slate-500">OPEN SLOT</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </main>

                {/* Footer Stats */}
                <footer className="h-16 border-t border-white/5 bg-slate-900/50 backdrop-blur flex items-center px-8 justify-between">
                    <div className="flex space-x-8 text-xs font-mono text-slate-500">
                        <span>SERVER: US-EAST-1 (DEPLOY_CACHE)</span>
                        <span className={isTimerRunning ? 'text-green-500 animate-pulse' : 'text-slate-500'}>
                            STATUS: {isTimerRunning ? 'SYNCED' : 'PAUSED'}
                        </span>
                    </div>
                    <div className="flex space-x-2">
                        <div className="flex items-end space-x-1 h-6">
                            {[40, 60, 30, 80, 50, 90, 70, 40].map((h, i) => (
                                <div key={i} style={{ height: `${h}%` }} className="w-1 bg-cyan-900/50 rounded-sm"></div>
                            ))}
                        </div>
                    </div>
                </footer>
            </div>
        );
    };

    return (
        <div className="antialiased text-slate-200 selection:bg-cyan-500/30">
            {view === 'onboarding' && renderOnboarding()}
            {view === 'lobby' && renderLobby()}
            {view === 'workspace' && renderWorkspace()}
        </div>
    );
};

export default App;