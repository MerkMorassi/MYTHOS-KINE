import React, { useState } from 'react';
import { LoreRefinementSuggestion } from '../types';
import { refineLoreEntryWithAudioSentimentService } from '../services/geminiService';

interface LoreRefinementAssistantProps {
    projectLore: any[];
    audioSentimentData?: any;
    onApplyRefinement: (loreId: string, refinedContent: string) => void;
    onClose?: () => void;
}

export const LoreRefinementAssistant: React.FC<LoreRefinementAssistantProps> = ({
    projectLore = [],
    audioSentimentData,
    onApplyRefinement,
    onClose
}) => {
    const [selectedLoreId, setSelectedLoreId] = useState<string>(
        projectLore[0]?.id || ''
    );
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [suggestion, setSuggestion] = useState<LoreRefinementSuggestion | null>(null);
    const [applied, setApplied] = useState(false);

    const activeLore = projectLore.find(l => l.id === selectedLoreId) || projectLore[0];

    // Read audio sentiment trends or use baseline
    const sentiment = audioSentimentData?.overallSentiment || {
        dominant: "Tense & Suspenseful",
        tenseOrNegative: 42,
        mysterious: 25,
        positive: 15
    };

    const keywords = audioSentimentData?.recurringKeywords || [
        { word: "Obsidian Seal", count: 7, sentiment: "tense", category: "Artifacts" },
        { word: "Project Chrysalis", count: 5, sentiment: "mysterious", category: "Conspiracy" },
        { word: "chronal compass", count: 4, sentiment: "tense", category: "Relics" }
    ];

    const handleRunRefinement = async () => {
        if (!activeLore) return;
        setIsAnalyzing(true);
        setApplied(false);
        try {
            const res = await refineLoreEntryWithAudioSentimentService({
                loreEntry: {
                    id: activeLore.id,
                    title: activeLore.title,
                    content: activeLore.content
                },
                audioSentimentData
            });
            setSuggestion(res);
        } catch (err) {
            console.error("Lore refinement failed:", err);
            alert(`Refinement failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApply = () => {
        if (!suggestion) return;
        onApplyRefinement(suggestion.loreId, suggestion.refinedContent);
        setApplied(true);
    };

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl font-sans space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-neutral-800 pb-4">
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <span>✨</span> AI Lore Refinement Assistant
                        <span className="text-[9px] bg-blue-950/80 text-blue-400 border border-blue-900/60 font-mono px-2 py-0.5 rounded-full uppercase">
                            Audio Sentiment Grounded
                        </span>
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
                        Suggests text revisions for lore entries based on detected sentiment arcs and recurring acoustic keywords
                    </p>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-white text-xs font-bold p-1"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Audio Intelligence Bar */}
            <div className="bg-black/40 border border-neutral-850 p-4 rounded-xl space-y-3">
                <span className="text-[9px] font-mono font-black text-blue-400 uppercase tracking-widest block">
                    Detected Audio Sentiment & Table Read Motifs:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800">
                        <span className="text-[9px] text-neutral-500 uppercase font-black block">Dominant Arc Tone</span>
                        <span className="text-xs font-bold text-white mt-0.5 block">{sentiment.dominant}</span>
                    </div>
                    <div className="bg-neutral-900/80 p-2.5 rounded-lg border border-neutral-800 sm:col-span-2">
                        <span className="text-[9px] text-neutral-500 uppercase font-black block">Director Voice Memo Keywords</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {keywords.map((k: any, i: number) => (
                                <span key={i} className="text-[9px] font-mono bg-neutral-800 text-blue-300 px-2 py-0.5 rounded border border-blue-900/30 font-bold">
                                    "{k.word}" ({k.count || 1}x)
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Entry Selector & Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                    <label className="text-[9px] font-black text-neutral-500 uppercase tracking-wider block mb-1">
                        Select Lore Entry to Harmonize:
                    </label>
                    <select
                        value={selectedLoreId}
                        onChange={(e) => {
                            setSelectedLoreId(e.target.value);
                            setSuggestion(null);
                            setApplied(false);
                        }}
                        className="w-full bg-neutral-950 border border-neutral-800 text-white text-xs p-2.5 rounded-xl font-medium focus:ring-1 focus:ring-blue-500"
                    >
                        {projectLore.map(l => (
                            <option key={l.id} value={l.id}>
                                {l.title}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="sm:self-end">
                    <button
                        onClick={handleRunRefinement}
                        disabled={isAnalyzing || !activeLore}
                        className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {isAnalyzing ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Analyzing Sentiment...</span>
                            </>
                        ) : (
                            <>
                                <span>✨</span>
                                <span>Harmonize with Audio</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Refinement Result Display */}
            {suggestion && (
                <div className="bg-black/50 border border-neutral-800 rounded-xl p-5 space-y-4 animate-fade-in">
                    <div className="flex flex-wrap justify-between items-center gap-2 border-b border-neutral-800 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-900/40">
                                {suggestion.toneShift}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono text-neutral-500 uppercase">Injected Keywords:</span>
                            {suggestion.incorporatedKeywords.map((kw, i) => (
                                <span key={i} className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-900/40 px-2 py-0.5 rounded font-black">
                                    ✓ {kw}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Original */}
                        <div className="space-y-1.5">
                            <span className="text-[9px] font-black text-neutral-500 uppercase tracking-wider">
                                Current Lore Content
                            </span>
                            <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-850 text-xs text-neutral-400 font-mono leading-relaxed h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                                {suggestion.originalContent}
                            </div>
                        </div>

                        {/* Refined */}
                        <div className="space-y-1.5">
                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span>✨</span> Audio-Harmonized Revision
                            </span>
                            <div className="bg-neutral-950 p-3 rounded-lg border border-emerald-900/40 text-xs text-neutral-200 font-mono leading-relaxed h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                                {suggestion.refinedContent}
                            </div>
                        </div>
                    </div>

                    {/* Justification */}
                    <div className="bg-neutral-900/70 p-3 rounded-lg border border-neutral-800 text-xs text-neutral-300 leading-snug">
                        <strong className="text-blue-300 font-bold">Continuity Rationale: </strong>
                        {suggestion.justification}
                    </div>

                    {/* Action */}
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={handleApply}
                            disabled={applied}
                            className={`px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition shadow-lg ${
                                applied
                                    ? 'bg-neutral-800 text-neutral-400 cursor-default'
                                    : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                            }`}
                        >
                            {applied ? "✓ Applied to Lore Bible" : "💾 Apply Revision to Lore Entry"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
