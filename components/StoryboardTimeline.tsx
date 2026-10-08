import React, { useState, useEffect, useRef } from 'react';
import { StoryboardFrame as StoryboardFrameType } from '../types.ts';
import { DownloadIcon, TrashIcon } from './icons.tsx';
import { 
    analyzeScriptEmotionalIntensityService, 
    EmotionalIntensityPoint 
} from '../services/geminiService.ts';

interface StoryboardTimelineProps {
    frames: StoryboardFrameType[];
    projectName?: string;
    onUpdateNote: (id: string, notes: string) => void;
    onRemove: (id: string) => void;
    onReorder: (startIndex: number, endIndex: number) => void;
    onUpdateFrame?: (id: string, updates: Partial<StoryboardFrameType>) => void;
}

const SHOT_TYPES = [
    'Wide Shot (WS)',
    'Close-Up (CU)',
    'Extreme Close-Up (ECU)',
    'Medium Shot (MS)',
    'Medium Close-Up (MCU)',
    'Establishing Shot',
    'Over-The-Shoulder (OTS)',
    'Point of View (POV)',
    'Tracking / Dolly',
    'Aerial / Drone',
    'Dutch Angle',
    'Low Angle Hero',
    'High Angle'
];

const TRANSITION_TYPES = [
    'Hard Cut',
    'Cross Dissolve (1.0s)',
    'Fade to Black (1.5s)',
    'Smash Cut',
    'Match Cut',
    'J-Cut (Audio Lead)',
    'L-Cut (Audio Lag)',
    'Wipe'
];

const AI_MODELS = [
    'Gemini 2.5 Flash Image',
    'Imagen 3 Cinema',
    'Mythos SDXL Cinema 4K',
    'Flux.1 Pro High-Def',
    'Gemini 3-Pro-Image'
];

