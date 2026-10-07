import React, { useState, useEffect, useMemo } from 'react';
import { Character, ScriptFile, LoreEntry, CharacterArcReport, CharacterArcMilestone } from '../types.ts';
import { analyzeCharacterArcAcrossScriptsService } from '../services/geminiService.ts';

interface CharacterArcTimelineProps {
    characters: Character[];
    scriptsBin: ScriptFile[];
    lore?: LoreEntry[];
    projectName?: string;
    activeProjectId?: string;
    onSelectScript?: (scriptId: string) => void;
}

const ARC_PHASE_COLORS: Record<CharacterArcMilestone['arcPhase'], { bg: string; text: string; border: string; glow: string }> = {
    'Introduction': {
        bg: 'bg-sky-950/40',
        text: 'text-sky-400',
        border: 'border-sky-800/80',
        glow: 'rgba(56, 189, 248, 0.35)'
    },
    'Inciting Action': {
        bg: 'bg-indigo-950/40',
        text: 'text-indigo-400',
        border: 'border-indigo-800/80',
        glow: 'rgba(99, 102, 241, 0.35)'
    },
    'Rising Conflict': {
        bg: 'bg-amber-950/40',
        text: 'text-amber-400',
        border: 'border-amber-800/80',
        glow: 'rgba(245, 158, 11, 0.35)'
    },
    'Crisis & Ordeal': {
        bg: 'bg-rose-950/40',
        text: 'text-rose-400',
        border: 'border-rose-800/80',
        glow: 'rgba(244, 63, 94, 0.35)'
    },
    'Climax': {
        bg: 'bg-purple-950/50',
        text: 'text-purple-300',
        border: 'border-purple-700/80',
        glow: 'rgba(168, 85, 247, 0.45)'
    },
    'Resolution': {
        bg: 'bg-emerald-950/40',
        text: 'text-emerald-400',
        border: 'border-emerald-800/80',
        glow: 'rgba(16, 185, 129, 0.35)'
    }
};

