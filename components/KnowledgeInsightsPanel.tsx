import React, { useState, useEffect } from 'react';
import { LoreEntry, Character, KnowledgeInsightsReport, KnowledgeInsightContradiction, ContradictionDomain } from '../types.ts';
import { generateKnowledgeInsightsService } from '../services/geminiService.ts';

interface KnowledgeInsightsPanelProps {
    lore: LoreEntry[];
    characters: Character[];
    scriptsBin?: any[];
    activeProjectId?: string;
    projectName?: string;
    onCreateLore?: (title: string, content: string, projectId: string) => void;
    onSelectLore?: (loreId: string) => void;
}

const DOMAIN_ICONS: Record<ContradictionDomain, string> = {
    'Timeline & Chronology': '⏳',
    'Character Arc & Motivation': '👤',
    'Physical & Tech Rules': '⚙️',
    'World & Environmental Laws': '🌍',
    'Faction & Political Allegiance': '⚔️'
};

const SEVERITY_COLORS: Record<'critical' | 'high' | 'medium' | 'low', { bg: string; text: string; border: string; badge: string }> = {
    critical: {
        bg: 'bg-rose-950/40',
        text: 'text-rose-400',
        border: 'border-rose-800/80',
        badge: 'bg-rose-900/80 text-rose-200 border-rose-700'
    },
    high: {
        bg: 'bg-amber-950/40',
        text: 'text-amber-400',
        border: 'border-amber-800/80',
        badge: 'bg-amber-900/80 text-amber-200 border-amber-700'
    },
    medium: {
        bg: 'bg-yellow-950/30',
        text: 'text-yellow-400',
        border: 'border-yellow-800/70',
        badge: 'bg-yellow-900/80 text-yellow-200 border-yellow-700'
    },
    low: {
        bg: 'bg-blue-950/30',
        text: 'text-blue-400',
        border: 'border-blue-800/70',
        badge: 'bg-blue-900/80 text-blue-200 border-blue-700'
    }
};

