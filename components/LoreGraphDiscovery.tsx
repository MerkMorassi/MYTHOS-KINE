import React, { useState, useEffect } from 'react';
import { NarrativeThread } from '../types';
import { discoverLoreNarrativeThreadsService } from '../services/geminiService';

interface LoreGraphDiscoveryProps {
    scriptContent?: string;
    scriptTitle?: string;
    characters: any[];
    lore: any[];
    onAcceptThread: (thread: NarrativeThread) => void;
}

export const LoreGraphDiscovery: React.FC<LoreGraphDiscoveryProps> = ({
    scriptContent = '',
    scriptTitle = 'Current Script Draft',
    characters = [],
    lore = [],
    onAcceptThread
}) => {
    const [threads, setThreads] = useState<NarrativeThread[]>(() => {
        try {
            const cached = localStorage.getItem('mythos_discovered_narrative_threads');
            return cached ? JSON.parse(cached) : [];
        } catch {
            return [];
        }
    });

    const [isScanning, setIsScanning] = useState(false);
    const [filter, setFilter] = useState<'all' | 'discovered' | 'accepted'>('discovered');
    const [lastScannedAt, setLastScannedAt] = useState<string | null>(() => {
        return localStorage.getItem('mythos_lore_discovery_last_scan');
    });

    // Auto-save discovered threads to local cache
    useEffect(() => {
        try {
            localStorage.setItem('mythos_discovered_narrative_threads', JSON.stringify(threads));
        } catch (e) {}
    }, [threads]);

    const runDiscovery = async () => {
        setIsScanning(true);
        try {
            const textToAnalyze = scriptContent && scriptContent.trim().length > 50
                ? scriptContent
                : `SCENE START.
INT. CITADEL ARCHIVES - NIGHT
MARCUS (40s, grizzled) moves past the flickering stasis pylons. He holds the broken chronal compass.
VAELEN steps from the shadows of Sector 7.
VAELEN: You shouldn't have opened the Obsidian Seal, Marcus. The Council will know by dawn.
MARCUS: The Council authorized it, Vaelen. Lyra deciphered the stasis runes hours ago.
LYRA enters through the vault breach, clutching void-salt canisters.
LYRA: We have twelve minutes before the stasis field collapses. We seal this pact now or none of us leave the Citadel alive.`;

            const results = await discoverLoreNarrativeThreadsService({
                scriptContent: textToAnalyze,
                scriptTitle,
                characters,
                lore
            });

            if (results.length > 0) {
                // Merge with existing avoiding duplicates
                setThreads(prev => {
                    const existingTitles = new Set(prev.map(t => t.threadTitle.toLowerCase()));
                    const brandNew = results.filter(r => !existingTitles.has(r.threadTitle.toLowerCase()));
                    return [...brandNew, ...prev];
                });
            }

            const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setLastScannedAt(nowStr);
            localStorage.setItem('mythos_lore_discovery_last_scan', nowStr);
        } catch (err) {
            console.error("Lore Graph Discovery scan failed:", err);
        } finally {
            setIsScanning(false);
        }
    };

    // Auto-scan on mount if empty
    useEffect(() => {
        if (threads.length === 0) {
            runDiscovery();
        }
    }, []);

    const handleAccept = (thread: NarrativeThread) => {
        onAcceptThread(thread);
        setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, status: 'accepted' } : t));
    };

    const handleDismiss = (id: string) => {
        setThreads(prev => prev.filter(t => t.id !== id));
    };

    const displayedThreads = threads.filter(t => {
        if (filter === 'all') return true;
        return t.status === filter;
    });

    return (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-5 shadow-xl font-sans space-y-4">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                            <span>🧵</span> Lore Graph Discovery
                        </h4>
                    </div>
                    <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
                        Background job extracting bidirectional narrative threads from scripts
                    </p>
                </div>

                <button
                    onClick={runDiscovery}
                    disabled={isScanning}
                    className="px-3 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                    {isScanning ? (
                        <>
                            <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            <span>Scanning...</span>
                        </>
                    ) : (
                        <>
                            <span>⚡</span>
                            <span>Scan Scripts</span>
                        </>
                    )}
                </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex justify-between items-center text-[10px]">
                <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-neutral-850">
                    {(['discovered', 'accepted', 'all'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition ${
                                filter === tab
                                    ? 'bg-neutral-800 text-white'
                                    : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
                {lastScannedAt && (
                    <span className="text-[9px] font-mono text-neutral-500">
                        Last scan: {lastScannedAt}
                    </span>
                )}
            </div>

            {/* Threads List */}
            <div className="space-y-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1">
                {displayedThreads.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-500 italic bg-black/20 rounded-xl border border-neutral-850">
                        {isScanning ? "Scanning script narratives for implicit relational threads..." : "No narrative threads matching current filter. Click 'Scan Scripts' to discover new links."}
                    </div>
                ) : (
                    displayedThreads.map(thread => (
                        <div
                            key={thread.id}
                            className="bg-black/40 border border-neutral-850 hover:border-neutral-750 p-3.5 rounded-xl transition-all space-y-2.5 group relative"
                        >
                            <div className="flex justify-between items-start gap-2">
                                <span className="text-xs font-bold text-neutral-100 group-hover:text-emerald-400 transition leading-snug">
                                    {thread.threadTitle}
                                </span>
                                <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/40 shrink-0">
                                    {thread.confidenceScore}% Match
                                </span>
                            </div>

                            {/* Bidirectional Link Badge Preview */}
                            <div className="bg-neutral-950/80 p-2 rounded-lg border border-neutral-850 text-[10px] font-mono space-y-1">
                                <div className="flex items-center gap-1.5 text-neutral-300">
                                    <span className="text-purple-400 font-bold">{thread.sourceCharacter}</span>
                                    <span className="text-neutral-500">──[ {thread.bidirectionalRelation.forward} ]──▶</span>
                                    <span className="text-blue-400 font-bold">{thread.targetEntityOrEvent}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-neutral-400 text-[9px]">
                                    <span className="text-blue-400 font-bold">{thread.targetEntityOrEvent}</span>
                                    <span className="text-neutral-500">──[ {thread.bidirectionalRelation.reverse} ]──▶</span>
                                    <span className="text-purple-400 font-bold">{thread.sourceCharacter}</span>
                                </div>
                            </div>

                            <p className="text-[10px] text-neutral-400 leading-relaxed font-sans">
                                {thread.dramaticContext}
                            </p>

                            {thread.sceneEvidence && (
                                <p className="text-[9px] font-mono text-neutral-500 italic bg-black/40 p-1.5 rounded border border-neutral-850">
                                    "{thread.sceneEvidence}"
                                </p>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-2 pt-1 border-t border-neutral-850/60">
                                {thread.status === 'discovered' ? (
                                    <>
                                        <button
                                            onClick={() => handleDismiss(thread.id)}
                                            className="px-2.5 py-1 text-[9px] text-neutral-500 hover:text-neutral-300 font-bold transition"
                                        >
                                            Dismiss
                                        </button>
                                        <button
                                            onClick={() => handleAccept(thread)}
                                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition shadow flex items-center gap-1 cursor-pointer"
                                        >
                                            <span>✓</span> Create Graph Links
                                        </button>
                                    </>
                                ) : (
                                    <span className="text-[9px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                                        ✓ Linked to Neural Graph
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
