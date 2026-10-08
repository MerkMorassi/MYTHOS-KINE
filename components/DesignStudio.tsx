
import React, { useState } from 'react';
import { Agent, ActiveView, LoreEntry, StoryboardFrame, MoodPalette, CinematicMoodReport } from '../types.ts';
import { AgentChatView } from './AgentChatView.tsx';
import { StudioHeader } from './StudioHeader.tsx';
import { PencilIcon } from './icons/PencilIcon.tsx';
import { generateCinematicMoodPalettes, inferLightingPreviewService } from '../services/geminiService.ts';
import { LoadingSpinner } from './icons.tsx';

interface DesignStudioProps {
    agent: Agent;
    lore: LoreEntry[];
    storyboard: StoryboardFrame[];
    projectName?: string;
    onNavigate: (view: ActiveView) => void;
    onOpenChat: (mode: 'chat' | 'call') => void;
    onUpdateFrame?: (id: string, updates: Partial<StoryboardFrame>) => void;
}

export const DesignStudio: React.FC<DesignStudioProps> = ({ 
    agent, 
    lore, 
    storyboard, 
    projectName,
    onNavigate, 
    onOpenChat,
    onUpdateFrame
}) => {
    const [activeTab, setActiveTab] = useState<'chat' | 'palettes'>('chat');
    const [selectedLoreIds, setSelectedLoreIds] = useState<string[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [moodReport, setMoodReport] = useState<CinematicMoodReport | null>(null);
    const [applyingToFrameId, setApplyingToFrameId] = useState<string | null>(null);
    const [showLightingPreview, setShowLightingPreview] = useState(false);
    const [lightingCache, setLightingCache] = useState<Record<string, any>>({});
    const [isInferringLighting, setIsInferringLighting] = useState(false);

    const toggleLoreSelection = (id: string) => {
        setSelectedLoreIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleGeneratePalettes = async () => {
        if (selectedLoreIds.length === 0) {
            alert("Please select at least one lore entry to analyze.");
            return;
        }

        setIsGenerating(true);
        try {
            const selectedLore = lore.filter(l => selectedLoreIds.includes(l.id));
            const report = await generateCinematicMoodPalettes({
                selectedLore,
                projectName
            });
            setMoodReport(report);
        } catch (err) {
            console.error("Mood Palette Generation failed:", err);
            alert("Failed to generate palettes. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApplyPalette = (palette: MoodPalette, frameId: string) => {
        if (!onUpdateFrame) return;

        onUpdateFrame(frameId, {
            notes: `[VISUAL STYLE: ${palette.name}] ${palette.visualStyleKeywords}\n\n${palette.description}`,
            imageMetadata: {
                ...storyboard.find(f => f.id === frameId)?.imageMetadata,
                moodPalette: {
                    name: palette.name,
                    colors: palette.colors,
                    style: palette.visualStyleKeywords
                }
            }
        });
        
        setApplyingToFrameId(null);
        alert(`✨ Visual style "${palette.name}" applied to storyboard frame!`);
    };

    const handleToggleLightingPreview = async () => {
        const next = !showLightingPreview;
        setShowLightingPreview(next);

        if (next && storyboard.length > 0) {
            setIsInferringLighting(true);
            try {
                const newCache = { ...lightingCache };
                for (const frame of storyboard) {
                    if (!newCache[frame.id]) {
                        // In real app, we might only do this for the visible ones or on demand
                        const tone = moodReport?.suggestedAestheticStyle || "Cinematic and Dramatic";
                        const lighting = await inferLightingPreviewService(frame.notes, tone);
                        newCache[frame.id] = lighting;
                    }
                }
                setLightingCache(newCache);
            } catch (err) {
                console.error("Lighting inference failed:", err);
            } finally {
                setIsInferringLighting(false);
            }
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-primary overflow-hidden">
            <main className="flex-grow overflow-hidden flex flex-col relative">
                <div className="p-6 pb-0 max-w-6xl mx-auto w-full shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-900 to-rose-900 border border-pink-500/30 flex items-center justify-center overflow-hidden shadow-lg shadow-pink-900/20">
                                <PencilIcon className="w-8 h-8 text-pink-400" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-black text-white tracking-tight italic">Design Studio</h1>
                                <p className="text-pink-300 font-medium">Visual Development & Style Guides</p>
                            </div>
                        </div>

                        <div className="flex bg-neutral-900 p-1 rounded-xl border border-neutral-800 self-start md:self-center">
                            <button
                                onClick={() => setActiveTab('chat')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                                    activeTab === 'chat' 
                                        ? 'bg-pink-600 text-white shadow-lg' 
                                        : 'text-neutral-500 hover:text-neutral-300'
                                }`}
                            >
                                💬 Stylus Chat
                            </button>
                            <button
                                onClick={() => setActiveTab('palettes')}
                                className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                                    activeTab === 'palettes' 
                                        ? 'bg-pink-600 text-white shadow-lg' 
                                        : 'text-neutral-500 hover:text-neutral-300'
                                }`}
                            >
                                🎨 Mood Palettes
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-grow overflow-hidden flex flex-col">
                    {activeTab === 'chat' ? (
                        <div className="flex-grow overflow-hidden">
                            <div className="p-6 pt-0 max-w-6xl mx-auto w-full">
                                <div className="bg-pink-900/20 border border-pink-500/20 p-4 rounded-xl mb-6">
                                    <p className="text-sm text-pink-200">
                                        <strong>Stylus Status:</strong> Palette ready. Describe a character or setting, and I will define its visual language.
                                    </p>
                                </div>
                                <div className="h-px bg-neutral-800 w-full"></div>
                            </div>
                            <AgentChatView agent={agent} />
                        </div>
                    ) : (
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-6 pt-0">
                            <div className="max-w-6xl mx-auto w-full space-y-8 animate-fade-in">
                                {/* Header Block */}
                                <section className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl space-y-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h2 className="text-xl font-bold text-white mb-2">Cinematic Mood Palette Tool</h2>
                                            <p className="text-sm text-neutral-400 max-w-2xl">
                                                Select core lore entries to analyze their thematic essence. Stylus will generate professional color grading suggestions and visual styles to ground your cinematic vision.
                                            </p>
                                        </div>
                                        <div className="flex gap-4">
                                            <button
                                                onClick={handleToggleLightingPreview}
                                                className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${
                                                    showLightingPreview 
                                                        ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_15px_rgba(217,119,6,0.4)]' 
                                                        : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                                                }`}
                                            >
                                                {isInferringLighting ? <LoadingSpinner /> : (showLightingPreview ? '💡 Lighting Active' : '🔦 Lighting Preview')}
                                            </button>
                                            <button
                                                onClick={handleGeneratePalettes}
                                                disabled={isGenerating || selectedLoreIds.length === 0}
                                                className="px-6 py-3 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-black uppercase text-xs tracking-widest rounded-xl transition-all shadow-lg flex items-center gap-2"
                                            >
                                                {isGenerating ? <LoadingSpinner /> : '✨ Generate Palettes'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Lore Selector */}
                                    <div className="space-y-3">
                                        <span className="text-[10px] font-black uppercase text-pink-500 tracking-widest">Select Narrative Context ({selectedLoreIds.length})</span>
                                        <div className="flex flex-wrap gap-2">
                                            {lore.length === 0 && <p className="text-xs text-neutral-600 italic">No lore entries found in this project.</p>}
                                            {lore.map(entry => (
                                                <button
                                                    key={entry.id}
                                                    onClick={() => toggleLoreSelection(entry.id)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                                        selectedLoreIds.includes(entry.id)
                                                            ? 'bg-pink-900/40 border-pink-500 text-pink-200'
                                                            : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'
                                                    }`}
                                                >
                                                    {entry.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </section>

                                {moodReport && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-slide-up">
                                        {moodReport.palettes.map(palette => (
                                            <div key={palette.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
                                                {/* Color Strip */}
                                                <div className="h-24 flex">
                                                    {palette.colors.map((color, i) => (
                                                        <div 
                                                            key={i} 
                                                            className="flex-grow transition-transform hover:scale-105 hover:z-10 relative group"
                                                            style={{ backgroundColor: color }}
                                                            title={color}
                                                        >
                                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="bg-black/80 text-[8px] font-mono text-white px-1 rounded uppercase tracking-tighter">{color}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="p-5 space-y-4 flex-grow flex flex-col">
                                                    <div>
                                                        <h3 className="text-lg font-black text-white uppercase tracking-tight">{palette.name}</h3>
                                                        <p className="text-[10px] font-mono text-pink-400 font-bold uppercase tracking-widest mt-1">
                                                            {palette.visualStyleKeywords}
                                                        </p>
                                                    </div>

                                                    <p className="text-xs text-neutral-300 leading-relaxed italic">
                                                        "{palette.description}"
                                                    </p>

                                                    <div className="p-3 bg-black/40 rounded-xl border border-neutral-800 text-[10px] text-neutral-400 leading-normal">
                                                        <strong className="text-neutral-200 uppercase block mb-1">Director's Note:</strong>
                                                        {palette.thematicJustification}
                                                    </div>

                                                    <div className="mt-auto pt-4 border-t border-neutral-800">
                                                        <button
                                                            onClick={() => setApplyingToFrameId(applyingToFrameId === palette.id ? null : palette.id)}
                                                            className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-neutral-700 flex items-center justify-center gap-2"
                                                        >
                                                            🖌️ Apply to Frame
                                                        </button>

                                                        {applyingToFrameId === palette.id && (
                                                            <div className="mt-3 p-3 bg-black/60 rounded-xl border border-pink-500/30 space-y-3 animate-fade-in">
                                                                <span className="text-[9px] font-black text-pink-400 uppercase tracking-widest block">Choose Target Shot</span>
                                                                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                                                    {storyboard.length === 0 && <p className="text-[10px] text-neutral-600 italic col-span-2">No frames in storyboard.</p>}
                                                                    {storyboard.map((frame, fIdx) => (
                                                                        <button
                                                                            key={frame.id}
                                                                            onClick={() => handleApplyPalette(palette, frame.id)}
                                                                            className="group relative h-16 rounded-lg overflow-hidden border border-neutral-800 hover:border-pink-500 transition-all"
                                                                        >
                                                                            <img 
                                                                                src={frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`} 
                                                                                className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                                                                            />
                                                                            {showLightingPreview && lightingCache[frame.id] && (
                                                                                <div className="absolute inset-0 pointer-events-none mix-blend-overlay">
                                                                                    {/* Lighting SVG Overlay */}
                                                                                    <svg viewBox="0 0 100 100" className="w-full h-full opacity-70">
                                                                                        <rect width="100" height="100" fill={lightingCache[frame.id].globalAmbientColor || 'transparent'} opacity="0.3" />
                                                                                        {lightingCache[frame.id].lightSources?.map((light: any, i: number) => (
                                                                                            <radialGradient key={`light-${i}`} id={`light-grad-${frame.id}-${i}`}>
                                                                                                <stop offset="0%" stopColor={light.color} stopOpacity={light.intensity} />
                                                                                                <stop offset="100%" stopColor={light.color} stopOpacity="0" />
                                                                                            </radialGradient>
                                                                                        ))}
                                                                                        {lightingCache[frame.id].lightSources?.map((light: any, i: number) => (
                                                                                            <circle 
                                                                                                key={i} 
                                                                                                cx={light.x} 
                                                                                                cy={light.y} 
                                                                                                r={light.radius / 2} 
                                                                                                fill={`url(#light-grad-${frame.id}-${i})`} 
                                                                                            />
                                                                                        ))}
                                                                                        {lightingCache[frame.id].shadowAreas?.map((shadow: any, i: number) => (
                                                                                            <rect 
                                                                                                key={`shadow-${i}`} 
                                                                                                x={shadow.x} 
                                                                                                y={shadow.y} 
                                                                                                width={shadow.width} 
                                                                                                height={shadow.height} 
                                                                                                fill="black" 
                                                                                                opacity={shadow.opacity} 
                                                                                                filter={`blur(${shadow.blur / 5}px)`}
                                                                                            />
                                                                                        ))}
                                                                                    </svg>
                                                                                </div>
                                                                            )}
                                                                            <div className="absolute inset-0 bg-black/40 group-hover:bg-transparent transition-colors flex items-center justify-center">
                                                                                <span className="text-[10px] font-bold text-white shadow-black drop-shadow-md">Shot {fIdx + 1}</span>
                                                                            </div>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                <button 
                                                                    onClick={() => setApplyingToFrameId(null)}
                                                                    className="w-full py-1 text-[9px] text-neutral-500 hover:text-neutral-300 font-bold uppercase"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {moodReport && (
                                    <div className="bg-pink-950/10 border border-pink-900/30 p-6 rounded-2xl flex flex-col md:flex-row items-start gap-6">
                                        <div className="space-y-4 flex-grow">
                                            <h4 className="text-sm font-black text-pink-500 uppercase tracking-widest">Aesthetic Synthesis</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {moodReport.dominantThemes.map((theme, i) => (
                                                    <span key={i} className="px-2 py-1 bg-pink-900/20 text-pink-300 text-[10px] font-bold rounded border border-pink-500/20">#{theme}</span>
                                                ))}
                                            </div>
                                            <p className="text-xs text-neutral-300">
                                                Stylus suggests grounding the visual language in <strong className="text-white italic">{moodReport.suggestedAestheticStyle}</strong>. This approach balances the dramatic weight of the selected lore while maintaining a consistent visual throughline across your screenplay's narrative arcs.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};