export const CharacterArcTimeline: React.FC<CharacterArcTimelineProps> = ({
    characters = [],
    scriptsBin = [],
    lore = [],
    projectName = 'ZOE FILMS Universe',
    activeProjectId = 'default'
}) => {
    const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
    const [searchChar, setSearchChar] = useState<string>('');
    const [phaseFilter, setPhaseFilter] = useState<string>('all');
    const [selectedScriptFilter, setSelectedScriptFilter] = useState<string>('all');
    const [timelineLayout, setTimelineLayout] = useState<'chronological' | 'horizontal'>('chronological');
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [reportsMap, setReportsMap] = useState<Record<string, CharacterArcReport>>({});
    const [inspectingScene, setInspectingScene] = useState<{ milestone: CharacterArcMilestone; fullScriptText?: string } | null>(null);
    const [customMilestonesMap, setCustomMilestonesMap] = useState<Record<string, CharacterArcMilestone[]>>({});
    const [showAddModal, setShowAddModal] = useState<boolean>(false);
    const [newTitle, setNewTitle] = useState<string>('');
    const [newScriptId, setNewScriptId] = useState<string>('');
    const [newPhase, setNewPhase] = useState<CharacterArcMilestone['arcPhase']>('Rising Conflict');
    const [newSummary, setNewSummary] = useState<string>('');
    const [newExcerpt, setNewExcerpt] = useState<string>('');
    const [newShift, setNewShift] = useState<string>('');

    // Active character
    const activeCharacter = useMemo(() => {
        return characters.find(c => c.id === selectedCharId) || characters[0];
    }, [characters, selectedCharId]);

    // Load persisted reports and custom milestones from localStorage
    useEffect(() => {
        try {
            const cachedReports = localStorage.getItem(`mythos_char_arc_reports_${activeProjectId}`);
            if (cachedReports) setReportsMap(JSON.parse(cachedReports));

            const cachedCustom = localStorage.getItem(`mythos_char_arc_custom_${activeProjectId}`);
            if (cachedCustom) setCustomMilestonesMap(JSON.parse(cachedCustom));
        } catch (e) {
            console.warn("Could not load cached character arc reports:", e);
        }
    }, [activeProjectId]);

    // Compute or retrieve report for the active character
    useEffect(() => {
        if (!activeCharacter) return;
        if (reportsMap[activeCharacter.id]) return;

        // Perform fast heuristic scan immediately
        analyzeCharacterArcAcrossScriptsService({
            character: activeCharacter,
            scriptsBin,
            lore,
            projectName
        }).then(rep => {
            setReportsMap(prev => ({ ...prev, [activeCharacter.id]: rep }));
        }).catch(err => {
            console.error("Initial character arc scan error:", err);
        });
    }, [activeCharacter, scriptsBin, lore, projectName]);

    const activeReport = activeCharacter ? reportsMap[activeCharacter.id] : null;

    // Trigger full Gemini deep dramaturgical arc synthesis
    const handleRunDeepAnalysis = async () => {
        if (!activeCharacter) return;
        setIsAnalyzing(true);
        try {
            const report = await analyzeCharacterArcAcrossScriptsService({
                character: activeCharacter,
                scriptsBin,
                lore,
                projectName
            });

            setReportsMap(prev => {
                const next = { ...prev, [activeCharacter.id]: report };
                try {
                    localStorage.setItem(`mythos_char_arc_reports_${activeProjectId}`, JSON.stringify(next));
                } catch (e) {}
                return next;
            });
        } catch (err) {
            console.error("Deep Character Arc Analysis failed:", err);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Filter characters for top list
    const filteredCharacters = characters.filter(c => {
        if (!searchChar.trim()) return true;
        const q = searchChar.toLowerCase();
        return c.name.toLowerCase().includes(q) || (c.archetype || '').toLowerCase().includes(q);
    });

    // Combine generated milestones with custom user-added milestones
    const combinedMilestones = useMemo(() => {
        if (!activeCharacter) return [];
        const base = activeReport?.milestones || [];
        const custom = customMilestonesMap[activeCharacter.id] || [];
        const all = [...custom, ...base];

        return all.filter(m => {
            if (phaseFilter !== 'all' && m.arcPhase !== phaseFilter) return false;
            if (selectedScriptFilter !== 'all' && m.scriptId !== selectedScriptFilter) return false;
            return true;
        });
    }, [activeReport, customMilestonesMap, activeCharacter, phaseFilter, selectedScriptFilter]);

    // Handle adding custom milestone
    const handleAddCustomMilestone = (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeCharacter || !newTitle.trim()) return;

        const targetScript = scriptsBin.find(s => s.id === newScriptId) || scriptsBin[0];
        const newM: CharacterArcMilestone = {
            id: `custom_milestone_${Date.now()}`,
            scriptId: targetScript?.id || 'manual_script',
            scriptTitle: targetScript?.title || 'Screenplay Sequence',
            scriptDate: targetScript?.date || new Date().toLocaleDateString(),
            sceneHeading: 'SCENE MILESTONE',
            title: newTitle.trim(),
            summary: newSummary.trim() || 'Custom narrative turning point.',
            sceneExcerpt: newExcerpt.trim() ? `"${newExcerpt.trim()}"` : `"${activeCharacter.name} commits to pivotal choice."`,
            arcPhase: newPhase,
            emotionalShift: newShift.trim() || 'Internal Transformation',
            dramaticWeight: 'major',
            presenceScore: 85,
            timestamp: Date.now()
        };

        setCustomMilestonesMap(prev => {
            const list = prev[activeCharacter.id] || [];
            const next = { ...prev, [activeCharacter.id]: [newM, ...list] };
            try {
                localStorage.setItem(`mythos_char_arc_custom_${activeProjectId}`, JSON.stringify(next));
            } catch (err) {}
            return next;
        });

        setShowAddModal(false);
        setNewTitle('');
        setNewSummary('');
        setNewExcerpt('');
        setNewShift('');
    };

    // Export Arc dossier
    const handleExportMarkdown = () => {
        if (!activeCharacter || !activeReport) return;
        const md = [
            `# CHARACTER ARC DOSSIER: ${activeCharacter.name.toUpperCase()}`,
            `**Archetype:** ${activeCharacter.archetype || 'N/A'}`,
            `**Project:** ${projectName}`,
            `**Total Script Appearances:** ${activeReport.totalScriptAppearances} of ${scriptsBin.length}`,
            ``,
            `## OVERALL ARC TRAJECTORY`,
            activeReport.overallArcTrajectory,
            ``,
            `## PRIMARY INTERNAL CONFLICT`,
            activeReport.primaryInternalConflict,
            ``,
            `## TRANSFORMATION VERDICT`,
            activeReport.transformationVerdict,
            ``,
            `## NARRATIVE MILESTONES ACROSS SCRIPTS`,
            ...combinedMilestones.map((m, idx) => [
                `### ${idx + 1}. ${m.title} [${m.arcPhase}]`,
                `- **Script:** ${m.scriptTitle} (${m.scriptDate || 'N/A'})`,
                `- **Heading:** ${m.sceneHeading || 'Scene'}`,
                `- **Emotional Shift:** ${m.emotionalShift}`,
                `- **Dramatic Weight:** ${m.dramaticWeight.toUpperCase()}`,
                `- **Excerpt:** ${m.sceneExcerpt}`,
                `- **Summary:** ${m.summary}`,
                ``
            ].join('\n'))
        ].join('\n');

        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeCharacter.name.toLowerCase().replace(/\s+/g, '_')}_arc_timeline.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (characters.length === 0) {
        return (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center space-y-3">
                <span className="text-4xl">🎭</span>
                <h3 className="text-lg font-bold text-white">No Characters Found</h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto">
                    Create characters in the Characters studio first to map their narrative trajectories and presence across screenplays.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full h-full space-y-6 text-neutral-100 select-none pb-12">
            {/* Top Command Bar & Character Selector */}
            <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl">🎭</span>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight font-mono">
                                Character Arc Timeline
                            </h2>
                            <span className="bg-purple-950 text-purple-300 border border-purple-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                                Multi-Script Progression
                            </span>
                        </div>
                        <p className="text-neutral-400 text-xs mt-1 max-w-2xl leading-relaxed">
                            Chronologically maps character presence, scene dialogue density, dramatic turning points, and transformative psychological trajectory across all screenplay drafts in {projectName}.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            onClick={handleRunDeepAnalysis}
                            disabled={isAnalyzing}
                            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition shadow-lg hover:shadow-purple-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                            title="Run deep character arc analysis with Gemini"
                        >
                            {isAnalyzing ? (
                                <>
                                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span>Synthesizing Arc...</span>
                                </>
                            ) : (
                                <>
                                    <span>✨</span>
                                    <span>AI Arc Deep Scan</span>
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => setShowAddModal(true)}
                            className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer border border-neutral-700/80 flex items-center gap-1.5"
                        >
                            <span>＋</span>
                            <span>Add Milestone</span>
                        </button>

                        <button
                            onClick={handleExportMarkdown}
                            className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer border border-neutral-700/80 flex items-center gap-1.5"
                            title="Export Arc Dossier to Markdown"
                        >
                            <span>📄</span>
                            <span>Export Dossier</span>
                        </button>
                    </div>
                </div>

                {/* Horizontal Character Carousel / Selector */}
                <div className="pt-2 border-t border-neutral-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 font-bold">
                            Select Protagonist / Ensemble Entity ({filteredCharacters.length} Available):
                        </span>
                        <input
                            type="text"
                            placeholder="Search characters..."
                            value={searchChar}
                            onChange={(e) => setSearchChar(e.target.value)}
                            className="bg-black/50 border border-neutral-800 px-3 py-1 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-purple-500 w-44"
                        />
                    </div>

                    <div className="flex items-center gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
                        {filteredCharacters.map(char => {
                            const isSelected = char.id === activeCharacter?.id;
                            const rep = reportsMap[char.id];
                            const scriptCount = rep ? rep.totalScriptAppearances : scriptsBin.filter(s => (s.content || '').toLowerCase().includes(char.name.toLowerCase())).length;

                            return (
                                <button
                                    key={char.id}
                                    onClick={() => setSelectedCharId(char.id)}
                                    className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                                        isSelected
                                            ? 'bg-gradient-to-r from-purple-950/80 to-indigo-950/80 border-purple-500 shadow-md ring-1 ring-purple-500/30'
                                            : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-850'
                                    }`}
                                >
                                    <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden border border-neutral-700 shrink-0 font-bold text-neutral-300">
                                        {char.avatar ? (
                                            <img src={char.avatar.startsWith('data:') ? char.avatar : `data:image/jpeg;base64,${char.avatar}`} alt={char.name} className="w-full h-full object-cover" />
                                        ) : (
                                            char.name.substring(0, 2).toUpperCase()
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <div className="text-xs font-bold text-white leading-tight flex items-center gap-1.5">
                                            <span>{char.name}</span>
                                        </div>
                                        <div className="text-[10px] text-neutral-400 font-mono mt-0.5 truncate max-w-[130px]">
                                            {char.archetype || 'Archetype'}
                                        </div>
                                        <div className="text-[9px] font-mono text-purple-400 mt-0.5">
                                            {scriptCount} / {scriptsBin.length} Scripts
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Character Arc Executive Summary Card */}
            {activeCharacter && activeReport && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Trajectory Synopsis */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-neutral-900 via-neutral-900 to-purple-950/30 border border-neutral-800 p-5 rounded-2xl shadow-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                            <span className="text-[10px] font-mono font-black uppercase text-purple-400 tracking-wider flex items-center gap-1.5">
                                <span>📈</span> Overall Narrative Trajectory
                            </span>
                            <span className="text-xs text-neutral-400 font-mono">
                                Across {activeReport.totalScriptAppearances} Script Screenplays
                            </span>
                        </div>
                        <p className="text-neutral-200 text-sm leading-relaxed font-sans">
                            {activeReport.overallArcTrajectory}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                            <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl space-y-1">
                                <span className="text-[9px] font-mono uppercase text-amber-400 font-black block">Core Internal Conflict</span>
                                <p className="text-xs text-neutral-300 leading-snug">{activeReport.primaryInternalConflict}</p>
                            </div>
                            <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl space-y-1">
                                <span className="text-[9px] font-mono uppercase text-emerald-400 font-black block">Transformation Verdict</span>
                                <p className="text-xs text-neutral-300 leading-snug">{activeReport.transformationVerdict}</p>
                            </div>
                        </div>
                    </div>

                    {/* Presence Metrics & Scripts Progression Meter */}
                    <div className="bg-neutral-900/80 border border-neutral-800 p-5 rounded-2xl shadow-lg space-y-3 flex flex-col justify-between">
                        <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                            <span className="text-[10px] font-mono font-black uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                                <span>📊</span> Screenplay Presence Heat
                            </span>
                            <span className="text-xs text-neutral-400 font-mono">
                                {activeReport.totalDialogueMentions} Total Mentions
                            </span>
                        </div>

                        <div className="space-y-2.5 flex-grow overflow-y-auto max-h-48 custom-scrollbar pr-1">
                            {activeReport.presenceByScript.map(item => (
                                <div key={item.scriptId} className="bg-black/30 border border-neutral-800/60 p-2.5 rounded-xl space-y-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-neutral-200 truncate max-w-[150px]">{item.scriptTitle}</span>
                                        <span className="text-[10px] font-mono text-cyan-400 font-bold">{item.intensity}%</span>
                                    </div>
                                    <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full"
                                            style={{ width: `${item.intensity}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] font-mono text-neutral-400 pt-0.5">
                                        <span>{item.mentionCount} scene mentions</span>
                                        <span className="text-neutral-500 italic">{item.dominantEmotion}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Filter and Timeline Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-900/70 border border-neutral-800 p-3.5 rounded-xl">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase font-black mr-1">Filter Phase:</span>
                    {(['all', 'Introduction', 'Inciting Action', 'Rising Conflict', 'Crisis & Ordeal', 'Climax', 'Resolution'] as const).map(phase => (
                        <button
                            key={phase}
                            onClick={() => setPhaseFilter(phase)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                phaseFilter === phase
                                    ? 'bg-purple-600 text-white shadow-md'
                                    : 'text-neutral-400 hover:text-white bg-neutral-800/40'
                            }`}
                        >
                            {phase === 'all' ? 'All Phases' : phase}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3">
                    {/* Script Selector */}
                    {scriptsBin.length > 0 && (
                        <select
                            value={selectedScriptFilter}
                            onChange={(e) => setSelectedScriptFilter(e.target.value)}
                            className="bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 rounded-lg px-2.5 py-1 focus:outline-none"
                        >
                            <option value="all">All Scripts ({scriptsBin.length})</option>
                            {scriptsBin.map(s => (
                                <option key={s.id} value={s.id}>{s.title || 'Screenplay Draft'}</option>
                            ))}
                        </select>
                    )}

                    {/* Layout Switcher */}
                    <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-neutral-800">
                        <button
                            onClick={() => setTimelineLayout('chronological')}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                                timelineLayout === 'chronological' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            📋 Cards Flow
                        </button>
                        <button
                            onClick={() => setTimelineLayout('horizontal')}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                                timelineLayout === 'horizontal' ? 'bg-neutral-700 text-white' : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            ↔ Reel Timeline
                        </button>
                    </div>
                </div>
            </div>

            {/* Interactive Timeline Body */}
            {combinedMilestones.length === 0 ? (
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-12 text-center space-y-2">
                    <span className="text-3xl">🎬</span>
                    <h4 className="text-sm font-bold text-neutral-300">No milestones matched this filter</h4>
                    <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                        Adjust phase filters or click "AI Arc Deep Scan" to extract character turning points across screenplays.
                    </p>
                </div>
            ) : timelineLayout === 'horizontal' ? (
                /* Horizontal Cinematic Reel View */
                <div className="relative overflow-x-auto pb-4 custom-scrollbar bg-neutral-950/60 border border-neutral-800 rounded-2xl p-6">
                    <div className="flex items-stretch gap-6 min-w-max relative">
                        {/* Connecting Trajectory Line */}
                        <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-gradient-to-r from-sky-500 via-amber-500 via-rose-500 to-emerald-500 -translate-y-1/2 z-0 opacity-40" />

                        {combinedMilestones.map((m, idx) => {
                            const colors = ARC_PHASE_COLORS[m.arcPhase] || ARC_PHASE_COLORS['Rising Conflict'];

                            return (
                                <div
                                    key={m.id}
                                    className="w-80 bg-neutral-900/90 border border-neutral-800 hover:border-neutral-700 p-4 rounded-2xl shadow-xl flex flex-col justify-between space-y-3 z-10 transition-all hover:scale-102 hover:shadow-2xl"
                                >
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center text-[10px] font-mono">
                                            <span className="text-neutral-400 font-bold truncate max-w-[140px]">
                                                {m.scriptTitle}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full font-black uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                {m.arcPhase}
                                            </span>
                                        </div>

                                        <div className="text-xs font-black text-white leading-snug">
                                            {m.title}
                                        </div>

                                        {m.sceneHeading && (
                                            <div className="text-[10px] text-neutral-500 font-mono">
                                                📍 {m.sceneHeading}
                                            </div>
                                        )}

                                        <div className="p-2.5 bg-black/50 border border-neutral-800 rounded-xl text-[11px] text-neutral-300 italic font-mono leading-relaxed">
                                            {m.sceneExcerpt}
                                        </div>

                                        <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                                            {m.summary}
                                        </p>
                                    </div>

                                    <div className="pt-2 border-t border-neutral-800 flex justify-between items-center">
                                        <span className="text-[9px] font-mono font-bold text-amber-300">
                                            ⚡ {m.emotionalShift}
                                        </span>
                                        <button
                                            onClick={() => {
                                                const script = scriptsBin.find(s => s.id === m.scriptId);
                                                setInspectingScene({ milestone: m, fullScriptText: script?.content });
                                            }}
                                            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[10px] font-bold cursor-pointer"
                                        >
                                            Inspect Scene
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* Vertical Sequential Cards Flow */
                <div className="relative pl-6 border-l-2 border-neutral-800 space-y-6">
                    {combinedMilestones.map((m, idx) => {
                        const colors = ARC_PHASE_COLORS[m.arcPhase] || ARC_PHASE_COLORS['Rising Conflict'];

                        return (
                            <div key={m.id} className="relative group">
                                {/* Timeline Dot */}
                                <div
                                    className="absolute -left-[31px] top-4 w-4 h-4 rounded-full border-2 bg-neutral-950 border-purple-400 group-hover:scale-125 transition-transform"
                                    style={{ boxShadow: `0 0 10px ${colors.glow}` }}
                                />

                                <div className="bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 p-5 rounded-2xl shadow-xl space-y-3 transition-all">
                                    <div className="flex flex-wrap justify-between items-center gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold text-neutral-400">
                                                Sequence #{idx + 1} • {m.scriptTitle}
                                            </span>
                                            {m.scriptDate && (
                                                <span className="text-[10px] text-neutral-500 font-mono">
                                                    ({m.scriptDate})
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase border ${colors.bg} ${colors.text} ${colors.border}`}>
                                                {m.arcPhase}
                                            </span>
                                            <span className="bg-black/60 px-2 py-0.5 rounded text-[10px] font-mono text-purple-300 border border-neutral-800">
                                                Impact: {m.dramaticWeight}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                                        <h4 className="text-base font-black text-white">{m.title}</h4>
                                        {m.sceneHeading && (
                                            <span className="text-xs font-mono text-neutral-400">
                                                📍 {m.sceneHeading}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="p-3 bg-black/50 border border-neutral-800/80 rounded-xl space-y-1">
                                            <span className="text-[9px] font-mono uppercase text-neutral-500 font-bold block">Script Scene Dialogue / Action Excerpt</span>
                                            <p className="text-xs text-neutral-300 font-mono italic leading-relaxed">{m.sceneExcerpt}</p>
                                        </div>

                                        <div className="p-3 bg-neutral-850/60 border border-neutral-800/80 rounded-xl space-y-1">
                                            <span className="text-[9px] font-mono uppercase text-purple-400 font-bold block">Character Subtext & Arc Meaning</span>
                                            <p className="text-xs text-neutral-300 leading-relaxed font-sans">{m.summary}</p>
                                            <div className="pt-2 text-[10px] font-mono text-amber-300 font-bold flex items-center gap-1">
                                                <span>⚡ Psychological Shift:</span>
                                                <span className="text-white">{m.emotionalShift}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-1">
                                        <button
                                            onClick={() => {
                                                const script = scriptsBin.find(s => s.id === m.scriptId);
                                                setInspectingScene({ milestone: m, fullScriptText: script?.content });
                                            }}
                                            className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                                        >
                                            <span>📖</span>
                                            <span>Inspect Script Context</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Inspect Scene Modal Drawer */}
            {inspectingScene && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col animate-fadeIn">
                        <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                            <div>
                                <h3 className="text-lg font-bold text-white">{inspectingScene.milestone.title}</h3>
                                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                                    {inspectingScene.milestone.scriptTitle} • {inspectingScene.milestone.sceneHeading}
                                </p>
                            </div>
                            <button
                                onClick={() => setInspectingScene(null)}
                                className="text-neutral-500 hover:text-white p-1 rounded-lg"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 overflow-y-auto custom-scrollbar flex-grow pr-1">
                            <div className="bg-black/60 border border-neutral-800 p-3 rounded-xl font-mono text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap">
                                {inspectingScene.milestone.sceneExcerpt}
                            </div>

                            {inspectingScene.fullScriptText && (
                                <div className="space-y-1">
                                    <span className="text-[10px] font-mono uppercase text-neutral-400 font-bold block">
                                        Full Screenplay Draft Context:
                                    </span>
                                    <div className="bg-black/40 border border-neutral-800/80 p-3 rounded-xl font-mono text-[11px] text-neutral-400 max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                                        {inspectingScene.fullScriptText}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-2 border-t border-neutral-800 flex justify-end">
                            <button
                                onClick={() => setInspectingScene(null)}
                                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Custom Milestone Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <form onSubmit={handleAddCustomMilestone} className="bg-neutral-900 border border-neutral-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-fadeIn">
                        <div className="flex justify-between items-center border-b border-neutral-800 pb-3">
                            <h3 className="text-base font-bold text-white">Add Custom Narrative Milestone</h3>
                            <button type="button" onClick={() => setShowAddModal(false)} className="text-neutral-500 hover:text-white">✕</button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-neutral-400 mb-1 font-bold">Milestone Title</label>
                                <input
                                    type="text"
                                    placeholder="e.g., The Midnight Confrontation"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="w-full bg-black/60 border border-neutral-800 p-2.5 rounded-xl text-white outline-none focus:ring-1 focus:ring-purple-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-neutral-400 mb-1 font-bold">Script Association</label>
                                    <select
                                        value={newScriptId}
                                        onChange={(e) => setNewScriptId(e.target.value)}
                                        className="w-full bg-black/60 border border-neutral-800 p-2.5 rounded-xl text-white outline-none"
                                    >
                                        {scriptsBin.map(s => (
                                            <option key={s.id} value={s.id}>{s.title || 'Screenplay Draft'}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-neutral-400 mb-1 font-bold">Arc Phase</label>
                                    <select
                                        value={newPhase}
                                        onChange={(e) => setNewPhase(e.target.value as any)}
                                        className="w-full bg-black/60 border border-neutral-800 p-2.5 rounded-xl text-white outline-none"
                                    >
                                        <option value="Introduction">Introduction</option>
                                        <option value="Inciting Action">Inciting Action</option>
                                        <option value="Rising Conflict">Rising Conflict</option>
                                        <option value="Crisis & Ordeal">Crisis & Ordeal</option>
                                        <option value="Climax">Climax</option>
                                        <option value="Resolution">Resolution</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-neutral-400 mb-1 font-bold">Scene Excerpt / Quote</label>
                                <input
                                    type="text"
                                    placeholder="e.g., I won't turn back now."
                                    value={newExcerpt}
                                    onChange={(e) => setNewExcerpt(e.target.value)}
                                    className="w-full bg-black/60 border border-neutral-800 p-2.5 rounded-xl text-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-400 mb-1 font-bold">Dramatic Summary</label>
                                <textarea
                                    placeholder="Explain how this scene shifts the character's motivation or worldview..."
                                    value={newSummary}
                                    onChange={(e) => setNewSummary(e.target.value)}
                                    rows={3}
                                    className="w-full bg-black/60 border border-neutral-800 p-2.5 rounded-xl text-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-neutral-400 mb-1 font-bold">Psychological / Emotional Shift</label>
                                <input
                                    type="text"
                                    placeholder="e.g., Doubt ➔ Sovereign Resolve"
                                    value={newShift}
                                    onChange={(e) => setNewShift(e.target.value)}
                                    className="w-full bg-black/60 border border-neutral-800 p-2.5 rounded-xl text-white outline-none"
                                />
                            </div>
                        </div>

                        <div className="pt-2 border-t border-neutral-800 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                className="px-4 py-2 bg-neutral-800 text-neutral-300 font-bold text-xs rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
                            >
                                Save Milestone
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
