import React, { useState } from 'react';
import { LoreEntry, Character, SavedTranscript, LoreQueryResponse, LoreQueryCitation } from '../types.ts';
import { queryLoreAndTranscriptsWithGemini } from '../services/geminiService.ts';

interface LoreQuerySearchBarProps {
    lore: LoreEntry[];
    transcripts?: SavedTranscript[];
    characters?: Character[];
    onSelectLore?: (loreId: string) => void;
    onSelectTranscript?: (transcriptId: string) => void;
    activeProjectId?: string;
}

const PRESET_QUERIES = [
    "What are the central factions and their conflicting motives?",
    "Where does Elena conflict with Marcus across lore and audio logs?",
    "What magical rules or technological paradigms govern this world?",
    "Summarize major historical battles, disasters, and turning points."
];

export const LoreQuerySearchBar: React.FC<LoreQuerySearchBarProps> = ({
    lore,
    transcripts = [],
    characters = [],
    onSelectLore,
    onSelectTranscript,
    activeProjectId
}) => {
    const [queryText, setQueryText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<LoreQueryResponse | null>(() => {
        try {
            const cached = localStorage.getItem(`lore_query_last_${activeProjectId || 'default'}`);
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });
    const [error, setError] = useState<string | null>(null);
    const [copiedSummary, setCopiedSummary] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [evidenceFilter, setEvidenceFilter] = useState<'all' | 'lore' | 'transcript'>('all');

    const handleSearch = async (overrideQuery?: string) => {
        const queryToRun = (overrideQuery || queryText).trim();
        if (!queryToRun) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await queryLoreAndTranscriptsWithGemini({
                query: queryToRun,
                lore,
                transcripts,
                characters
            });

            setResult(response);
            setIsExpanded(true);

            try {
                localStorage.setItem(`lore_query_last_${activeProjectId || 'default'}`, JSON.stringify(response));
            } catch {}
        } catch (err) {
            console.error("Lore Query Search failed:", err);
            setError(err instanceof Error ? err.message : "Failed to execute semantic query.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleClear = () => {
        setQueryText('');
        setResult(null);
        setError(null);
        try {
            localStorage.removeItem(`lore_query_last_${activeProjectId || 'default'}`);
        } catch {}
    };

    const handleCopy = () => {
        if (!result) return;
        const textToCopy = `LORE QUERY: "${result.query}"\n\nNARRATIVE SUMMARY:\n${result.summary}\n\nNARRATIVE CONTEXT:\n${result.narrativeContext}\n\nSCREENPLAY IMPLICATIONS:\n${result.screenplayImplications}\n\nCITED EVIDENCE:\n` +
            result.directEvidence.map(e => `- [${e.sourceType.toUpperCase()}] ${e.title}: "${e.quoteOrSnippet}"`).join('\n');
        
        navigator.clipboard.writeText(textToCopy);
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2500);
    };

    const filteredEvidence = (result?.directEvidence || []).filter(e => {
        if (evidenceFilter === 'lore') return e.sourceType === 'lore';
        if (evidenceFilter === 'transcript') return e.sourceType === 'transcript';
        return true;
    });

    return (
        <div className="bg-gradient-to-r from-neutral-900/90 via-indigo-950/30 to-neutral-900/90 border border-indigo-900/40 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
            {/* Header & Instructions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                    <span className="text-lg">🔮</span>
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 font-mono">
                            <span>Natural Language Lore Query</span>
                            <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/60 font-bold px-2 py-0.5 rounded-full">
                                Powered by Gemini
                            </span>
                        </h3>
                        <p className="text-xs text-neutral-400 mt-0.5">
                            Semantically searches across <strong className="text-indigo-300 font-mono">{lore.length} lore entries</strong> and <strong className="text-indigo-300 font-mono">{transcripts.length} voice transcripts</strong> to produce context-aware summaries instead of simple keyword matches.
                        </p>
                    </div>
                </div>

                {result && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsExpanded(prev => !prev)}
                            className="text-xs text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/60 font-medium transition cursor-pointer"
                        >
                            {isExpanded ? '▲ Collapse Result' : '▼ Expand Result'}
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            className="text-xs text-neutral-400 hover:text-rose-400 px-2.5 py-1 rounded-lg bg-neutral-800/80 border border-neutral-700/60 font-medium transition cursor-pointer"
                        >
                            ✕ Clear
                        </button>
                    </div>
                )}
            </div>

            {/* Search Input Bar */}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSearch();
                }}
                className="flex flex-col sm:flex-row gap-2"
            >
                <div className="relative flex-grow">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-indigo-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={queryText}
                        onChange={(e) => setQueryText(e.target.value)}
                        placeholder="Ask anything about story canon, faction histories, or spoken transcript notes..."
                        disabled={isLoading}
                        className="w-full bg-black/70 border border-neutral-750 focus:border-indigo-500 rounded-xl pl-10 pr-10 py-3 text-xs text-white placeholder-neutral-500 outline-none transition shadow-inner font-sans"
                    />
                    {queryText && (
                        <button
                            type="button"
                            onClick={() => setQueryText('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 text-xs cursor-pointer"
                        >
                            ✕
                        </button>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isLoading || !queryText.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black uppercase text-xs tracking-wider rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                    {isLoading ? (
                        <>
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Synthesizing...</span>
                        </>
                    ) : (
                        <>
                            <span>✨</span>
                            <span>Query Canon</span>
                        </>
                    )}
                </button>
            </form>

            {/* Quick Prompt Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mr-1">
                    Try Query:
                </span>
                {PRESET_QUERIES.map((preset, idx) => (
                    <button
                        key={idx}
                        type="button"
                        onClick={() => {
                            setQueryText(preset);
                            handleSearch(preset);
                        }}
                        disabled={isLoading}
                        className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-lg text-[10px] font-medium transition cursor-pointer disabled:opacity-50"
                    >
                        "{preset}"
                    </button>
                ))}
            </div>

            {/* Error Message */}
            {error && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center justify-between">
                    <span>⚠️ {error}</span>
                    <button
                        type="button"
                        onClick={() => handleSearch()}
                        className="px-2.5 py-1 bg-rose-900/60 hover:bg-rose-900 text-white rounded text-[10px] font-bold"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Structured Search Result Card */}
            {result && isExpanded && (
                <div className="bg-neutral-950/80 border border-indigo-900/50 rounded-xl p-5 space-y-4 shadow-2xl animate-fadeIn">
                    {/* Result Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-indigo-400 font-mono tracking-wider">
                                Semantic Answer
                            </span>
                            <span className="text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-mono font-bold">
                                {result.confidenceScore}% Confidence
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 border border-neutral-700"
                            >
                                <span>{copiedSummary ? '✓ Copied' : '📋 Copy Summary'}</span>
                            </button>
                        </div>
                    </div>

                    {/* Context-Aware Summary */}
                    <div className="space-y-2">
                        <div className="text-xs sm:text-sm text-neutral-100 leading-relaxed font-sans whitespace-pre-line bg-black/40 p-4 rounded-xl border border-neutral-850">
                            {result.summary}
                        </div>

                        {result.narrativeContext && (
                            <p className="text-[11px] text-neutral-400 italic bg-neutral-900/40 px-3 py-2 rounded-lg border border-neutral-900">
                                📌 <strong>Narrative Context:</strong> {result.narrativeContext}
                            </p>
                        )}
                    </div>

                    {/* Badges: Thematic Themes & Character Connections */}
                    {(result.thematicThemes.length > 0 || result.characterConnections.length > 0) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-900">
                            {result.thematicThemes.map((theme, i) => (
                                <span
                                    key={i}
                                    className="px-2.5 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-800/60 text-indigo-300 text-[10px] font-mono font-medium"
                                >
                                    #{theme}
                                </span>
                            ))}
                            {result.characterConnections.map((charName, i) => (
                                <span
                                    key={i}
                                    className="px-2.5 py-0.5 rounded-full bg-purple-950/70 border border-purple-800/60 text-purple-300 text-[10px] font-mono font-medium"
                                >
                                    👤 {charName}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Direct Evidence & Citations */}
                    {result.directEvidence && result.directEvidence.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-neutral-900">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider font-mono flex items-center gap-1.5">
                                    <span>🔍</span> Direct Canon & Transcript Evidence ({result.directEvidence.length})
                                </span>

                                <div className="flex items-center gap-1 text-[10px]">
                                    <button
                                        type="button"
                                        onClick={() => setEvidenceFilter('all')}
                                        className={`px-2 py-0.5 rounded ${evidenceFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white'}`}
                                    >
                                        All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEvidenceFilter('lore')}
                                        className={`px-2 py-0.5 rounded ${evidenceFilter === 'lore' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white'}`}
                                    >
                                        Lore
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEvidenceFilter('transcript')}
                                        className={`px-2 py-0.5 rounded ${evidenceFilter === 'transcript' ? 'bg-indigo-600 text-white' : 'text-neutral-500 hover:text-white'}`}
                                    >
                                        Transcripts
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                {filteredEvidence.map((citation: LoreQueryCitation, idx: number) => {
                                    const isLore = citation.sourceType === 'lore';
                                    return (
                                        <div
                                            key={idx}
                                            className="bg-neutral-900/70 border border-neutral-800 p-3 rounded-xl space-y-1.5 hover:border-neutral-700 transition"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5 truncate">
                                                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded font-mono ${
                                                        isLore
                                                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                                            : 'bg-purple-950 text-purple-300 border border-purple-800'
                                                    }`}>
                                                        {isLore ? '📖 Lore' : '🎙️ Transcript'}
                                                    </span>
                                                    <span className="text-xs font-bold text-white truncate">
                                                        {citation.title}
                                                    </span>
                                                </div>

                                                <span className="text-[9px] font-mono text-neutral-400 shrink-0">
                                                    {citation.relevanceScore}% Match
                                                </span>
                                            </div>

                                            <p className="text-[11px] text-neutral-300 italic line-clamp-3 bg-black/40 p-2 rounded border border-neutral-850">
                                                "{citation.quoteOrSnippet}"
                                            </p>

                                            {isLore && onSelectLore && (
                                                <div className="flex justify-end pt-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectLore(citation.id)}
                                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold transition cursor-pointer"
                                                    >
                                                        Open Lore Entry →
                                                    </button>
                                                </div>
                                            )}

                                            {!isLore && onSelectTranscript && (
                                                <div className="flex justify-end pt-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectTranscript(citation.id)}
                                                        className="text-[10px] text-purple-400 hover:text-purple-300 font-bold transition cursor-pointer"
                                                    >
                                                        View Transcript →
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Screenplay Implications */}
                    {result.screenplayImplications && (
                        <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-1">
                            <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider font-mono block">
                                🎬 Screenplay & Directing Guidance
                            </span>
                            <p className="text-xs text-neutral-300 leading-relaxed">
                                {result.screenplayImplications}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