export const KnowledgeInsightsPanel: React.FC<KnowledgeInsightsPanelProps> = ({
    lore = [],
    characters = [],
    scriptsBin = [],
    activeProjectId = 'default',
    projectName = 'ZOE FILMS Universe',
    onCreateLore,
    onSelectLore
}) => {
    const [report, setReport] = useState<KnowledgeInsightsReport | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
    const [selectedDomain, setSelectedDomain] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');
    const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
    const [statusToast, setStatusToast] = useState<string | null>(null);

    // Track locally resolved contradictions
    const [resolvedMap, setResolvedMap] = useState<Record<string, boolean>>({});

    // Load cached report
    useEffect(() => {
        try {
            const cacheKey = `mythos_knowledge_insights_${activeProjectId}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                setReport(parsed);
            }
            const resolvedCacheKey = `mythos_knowledge_resolved_${activeProjectId}`;
            const cachedResolved = localStorage.getItem(resolvedCacheKey);
            if (cachedResolved) {
                setResolvedMap(JSON.parse(cachedResolved));
            }
        } catch (e) {
            console.warn("Failed to load cached knowledge insights:", e);
        }
    }, [activeProjectId]);

    const handleRunAudit = async () => {
        setIsLoading(true);
        setStatusToast("Analyzing narrative documents with Gemini for lore contradictions...");

        try {
            const result = await generateKnowledgeInsightsService({
                lore,
                characters,
                scriptsBin,
                projectName
            });

            setReport(result);
            try {
                localStorage.setItem(`mythos_knowledge_insights_${activeProjectId}`, JSON.stringify(result));
            } catch (storageErr) {
                console.warn("Could not cache knowledge insights to localStorage:", storageErr);
            }

            setStatusToast(`Analysis complete! Identified ${result.contradictions.length} contradictions with thematic resolutions.`);
            setTimeout(() => setStatusToast(null), 5000);
        } catch (err: any) {
            console.error("Knowledge insights audit failed:", err);
            setStatusToast(`Audit failed: ${err.message || 'Unknown error'}`);
            setTimeout(() => setStatusToast(null), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggleResolved = (contraId: string) => {
        setResolvedMap(prev => {
            const next = { ...prev, [contraId]: !prev[contraId] };
            try {
                localStorage.setItem(`mythos_knowledge_resolved_${activeProjectId}`, JSON.stringify(next));
            } catch (e) {
                console.warn("Failed to persist resolved status:", e);
            }
            return next;
        });
    };

    const handleAdoptResolution = (contra: KnowledgeInsightContradiction) => {
        if (!onCreateLore) return;
        const title = contra.thematicResolution.suggestedLoreTitle || `${contra.title} (Thematic Reconciliation)`;
        const content = `${contra.thematicResolution.draftLoreContent}\n\n---\n**Thematic Synthesis Strategy:** ${contra.thematicResolution.strategy}\n**Narrative Context:** ${contra.thematicResolution.narrativeSynthesis}\n**Reconciled Entities:** ${contra.conflictingEntities.join(' ⚔️ ')}`;

        onCreateLore(title, content, activeProjectId);

        // Mark as resolved
        setResolvedMap(prev => {
            const next = { ...prev, [contra.id]: true };
            try {
                localStorage.setItem(`mythos_knowledge_resolved_${activeProjectId}`, JSON.stringify(next));
            } catch (e) {}
            return next;
        });

        setStatusToast(`Adopted "${title}" into Lore Bible!`);
        setTimeout(() => setStatusToast(null), 4000);
    };

    // Filter contradictions
    const filteredContradictions = (report?.contradictions || []).filter(c => {
        const isResolved = Boolean(resolvedMap[c.id]);
        if (statusFilter === 'unresolved' && isResolved) return false;
        if (statusFilter === 'resolved' && !isResolved) return false;

        if (selectedSeverity !== 'all' && c.severity !== selectedSeverity) return false;
        if (selectedDomain !== 'all' && c.thematicDomain !== selectedDomain) return false;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const inTitle = c.title.toLowerCase().includes(q);
            const inSummary = c.contradictionSummary.toLowerCase().includes(q);
            const inEntities = c.conflictingEntities.some(e => e.toLowerCase().includes(q));
            const inResolution = c.thematicResolution.strategy.toLowerCase().includes(q) || c.thematicResolution.narrativeSynthesis.toLowerCase().includes(q);
            if (!inTitle && !inSummary && !inEntities && !inResolution) return false;
        }

        return true;
    });

    const totalCount = report?.contradictions.length || 0;
    const resolvedCount = Object.values(resolvedMap).filter(Boolean).length;
    const unresolvedCount = Math.max(0, totalCount - resolvedCount);

    return (
        <div className="flex flex-col h-full w-full bg-[#0c0d12] text-neutral-100 overflow-y-auto p-6 lg:p-8 space-y-6">
            {/* Header / Command Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-neutral-900/80 border border-neutral-800 p-6 rounded-2xl shadow-xl backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">💡</span>
                        <h2 className="text-2xl font-black text-white tracking-tight uppercase">Knowledge Insights & Thematic Resolutions</h2>
                    </div>
                    <p className="text-neutral-400 text-sm max-w-2xl leading-relaxed">
                        Detect continuity paradoxes and canon discrepancies across character backstories, screenplay scenes, and lore documents using Gemini API, with automatic writer-room thematic resolutions.
                    </p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-neutral-400 font-mono">
                        <span>Universe: <strong className="text-white">{projectName}</strong></span>
                        <span>•</span>
                        <span>Lore Entries: <strong className="text-cyan-400">{lore.length}</strong></span>
                        <span>•</span>
                        <span>Characters: <strong className="text-purple-400">{characters.length}</strong></span>
                        <span>•</span>
                        <span>Scripts: <strong className="text-amber-400">{scriptsBin.length}</strong></span>
                        {report && (
                            <>
                                <span>•</span>
                                <span>Last Audit: <strong className="text-neutral-300">{new Date(report.analyzedAt).toLocaleTimeString()}</strong></span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleRunAudit}
                        disabled={isLoading}
                        className="flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                        title="Run Deep Contradiction Audit with Gemini"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                </svg>
                                <span>Synthesizing Insights...</span>
                            </>
                        ) : (
                            <>
                                <span>✨</span>
                                <span>{report ? 'Re-Analyze with Gemini' : 'Run Knowledge Audit'}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Notification Toast */}
            {statusToast && (
                <div className="bg-indigo-950/80 border border-indigo-700/80 px-5 py-2.5 rounded-xl text-xs font-mono text-indigo-200 flex items-center justify-between shadow-lg animate-fadeIn">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        <span>{statusToast}</span>
                    </div>
                    <button onClick={() => setStatusToast(null)} className="text-neutral-400 hover:text-white">✕</button>
                </div>
            )}

            {/* Metric KPI Cards */}
            {report && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Stability Score */}
                    <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Canon Stability Score</div>
                            <div className={`text-3xl font-black mt-1 ${
                                report.canonStabilityScore >= 80 ? 'text-emerald-400' :
                                report.canonStabilityScore >= 60 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                                {report.canonStabilityScore}%
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">
                                {report.canonStabilityScore >= 80 ? 'High Coherence' : 'Moderate Drift Risk'}
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center text-xl">
                            🛡️
                        </div>
                    </div>

                    {/* Total Contradictions */}
                    <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Active Contradictions</div>
                            <div className="text-3xl font-black text-white mt-1">{totalCount}</div>
                            <div className="text-xs text-rose-400 font-medium mt-1">
                                {unresolvedCount} awaiting resolution
                            </div>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-rose-950/50 border border-rose-800 flex items-center justify-center text-xl">
                            ⚔️
                        </div>
                    </div>

                    {/* Reconciled Count */}
                    <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Thematic Reconciliations</div>
                            <div className="text-3xl font-black text-emerald-400 mt-1">{resolvedCount}</div>
                            <div className="text-xs text-neutral-500 mt-1">Adopted into canon</div>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-emerald-950/50 border border-emerald-800 flex items-center justify-center text-xl">
                            ✨
                        </div>
                    </div>

                    {/* Dominant Domain */}
                    <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-2xl flex items-center justify-between">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Primary Friction Area</div>
                            <div className="text-lg font-bold text-cyan-300 mt-1 truncate max-w-[160px]">
                                {Object.entries(report.domainBreakdown || {}).sort((a,b) => b[1] - a[1])[0]?.[0] || 'Character Arc'}
                            </div>
                            <div className="text-xs text-neutral-500 mt-1">Highest discrepancy count</div>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-cyan-950/50 border border-cyan-800 flex items-center justify-center text-xl">
                            🧭
                        </div>
                    </div>
                </div>
            )}

            {/* Executive Summary Card */}
            {report && (
                <div className="bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-neutral-900 border border-neutral-800 p-6 rounded-2xl">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-400 mb-2 font-mono">
                        <span>📋</span> Executive Continuity Summary
                    </div>
                    <p className="text-neutral-200 text-sm leading-relaxed">
                        {report.summary}
                    </p>

                    {report.recommendedActionPlan && report.recommendedActionPlan.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-neutral-800/80">
                            <span className="text-[11px] font-black uppercase tracking-wider text-neutral-400 block mb-2">Showrunner Recommended Action Directives:</span>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                {report.recommendedActionPlan.map((action, idx) => (
                                    <div key={idx} className="bg-black/40 border border-neutral-800 p-2.5 rounded-xl text-xs text-neutral-300 flex items-start gap-2">
                                        <span className="text-indigo-400 font-bold font-mono">#{idx+1}</span>
                                        <span>{action}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Filter and Search Bar */}
            {report && (
                <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800 p-3.5 rounded-xl">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Status Filter */}
                        <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-neutral-800 text-xs">
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={`px-3 py-1 rounded-md font-bold transition-all ${statusFilter === 'all' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'}`}
                            >
                                All ({totalCount})
                            </button>
                            <button
                                onClick={() => setStatusFilter('unresolved')}
                                className={`px-3 py-1 rounded-md font-bold transition-all ${statusFilter === 'unresolved' ? 'bg-rose-900/80 text-rose-200' : 'text-neutral-400 hover:text-white'}`}
                            >
                                Needs Resolution ({unresolvedCount})
                            </button>
                            <button
                                onClick={() => setStatusFilter('resolved')}
                                className={`px-3 py-1 rounded-md font-bold transition-all ${statusFilter === 'resolved' ? 'bg-emerald-900/80 text-emerald-200' : 'text-neutral-400 hover:text-white'}`}
                            >
                                Resolved ({resolvedCount})
                            </button>
                        </div>

                        {/* Severity Filter */}
                        <select
                            value={selectedSeverity}
                            onChange={(e) => setSelectedSeverity(e.target.value)}
                            className="bg-black/60 border border-neutral-800 text-xs text-neutral-300 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="all">All Severities</option>
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                        </select>

                        {/* Domain Filter */}
                        <select
                            value={selectedDomain}
                            onChange={(e) => setSelectedDomain(e.target.value)}
                            className="bg-black/60 border border-neutral-800 text-xs text-neutral-300 px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="all">All Domains</option>
                            <option value="Timeline & Chronology">⏳ Timeline & Chronology</option>
                            <option value="Character Arc & Motivation">👤 Character Arc & Motivation</option>
                            <option value="Physical & Tech Rules">⚙️ Physical & Tech Rules</option>
                            <option value="World & Environmental Laws">🌍 World & Environmental Laws</option>
                            <option value="Faction & Political Allegiance">⚔️ Faction & Political Allegiance</option>
                        </select>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Filter by entity, keyword..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-black/60 border border-neutral-800 text-xs text-white placeholder-neutral-500 pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-56"
                        />
                        <span className="absolute left-2.5 top-2 text-neutral-500 text-xs">🔍</span>
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-neutral-400 hover:text-white text-xs">✕</button>
                        )}
                    </div>
                </div>
            )}

            {/* Empty State / Initial Trigger Prompt */}
            {!report && !isLoading && (
                <div className="bg-neutral-900/40 border-2 border-dashed border-neutral-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center text-3xl mb-4">
                        💡
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">No Continuity Audit on File</h3>
                    <p className="text-neutral-400 text-sm max-w-md mb-6 leading-relaxed">
                        Execute an AI-driven Knowledge Insights audit across your {lore.length} lore entries, {characters.length} characters, and {scriptsBin.length} script documents to uncover contradictions and generate thematic resolutions.
                    </p>
                    <button
                        onClick={handleRunAudit}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer"
                    >
                        ✨ Launch Knowledge Insights Audit
                    </button>
                </div>
            )}

            {/* Contradiction Cards List */}
            {report && (
                <div className="space-y-4">
                    {filteredContradictions.length === 0 ? (
                        <div className="bg-neutral-900/30 border border-neutral-800/80 p-8 rounded-2xl text-center text-neutral-500 text-sm">
                            No contradictions match the current filters.
                        </div>
                    ) : (
                        filteredContradictions.map((contra) => {
                            const isResolved = Boolean(resolvedMap[contra.id]);
                            const isExpanded = expandedCardId === contra.id || !isResolved;
                            const sev = SEVERITY_COLORS[contra.severity] || SEVERITY_COLORS.medium;
                            const domainIcon = DOMAIN_ICONS[contra.thematicDomain] || '📜';

                            return (
                                <div
                                    key={contra.id}
                                    className={`border rounded-2xl transition-all duration-200 overflow-hidden ${
                                        isResolved
                                            ? 'bg-neutral-900/30 border-neutral-800/60 opacity-80'
                                            : `${sev.bg} ${sev.border} shadow-lg`
                                    }`}
                                >
                                    {/* Card Header Bar */}
                                    <div 
                                        onClick={() => setExpandedCardId(isExpanded ? null : contra.id)}
                                        className="p-5 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none border-b border-white/5"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg">{domainIcon}</span>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-base font-bold text-white">{contra.title}</h4>
                                                    {isResolved && (
                                                        <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                                            ✓ Resolved
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-neutral-400 font-mono">
                                                        Conflict: <strong className="text-neutral-200">{contra.conflictingEntities.join(' ⚔️ ')}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2.5">
                                            {/* Domain Pill */}
                                            <span className="bg-black/50 text-neutral-300 border border-neutral-700/60 text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                                {contra.thematicDomain}
                                            </span>

                                            {/* Severity Pill */}
                                            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border ${sev.badge}`}>
                                                {contra.severity}
                                            </span>

                                            <span className="text-neutral-500 text-xs ml-1">
                                                {isExpanded ? '▲' : '▼'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Expanded Body */}
                                    {isExpanded && (
                                        <div className="p-6 space-y-5 bg-black/20">
                                            {/* Conflict Summary & Evidence */}
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                <div className="bg-neutral-900/80 border border-neutral-800 p-4 rounded-xl">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-1">
                                                        Contradiction Analysis
                                                    </span>
                                                    <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                                                        {contra.contradictionSummary}
                                                    </p>
                                                    <div className="mt-3 text-[11px] text-neutral-500 font-mono">
                                                        Source Documents: {contra.sourceDocuments.join(', ')}
                                                    </div>
                                                </div>

                                                <div className="bg-rose-950/20 border border-rose-900/40 p-4 rounded-xl">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 block mb-1">
                                                        Canonical Evidence Excerpt
                                                    </span>
                                                    <p className="text-xs text-neutral-300 font-mono italic leading-relaxed whitespace-pre-wrap">
                                                        {contra.evidenceExcerpt}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Thematic Resolution Section */}
                                            <div className="bg-gradient-to-br from-indigo-950/40 via-purple-950/30 to-blue-950/40 border border-indigo-700/60 p-5 rounded-2xl shadow-inner">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm">✨</span>
                                                        <span className="text-xs font-black uppercase tracking-widest text-indigo-300 font-mono">
                                                            Suggested Thematic Resolution
                                                        </span>
                                                    </div>
                                                    <span className="text-xs font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-800/80 px-2.5 py-0.5 rounded-lg">
                                                        Strategy: {contra.thematicResolution.strategy}
                                                    </span>
                                                </div>

                                                <p className="text-xs text-neutral-200 leading-relaxed font-medium mb-4">
                                                    {contra.thematicResolution.narrativeSynthesis}
                                                </p>

                                                {/* Pre-written Canon Lore Draft */}
                                                <div className="bg-black/60 border border-neutral-700/80 p-4 rounded-xl">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
                                                            Draft Canon Lore Entry:
                                                        </span>
                                                        <strong className="text-xs text-white font-mono">{contra.thematicResolution.suggestedLoreTitle}</strong>
                                                    </div>
                                                    <p className="text-xs text-neutral-300 leading-relaxed font-mono whitespace-pre-wrap bg-neutral-900/60 p-3 rounded-lg border border-neutral-800">
                                                        {contra.thematicResolution.draftLoreContent}
                                                    </p>
                                                </div>

                                                {/* Action Bar */}
                                                <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-indigo-900/60">
                                                    <div className="flex items-center gap-2">
                                                        {/* Adopt Lore Button */}
                                                        {onCreateLore && (
                                                            <button
                                                                onClick={() => handleAdoptResolution(contra)}
                                                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                                                                title="Insert this thematic reconciliation directly into your Canon Lore Bible"
                                                            >
                                                                <span>📥</span>
                                                                <span>Adopt into Lore Bible</span>
                                                            </button>
                                                        )}

                                                        {/* Toggle Resolved */}
                                                        <button
                                                            onClick={() => handleToggleResolved(contra.id)}
                                                            className={`px-3 py-2 text-xs font-bold rounded-xl transition-all border cursor-pointer ${
                                                                isResolved
                                                                    ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border-neutral-700'
                                                                    : 'bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border-indigo-700'
                                                            }`}
                                                        >
                                                            {isResolved ? 'Mark as Unresolved' : '✓ Mark as Reconciled'}
                                                        </button>
                                                    </div>

                                                    <div className="text-[11px] text-neutral-400 font-mono">
                                                        Status: <strong className={isResolved ? 'text-emerald-400' : 'text-amber-400'}>{isResolved ? 'Reconciled' : 'Open Discrepancy'}</strong>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};