// Format seconds into MM:SS or HH:MM:SS
const formatSecondsToTimecode = (totalSec: number): string => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = Math.floor(totalSec % 60);
    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const StoryboardTimeline: React.FC<StoryboardTimelineProps> = ({
    frames,
    projectName,
    onUpdateNote,
    onRemove,
    onReorder,
    onUpdateFrame
}) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const frameRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Timeline view settings
    const [cardWidth, setCardWidth] = useState<'compact' | 'standard' | 'expanded'>('standard');
    const [activeInspectorFrameId, setActiveInspectorFrameId] = useState<string | null>(null);
    const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

    // Playhead simulation state for pacing evaluation
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [activePlayingIndex, setActivePlayingIndex] = useState<number>(0);
    const [secondsInCurrentShot, setSecondsInCurrentShot] = useState<number>(0);

    // Emotional Intensity Curve calculated by Gemini based on script segment analysis
    const [intensityCurve, setIntensityCurve] = useState<EmotionalIntensityPoint[]>([]);
    const [isCalculatingIntensity, setIsCalculatingIntensity] = useState<boolean>(false);
    const [showIntensityCurve, setShowIntensityCurve] = useState<boolean>(true);

    // Auto-calculate or update emotional intensity curve when frames or their script segments change
    const frameSegmentsFingerprint = frames.map(f => `${f.id}:${f.scriptSegment || ''}:${f.sceneName || ''}`).join('|');

    useEffect(() => {
        if (frames.length === 0) {
            setIntensityCurve([]);
            return;
        }

        let isMounted = true;
        const calculateCurve = async () => {
            setIsCalculatingIntensity(true);
            try {
                const points = await analyzeScriptEmotionalIntensityService(
                    frames.map(f => ({
                        id: f.id,
                        notes: f.notes,
                        scriptSegment: f.scriptSegment,
                        sceneName: f.sceneName,
                        shotType: f.shotType
                    }))
                );
                if (isMounted) {
                    setIntensityCurve(points);
                }
            } catch (err) {
                console.warn("Could not calculate emotional intensity curve:", err);
            } finally {
                if (isMounted) setIsCalculatingIntensity(false);
            }
        };

        calculateCurve();

        return () => {
            isMounted = false;
        };
    }, [frameSegmentsFingerprint]);

    // Calculate pacing statistics
    const frameDurations = frames.map(f => Math.max(1, f.duration || 5));
    const totalDurationSeconds = frameDurations.reduce((sum, d) => sum + d, 0);
    const averageShotDuration = frames.length > 0 ? (totalDurationSeconds / frames.length) : 0;

    // Cumulative start times
    const startTimes: number[] = [];
    let runningTotal = 0;
    frameDurations.forEach(d => {
        startTimes.push(runningTotal);
        runningTotal += d;
    });

    // Determine Pacing Pace Tempo
    const getPacingTempoBadge = () => {
        if (frames.length === 0) return { label: 'Empty Timeline', color: 'text-neutral-500 bg-neutral-800' };
        if (averageShotDuration < 3.2) {
            return { label: '⚡ Rapid Cutting / High Action', color: 'text-amber-400 bg-amber-950/40 border-amber-800/50' };
        } else if (averageShotDuration <= 6.5) {
            return { label: '🎬 Narrative Cinematic Standard', color: 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50' };
        } else {
            return { label: '⏳ Atmospheric / Deliberate Slow-Burn', color: 'text-purple-400 bg-purple-950/40 border-purple-800/50' };
        }
    };
    const tempo = getPacingTempoBadge();

    // Playhead simulation timer
    useEffect(() => {
        let timer: any = null;
        if (isPlaying && frames.length > 0) {
            timer = setInterval(() => {
                setSecondsInCurrentShot(prev => {
                    const currentDuration = frameDurations[activePlayingIndex] || 5;
                    if (prev + 1 >= currentDuration) {
                        // Advance to next frame
                        if (activePlayingIndex + 1 < frames.length) {
                            const nextIdx = activePlayingIndex + 1;
                            setActivePlayingIndex(nextIdx);
                            // Auto-scroll active card into view
                            const targetFrame = frames[nextIdx];
                            if (targetFrame && frameRefs.current[targetFrame.id]) {
                                frameRefs.current[targetFrame.id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                            }
                            return 0;
                        } else {
                            // Reached end of sequence
                            setIsPlaying(false);
                            setActivePlayingIndex(0);
                            return 0;
                        }
                    }
                    return prev + 1;
                });
            }, 1000);
        } else if (!isPlaying) {
            setSecondsInCurrentShot(0);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [isPlaying, activePlayingIndex, frames, frameDurations]);

    const handleTogglePlay = () => {
        if (!isPlaying) {
            setIsPlaying(true);
            const targetFrame = frames[activePlayingIndex];
            if (targetFrame && frameRefs.current[targetFrame.id]) {
                frameRefs.current[targetFrame.id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        } else {
            setIsPlaying(false);
        }
    };

    const handleAdjustDuration = (frameId: string, currentDuration: number, delta: number) => {
        const newDuration = Math.max(1, Math.min(60, currentDuration + delta));
        onUpdateFrame?.(frameId, { duration: newDuration });
    };

    const handleCopyPrompt = (promptText: string, id: string) => {
        navigator.clipboard.writeText(promptText);
        setCopiedPromptId(id);
        setTimeout(() => setCopiedPromptId(null), 2500);
    };

    const handleScroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const shift = direction === 'left' ? -450 : 450;
            scrollContainerRef.current.scrollBy({ left: shift, behavior: 'smooth' });
        }
    };

    const handleAutoCalculateTimestamps = () => {
        frames.forEach((frame, idx) => {
            const startSec = startTimes[idx];
            const ts = formatSecondsToTimecode(startSec);
            onUpdateFrame?.(frame.id, { timestamp: ts });
        });
    };

    const cardWidthClasses = {
        compact: 'w-[320px] min-w-[320px]',
        standard: 'w-[410px] min-w-[410px]',
        expanded: 'w-[500px] min-w-[500px]'
    };

    return (
        <div className="flex flex-col h-full w-full bg-neutral-950 overflow-hidden font-sans select-none">
            {/* TIMELINE CONTROL & PACING HEADER BAR */}
            <div className="flex-shrink-0 bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4 z-10 shadow-lg">
                <div className="flex items-center gap-4 flex-wrap">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-black text-white tracking-wide uppercase font-mono flex items-center gap-2">
                                <span className="text-cyan-400">🎞️</span> Storyboard Timeline View
                            </h3>
                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${tempo.color}`}>
                                {tempo.label}
                            </span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-0.5">
                            Cinematic pacing editor • Overlay frame notes, script dialogue segments, and AI metadata across chronological timecode
                        </p>
                    </div>
                </div>

                {/* Right controls: Playhead Simulator, Pacing Stats & View Zoom */}
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Real-time Cinematic Pacing Metrics */}
                    <div className="flex items-center gap-2 bg-black/50 border border-neutral-800 px-3 py-1.5 rounded-xl font-mono text-xs">
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Total Runtime</span>
                            <span className="text-white font-bold">{formatSecondsToTimecode(totalDurationSeconds)}</span>
                        </div>
                        <div className="h-6 w-px bg-neutral-800 mx-1"></div>
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Avg Shot Length</span>
                            <span className="text-cyan-400 font-bold">{averageShotDuration.toFixed(1)}s</span>
                        </div>
                        <div className="h-6 w-px bg-neutral-800 mx-1"></div>
                        <div className="flex flex-col">
                            <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">Shots</span>
                            <span className="text-white font-bold">{frames.length}</span>
                        </div>
                    </div>

                    {/* Simulation Playhead Button */}
                    <button
                        type="button"
                        onClick={handleTogglePlay}
                        disabled={frames.length === 0}
                        className={`flex items-center gap-2 font-bold px-3.5 py-2 rounded-xl text-xs transition-all shadow-md active:scale-95 cursor-pointer ${
                            isPlaying
                                ? 'bg-amber-600 hover:bg-amber-500 text-white animate-pulse'
                                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        }`}
                        title="Simulate cinematic sequence pacing in real time"
                    >
                        {isPlaying ? (
                            <>
                                <span>⏸</span>
                                <span>Pause Sim (Shot #{activePlayingIndex + 1})</span>
                            </>
                        ) : (
                            <>
                                <span>▶</span>
                                <span>Simulate Pacing</span>
                            </>
                        )}
                    </button>

                    {/* Emotional Intensity Curve Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowIntensityCurve(!showIntensityCurve)}
                        disabled={frames.length === 0}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                            showIntensityCurve
                                ? 'bg-purple-900/60 border-purple-500/80 text-purple-200 shadow-md shadow-purple-950/50'
                                : 'bg-neutral-800 border-neutral-700/60 text-neutral-400 hover:text-white'
                        }`}
                        title="Toggle AI-generated Dramatic Stakes & Emotional Intensity curve below timeline"
                    >
                        <span>📈</span>
                        <span>Intensity Curve</span>
                        {isCalculatingIntensity && (
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping inline-block ml-0.5" />
                        )}
                    </button>

                    {/* Auto Timecode Sync */}
                    <button
                        type="button"
                        onClick={handleAutoCalculateTimestamps}
                        disabled={frames.length === 0}
                        className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white px-3 py-2 rounded-xl text-xs font-bold border border-neutral-700/60 transition-all cursor-pointer"
                        title="Recalculate and synchronize timecodes continuously based on frame durations"
                    >
                        <span>⏱️</span>
                        <span>Sync Timecodes</span>
                    </button>

                    {/* Zoom Width Selector */}
                    <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-neutral-800">
                        {(['compact', 'standard', 'expanded'] as const).map(mode => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => setCardWidth(mode)}
                                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                    cardWidth === mode
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-neutral-500 hover:text-white'
                                }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    {/* Horizontal Track Quick Navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => handleScroll('left')}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl border border-neutral-700/50 transition-colors"
                            title="Scroll timeline left"
                        >
                            ◀
                        </button>
                        <button
                            type="button"
                            onClick={() => handleScroll('right')}
                            className="p-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl border border-neutral-700/50 transition-colors"
                            title="Scroll timeline right"
                        >
                            ▶
                        </button>
                    </div>
                </div>
            </div>

            {/* CINEMATIC PACING RHYTHM BAR / MINI TIMELINE */}
            {frames.length > 0 && (
                <div className="flex-shrink-0 bg-neutral-900/60 border-b border-neutral-800 px-6 py-2.5 flex items-center gap-3">
                    <span className="text-[10px] font-black text-neutral-500 uppercase tracking-widest font-mono shrink-0">
                        Pacing Rhythm Meter:
                    </span>
                    <div className="flex-grow flex h-4 rounded-md overflow-hidden bg-black/60 border border-neutral-800 relative">
                        {frames.map((frame, idx) => {
                            const duration = frame.duration || 5;
                            const pct = totalDurationSeconds > 0 ? (duration / totalDurationSeconds) * 100 : 0;
                            const isActive = isPlaying && activePlayingIndex === idx;
                            return (
                                <div
                                    key={frame.id}
                                    style={{ width: `${pct}%` }}
                                    onClick={() => {
                                        setActivePlayingIndex(idx);
                                        frameRefs.current[frame.id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                                    }}
                                    className={`h-full border-r border-black/40 cursor-pointer transition-all relative group ${
                                        isActive
                                            ? 'bg-cyan-400 animate-pulse'
                                            : idx % 2 === 0
                                                ? 'bg-blue-600/70 hover:bg-blue-500'
                                                : 'bg-indigo-600/70 hover:bg-indigo-500'
                                    }`}
                                    title={`Shot #${idx + 1} (${duration}s): ${frame.shotType || 'Standard'} - ${frame.sceneName || 'Scene 1'}`}
                                >
                                    <span className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] font-mono px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                                        #{idx + 1}: {duration}s
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <span className="text-[10px] font-mono font-bold text-neutral-400 shrink-0">
                        {formatSecondsToTimecode(totalDurationSeconds)}
                    </span>
                </div>
            )}

            {/* HORIZONTAL SCROLLABLE TIMELINE TRACK CANVAS */}
            <div
                ref={scrollContainerRef}
                className="flex-grow overflow-x-auto overflow-y-auto p-6 bg-gradient-to-b from-neutral-950 via-neutral-900/70 to-neutral-950 custom-scrollbar"
            >
                {frames.length === 0 ? (
                    <div className="h-full min-h-[350px] flex flex-col items-center justify-center opacity-70">
                        <div className="w-20 h-20 bg-neutral-900 border-2 border-dashed border-neutral-700 rounded-3xl flex items-center justify-center mb-4 text-3xl">
                            🎬
                        </div>
                        <h4 className="text-lg font-bold text-neutral-300">No Storyboard Frames on Timeline</h4>
                        <p className="text-xs text-neutral-500 max-w-sm text-center mt-1">
                            Generate images in the Studio or Grid and click "Add to Storyboard" to construct your cinematic pacing sequence.
                        </p>
                    </div>
                ) : (
                    <div className="flex items-start gap-4 pb-12 pt-2 min-w-max">
                        {frames.map((frame, index) => {
                            const shotLetter = String.fromCharCode(65 + (index % 26));
                            const duration = frame.duration || 5;
                            const startTime = startTimes[index] || 0;
                            const endTime = startTime + duration;
                            const isActivePlayhead = isPlaying && activePlayingIndex === index;

                            // Derived / fallback image metadata
                            const meta = frame.imageMetadata || {};
                            const aiModel = meta.model || (frame.prompt ? 'Imagen 3 Cinema' : 'Gemini 2.5 Flash');
                            const aiEngine = meta.engine || 'Mythos AI Engine';
                            const aspectRatio = meta.aspectRatio || '16:9 Cinema';
                            const guidanceScale = meta.guidanceScale || 7.5;
                            const seedVal = meta.seed || `#${frame.id.slice(-6).toUpperCase()}`;

                            return (
                                <React.Fragment key={frame.id}>
                                    {/* TIMELINE FRAME CARD */}
                                    <div
                                        ref={(el) => { frameRefs.current[frame.id] = el; }}
                                        className={`
                                            ${cardWidthClasses[cardWidth]}
                                            flex flex-col bg-neutral-900/95 border rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 backdrop-blur-md relative
                                            ${isActivePlayhead
                                                ? 'border-cyan-400 ring-4 ring-cyan-500/30 shadow-[0_0_25px_rgba(6,182,212,0.4)] scale-[1.02] z-20'
                                                : 'border-neutral-800 hover:border-neutral-700 hover:shadow-cyan-900/10'
                                            }
                                        `}
                                    >
                                        {/* ACTIVE PLAYHEAD INDICATOR GLOW */}
                                        {isActivePlayhead && (
                                            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-300 animate-pulse z-30"></div>
                                        )}

                                        {/* 1. TOP PACING & TIMECODE HEADER */}
                                        <div className="p-3 bg-neutral-850/90 border-b border-neutral-800 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-black text-cyan-400 text-[10px] font-black px-2 py-0.5 rounded-lg border border-cyan-900/40 font-mono">
                                                    #{index + 1} • SHOT {shotLetter}
                                                </span>
                                                <span className="text-[10px] font-bold text-neutral-300 uppercase truncate max-w-[100px]">
                                                    {frame.sceneName || `SCENE 1`}
                                                </span>
                                            </div>

                                            {/* Time range & Duration Controller */}
                                            <div className="flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-lg border border-neutral-700/60 font-mono">
                                                <span className="text-[10px] text-cyan-300 font-bold" title="Timecode range">
                                                    {formatSecondsToTimecode(startTime)} - {formatSecondsToTimecode(endTime)}
                                                </span>

                                                <div className="flex items-center gap-0.5 ml-1 border-l border-neutral-800 pl-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAdjustDuration(frame.id, duration, -1)}
                                                        className="w-4 h-4 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded text-[10px] font-bold"
                                                        title="Decrease duration by 1s"
                                                    >
                                                        -
                                                    </button>
                                                    <span className="text-[10px] font-black text-white px-1">
                                                        {duration}s
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAdjustDuration(frame.id, duration, 1)}
                                                        className="w-4 h-4 flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded text-[10px] font-bold"
                                                        title="Increase duration by 1s"
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 2. CINEMATIC THUMBNAIL WITH SHOT TYPE SELECTOR */}
                                        <div className="relative aspect-video bg-black group/thumb overflow-hidden">
                                            <img
                                                src={frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`}
                                                alt={`Shot ${shotLetter}`}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90"></div>

                                            {/* Shot Type Dropdown Badge */}
                                            <div className="absolute top-2 left-2 z-10">
                                                <select
                                                    value={frame.shotType || 'Wide Shot (WS)'}
                                                    onChange={(e) => onUpdateFrame?.(frame.id, { shotType: e.target.value })}
                                                    className="bg-black/80 hover:bg-black text-neutral-200 hover:text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border border-neutral-700/80 backdrop-blur-md outline-none cursor-pointer"
                                                >
                                                    {SHOT_TYPES.map(st => (
                                                        <option key={st} value={st} className="bg-neutral-900 text-white">
                                                            {st}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Duration Watermark on thumbnail */}
                                            <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 font-bold border border-cyan-800/40">
                                                ⏱ {duration}.0s HOLD
                                            </div>

                                            {/* Quick Actions overlay */}
                                            <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover/thumb:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const link = document.createElement('a');
                                                        link.href = frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`;
                                                        link.download = `shot_${index + 1}_${shotLetter}.jpg`;
                                                        link.click();
                                                    }}
                                                    className="bg-black/80 hover:bg-black text-neutral-300 hover:text-white p-1 rounded border border-neutral-700"
                                                    title="Download shot image"
                                                >
                                                    <DownloadIcon className="w-3 h-3" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onRemove(frame.id)}
                                                    className="bg-black/80 hover:bg-rose-950 text-neutral-400 hover:text-rose-400 p-1 rounded border border-neutral-700"
                                                    title="Remove shot"
                                                >
                                                    <TrashIcon className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* 3. THREE CINEMATIC OVERLAYS CONTAINER */}
                                        <div className="p-3.5 space-y-3 bg-neutral-900/90 text-xs">
                                            {/* OVERLAY TIER 1: FRAME & ACTION NOTES */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1 font-mono">
                                                        <span>🎬</span> Frame Notes & Action
                                                    </span>
                                                    <span className="text-[8px] text-neutral-500 font-mono">
                                                        Blocking / Camera
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={frame.notes || ''}
                                                    onChange={(e) => onUpdateNote(frame.id, e.target.value)}
                                                    placeholder="Camera movement, actor blocking, environmental cues (e.g. Slow dolly push toward window)..."
                                                    className="w-full h-16 bg-black/40 border border-neutral-800 rounded-lg p-2 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-amber-500/60 focus:bg-black/60 transition-all resize-none leading-relaxed"
                                                />
                                            </div>

                                            {/* OVERLAY TIER 2: SCRIPT SEGMENTS & DIALOGUE */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1 font-mono">
                                                        <span>📜</span> Script Segment / Dialogue
                                                    </span>
                                                    <span className="text-[8px] text-neutral-500 font-mono">
                                                        Screenplay Excerpt
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={frame.scriptSegment || ''}
                                                    onChange={(e) => onUpdateFrame?.(frame.id, { scriptSegment: e.target.value })}
                                                    placeholder='ELENA: "The signal is emanating from deep within the bedrock..."'
                                                    className="w-full h-16 bg-black/40 border border-neutral-800 rounded-lg p-2 text-xs text-cyan-200 placeholder-neutral-600 font-mono focus:outline-none focus:border-cyan-500/60 focus:bg-black/60 transition-all resize-none leading-relaxed"
                                                />
                                            </div>

                                            {/* OVERLAY TIER 3: AI-GENERATED IMAGE METADATA */}
                                            <div className="space-y-1.5 pt-1 border-t border-neutral-800/60">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-purple-400 flex items-center gap-1 font-mono">
                                                        <span>✨</span> AI Generation Metadata
                                                    </span>
                                                    <span className="text-[8px] text-neutral-500 font-mono">
                                                        Model & Params
                                                    </span>
                                                </div>

                                                <div className="bg-black/50 border border-neutral-800 rounded-lg p-2 space-y-1.5">
                                                    {/* Key Parameter Pills */}
                                                    <div className="flex flex-wrap gap-1 text-[8px] font-mono">
                                                        <span className="px-1.5 py-0.5 bg-neutral-850 text-neutral-300 rounded border border-neutral-700/50">
                                                            {aiModel}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 bg-neutral-850 text-neutral-300 rounded border border-neutral-700/50">
                                                            AR: {aspectRatio}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 bg-neutral-850 text-neutral-400 rounded border border-neutral-700/50">
                                                            CFG: {guidanceScale}
                                                        </span>
                                                        <span className="px-1.5 py-0.5 bg-neutral-850 text-neutral-400 rounded border border-neutral-700/50 truncate max-w-[90px]">
                                                            {seedVal}
                                                        </span>
                                                    </div>

                                                    {/* Visual Prompt Preview */}
                                                    {frame.prompt ? (
                                                        <div className="space-y-1">
                                                            <p className="text-[10px] text-neutral-300 italic line-clamp-2 leading-tight">
                                                                "{frame.prompt}"
                                                            </p>
                                                            <div className="flex justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyPrompt(frame.prompt || '', frame.id)}
                                                                    className="text-[8px] text-cyan-400 hover:text-cyan-300 uppercase font-black tracking-wider transition-colors"
                                                                >
                                                                    {copiedPromptId === frame.id ? '✓ Prompt Copied' : 'Copy Prompt'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-[9px] text-neutral-500 italic">
                                                            Direct upload or generated asset without prompt log
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* 4. BOTTOM TIMELINE REORDER & ACTIONS FOOTER */}
                                        <div className="p-2.5 bg-neutral-850/80 border-t border-neutral-800 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    disabled={index === 0}
                                                    onClick={() => onReorder(index, index - 1)}
                                                    className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 rounded text-[10px] font-bold border border-neutral-700/50 transition-colors"
                                                    title="Move shot earlier on timeline"
                                                >
                                                    ← Shift Left
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={index === frames.length - 1}
                                                    onClick={() => onReorder(index, index + 1)}
                                                    className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 rounded text-[10px] font-bold border border-neutral-700/50 transition-colors"
                                                    title="Move shot later on timeline"
                                                >
                                                    Shift Right →
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => onRemove(frame.id)}
                                                className="text-neutral-500 hover:text-rose-400 text-xs px-1.5 py-1 transition-colors"
                                                title="Delete shot from sequence"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>

                                    {/* CONNECTIVE PACING TRANSITION BADGE BETWEEN SHOTS */}
                                    {index < frames.length - 1 && (
                                        <div className="self-center flex flex-col items-center justify-center px-1 shrink-0">
                                            <div className="h-0.5 w-6 bg-gradient-to-r from-neutral-700 to-neutral-700 mb-1"></div>
                                            <div className="bg-black/80 border border-neutral-800 text-[9px] font-mono text-neutral-400 font-bold px-2 py-1 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1">
                                                <span>⚡</span> CUT
                                            </div>
                                            <div className="h-0.5 w-6 bg-gradient-to-r from-neutral-700 to-neutral-700 mt-1"></div>
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* EMOTIONAL INTENSITY CURVE PANEL BELOW THE TIMELINE */}
            {showIntensityCurve && frames.length > 0 && (
                <div className="flex-shrink-0 bg-neutral-900/95 border-t border-neutral-800 px-6 py-3.5 z-10 backdrop-blur-md shadow-2xl">
                    <div className="flex items-center justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-purple-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                                <span>📈</span> Emotional Intensity & Dramatic Stakes Curve
                            </span>
                            <span className="text-[10px] bg-purple-950/70 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded-full font-mono font-bold">
                                Gemini Script Analysis
                            </span>
                            {isCalculatingIntensity && (
                                <span className="text-[10px] text-neutral-400 font-mono animate-pulse">
                                    Analyzing dramatic pacing...
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-mono text-neutral-400">
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Low / Calm
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Rising Stakes
                            </span>
                            <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Climax / Crisis
                            </span>
                        </div>
                    </div>

                    {/* SVG Curve Canvas */}
                    <div className="relative w-full h-24 bg-black/60 rounded-xl border border-neutral-800/80 overflow-hidden flex items-center justify-center p-2">
                        {intensityCurve.length > 0 ? (
                            (() => {
                                const n = intensityCurve.length;
                                const svgWidth = Math.max(600, n * 80);
                                const svgHeight = 76;
                                const paddingX = 40;
                                const paddingY = 12;

                                const getX = (idx: number) => {
                                    if (n <= 1) return svgWidth / 2;
                                    return paddingX + (idx / (n - 1)) * (svgWidth - paddingX * 2);
                                };

                                const getY = (intensity: number) => {
                                    // 0 intensity -> bottom, 100 -> top
                                    const available = svgHeight - paddingY * 2;
                                    return svgHeight - paddingY - (intensity / 100) * available;
                                };

                                // Build path
                                const pathD = intensityCurve.reduce((acc, pt, idx) => {
                                    const x = getX(idx);
                                    const y = getY(pt.intensity);
                                    if (idx === 0) return `M ${x} ${y}`;
                                    // Smooth bezier curve
                                    const prevX = getX(idx - 1);
                                    const prevY = getY(intensityCurve[idx - 1].intensity);
                                    const cp1x = prevX + (x - prevX) / 2;
                                    const cp1y = prevY;
                                    const cp2x = prevX + (x - prevX) / 2;
                                    const cp2y = y;
                                    return `${acc} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x} ${y}`;
                                }, '');

                                // Build area fill under path
                                const areaD = `${pathD} L ${getX(n - 1)} ${svgHeight} L ${getX(0)} ${svgHeight} Z`;

                                return (
                                    <div className="w-full h-full overflow-x-auto custom-scrollbar flex items-center">
                                        <svg 
                                            width="100%" 
                                            height="100%" 
                                            viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                                            preserveAspectRatio="none"
                                            className="overflow-visible"
                                        >
                                            <defs>
                                                <linearGradient id="intensityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                                                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.25" />
                                                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.05" />
                                                </linearGradient>
                                                <linearGradient id="lineStrokeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    {intensityCurve.map((pt, i) => (
                                                        <stop
                                                            key={i}
                                                            offset={`${(i / Math.max(1, n - 1)) * 100}%`}
                                                            stopColor={pt.colorHex || (pt.intensity > 70 ? '#ef4444' : pt.intensity > 45 ? '#f59e0b' : '#38bdf8')}
                                                        />
                                                    ))}
                                                </linearGradient>
                                            </defs>

                                            {/* Horizontal Guideline Grids */}
                                            <line x1="0" y1={getY(25)} x2={svgWidth} y2={getY(25)} stroke="#262626" strokeDasharray="3 3" strokeWidth="0.8" />
                                            <line x1="0" y1={getY(50)} x2={svgWidth} y2={getY(50)} stroke="#262626" strokeDasharray="3 3" strokeWidth="0.8" />
                                            <line x1="0" y1={getY(75)} x2={svgWidth} y2={getY(75)} stroke="#262626" strokeDasharray="3 3" strokeWidth="0.8" />

                                            {/* Area Fill */}
                                            <path d={areaD} fill="url(#intensityGradient)" />

                                            {/* Main Curve Line */}
                                            <path 
                                                d={pathD} 
                                                fill="none" 
                                                stroke="url(#lineStrokeGradient)" 
                                                strokeWidth="2.5" 
                                                strokeLinecap="round" 
                                                strokeLinejoin="round" 
                                            />

                                            {/* Data Points / Shot Nodes */}
                                            {intensityCurve.map((pt, idx) => {
                                                const x = getX(idx);
                                                const y = getY(pt.intensity);
                                                const targetFrame = frames[idx];
                                                const isCurrent = isPlaying && activePlayingIndex === idx;

                                                return (
                                                    <g 
                                                        key={idx} 
                                                        className="cursor-pointer group"
                                                        onClick={() => {
                                                            setActivePlayingIndex(idx);
                                                            if (targetFrame && frameRefs.current[targetFrame.id]) {
                                                                frameRefs.current[targetFrame.id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                                                            }
                                                        }}
                                                    >
                                                        {/* Node circle */}
                                                        <circle
                                                            cx={x}
                                                            cy={y}
                                                            r={isCurrent ? 6 : 4}
                                                            fill={isCurrent ? '#ffffff' : (pt.colorHex || '#38bdf8')}
                                                            stroke="#000000"
                                                            strokeWidth="1.5"
                                                            className="transition-all group-hover:r-6"
                                                        />

                                                        {/* Shot label text */}
                                                        <text
                                                            x={x}
                                                            y={svgHeight - 2}
                                                            textAnchor="middle"
                                                            fill="#737373"
                                                            fontSize="8"
                                                            fontFamily="monospace"
                                                            className="group-hover:fill-white font-bold"
                                                        >
                                                            #{idx + 1}
                                                        </text>

                                                        {/* Hover Dramatic Stakes Tooltip */}
                                                        <title>{`Shot #${idx + 1}: Intensity ${pt.intensity}% (${pt.dramaticStakes})`}</title>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                );
                            })()
                        ) : (
                            <div className="text-xs text-neutral-500 font-mono">
                                Generating narrative stakes intensity curve...
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
