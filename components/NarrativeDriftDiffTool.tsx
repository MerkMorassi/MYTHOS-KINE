import React, { useState, useMemo } from 'react';
import { LoreEntry, NarrativeDriftAnalysis } from '../types';
import { analyzeNarrativeDriftService } from '../services/geminiService';

interface NarrativeDriftDiffToolProps {
    lore: LoreEntry[];
    scriptsBin?: any[];
    activeProjectId?: string;
    onUpdateLore?: (id: string, title: string, content: string) => void;
    onCreateLore?: (title: string, content: string) => void;
}

interface DiffToken {
    type: 'same' | 'added' | 'removed';
    value: string;
}

export const NarrativeDriftDiffTool: React.FC<NarrativeDriftDiffToolProps> = ({
    lore = [],
    scriptsBin = [],
    activeProjectId,
    onUpdateLore,
    onCreateLore
}) => {
    // Selection state
    const [selectedLoreId, setSelectedLoreId] = useState<string>(lore[0]?.id || '');
    const [selectedScriptId, setSelectedScriptId] = useState<string>(scriptsBin[0]?.id || 'custom');
    const [customScriptSnippet, setCustomScriptSnippet] = useState<string>(() => {
        return scriptsBin[0]?.content?.slice(0, 1200) || `INT. CITADEL ARCHIVES - NIGHT\n\nVAELEN enters the forbidden vault, clutching the broken Obsidian Seal.\n\nVAELEN\nThe Council was dissolved three years ago, Marcus. We no longer answer to their oaths.\n\nMARCUS\nYou swore your allegiance under the ancient charter. If you breach this stasis field, the timeline collapses.\n\nVAELEN\nThere is no timeline left to save.`;
    });
    
    // View modes
    const [diffMode, setDiffMode] = useState<'side-by-side' | 'unified'>('side-by-side');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<NarrativeDriftAnalysis | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [statusToast, setStatusToast] = useState<string | null>(null);

    // Active canonical lore entry
    const activeLore = useMemo(() => {
        return lore.find(l => l.id === selectedLoreId) || lore[0] || {
            id: 'sample_lore',
            title: 'Sample Lore: The Obsidian Council Treaty',
            content: 'The Obsidian Council Treaty binds all Wardens, including Vaelen, to protect the stasis field at all costs until the Year of the Eclipse. Any Warden who breaks the seal faces perpetual exile from the Citadel.'
        };
    }, [lore, selectedLoreId]);

    // Active script content
    const activeScriptText = useMemo(() => {
        if (selectedScriptId === 'custom') {
            return customScriptSnippet;
        }
        const found = scriptsBin.find(s => s.id === selectedScriptId);
        return found?.content || customScriptSnippet;
    }, [scriptsBin, selectedScriptId, customScriptSnippet]);

    // Compute Word-level diff tokens
    const diffTokens = useMemo(() => {
        const loreWords = activeLore.content.split(/(\s+)/);
        const scriptWords = activeScriptText.split(/(\s+)/);

        const tokens: DiffToken[] = [];
        const loreWordSet = new Set(activeLore.content.toLowerCase().split(/\W+/).filter(Boolean));
        const scriptWordSet = new Set(activeScriptText.toLowerCase().split(/\W+/).filter(Boolean));

        // Tokenized representation
        scriptWords.forEach(word => {
            const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!clean || /^\s+$/.test(word)) {
                tokens.push({ type: 'same', value: word });
            } else if (!loreWordSet.has(clean)) {
                tokens.push({ type: 'added', value: word });
            } else {
                tokens.push({ type: 'same', value: word });
            }
        });

        return tokens;
    }, [activeLore.content, activeScriptText]);

    // Compute Lore side tokens (what was removed / absent from script)
    const loreDiffTokens = useMemo(() => {
        const scriptWordSet = new Set(activeScriptText.toLowerCase().split(/\W+/).filter(Boolean));
        const loreWords = activeLore.content.split(/(\s+)/);

        return loreWords.map(word => {
            const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!clean || /^\s+$/.test(word)) {
                return { type: 'same' as const, value: word };
            }
            if (!scriptWordSet.has(clean)) {
                return { type: 'removed' as const, value: word };
            }
            return { type: 'same' as const, value: word };
        });
    }, [activeLore.content, activeScriptText]);

    // Run AI Semantic Drift Analysis
    const handleRunAnalysis = async () => {
        if (!activeLore.content.trim() || !activeScriptText.trim()) {
            setError("Please provide both canonical lore text and a script snippet to diff.");
            return;
        }

        setIsAnalyzing(true);
        setError(null);

        try {
            const result = await analyzeNarrativeDriftService({
                loreTitle: activeLore.title,
                loreContent: activeLore.content,
                scriptTitle: selectedScriptId === 'custom' ? 'Custom Script Snippet' : (scriptsBin.find(s => s.id === selectedScriptId)?.title || 'Screenplay Draft'),
                scriptSnippet: activeScriptText
            });

            setAnalysis(result);
            setStatusToast(`Analysis complete: ${result.driftScore}% narrative drift detected (${result.status.toUpperCase()}).`);
            setTimeout(() => setStatusToast(null), 4000);
        } catch (err: any) {
            console.error("Drift analysis failed:", err);
            setError(err.message || "Failed to analyze narrative drift.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Apply Reconciled Lore Entry Update
    const handleApplyLoreUpdate = () => {
        if (!analysis?.suggestedLoreUpdate) return;

        if (onUpdateLore && activeLore.id) {
            onUpdateLore(
                activeLore.id,
                activeLore.title,
                analysis.suggestedLoreUpdate
            );
            setStatusToast(`Updated Lore Entry "${activeLore.title}" with reconciled canon!`);
            setTimeout(() => setStatusToast(null), 3500);
        } else if (onCreateLore) {
            onCreateLore(
                `Reconciled: ${activeLore.title}`,
                analysis.suggestedLoreUpdate
            );
            setStatusToast(`Created new reconciled lore entry!`);
            setTimeout(() => setStatusToast(null), 3500);
        }
    };

    // Copy Revision Notes to Clipboard
    const handleCopyNotes = () => {
        if (!analysis) return;
        const notes = `# 🔍 Narrative Drift & Continuity Report
**Lore Entry:** ${activeLore.title}
**Drift Severity:** ${analysis.driftScore}% (${analysis.status.toUpperCase()})
**Identified Categories:** ${analysis.driftCategories.join(', ')}

## Executive Summary
${analysis.summary}

## Divergences & Contradictions
${analysis.divergences.map((d, i) => `### Divergence ${i + 1} [${d.severity.toUpperCase()}]
- **Canonical Lore:** "${d.loreStatement}"
- **Script Snippet:** "${d.scriptStatement}"
- **Analysis:** ${d.explanation}
`).join('\n')}

## Recommended Continuity Corrections
${analysis.reconciliationAdvice.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;

        navigator.clipboard.writeText(notes);
        setStatusToast("Copied continuity notes & drift report to clipboard!");
        setTimeout(() => setStatusToast(null), 3500);
    };

    return (
        <div className="space-y-6 font-sans">
            {/* Status Toast */}
            {statusToast && (
                <div className="fixed bottom-6 right-6 z-50 bg-emerald-950/95 border border-emerald-500 text-emerald-200 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold animate-fade-in flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{statusToast}</span>
                </div>
            )}

            {/* Header & Tool Description */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-800 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🔍</span>
                            <h3 className="text-sm font-black text-white uppercase tracking-widest">
                                Visual Narrative Drift & Text Diffing Tool
                            </h3>
                            <span className="text-[9px] bg-red-950/80 text-rose-400 border border-rose-900/60 font-mono px-2 py-0.5 rounded-full uppercase">
                                Continuity Guard
                            </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 font-medium mt-1">
                            Compare screenplay dialogue and scene snippets against canonical lore entries to expose narrative drifts, motive inversions, and timeline paradoxes.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleRunAnalysis}
                            disabled={isAnalyzing}
                            className="px-4 py-2 bg-gradient-to-r from-red-600 via-rose-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                        >
                            {isAnalyzing ? (
                                <>
                                    <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                    <span>Scanning Drift...</span>
                                </>
                            ) : (
                                <>
                                    <span>⚡</span>
                                    <span>Analyze Narrative Drift</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Source Selectors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Lore Source */}
                    <div className="bg-black/40 border border-neutral-800 p-3.5 rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-purple-400 tracking-wider flex items-center gap-1.5">
                                <span>📜</span> 01 — Canonical Lore Ground Truth
                            </label>
                            <span className="text-[9px] font-mono text-neutral-500">{lore.length} Entries</span>
                        </div>
                        <select
                            value={selectedLoreId}
                            onChange={(e) => setSelectedLoreId(e.target.value)}
                            className="w-full bg-neutral-900 border border-neutral-750 text-white text-xs p-2 rounded-lg font-mono focus:outline-none focus:border-purple-500"
                        >
                            {lore.map(l => (
                                <option key={l.id} value={l.id}>
                                    {l.title} ({l.content.length} chars)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Right: Script Source */}
                    <div className="bg-black/40 border border-neutral-800 p-3.5 rounded-xl space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                                <span>🎬</span> 02 — Screenplay Snippet or Draft
                            </label>
                            <span className="text-[9px] font-mono text-neutral-500">
                                {scriptsBin.length} Script Drafts
                            </span>
                        </div>
                        <select
                            value={selectedScriptId}
                            onChange={(e) => {
                                setSelectedScriptId(e.target.value);
                                if (e.target.value !== 'custom') {
                                    const s = scriptsBin.find(sb => sb.id === e.target.value);
                                    if (s?.content) setCustomScriptSnippet(s.content);
                                }
                            }}
                            className="w-full bg-neutral-900 border border-neutral-750 text-white text-xs p-2 rounded-lg font-mono focus:outline-none focus:border-amber-500"
                        >
                            <option value="custom">✍️ Custom Snippet / Live Input</option>
                            {scriptsBin.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.title || 'Screenplay Draft'}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Editable snippet if custom is selected */}
                {selectedScriptId === 'custom' && (
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                            Paste or Edit Screenplay Scene Excerpt
                        </label>
                        <textarea
                            value={customScriptSnippet}
                            onChange={(e) => setCustomScriptSnippet(e.target.value)}
                            placeholder="Paste script dialogue or action lines here..."
                            rows={3}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-neutral-700"
                        />
                    </div>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-rose-300 text-xs font-semibold flex items-center gap-2">
                    <span>⚠️</span>
                    <span>{error}</span>
                </div>
            )}

            {/* AI Narrative Drift Metrics & Insights Panel */}
            {analysis && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-5 animate-fade-in">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-neutral-800 pb-4">
                        <div className="flex items-center gap-3">
                            {/* Score Ring */}
                            <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black border ${
                                analysis.driftScore > 50
                                    ? 'bg-rose-950/80 border-rose-600 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                                    : analysis.driftScore > 20
                                        ? 'bg-amber-950/80 border-amber-600 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                                        : 'bg-emerald-950/80 border-emerald-600 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                            }`}>
                                <span className="text-lg leading-none">{analysis.driftScore}%</span>
                                <span className="text-[8px] uppercase tracking-wider opacity-70">Drift</span>
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-black text-white uppercase tracking-wider">
                                        Narrative Drift Index
                                    </h4>
                                    <span className={`text-[9px] font-black uppercase font-mono px-2 py-0.5 rounded-full border ${
                                        analysis.status === 'critical'
                                            ? 'bg-rose-950 text-rose-400 border-rose-800'
                                            : analysis.status === 'moderate'
                                                ? 'bg-amber-950 text-amber-400 border-amber-800'
                                                : 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                    }`}>
                                        {analysis.status}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {analysis.driftCategories.map((cat, i) => (
                                        <span key={i} className="text-[9px] font-mono bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded border border-neutral-750">
                                            #{cat}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleCopyNotes}
                                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg border border-neutral-700 transition flex items-center gap-1.5 cursor-pointer"
                            >
                                <span>📋</span> Copy Notes
                            </button>
                            {analysis.suggestedLoreUpdate && (
                                <button
                                    onClick={handleApplyLoreUpdate}
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer"
                                    title="Update canonical lore entry with new script canon"
                                >
                                    <span>💾</span> Reconcile Lore
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Executive Summary */}
                    <div className="bg-black/40 p-4 rounded-xl border border-neutral-800 space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 block font-mono">
                            Continuity Diagnosis
                        </span>
                        <p className="text-xs text-neutral-200 leading-relaxed font-sans">
                            {analysis.summary}
                        </p>
                    </div>

                    {/* Divergences list */}
                    {analysis.divergences.length > 0 && (
                        <div className="space-y-2.5">
                            <h5 className="text-[11px] font-black uppercase tracking-wider text-neutral-400 font-mono">
                                Specific Canon Contradictions ({analysis.divergences.length})
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {analysis.divergences.map((div, idx) => (
                                    <div key={idx} className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                                                div.severity === 'high' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                                            }`}>
                                                Severity: {div.severity}
                                            </span>
                                            <span className="text-[9px] font-mono text-neutral-500">Conflict #{idx + 1}</span>
                                        </div>

                                        <div className="space-y-1 text-xs">
                                            <div className="p-2 rounded bg-rose-950/30 border border-rose-900/40 text-rose-200 text-[11px] leading-relaxed">
                                                <strong className="text-[9px] uppercase font-mono block text-rose-400">Canonical Lore:</strong>
                                                "{div.loreStatement}"
                                            </div>
                                            <div className="p-2 rounded bg-amber-950/30 border border-amber-900/40 text-amber-200 text-[11px] leading-relaxed">
                                                <strong className="text-[9px] uppercase font-mono block text-amber-400">Script Dialogue:</strong>
                                                "{div.scriptStatement}"
                                            </div>
                                        </div>

                                        <p className="text-[10px] text-neutral-400 italic">
                                            {div.explanation}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reconciliation Recommendations */}
                    {analysis.reconciliationAdvice.length > 0 && (
                        <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/40 space-y-2">
                            <h5 className="text-[10px] font-black uppercase tracking-wider text-purple-400 font-mono">
                                🛠 Recommended Writers' Room Actions
                            </h5>
                            <ul className="space-y-1">
                                {analysis.reconciliationAdvice.map((rec, i) => (
                                    <li key={i} className="text-xs text-neutral-300 flex items-start gap-2">
                                        <span className="text-purple-400 shrink-0 font-bold">•</span>
                                        <span>{rec}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Visual Diff View Controller */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-xs font-black uppercase text-neutral-300 tracking-wider">
                            Interactive Visual Text Diff
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                            <span className="flex items-center gap-1 text-rose-400">
                                <span className="w-2.5 h-2.5 rounded bg-rose-600/40 border border-rose-500 inline-block" />
                                <span>Removed Canon</span>
                            </span>
                            <span className="flex items-center gap-1 text-emerald-400">
                                <span className="w-2.5 h-2.5 rounded bg-emerald-600/40 border border-emerald-500 inline-block" />
                                <span>Script Addition</span>
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-1 bg-black/60 p-1 rounded-xl border border-neutral-800 text-[10px] font-bold">
                        <button
                            onClick={() => setDiffMode('side-by-side')}
                            className={`px-3 py-1 rounded-lg transition ${
                                diffMode === 'side-by-side' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            Side-by-Side
                        </button>
                        <button
                            onClick={() => setDiffMode('unified')}
                            className={`px-3 py-1 rounded-lg transition ${
                                diffMode === 'unified' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            Unified Stream
                        </button>
                    </div>
                </div>

                {/* Diff Viewer Panels */}
                {diffMode === 'side-by-side' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Canonical Lore Left Panel */}
                        <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-mono border-b border-neutral-850 pb-2">
                                <span className="text-purple-400 font-bold uppercase">📜 Canonical Lore Bible</span>
                                <span className="text-neutral-500">{activeLore.title}</span>
                            </div>
                            <div className="text-xs font-mono leading-relaxed whitespace-pre-wrap select-text p-2 max-h-96 overflow-y-auto custom-scrollbar">
                                {loreDiffTokens.map((token, idx) => (
                                    <span
                                        key={idx}
                                        className={
                                            token.type === 'removed'
                                                ? 'bg-rose-950/70 text-rose-300 line-through border-b border-rose-500/80 px-0.5 rounded'
                                                : 'text-neutral-300'
                                        }
                                    >
                                        {token.value}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Screenplay Excerpt Right Panel */}
                        <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-2">
                            <div className="flex justify-between items-center text-[10px] font-mono border-b border-neutral-850 pb-2">
                                <span className="text-amber-400 font-bold uppercase">🎬 Script Excerpt</span>
                                <span className="text-neutral-500">
                                    {selectedScriptId === 'custom' ? 'Custom Excerpt' : (scriptsBin.find(s => s.id === selectedScriptId)?.title || 'Draft')}
                                </span>
                            </div>
                            <div className="text-xs font-mono leading-relaxed whitespace-pre-wrap select-text p-2 max-h-96 overflow-y-auto custom-scrollbar">
                                {diffTokens.map((token, idx) => (
                                    <span
                                        key={idx}
                                        className={
                                            token.type === 'added'
                                                ? 'bg-emerald-950/70 text-emerald-300 font-bold border-b border-emerald-500/80 px-0.5 rounded'
                                                : 'text-neutral-300'
                                        }
                                    >
                                        {token.value}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Unified Inline Stream */
                    <div className="bg-neutral-950 p-5 rounded-xl border border-neutral-800 space-y-3">
                        <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider border-b border-neutral-850 pb-2">
                            Unified Inline Diff: Canonical Lore ➔ Screenplay Translation
                        </div>
                        <div className="text-xs font-mono leading-relaxed whitespace-pre-wrap p-2 max-h-96 overflow-y-auto custom-scrollbar space-y-2">
                            <div className="p-3 bg-neutral-900/50 rounded-lg border border-neutral-850">
                                <span className="text-[9px] uppercase font-bold text-neutral-500 block mb-1">Drift Comparison:</span>
                                {diffTokens.map((token, idx) => (
                                    <span
                                        key={idx}
                                        className={
                                            token.type === 'added'
                                                ? 'bg-emerald-950/80 text-emerald-300 font-bold px-1 py-0.5 rounded border border-emerald-800/60 mr-0.5 inline-block'
                                                : 'text-neutral-300'
                                        }
                                    >
                                        {token.value}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
