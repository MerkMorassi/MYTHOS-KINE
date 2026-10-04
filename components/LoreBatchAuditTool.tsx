import React, { useState, useEffect } from 'react';
import { LoreEntry, Character, SavedTranscript, ProjectConsistencyReport, CharacterBackstoryGap } from '../types';
import { batchAuditLoreConsistencyService } from '../services/geminiService';
import { vectorDb } from '../services/vectorDbService';

interface LoreBatchAuditToolProps {
    characters: Character[];
    lore: LoreEntry[];
    scriptsBin?: any[];
    transcripts?: SavedTranscript[];
    activeProjectId?: string;
    onCreateLore?: (title: string, content: string) => void;
}

export const LoreBatchAuditTool: React.FC<LoreBatchAuditToolProps> = ({
    characters = [],
    lore = [],
    scriptsBin = [],
    transcripts = [],
    activeProjectId = 'default',
    onCreateLore
}) => {
    const [report, setReport] = useState<ProjectConsistencyReport | null>(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditStage, setAuditStage] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [statusToast, setStatusToast] = useState<string | null>(null);

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'severe_void' | 'moderate_gaps' | 'complete'>('all');
    const [searchChar, setSearchChar] = useState('');

    // Inline Lore Creator state for filling gaps
    const [activeGapPrompt, setActiveGapPrompt] = useState<{
        characterName: string;
        gapTitle: string;
        suggestedPrompt: string;
        contentDraft: string;
    } | null>(null);

    // Load cached report for this project if available
    useEffect(() => {
        try {
            const cached = localStorage.getItem(`mythos_consistency_report_${activeProjectId}`);
            if (cached) {
                setReport(JSON.parse(cached));
            }
        } catch (e) {
            console.error("Failed to load cached consistency report:", e);
        }
    }, [activeProjectId]);

    // Total documents inventory count
    const totalDocsCount = lore.length + scriptsBin.length + transcripts.length;

    // Trigger comprehensive batch semantic review
    const handleRunBatchAudit = async () => {
        if (characters.length === 0) {
            setError("No characters registered in the project. Please register characters in Characters Studio before running the audit.");
            return;
        }

        setIsAuditing(true);
        setError(null);
        setAuditStage('Gathering all uploaded documents, scripts, and lore repositories...');

        try {
            // 1. Gather all documents across the project
            const docsToAudit: Array<{ title: string; content: string; type: string }> = [];

            // Lore entries
            lore.forEach(l => {
                docsToAudit.push({
                    title: l.title,
                    content: l.content,
                    type: 'lore_bible'
                });
            });

            // Scripts & Screenplays
            scriptsBin.forEach(s => {
                docsToAudit.push({
                    title: s.title || 'Screenplay Draft',
                    content: s.content || '',
                    type: 'screenplay'
                });
            });

            // Transcripts
            transcripts.forEach(t => {
                docsToAudit.push({
                    title: t.title || 'Voice Memo / Interview',
                    content: t.text || '',
                    type: 'transcript'
                });
            });

            // Vector DB indexed files
            try {
                const vectorRecords = await vectorDb.getAllVectors();
                if (vectorRecords && vectorRecords.length > 0) {
                    const uniqueSources = Array.from(new Set(vectorRecords.map(v => v.source).filter(Boolean)));
                    uniqueSources.forEach(src => {
                        const chunks = vectorRecords.filter(v => v.source === src);
                        const combinedText = chunks.map(c => c.text).join('\n\n');
                        docsToAudit.push({
                            title: src,
                            content: combinedText,
                            type: 'sacred_archive_doc'
                        });
                    });
                }
            } catch (vErr) {
                console.warn("Vector records retrieval skipped for batch audit:", vErr);
            }

            setAuditStage(`Executing semantic audit across ${docsToAudit.length} documents & ${characters.length} character backstories...`);

            // 2. Call Gemini semantic audit service
            const generatedReport = await batchAuditLoreConsistencyService(docsToAudit, characters, lore);

            setReport(generatedReport);
            localStorage.setItem(`mythos_consistency_report_${activeProjectId}`, JSON.stringify(generatedReport));
            
            setStatusToast(`Batch audit complete! Generated Project Consistency Report (${generatedReport.overallIntegrityScore}% Lore Integrity).`);
            setTimeout(() => setStatusToast(null), 4000);
        } catch (err: any) {
            console.error("Batch audit error:", err);
            setError(err.message || "Failed to complete batch consistency audit.");
        } finally {
            setIsAuditing(false);
            setAuditStage('');
        }
    };

    // Download Consistency Report as Markdown
    const handleDownloadReport = () => {
        if (!report) return;

        let md = `# 🛡️ Project Consistency Report — Character Backstory & Lore Audit\n\n`;
        md += `> **Generated:** ${new Date(report.generatedAt).toLocaleString()}  \n`;
        md += `> **Overall Lore Integrity Score:** **${report.overallIntegrityScore}%**  \n`;
        md += `> **Total Documents Audited:** ${report.totalDocumentsAudited}  \n`;
        md += `> **Characters Reviewed:** ${report.characterGaps.length}  \n\n`;

        md += `---\n\n`;
        md += `## 1. Executive Summary\n\n${report.executiveSummary}\n\n`;
        md += `---\n\n`;

        md += `## 2. Character Backstory Gap Analysis\n\n`;
        report.characterGaps.forEach((char, idx) => {
            md += `### 2.${idx + 1} ${char.characterName} (${char.archetype})\n`;
            md += `- **Coverage Status:** \`${char.coverageStatus.toUpperCase()}\` (${char.coverageScore}%)\n`;
            md += `- **Known History:** ${char.knownHistorySummary}\n\n`;

            if (char.backstoryGaps.length > 0) {
                md += `#### Identified Backstory Gaps:\n`;
                char.backstoryGaps.forEach((gap, gIdx) => {
                    md += `##### Gap ${gIdx + 1}: ${gap.gapTitle} [${gap.severity.toUpperCase()}]\n`;
                    md += `- **Era / Chronological Window:** \`${gap.eraOrPeriod}\`\n`;
                    md += `- **Description:** ${gap.description}\n`;
                    if (gap.unansweredQuestions?.length > 0) {
                        md += `- **Unanswered Questions:**\n`;
                        gap.unansweredQuestions.forEach(q => md += `  - ${q}\n`);
                    }
                    if (gap.suggestedLorePrompt) {
                        md += `- **Suggested Creative Prompt:** *${gap.suggestedLorePrompt}*\n`;
                    }
                    md += `\n`;
                });
            }

            if (char.conflictingDetails?.length > 0) {
                md += `#### Conflicting Canon Details:\n`;
                char.conflictingDetails.forEach(conf => md += `- ⚠️ ${conf}\n`);
                md += `\n`;
            }
            md += `---\n\n`;
        });

        if (report.timelineVoids?.length > 0) {
            md += `## 3. Timeline Voids & Chronological Blindspots\n\n`;
            report.timelineVoids.forEach(v => {
                md += `### ⏳ ${v.era}\n`;
                md += `${v.voidDescription}\n`;
                if (v.affectedCharacters?.length > 0) {
                    md += `*Affected Characters:* ${v.affectedCharacters.join(', ')}\n\n`;
                }
            });
            md += `---\n\n`;
        }

        if (report.priorityRecommendations?.length > 0) {
            md += `## 4. Priority Recommendations for Production Team\n\n`;
            report.priorityRecommendations.forEach((rec, rIdx) => {
                md += `${rIdx + 1}. ${rec}\n`;
            });
            md += `\n`;
        }

        const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `project-consistency-report-${new Date().toISOString().slice(0, 10)}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Save filled gap draft to Lore Bible
    const handleSaveGapToLore = (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeGapPrompt || !activeGapPrompt.contentDraft.trim()) return;

        if (onCreateLore) {
            onCreateLore(
                `Backstory: ${activeGapPrompt.characterName} — ${activeGapPrompt.gapTitle}`,
                activeGapPrompt.contentDraft.trim()
            );
            setStatusToast(`Saved backstory entry for ${activeGapPrompt.characterName} to Lore Bible!`);
            setTimeout(() => setStatusToast(null), 3500);
        }

        setActiveGapPrompt(null);
    };

    // Filter characters
    const filteredCharacterGaps = (report?.characterGaps || []).filter(c => {
        if (statusFilter !== 'all' && c.coverageStatus !== statusFilter) return false;
        if (searchChar && !c.characterName.toLowerCase().includes(searchChar.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="space-y-6 font-sans">
            {/* Notification Toast */}
            {statusToast && (
                <div className="fixed bottom-6 right-6 z-50 bg-emerald-950/95 border border-emerald-500 text-emerald-200 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold animate-fade-in flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{statusToast}</span>
                </div>
            )}

            {/* Top Audit Banner & Controls */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-800 pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl">📑</span>
                            <h3 className="text-base font-black text-white uppercase tracking-wider">
                                Lore Studio Batch Audit & Consistency Engine
                            </h3>
                            <span className="text-[9px] bg-purple-950/80 text-purple-300 border border-purple-800/60 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                                Semantic Gap Analysis
                            </span>
                        </div>
                        <p className="text-xs text-neutral-400 mt-1 max-w-2xl leading-relaxed">
                            Triggers a comprehensive semantic review of all uploaded screenplays, lore bibles, audio transcripts, and archive documents to map blind spots, unrecorded years, and narrative gaps in character backstories.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {report && (
                            <button
                                onClick={handleDownloadReport}
                                className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs uppercase tracking-wider rounded-xl transition border border-neutral-700 flex items-center gap-1.5 cursor-pointer shadow"
                                title="Download complete Consistency Report as Markdown (.md)"
                            >
                                <span>📥</span> Export Report (.md)
                            </button>
                        )}
                        <button
                            onClick={handleRunBatchAudit}
                            disabled={isAuditing}
                            className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-purple-900/20 flex items-center gap-2 cursor-pointer"
                        >
                            {isAuditing ? (
                                <>
                                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Auditing Repository...</span>
                                </>
                            ) : (
                                <>
                                    <span>⚡</span>
                                    <span>{report ? "Re-Run Batch Audit" : "Trigger Batch Audit"}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Document Inventory Status Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl">
                        <span className="text-neutral-500 text-[10px] uppercase block font-bold">Lore Bible Entries</span>
                        <span className="text-base font-bold text-white mt-0.5 block">{lore.length}</span>
                    </div>
                    <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl">
                        <span className="text-neutral-500 text-[10px] uppercase block font-bold">Screenplay Drafts</span>
                        <span className="text-base font-bold text-white mt-0.5 block">{scriptsBin.length}</span>
                    </div>
                    <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl">
                        <span className="text-neutral-500 text-[10px] uppercase block font-bold">Audio Transcripts</span>
                        <span className="text-base font-bold text-white mt-0.5 block">{transcripts.length}</span>
                    </div>
                    <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl">
                        <span className="text-neutral-500 text-[10px] uppercase block font-bold">Active Characters</span>
                        <span className="text-base font-bold text-purple-400 mt-0.5 block">{characters.length}</span>
                    </div>
                </div>

                {/* Progress / Loading Indicator */}
                {isAuditing && (
                    <div className="p-4 bg-purple-950/30 border border-purple-800/50 rounded-xl space-y-2 animate-pulse">
                        <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-300">
                            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-ping" />
                            <span>{auditStage}</span>
                        </div>
                        <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-full w-3/4 animate-pulse" />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-4 bg-red-950/40 border border-red-800 text-red-200 text-xs rounded-xl flex items-center gap-2 font-medium">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                )}
            </div>

            {/* Gap Resolution Inline Form Modal */}
            {activeGapPrompt && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <form onSubmit={handleSaveGapToLore} className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                            <div>
                                <span className="text-[10px] font-mono uppercase text-purple-400 font-bold block">
                                    Fill Character Backstory Gap
                                </span>
                                <h4 className="text-base font-black text-white mt-0.5">
                                    {activeGapPrompt.characterName}: {activeGapPrompt.gapTitle}
                                </h4>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveGapPrompt(null)}
                                className="text-neutral-500 hover:text-white text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-xs text-neutral-300 space-y-1">
                            <span className="text-[10px] font-bold uppercase text-neutral-500 block">Suggested Writing Angle</span>
                            <p className="italic text-neutral-400">{activeGapPrompt.suggestedPrompt}</p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-bold uppercase text-neutral-400 tracking-wider">
                                Lore Prose / Backstory Record
                            </label>
                            <textarea
                                value={activeGapPrompt.contentDraft}
                                onChange={e => setActiveGapPrompt({ ...activeGapPrompt, contentDraft: e.target.value })}
                                rows={6}
                                className="w-full bg-black border border-neutral-800 rounded-xl p-3 text-xs text-neutral-200 focus:outline-none focus:border-purple-500 font-serif leading-relaxed"
                                placeholder="Draft the narrative event or archival record that establishes this part of their history..."
                                required
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setActiveGapPrompt(null)}
                                className="px-4 py-2 bg-neutral-800 text-neutral-300 text-xs rounded-xl hover:bg-neutral-700 font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md"
                            >
                                Save into Lore Bible
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Consistency Report Display */}
            {report ? (
                <div className="space-y-6">
                    {/* Score Card & Executive Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-purple-950/50 via-neutral-900 to-black border border-purple-800/40 p-5 rounded-2xl flex flex-col justify-between shadow-lg">
                            <span className="text-[10px] font-mono uppercase text-purple-400 font-bold">Overall Lore Integrity</span>
                            <div className="my-2">
                                <span className="text-4xl font-black text-white">{report.overallIntegrityScore}%</span>
                                <span className="text-xs text-neutral-400 ml-1">Consistency</span>
                            </div>
                            <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        report.overallIntegrityScore >= 80 ? 'bg-emerald-500' : report.overallIntegrityScore >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${report.overallIntegrityScore}%` }}
                                />
                            </div>
                        </div>

                        <div className="md:col-span-3 bg-neutral-900 border border-neutral-800 p-5 rounded-2xl shadow-lg flex flex-col justify-between space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-mono uppercase text-neutral-500 font-bold">
                                    Auditor's Executive Summary • {report.totalDocumentsAudited} Documents Analyzed
                                </span>
                                <span className="text-[10px] font-mono text-neutral-500">
                                    Audit Stamp: {new Date(report.generatedAt).toLocaleDateString()}
                                </span>
                            </div>
                            <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                                {report.executiveSummary}
                            </p>
                        </div>
                    </div>

                    {/* Character Backstory Gap Matrix Section */}
                    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl space-y-5">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-800 pb-4">
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                                    <span>👥</span> Character Backstory Gap Matrix ({filteredCharacterGaps.length})
                                </h4>
                                <p className="text-xs text-neutral-400 mt-0.5">
                                    Semantic audit mapping unrecorded origins, missing time periods, and motive contradictions
                                </p>
                            </div>

                            {/* Filter tabs & Search */}
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="Search character..."
                                    value={searchChar}
                                    onChange={e => setSearchChar(e.target.value)}
                                    className="bg-black border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                                />
                                <div className="flex bg-black/60 p-0.5 rounded-lg border border-neutral-800 text-[10px] font-bold uppercase">
                                    <button
                                        onClick={() => setStatusFilter('all')}
                                        className={`px-2.5 py-1 rounded transition ${statusFilter === 'all' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'}`}
                                    >
                                        All
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('severe_void')}
                                        className={`px-2.5 py-1 rounded transition ${statusFilter === 'severe_void' ? 'bg-rose-950 text-rose-300' : 'text-neutral-400 hover:text-white'}`}
                                    >
                                        Severe Void
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('moderate_gaps')}
                                        className={`px-2.5 py-1 rounded transition ${statusFilter === 'moderate_gaps' ? 'bg-amber-950 text-amber-300' : 'text-neutral-400 hover:text-white'}`}
                                    >
                                        Moderate
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('complete')}
                                        className={`px-2.5 py-1 rounded transition ${statusFilter === 'complete' ? 'bg-emerald-950 text-emerald-300' : 'text-neutral-400 hover:text-white'}`}
                                    >
                                        Complete
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Character Cards Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {filteredCharacterGaps.map((charGap, idx) => (
                                <div 
                                    key={idx}
                                    className="bg-black/40 border border-neutral-800 hover:border-neutral-700 p-5 rounded-xl space-y-4 transition shadow-sm"
                                >
                                    {/* Card Header */}
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-full bg-purple-950/80 border border-purple-800 flex items-center justify-center text-sm font-black text-purple-300 font-mono">
                                                {charGap.characterName.charAt(0)}
                                            </div>
                                            <div>
                                                <h5 className="font-bold text-white text-sm">{charGap.characterName}</h5>
                                                <span className="text-[10px] font-mono text-neutral-400">{charGap.archetype}</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1">
                                            <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full border ${
                                                charGap.coverageStatus === 'complete'
                                                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/60'
                                                    : charGap.coverageStatus === 'moderate_gaps'
                                                    ? 'bg-amber-950/80 text-amber-400 border-amber-800/60'
                                                    : 'bg-rose-950/80 text-rose-400 border-rose-800/60'
                                            }`}>
                                                {charGap.coverageStatus.replace('_', ' ')}
                                            </span>
                                            <span className="text-[10px] font-mono text-neutral-400">{charGap.coverageScore}% covered</span>
                                        </div>
                                    </div>

                                    {/* Known History Summary */}
                                    <p className="text-xs text-neutral-300 bg-neutral-900/60 p-3 rounded-lg border border-neutral-850 leading-relaxed">
                                        <strong className="text-neutral-400 text-[10px] uppercase block mb-1">Documented History:</strong>
                                        {charGap.knownHistorySummary}
                                    </p>

                                    {/* Backstory Gaps */}
                                    {charGap.backstoryGaps.length > 0 && (
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-mono font-bold uppercase text-neutral-500 tracking-wider block">
                                                Identified Gaps ({charGap.backstoryGaps.length}):
                                            </span>
                                            <div className="space-y-2">
                                                {charGap.backstoryGaps.map((gap, gIdx) => (
                                                    <div key={gIdx} className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 space-y-2 text-xs">
                                                        <div className="flex justify-between items-start gap-2">
                                                            <div>
                                                                <h6 className="font-bold text-white text-xs">{gap.gapTitle}</h6>
                                                                <span className="text-[9px] font-mono text-purple-400">Era: {gap.eraOrPeriod}</span>
                                                            </div>
                                                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono ${
                                                                gap.severity === 'high' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-neutral-800 text-neutral-400'
                                                            }`}>
                                                                {gap.severity} severity
                                                            </span>
                                                        </div>

                                                        <p className="text-[11px] text-neutral-400 leading-relaxed">
                                                            {gap.description}
                                                        </p>

                                                        {gap.unansweredQuestions?.length > 0 && (
                                                            <div className="text-[10px] text-neutral-500 space-y-0.5 border-t border-neutral-900 pt-1.5">
                                                                <span className="font-bold uppercase text-[9px] text-neutral-400">Blindspots:</span>
                                                                <ul className="list-disc list-inside space-y-0.5 pl-1">
                                                                    {gap.unansweredQuestions.map((q, qIdx) => (
                                                                        <li key={qIdx} className="text-neutral-400 italic">{q}</li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {gap.suggestedLorePrompt && (
                                                            <div className="pt-2 flex justify-between items-center gap-2 border-t border-neutral-900">
                                                                <span className="text-[9px] text-neutral-500 truncate max-w-xs italic">
                                                                    {gap.suggestedLorePrompt}
                                                                </span>
                                                                <button
                                                                    onClick={() => setActiveGapPrompt({
                                                                        characterName: charGap.characterName,
                                                                        gapTitle: gap.gapTitle,
                                                                        suggestedPrompt: gap.suggestedLorePrompt,
                                                                        contentDraft: `Historical backstory record for ${charGap.characterName} during the ${gap.eraOrPeriod}.\n\nContext: ${gap.description}\n\nKey Events:\n- `
                                                                    })}
                                                                    className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-800/40 rounded text-[9px] font-bold uppercase tracking-wider transition shrink-0 cursor-pointer"
                                                                >
                                                                    📝 Plug Gap
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Contradicting Details */}
                                    {charGap.conflictingDetails.length > 0 && (
                                        <div className="p-2.5 bg-rose-950/20 border border-rose-900/40 rounded-lg text-xs space-y-1">
                                            <span className="text-[9px] font-bold uppercase text-rose-400 flex items-center gap-1">
                                                <span>⚠️</span> Conflicting Backstory Assertions:
                                            </span>
                                            {charGap.conflictingDetails.map((conf, cIdx) => (
                                                <p key={cIdx} className="text-[11px] text-rose-300/80 leading-snug">
                                                    {conf}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Timeline Voids & Priority Recommendations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Timeline Voids */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg space-y-4">
                            <h4 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                                <span>⏳</span> Timeline Voids ({report.timelineVoids.length})
                            </h4>
                            <p className="text-[11px] text-neutral-400">
                                Historical eras with little or no documented character events
                            </p>
                            <div className="space-y-3">
                                {report.timelineVoids.map((voidItem, vIdx) => (
                                    <div key={vIdx} className="bg-black/40 border border-neutral-800 p-3 rounded-xl space-y-1.5 text-xs">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-white text-xs">{voidItem.era}</span>
                                            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/40">
                                                Chronological Void
                                            </span>
                                        </div>
                                        <p className="text-neutral-400 text-[11px] leading-relaxed">
                                            {voidItem.voidDescription}
                                        </p>
                                        {voidItem.affectedCharacters?.length > 0 && (
                                            <div className="text-[9px] font-mono text-neutral-500 pt-1 border-t border-neutral-850">
                                                Affected: {voidItem.affectedCharacters.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Priority Recommendations */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-lg space-y-4">
                            <h4 className="text-xs font-black uppercase text-blue-400 tracking-wider flex items-center gap-1.5">
                                <span>💡</span> Showrunner Recommendations
                            </h4>
                            <p className="text-[11px] text-neutral-400">
                                Concrete continuity recommendations prioritized by severity
                            </p>
                            <div className="space-y-2.5">
                                {report.priorityRecommendations.map((rec, rIdx) => (
                                    <div key={rIdx} className="flex items-start gap-2.5 bg-black/40 border border-neutral-800 p-3 rounded-xl text-xs text-neutral-300">
                                        <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center text-[10px] font-mono shrink-0 font-bold">
                                            {rIdx + 1}
                                        </span>
                                        <span className="leading-relaxed">{rec}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Empty state when no audit has been run */
                <div className="bg-neutral-900/60 border border-dashed border-neutral-800 rounded-2xl p-12 text-center space-y-4">
                    <span className="text-4xl block">🛡️</span>
                    <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        No Project Consistency Audit Generated
                    </h4>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                        Execute the batch audit tool to trigger a comprehensive semantic review of all {totalDocsCount} uploaded documents and generate an actionable report of character backstory gaps.
                    </p>
                    <button
                        onClick={handleRunBatchAudit}
                        disabled={isAuditing}
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg cursor-pointer"
                    >
                        {isAuditing ? "Processing..." : "Initiate Batch Audit Now"}
                    </button>
                </div>
            )}
        </div>
    );
};
