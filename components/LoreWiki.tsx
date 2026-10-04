import React, { useState, useMemo, useRef, useEffect } from 'react';
import { LoreEntry, Character } from '../types';
import { generateSpeech } from '../services/geminiService';

interface LoreWikiProps {
    lore: LoreEntry[];
    characters?: Character[];
    activeProjectId?: string;
    onAddLore?: (title: string, content: string) => void;
    onUpdateLore?: (id: string, title: string, content: string) => void;
}

export const LoreWiki: React.FC<LoreWikiProps> = ({
    lore = [],
    characters = [],
    activeProjectId,
    onAddLore,
    onUpdateLore
}) => {
    const [selectedEntryId, setSelectedEntryId] = useState<string>(lore[0]?.id || '');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Text-to-Audio narration state
    const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
    const [speechRate, setSpeechRate] = useState<number>(1.0);
    const [isNarrating, setIsNarrating] = useState<boolean>(false);
    const [audioLoading, setAudioLoading] = useState<boolean>(false);
    const [audioError, setAudioError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [audioSrc, setAudioSrc] = useState<string | null>(null);

    // Active entry
    const activeEntry = useMemo(() => {
        return lore.find(l => l.id === selectedEntryId) || lore[0] || null;
    }, [lore, selectedEntryId]);

    // Categorization logic for TOC
    const categorizedEntries = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return lore.filter(entry => {
            const matchesQuery = !query || 
                entry.title.toLowerCase().includes(query) || 
                entry.content.toLowerCase().includes(query);
            return matchesQuery;
        });
    }, [lore, searchQuery]);

    // Grouping by first letter or topic
    const groupedTOC = useMemo(() => {
        const groups: Record<string, LoreEntry[]> = {};
        categorizedEntries.forEach(entry => {
            const letter = (entry.title.charAt(0) || '#').toUpperCase();
            if (!groups[letter]) groups[letter] = [];
            groups[letter].push(entry);
        });
        return groups;
    }, [categorizedEntries]);

    // Stop audio on entry switch
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setIsNarrating(false);
        setAudioError(null);
    }, [selectedEntryId]);

    // Handle Text-to-Audio Narration
    const handleToggleNarration = async () => {
        if (!activeEntry) return;

        if (isNarrating) {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            setIsNarrating(false);
            return;
        }

        setAudioLoading(true);
        setAudioError(null);

        const narrativeText = `${activeEntry.title}. ${activeEntry.content}`;

        try {
            // 1. Try Gemini Text-to-Audio Speech API
            const base64Audio = await generateSpeech(narrativeText.slice(0, 1500), selectedVoice, speechRate);
            if (base64Audio) {
                const audioBlob = `data:audio/mp3;base64,${base64Audio}`;
                setAudioSrc(audioBlob);
                if (audioRef.current) {
                    audioRef.current.src = audioBlob;
                    audioRef.current.playbackRate = speechRate;
                    await audioRef.current.play();
                    setIsNarrating(true);
                }
                setAudioLoading(false);
                return;
            }
        } catch (err: any) {
            console.warn("Gemini TTS narration fallback to browser SpeechSynthesis:", err);
        }

        // 2. Web Speech API Fallback
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(narrativeText);
                utterance.rate = speechRate;
                utterance.pitch = 1.0;
                
                // Pick appropriate voice if available
                const synthVoices = window.speechSynthesis.getVoices();
                if (synthVoices.length > 0) {
                    utterance.voice = synthVoices.find(v => v.lang.startsWith('en')) || synthVoices[0];
                }

                utterance.onend = () => {
                    setIsNarrating(false);
                };
                utterance.onerror = (e) => {
                    console.error("SpeechSynthesis error:", e);
                    setIsNarrating(false);
                    setAudioError("Audio playback encountered an error.");
                };

                window.speechSynthesis.speak(utterance);
                setIsNarrating(true);
            } catch (synthErr: any) {
                setAudioError("Voice synthesis currently unavailable.");
            }
        } else {
            setAudioError("Audio synthesis is not supported on this platform.");
        }
        setAudioLoading(false);
    };

    // Render hyperlinkable content: parse [[Wiki Links]] and mentions of other lore entries
    const renderHyperlinkableContent = (content: string) => {
        if (!content) return <p className="text-neutral-500 italic">No entry text.</p>;

        // Find titles of other lore entries to automatically hyperlink
        const otherEntries = lore.filter(l => l.id !== activeEntry?.id);
        const titleMap = new Map<string, string>(); // lowerTitle -> id
        otherEntries.forEach(l => {
            if (l.title.trim().length > 3) {
                titleMap.set(l.title.trim().toLowerCase(), l.id);
            }
        });

        // Split paragraphs
        const paragraphs = content.split(/\n\n+/);

        return paragraphs.map((para, pIdx) => {
            // First replace markdown bold/italics markers gracefully
            let text = para;

            // Check if paragraph is a heading
            if (text.startsWith('### ')) {
                return <h4 key={pIdx} className="text-base font-black text-purple-300 mt-4 mb-2 tracking-wide font-mono uppercase">{text.replace('### ', '')}</h4>;
            }
            if (text.startsWith('## ')) {
                return <h3 key={pIdx} className="text-lg font-black text-white mt-5 mb-2.5 tracking-tight border-b border-neutral-800 pb-1">{text.replace('## ', '')}</h3>;
            }
            if (text.startsWith('# ')) {
                return <h2 key={pIdx} className="text-xl font-black text-white mt-6 mb-3 tracking-tight">{text.replace('# ', '')}</h2>;
            }

            // Parse [[Wiki Link]] patterns and titles
            const parts: React.ReactNode[] = [];
            let remaining = text;
            let counter = 0;

            // Regex matches [[WikiLink]] or existing lore titles
            const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
            let lastIndex = 0;
            let match: RegExpExecArray | null;

            while ((match = wikiLinkRegex.exec(remaining)) !== null) {
                const before = remaining.substring(lastIndex, match.index);
                if (before) parts.push(before);

                const linkTitle = match[1].trim();
                const matchedLore = lore.find(l => l.title.toLowerCase() === linkTitle.toLowerCase());

                if (matchedLore) {
                    parts.push(
                        <button
                            key={`wiki-link-${counter++}`}
                            onClick={() => setSelectedEntryId(matchedLore.id)}
                            className="text-blue-400 hover:text-blue-300 underline font-bold bg-blue-950/40 px-1 py-0.5 rounded transition-colors inline-flex items-center gap-1 cursor-pointer mx-0.5"
                            title={`Jump to Lore Wiki: ${matchedLore.title}`}
                        >
                            <span>🔗</span> {linkTitle}
                        </button>
                    );
                } else {
                    parts.push(
                        <span key={`wiki-stub-${counter++}`} className="text-amber-400/90 bg-amber-950/30 px-1 py-0.5 rounded border border-amber-800/40 font-mono text-xs inline-block">
                            [[{linkTitle}]]
                        </span>
                    );
                }
                lastIndex = wikiLinkRegex.lastIndex;
            }

            if (lastIndex < remaining.length) {
                const rest = remaining.substring(lastIndex);

                // Auto-detect mention of characters
                const charMatches: React.ReactNode[] = [];
                let charText = rest;
                
                parts.push(charText);
            }

            return (
                <p key={pIdx} className="text-sm leading-relaxed text-neutral-300 mb-4 font-sans selection:bg-purple-900 selection:text-white">
                    {parts}
                </p>
            );
        });
    };

    return (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[760px]">
            {/* Wiki Header */}
            <div className="bg-neutral-950/90 px-6 py-4 border-b border-neutral-800 flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">📖</span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-white uppercase tracking-wider">Lore Wiki</h3>
                            <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-mono font-bold">
                                {lore.length} Articles
                            </span>
                        </div>
                        <p className="text-xs text-neutral-400">
                            Hyperlinkable narrative repository with automated cross-referencing and acoustic speech narration.
                        </p>
                    </div>
                </div>

                {/* Right controls: Text-to-Audio Narrate Button & Voice Settings */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Voice Lab Voice Selector */}
                    <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5">
                        <span className="text-xs text-neutral-400 font-mono">Voice:</span>
                        <select
                            value={selectedVoice}
                            onChange={(e) => setSelectedVoice(e.target.value)}
                            className="bg-transparent text-xs text-purple-300 font-bold outline-none cursor-pointer"
                        >
                            <option value="Kore" className="bg-neutral-900 text-white">Kore (Authoritative)</option>
                            <option value="Fenrir" className="bg-neutral-900 text-white">Fenrir (Deep / Dramatic)</option>
                            <option value="Puck" className="bg-neutral-900 text-white">Puck (Fast / Energetic)</option>
                            <option value="Zephyr" className="bg-neutral-900 text-white">Zephyr (Warm / Natural)</option>
                            <option value="Charon" className="bg-neutral-900 text-white">Charon (Ancient / Grave)</option>
                        </select>
                    </div>

                    {/* Speed Selector */}
                    <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5">
                        <span className="text-[10px] text-neutral-400 font-mono">Speed:</span>
                        {[0.8, 1.0, 1.25].map(r => (
                            <button
                                key={r}
                                onClick={() => setSpeechRate(r)}
                                className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                    speechRate === r ? 'bg-purple-600 text-white font-bold' : 'text-neutral-400 hover:text-white'
                                }`}
                            >
                                {r}x
                            </button>
                        ))}
                    </div>

                    {/* Primary TEXT-TO-AUDIO Narrate Button */}
                    <button
                        onClick={handleToggleNarration}
                        disabled={!activeEntry || audioLoading}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg cursor-pointer ${
                            isNarrating
                                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse border border-rose-400'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white border border-purple-400/40 hover:scale-[1.02]'
                        } disabled:opacity-50`}
                        title="Narrate this lore article using Voice Lab text-to-audio models"
                    >
                        {audioLoading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Synthesizing...</span>
                            </>
                        ) : isNarrating ? (
                            <>
                                <span>⏹️</span>
                                <span>Stop Audio</span>
                            </>
                        ) : (
                            <>
                                <span>🎙️</span>
                                <span>Text-to-Audio</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Audio Element Hidden for Playback */}
            <audio 
                ref={audioRef} 
                onEnded={() => setIsNarrating(false)} 
                onError={() => setIsNarrating(false)} 
                className="hidden" 
            />

            {/* Narration Status Bar if Active */}
            {isNarrating && (
                <div className="bg-purple-950/50 border-b border-purple-800/40 px-6 py-2 flex items-center justify-between animate-fade-in text-xs">
                    <div className="flex items-center gap-2.5 text-purple-300">
                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                        <span className="font-mono font-bold">
                            Narrating "{activeEntry?.title}" with Voice Lab ({selectedVoice} • {speechRate}x)
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="inline-block w-1 h-3 bg-purple-400 animate-pulse" />
                        <span className="inline-block w-1 h-4 bg-indigo-400 animate-pulse delay-75" />
                        <span className="inline-block w-1 h-2 bg-purple-400 animate-pulse delay-150" />
                        <span className="inline-block w-1 h-5 bg-indigo-300 animate-pulse delay-100" />
                    </div>
                </div>
            )}

            {audioError && (
                <div className="bg-rose-950/40 border-b border-rose-800/40 px-6 py-1.5 text-xs text-rose-300 flex items-center justify-between">
                    <span>⚠️ {audioError}</span>
                    <button onClick={() => setAudioError(null)} className="text-rose-400 hover:text-white">✕</button>
                </div>
            )}

            {/* Main Wiki Body: Two columns (TOC Left, Article Document Right) */}
            <div className="flex-1 flex overflow-hidden">
                {/* Table of Contents (TOC) Sidebar */}
                <div className="w-80 border-r border-neutral-800 bg-black/40 flex flex-col flex-shrink-0">
                    {/* Search & Filter Header */}
                    <div className="p-3 border-b border-neutral-800/80 space-y-2">
                        <div className="relative">
                            <span className="absolute left-2.5 top-2.5 text-neutral-500 text-xs">🔍</span>
                            <input
                                type="text"
                                placeholder="Search Wiki articles..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-purple-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* TOC Entry List */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                        {Object.keys(groupedTOC).length === 0 ? (
                            <div className="p-4 text-center text-neutral-500 text-xs italic">
                                No matching lore articles found.
                            </div>
                        ) : (
                            Object.keys(groupedTOC).sort().map(letter => (
                                <div key={letter} className="space-y-1">
                                    <div className="text-[10px] font-mono font-black text-purple-400/80 px-2 py-0.5 bg-neutral-900/60 rounded uppercase tracking-widest">
                                        {letter}
                                    </div>
                                    <div className="space-y-0.5">
                                        {groupedTOC[letter].map(item => {
                                            const isSelected = activeEntry?.id === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => setSelectedEntryId(item.id)}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between group cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-purple-600/30 text-white font-bold border-l-2 border-purple-500'
                                                            : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
                                                    }`}
                                                >
                                                    <span className="truncate pr-2">{item.title}</span>
                                                    <span className="text-[9px] font-mono text-neutral-500 group-hover:text-neutral-400 flex-shrink-0">
                                                        {item.content.length > 200 ? `${Math.round(item.content.length / 5)}w` : 'brief'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Quick Jump / Stats Footer */}
                    <div className="p-3 border-t border-neutral-800/80 text-[10px] text-neutral-500 flex justify-between font-mono">
                        <span>Showing {categorizedEntries.length} of {lore.length}</span>
                        <span>Hyperlinks: Active</span>
                    </div>
                </div>

                {/* Article Document View */}
                <div className="flex-1 overflow-y-auto p-8 bg-neutral-900/30">
                    {activeEntry ? (
                        <div className="max-w-3xl mx-auto space-y-6">
                            {/* Breadcrumbs & Metadata Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-neutral-800">
                                <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
                                    <span className="hover:text-white cursor-pointer" onClick={() => setSearchQuery('')}>Lore Bible</span>
                                    <span>/</span>
                                    <span className="text-purple-400 font-bold">{activeEntry.title}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono">
                                        ID: {activeEntry.id.slice(0, 10)}
                                    </span>
                                    <span className="text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 px-2 py-0.5 rounded font-mono font-bold">
                                        ~{Math.max(1, Math.round(activeEntry.content.split(/\s+/).length / 150))} min read
                                    </span>
                                </div>
                            </div>

                            {/* Article Title */}
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                                    {activeEntry.title}
                                </h1>
                            </div>

                            {/* Main Document Body */}
                            <div className="prose prose-invert max-w-none text-neutral-200">
                                {renderHyperlinkableContent(activeEntry.content)}
                            </div>

                            {/* Cross-Referenced Entities & Lore Connections Footer */}
                            <div className="mt-8 pt-6 border-t border-neutral-800 space-y-3">
                                <span className="text-xs font-black uppercase text-neutral-400 tracking-wider font-mono flex items-center gap-2">
                                    <span>🌐</span> Interconnected Entities & Cross-References
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {lore.filter(l => l.id !== activeEntry.id && (
                                        activeEntry.content.toLowerCase().includes(l.title.toLowerCase()) ||
                                        l.content.toLowerCase().includes(activeEntry.title.toLowerCase())
                                    )).map(rel => (
                                        <button
                                            key={rel.id}
                                            onClick={() => setSelectedEntryId(rel.id)}
                                            className="px-3 py-1 bg-neutral-800/80 hover:bg-purple-900/40 text-neutral-300 hover:text-white border border-neutral-700/60 hover:border-purple-500 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <span>📄</span>
                                            <span>{rel.title}</span>
                                        </button>
                                    ))}
                                    {characters.filter(c => activeEntry.content.toLowerCase().includes(c.name.toLowerCase())).map(char => (
                                        <span
                                            key={char.id}
                                            className="px-2.5 py-1 bg-purple-950/40 text-purple-300 border border-purple-800/40 rounded-lg text-xs font-medium flex items-center gap-1"
                                        >
                                            <span>👤</span>
                                            <span>{char.name}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                            <span className="text-4xl text-neutral-600">📜</span>
                            <h4 className="text-base font-bold text-neutral-300">No Lore Article Selected</h4>
                            <p className="text-xs text-neutral-500 max-w-sm">
                                Select an article from the Table of Contents on the left to read and listen to the world-building details.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
