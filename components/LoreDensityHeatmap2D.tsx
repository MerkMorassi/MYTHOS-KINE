import React, { useState, useMemo } from 'react';
import { TripletEdge } from '../types.ts';
import { VectorRecord } from '../services/vectorDbService';

interface LoreDensityHeatmap2DProps {
    projectLore?: any[];
    projectCharacters?: any[];
    tripletEdges?: TripletEdge[];
    vectors?: VectorRecord[];
    onSelectTopic?: (topic: string) => void;
}

interface SectorDefinition {
    id: string;
    label: string;
    icon: string;
    description: string;
}

const SECTORS: SectorDefinition[] = [
    { id: 'lore_docs', label: 'Lore Documents', icon: '📜', description: 'Core worldbuilding documents, wiki entries, and narrative lore' },
    { id: 'characters', label: 'Character Dossiers', icon: '👤', description: 'Character biographies, personality archetypes, and relationship notes' },
    { id: 'triplets', label: 'Relational Graph', icon: '🕸️', description: 'Bidirectional entity triplets and semantic knowledge links' },
    { id: 'vectors', label: 'Neural Vectors', icon: '🧠', description: 'High-dimensional semantic vector memory embeddings' },
    { id: 'scenarios', label: 'Narrative Scenarios', icon: '🎬', description: 'Screenplay scenes, discovered threads, and thematic hypotheses' },
];

const DEFAULT_CANON_TOPICS = [
    { name: 'Cosmology & World Origins', keywords: ['cosmology', 'origin', 'creation', 'universe', 'deity', 'myth', 'ancient', 'genesis', 'void'] },
    { name: 'Faction Politics & Governance', keywords: ['faction', 'syndicate', 'council', 'empire', 'rebellion', 'alliance', 'politics', 'guild', 'treaty'] },
    { name: 'Character Arcs & Lineages', keywords: ['protagonist', 'lineage', 'family', 'trauma', 'destiny', 'bloodline', 'mentor', 'betrayal'] },
    { name: 'Relics, Technology & Artifacts', keywords: ['relic', 'artifact', 'technology', 'device', 'weapon', 'cybernetic', 'ai', 'engine', 'blueprint'] },
    { name: 'Mysticism, Arcana & Superstition', keywords: ['mystic', 'arcana', 'magic', 'superstition', 'ritual', 'rune', 'sorcery', 'prophecy', 'curse'] },
    { name: 'Historical Battles & Epochs', keywords: ['battle', 'war', 'epoch', 'cataclysm', 'siege', 'uprising', 'revolution', 'chronology', 'timeline'] },
    { name: 'Geographic Realms & Strongholds', keywords: ['realm', 'stronghold', 'city', 'citadel', 'wasteland', 'sector', 'sanctuary', 'colony', 'territory'] },
    { name: 'Underworld & Covert Operations', keywords: ['underworld', 'black market', 'covert', 'smuggler', 'spy', 'heist', 'assassin', 'espionage', 'conspiracy'] },
];

export const LoreDensityHeatmap2D: React.FC<LoreDensityHeatmap2DProps> = ({
    projectLore = [],
    projectCharacters = [],
    tripletEdges = [],
    vectors = [],
    onSelectTopic
}) => {
    const [viewMode, setViewMode] = useState<'matrix' | 'hotspots' | 'entities'>('matrix');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [minDensityFilter, setMinDensityFilter] = useState<number>(0);
    const [selectedCell, setSelectedCell] = useState<{
        topicName: string;
        sector: SectorDefinition;
        count: number;
        densityPct: number;
        items: Array<{ title: string; type: string; snippet?: string }>;
    } | null>(null);

    // Entity index state (preserves existing entity gap/overlap inspection)
    const [activeEntityFilter, setActiveEntityFilter] = useState<'all' | 'gaps' | 'overlaps'>('all');
    const [selectedEntity, setSelectedEntity] = useState<any | null>(null);

    // Dynamic Topic Extraction: Combine canonical taxonomy with custom tags and clusters found in lore
    const dynamicTopics = useMemo(() => {
        const topicList = [...DEFAULT_CANON_TOPICS];
        const seenNames = new Set(topicList.map(t => t.name.toLowerCase()));

        // Extract custom tags / categories from projectLore
        projectLore.forEach(item => {
            if (Array.isArray(item.tags)) {
                item.tags.forEach((tag: string) => {
                    const cleanTag = tag.trim();
                    if (cleanTag && cleanTag.length > 2 && !seenNames.has(cleanTag.toLowerCase())) {
                        seenNames.add(cleanTag.toLowerCase());
                        topicList.push({
                            name: cleanTag.charAt(0).toUpperCase() + cleanTag.slice(1),
                            keywords: [cleanTag.toLowerCase()]
                        });
                    }
                });
            }
            if (item.category && typeof item.category === 'string') {
                const cleanCat = item.category.trim();
                if (cleanCat && cleanCat.length > 2 && !seenNames.has(cleanCat.toLowerCase())) {
                    seenNames.add(cleanCat.toLowerCase());
                    topicList.push({
                        name: cleanCat.charAt(0).toUpperCase() + cleanCat.slice(1),
                        keywords: [cleanCat.toLowerCase()]
                    });
                }
            }
        });

        return topicList;
    }, [projectLore]);

    // Calculate 2D Density Matrix data
    const matrixData = useMemo(() => {
        let maxCountAcrossProject = 1;

        const rows = dynamicTopics.map(topic => {
            const matchesBySector: Record<string, { count: number; items: Array<{ title: string; type: string; snippet?: string }> }> = {};

            SECTORS.forEach(sec => {
                matchesBySector[sec.id] = { count: 0, items: [] };
            });

            const keywords = topic.keywords;

            const matchesText = (text: string) => {
                const lower = text.toLowerCase();
                return keywords.some(kw => lower.includes(kw));
            };

            // 1. Lore Docs
            projectLore.forEach(doc => {
                const fullText = `${doc.title || ''} ${doc.content || ''} ${(doc.tags || []).join(' ')}`;
                if (matchesText(fullText)) {
                    matchesBySector['lore_docs'].count += 1;
                    matchesBySector['lore_docs'].items.push({
                        title: doc.title || 'Untitled Lore Entry',
                        type: 'Lore Document',
                        snippet: (doc.content || '').slice(0, 140) + '...'
                    });
                }
            });

            // 2. Characters
            projectCharacters.forEach(c => {
                const fullText = `${c.name || ''} ${c.role || ''} ${c.bio || ''} ${c.notes || ''}`;
                if (matchesText(fullText)) {
                    matchesBySector['characters'].count += 1;
                    matchesBySector['characters'].items.push({
                        title: c.name || 'Unnamed Character',
                        type: 'Character Dossier',
                        snippet: `${c.role ? `[${c.role}] ` : ''}${c.bio || c.notes || 'Character profile'}`.slice(0, 140)
                    });
                }
            });

            // 3. Triplets
            tripletEdges.forEach(t => {
                const fullText = `${t.s} ${t.p} ${t.o}`;
                if (matchesText(fullText)) {
                    matchesBySector['triplets'].count += 1;
                    matchesBySector['triplets'].items.push({
                        title: `${t.s} ➔ ${t.p} ➔ ${t.o}`,
                        type: 'Relational Triplet',
                        snippet: `Knowledge graph relationship anchored to ${t.s}`
                    });
                }
            });

            // 4. Vectors
            vectors.forEach(v => {
                if (matchesText(v.text)) {
                    matchesBySector['vectors'].count += 1;
                    matchesBySector['vectors'].items.push({
                        title: `Vector Record #${v.id.slice(0, 8)}`,
                        type: 'Neural Vector Record',
                        snippet: v.text.slice(0, 140) + '...'
                    });
                }
            });

            // 5. Scenarios (discovered threads or composite mentions)
            projectLore.forEach(l => {
                if (l.cluster && matchesText(l.cluster)) {
                    matchesBySector['scenarios'].count += 1;
                    matchesBySector['scenarios'].items.push({
                        title: `Thematic Cluster: ${l.cluster}`,
                        type: 'Narrative Cluster',
                        snippet: `Narrative branch anchored in ${l.title || 'lore'}`
                    });
                }
            });

            // Track project maximum
            SECTORS.forEach(sec => {
                if (matchesBySector[sec.id].count > maxCountAcrossProject) {
                    maxCountAcrossProject = matchesBySector[sec.id].count;
                }
            });

            const totalTopicMentions = SECTORS.reduce((sum, sec) => sum + matchesBySector[sec.id].count, 0);

            return {
                topicName: topic.name,
                keywords: topic.keywords,
                sectors: matchesBySector,
                totalMentions: totalTopicMentions
            };
        });

        // Compute normalized density percentage (0 - 100%) for each cell
        const normalizedRows = rows.map(r => {
            const sectorsWithDensity: Record<string, { count: number; densityPct: number; items: any[] }> = {};
            SECTORS.forEach(sec => {
                const c = r.sectors[sec.id].count;
                const densityPct = maxCountAcrossProject > 0 ? Math.round((c / maxCountAcrossProject) * 100) : 0;
                sectorsWithDensity[sec.id] = {
                    count: c,
                    densityPct,
                    items: r.sectors[sec.id].items
                };
            });
            return {
                ...r,
                sectors: sectorsWithDensity
            };
        }).sort((a, b) => b.totalMentions - a.totalMentions);

        return { rows: normalizedRows, maxCount: maxCountAcrossProject };
    }, [dynamicTopics, projectLore, projectCharacters, tripletEdges, vectors]);

    // High-Density Hotspots List (Ranked cross-domain intersections)
    const topHotspots = useMemo(() => {
        const list: Array<{ topicName: string; sector: SectorDefinition; count: number; densityPct: number; items: any[] }> = [];
        matrixData.rows.forEach(row => {
            SECTORS.forEach(sec => {
                const cell = row.sectors[sec.id];
                if (cell && cell.count > 0) {
                    list.push({
                        topicName: row.topicName,
                        sector: sec,
                        count: cell.count,
                        densityPct: cell.densityPct,
                        items: cell.items
                    });
                }
            });
        });
        return list.sort((a, b) => b.count - a.count);
    }, [matrixData]);

    // Top narrative highlights for "at a glance" summary
    const highlights = useMemo(() => {
        const topEpicenter = topHotspots[0] || null;
        const highestTotalTopic = matrixData.rows[0] || null;
        // Find narrative void (topic with lowest density but defined in canon)
        const voidTopic = [...matrixData.rows].reverse().find(r => r.totalMentions <= 1) || matrixData.rows[matrixData.rows.length - 1];

        return {
            epicenter: topEpicenter,
            dominantTopic: highestTotalTopic,
            narrativeVoid: voidTopic
        };
    }, [topHotspots, matrixData]);

    // Filter rows based on search query and minimum density
    const filteredRows = useMemo(() => {
        return matrixData.rows.filter(row => {
            if (searchQuery.trim() && !row.topicName.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
            if (minDensityFilter > 0) {
                const hasCellAboveMin = SECTORS.some(sec => row.sectors[sec.id].densityPct >= minDensityFilter);
                if (!hasCellAboveMin) return false;
            }
            return true;
        });
    }, [matrixData.rows, searchQuery, minDensityFilter]);

    // Entity index computation for preserving entity-level gap/overlap inspector
    const entityAnalysisItems = useMemo(() => {
        if (!tripletEdges || tripletEdges.length === 0) return [];
        const entities = Array.from(new Set(
            tripletEdges.flatMap(e => [e.s.trim(), e.o.trim()]).filter(s => s && s.length > 2)
        ));

        return entities.map(name => {
            const mentionsCount = vectors.filter(v => v.text.toLowerCase().includes(name.toLowerCase())).length;
            const relationsCount = tripletEdges.filter(e => e.s.trim() === name || e.o.trim() === name).length;
            const score = mentionsCount + relationsCount * 1.5;

            let status: 'gap' | 'balanced' | 'overlap' = 'balanced';
            if (score <= 2.5) {
                status = 'gap';
            } else if (score >= 9) {
                status = 'overlap';
            }

            return { name, mentionsCount, relationsCount, score, status };
        }).sort((a, b) => b.score - a.score);
    }, [tripletEdges, vectors]);

    const filteredEntityItems = useMemo(() => {
        return entityAnalysisItems.filter(item => {
            if (activeEntityFilter === 'gaps') return item.status === 'gap';
            if (activeEntityFilter === 'overlaps') return item.status === 'overlap';
            return true;
        });
    }, [entityAnalysisItems, activeEntityFilter]);

    // Helper to determine cell color styling based on 2D density percentage
    const getCellColorClass = (densityPct: number, count: number) => {
        if (count === 0) {
            return 'bg-neutral-900/30 border-neutral-800/40 text-neutral-600 hover:border-neutral-700';
        }
        if (densityPct <= 25) {
            return 'bg-blue-950/40 border-blue-800/50 text-blue-300 hover:border-blue-600 shadow-sm';
        }
        if (densityPct <= 60) {
            return 'bg-emerald-950/40 border-emerald-700/60 text-emerald-200 hover:border-emerald-500 shadow-md';
        }
        if (densityPct <= 85) {
            return 'bg-amber-950/50 border-amber-600/70 text-amber-200 hover:border-amber-400 font-bold shadow-md';
        }
        return 'bg-purple-900/70 border-fuchsia-500 text-fuchsia-100 font-black shadow-lg shadow-purple-900/40 ring-1 ring-fuchsia-400/40';
    };

    return (
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-2xl p-6 backdrop-blur-md space-y-6">
            {/* 1. TOP HEADER & VIEW TOGGLES */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-neutral-800 pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 font-mono">
                            <span className="text-cyan-400">🗺️</span> 2D Density Heatmap: Lore Topics Across Project
                        </h2>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-950 border border-cyan-800 text-cyan-300">
                            Narrative Distribution
                        </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                        Visualizes cross-sector narrative density across core lore documents, character arcs, graph links, and vector memory to identify narrative epicenters at a glance.
                    </p>
                </div>

                {/* View Switcher: 2D Matrix vs Hotspots vs Entity Index */}
                <div className="flex items-center gap-1.5 bg-black/50 p-1.5 rounded-xl border border-neutral-800 shrink-0">
                    <button
                        type="button"
                        onClick={() => { setViewMode('matrix'); setSelectedCell(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'matrix'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-neutral-400 hover:text-white'
                        }`}
                        title="2D Matrix Density Heatmap"
                    >
                        📊 2D Matrix Heatmap
                    </button>
                    <button
                        type="button"
                        onClick={() => { setViewMode('hotspots'); setSelectedCell(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'hotspots'
                                ? 'bg-rose-600 text-white shadow-md'
                                : 'text-neutral-400 hover:text-white'
                        }`}
                        title="Ranked Narrative Epicenters & Hotspots"
                    >
                        🔥 Narrative Hotspots ({topHotspots.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => { setViewMode('entities'); setSelectedCell(null); }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'entities'
                                ? 'bg-purple-600 text-white shadow-md'
                                : 'text-neutral-400 hover:text-white'
                        }`}
                        title="Entity Gaps & Overlaps Breakdown"
                    >
                        🏷️ Entity Gaps & Hubs
                    </button>
                </div>
            </div>

            {/* 2. AT A GLANCE: HIGH-DENSITY NARRATIVE AREAS HIGHLIGHTS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Highlight 1: Top Narrative Epicenter */}
                <div className="bg-gradient-to-br from-rose-950/40 to-neutral-900 border border-rose-900/40 rounded-xl p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-rose-400 font-mono">
                            🔥 Top Narrative Epicenter
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/40">
                            {highlights.epicenter ? `${highlights.epicenter.densityPct}% DENSITY` : 'N/A'}
                        </span>
                    </div>
                    <div className="mt-2">
                        <h4 className="text-sm font-black text-white truncate" title={highlights.epicenter?.topicName}>
                            {highlights.epicenter ? highlights.epicenter.topicName : 'Building Lore Repository...'}
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                            Concentrated in <span className="text-white font-bold">{highlights.epicenter ? highlights.epicenter.sector.label : 'Project'}</span> ({highlights.epicenter ? `${highlights.epicenter.count} references` : '0 refs'}).
                        </p>
                    </div>
                </div>

                {/* Highlight 2: Omnipresent Cross-Domain Theme */}
                <div className="bg-gradient-to-br from-cyan-950/40 to-neutral-900 border border-cyan-900/40 rounded-xl p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-400 font-mono">
                            🌐 Omnipresent Narrative Theme
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/40">
                            {highlights.dominantTopic ? `${highlights.dominantTopic.totalMentions} REFS` : 'N/A'}
                        </span>
                    </div>
                    <div className="mt-2">
                        <h4 className="text-sm font-black text-white truncate" title={highlights.dominantTopic?.topicName}>
                            {highlights.dominantTopic ? highlights.dominantTopic.topicName : 'Awaiting Canon Documents'}
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                            Highest cross-sector distribution across lore documents, graph triplets, and characters.
                        </p>
                    </div>
                </div>

                {/* Highlight 3: Low-Density Opportunity / Narrative Void */}
                <div className="bg-gradient-to-br from-amber-950/40 to-neutral-900 border border-amber-900/40 rounded-xl p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 font-mono">
                            ⚠️ Narrative Opportunity / Void
                        </span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/40">
                            UNDER-INDEXED
                        </span>
                    </div>
                    <div className="mt-2">
                        <h4 className="text-sm font-black text-white truncate" title={highlights.narrativeVoid?.topicName}>
                            {highlights.narrativeVoid ? highlights.narrativeVoid.topicName : 'None identified'}
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                            Low reference density. Expanding lore or characters here will enrich worldbuilding balance.
                        </p>
                    </div>
                </div>
            </div>

            {/* 3. HEATMAP COLOR DENSITY SCALE REFERENCE BAR */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 px-4 py-2.5 rounded-xl border border-neutral-800 text-xs">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 font-mono">
                    2D Density Intensity Scale:
                </span>
                <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
                    <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded bg-neutral-900 border border-neutral-800"></span>
                        <span className="text-neutral-500">0% (Unmapped)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded bg-blue-950 border border-blue-700"></span>
                        <span className="text-blue-300">1-25% (Low)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded bg-emerald-950 border border-emerald-600"></span>
                        <span className="text-emerald-300">26-60% (Moderate)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded bg-amber-950 border border-amber-500"></span>
                        <span className="text-amber-300">61-85% (High Density)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 rounded bg-purple-900 border border-fuchsia-400 ring-1 ring-fuchsia-400"></span>
                        <span className="text-fuchsia-200 font-bold">86-100% (Peak Epicenter)</span>
                    </div>
                </div>
            </div>

            {/* 4. MODE 1: 2D MATRIX HEATMAP VIEW */}
            {viewMode === 'matrix' && (
                <div className="space-y-4">
                    {/* Controls Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-grow max-w-md">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search lore topics or themes..."
                                className="w-full bg-black/50 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="text-neutral-500 hover:text-white text-xs px-2"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Minimum Density Threshold Filter */}
                        <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Density Floor:</span>
                            {( [0, 25, 50, 75] as const ).map(pct => (
                                <button
                                    key={pct}
                                    type="button"
                                    onClick={() => setMinDensityFilter(pct)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                                        minDensityFilter === pct
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-neutral-850 hover:bg-neutral-800 text-neutral-400'
                                    }`}
                                >
                                    {pct === 0 ? 'All' : `≥${pct}%`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 2D Heatmap Grid Table */}
                    <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950/60 custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[750px]">
                            <thead>
                                <tr className="border-b border-neutral-800 bg-neutral-900/80">
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-neutral-400 font-mono w-64">
                                        Lore Topic / Narrative Theme
                                    </th>
                                    {SECTORS.map(sec => (
                                        <th key={sec.id} className="p-3 text-[10px] font-black uppercase tracking-wider text-neutral-300 font-mono text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-base mb-0.5">{sec.icon}</span>
                                                <span>{sec.label}</span>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-neutral-400 font-mono text-right w-24">
                                        Total Refs
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-850">
                                {filteredRows.map((row) => (
                                    <tr key={row.topicName} className="hover:bg-neutral-900/40 transition-colors">
                                        {/* Y-Axis: Topic Title */}
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-neutral-200 font-sans">
                                                    {row.topicName}
                                                </span>
                                                <span className="text-[9px] text-neutral-500 font-mono truncate max-w-[200px]">
                                                    {row.keywords.slice(0, 3).join(', ')}
                                                </span>
                                            </div>
                                        </td>

                                        {/* 2D Density Cells across X-Axis Sectors */}
                                        {SECTORS.map(sec => {
                                            const cell = row.sectors[sec.id];
                                            const isSelected = selectedCell?.topicName === row.topicName && selectedCell?.sector.id === sec.id;
                                            const colorClasses = getCellColorClass(cell.densityPct, cell.count);

                                            return (
                                                <td key={sec.id} className="p-2 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedCell({
                                                            topicName: row.topicName,
                                                            sector: sec,
                                                            count: cell.count,
                                                            densityPct: cell.densityPct,
                                                            items: cell.items
                                                        })}
                                                        className={`
                                                            w-full h-14 rounded-xl border p-1.5 flex flex-col justify-between items-center transition-all cursor-pointer
                                                            ${colorClasses}
                                                            ${isSelected ? 'ring-2 ring-white scale-105 z-10 shadow-xl' : 'hover:scale-[1.02]'}
                                                        `}
                                                        title={`${row.topicName} in ${sec.label}: ${cell.count} refs (${cell.densityPct}% density)`}
                                                    >
                                                        <div className="flex items-center justify-between w-full px-1">
                                                            <span className="text-[8px] font-mono opacity-80">
                                                                {cell.densityPct > 0 ? `${cell.densityPct}%` : '—'}
                                                            </span>
                                                            <span className="text-[9px] font-mono font-bold">
                                                                {cell.count}
                                                            </span>
                                                        </div>

                                                        {/* Micro Density Bar */}
                                                        <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden mt-1">
                                                            <div
                                                                style={{ width: `${cell.densityPct}%` }}
                                                                className={`h-full rounded-full ${
                                                                    cell.densityPct >= 85 ? 'bg-fuchsia-400' :
                                                                    cell.densityPct >= 60 ? 'bg-amber-400' :
                                                                    cell.densityPct >= 25 ? 'bg-emerald-400' :
                                                                    cell.densityPct > 0 ? 'bg-blue-400' : 'bg-transparent'
                                                                }`}
                                                            ></div>
                                                        </div>
                                                    </button>
                                                </td>
                                            );
                                        })}

                                        {/* Row Summary Total */}
                                        <td className="p-3 text-right">
                                            <span className="text-xs font-mono font-bold text-neutral-300">
                                                {row.totalMentions}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* 5. INTERACTIVE 2D CELL INSPECTOR DRAWER */}
                    {selectedCell && (
                        <div className="bg-black/70 border border-neutral-700/80 rounded-2xl p-5 space-y-4 animate-fadeIn shadow-2xl">
                            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{selectedCell.sector.icon}</span>
                                        <h4 className="text-sm font-black text-white font-mono uppercase">
                                            {selectedCell.topicName} ✕ {selectedCell.sector.label}
                                        </h4>
                                        <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full border ${
                                            selectedCell.densityPct >= 85 ? 'bg-purple-950 text-fuchsia-300 border-fuchsia-700' :
                                            selectedCell.densityPct >= 60 ? 'bg-amber-950 text-amber-300 border-amber-700' :
                                            selectedCell.densityPct >= 25 ? 'bg-emerald-950 text-emerald-300 border-emerald-700' :
                                            selectedCell.count > 0 ? 'bg-blue-950 text-blue-300 border-blue-700' :
                                            'bg-neutral-900 text-neutral-500 border-neutral-800'
                                        }`}>
                                            {selectedCell.densityPct}% Density ({selectedCell.count} References)
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-400 mt-1">
                                        {selectedCell.sector.description}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCell(null)}
                                    className="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded bg-neutral-800 cursor-pointer"
                                >
                                    ✕ Close Inspector
                                </button>
                            </div>

                            {/* Matching items in this cell intersection */}
                            <div>
                                <h5 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 font-mono mb-2">
                                    Correlated Narrative Elements ({selectedCell.items.length}):
                                </h5>
                                {selectedCell.items.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                                        {selectedCell.items.map((item, idx) => (
                                            <div key={idx} className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3 flex flex-col justify-between">
                                                <div>
                                                    <span className="text-[8px] font-mono font-bold uppercase text-cyan-400">
                                                        {item.type}
                                                    </span>
                                                    <h6 className="text-xs font-bold text-neutral-200 mt-0.5 line-clamp-1" title={item.title}>
                                                        {item.title}
                                                    </h6>
                                                    {item.snippet && (
                                                        <p className="text-[10px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                                                            {item.snippet}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-4 bg-neutral-900/40 rounded-xl border border-neutral-800 text-center text-xs text-neutral-500 italic">
                                        No entries currently anchor "{selectedCell.topicName}" within {selectedCell.sector.label}. Add lore documents or character notes to expand this area.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 6. MODE 2: RANKED HIGH-DENSITY NARRATIVE HOTSPOTS LIST */}
            {viewMode === 'hotspots' && (
                <div className="space-y-4">
                    <p className="text-xs text-neutral-400">
                        Ranked narrative epicenters by cross-sector reference density, highlighting where the project's creative attention is most concentrated.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto custom-scrollbar pr-1">
                        {topHotspots.map((hotspot, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                                    hotspot.densityPct >= 85 ? 'bg-purple-950/20 border-fuchsia-800/40 hover:border-fuchsia-600' :
                                    hotspot.densityPct >= 60 ? 'bg-amber-950/20 border-amber-800/40 hover:border-amber-600' :
                                    'bg-neutral-900/80 border-neutral-800 hover:border-neutral-700'
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[9px] font-black uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-black/60 border border-neutral-800 text-neutral-300">
                                            #{idx + 1} {hotspot.sector.icon} {hotspot.sector.label}
                                        </span>
                                        <span className={`text-[10px] font-mono font-black ${
                                            hotspot.densityPct >= 85 ? 'text-fuchsia-400' :
                                            hotspot.densityPct >= 60 ? 'text-amber-400' :
                                            'text-blue-400'
                                        }`}>
                                            {hotspot.densityPct}% Density
                                        </span>
                                    </div>
                                    <h4 className="text-sm font-black text-white">{hotspot.topicName}</h4>
                                    <p className="text-xs text-neutral-400 mt-1">
                                        Contains <span className="text-white font-bold">{hotspot.count} direct references</span> within {hotspot.sector.label}.
                                    </p>
                                </div>

                                <div className="mt-3 pt-2 border-t border-neutral-800 flex justify-between items-center text-[10px] font-mono text-neutral-500">
                                    <span>{hotspot.items.length} items logged</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setViewMode('matrix');
                                            setSelectedCell(hotspot);
                                        }}
                                        className="text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                        Inspect Cell →
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 7. MODE 3: ENTITY GAPS & HUBS BREAKDOWN (Preserving original entity-level card inspection) */}
            {viewMode === 'entities' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                        <p className="text-xs text-neutral-400">
                            Micro-level entity audit flagging under-referenced items (Gaps) or dense relational hubs (Overlaps).
                        </p>
                        <div className="flex gap-1.5 bg-black/40 p-1 rounded-xl border border-neutral-800 shrink-0">
                            {(['all', 'gaps', 'overlaps'] as const).map(f => (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => { setActiveEntityFilter(f); setSelectedEntity(null); }}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                        activeEntityFilter === f
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'text-neutral-500 hover:text-white'
                                    }`}
                                >
                                    {f === 'all' ? 'All Entities' : f === 'gaps' ? '⚠️ Gaps Only' : '🔥 Dense Overlaps'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {filteredEntityItems.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                            {filteredEntityItems.map((item, idx) => {
                                const isSelected = selectedEntity?.name === item.name;
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setSelectedEntity(item)}
                                        className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between h-20 relative cursor-pointer ${
                                            isSelected 
                                                ? 'ring-2 ring-blue-500 border-blue-500 shadow-lg scale-[1.03]' 
                                                : item.status === 'gap'
                                                    ? 'bg-rose-950/20 border-rose-900/30 hover:border-rose-700/60'
                                                    : item.status === 'overlap'
                                                        ? 'bg-purple-950/20 border-purple-900/30 hover:border-purple-700/60'
                                                        : 'bg-black/20 border-neutral-800 hover:border-neutral-700'
                                        }`}
                                    >
                                        <div className="w-full">
                                            <div className="flex justify-between items-center w-full">
                                                <span className={`text-[7px] font-black uppercase px-1 rounded border font-mono ${
                                                    item.status === 'gap'
                                                        ? 'bg-red-950 text-red-400 border-red-900/20 animate-pulse'
                                                        : item.status === 'overlap'
                                                            ? 'bg-purple-950 text-purple-400 border-purple-900/20 font-black'
                                                            : 'bg-neutral-850 text-neutral-400 border-neutral-700/40'
                                                }`}>
                                                    {item.status === 'gap' ? 'Gap' : item.status === 'overlap' ? 'Hub' : 'Core'}
                                                </span>
                                                <span className="text-[9px] font-bold text-neutral-400 font-mono">
                                                    {item.score.toFixed(1)}
                                                </span>
                                            </div>
                                            <h4 className="text-[10px] font-black text-neutral-200 mt-1 truncate w-full font-mono" title={item.name}>
                                                {item.name}
                                            </h4>
                                        </div>
                                        <span className="text-[8px] text-neutral-500 font-mono truncate block w-full">
                                            {item.mentionsCount} mentions • {item.relationsCount} rels
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-neutral-500 italic text-center py-6 font-sans">
                            No entities matched this filter. Build triplets in the Neural Graph tab to populate entity analysis.
                        </p>
                    )}

                    {/* Entity Inspector Card */}
                    {selectedEntity && (
                        <div className="bg-black/50 border border-neutral-800 rounded-xl p-4 space-y-2 animate-fadeIn font-sans">
                            <div className="flex justify-between items-start pb-2 border-b border-neutral-800">
                                <div>
                                    <span className="text-[8px] font-black uppercase text-blue-400 tracking-wider font-mono">Integrative Entity Analysis</span>
                                    <h4 className="text-xs font-black text-white mt-0.5 font-mono">{selectedEntity.name}</h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedEntity(null)}
                                    className="text-neutral-500 hover:text-white text-xs cursor-pointer"
                                >
                                    ✕ Close Inspector
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono pt-1 text-neutral-400">
                                <div>
                                    Mentions In Documents: <span className="text-white font-bold">{selectedEntity.mentionsCount} times</span>
                                </div>
                                <div>
                                    Relationships Defined: <span className="text-white font-bold">{selectedEntity.relationsCount} links</span>
                                </div>
                                <div>
                                    Thematic Integration Index: <span className="text-white font-bold">{selectedEntity.score.toFixed(1)} pts</span>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-neutral-800 flex gap-2 items-center text-xs">
                                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 font-mono">Integration Status:</span>
                                <p className="text-neutral-300 leading-normal text-xs">
                                    {selectedEntity.status === 'gap' ? (
                                        <span className="text-rose-400 font-bold">⚠️ Critical Gap: This entity is under-referenced and barely linked. Create more lore documents or scripts containing "{selectedEntity.name}" to balance the project.</span>
                                    ) : selectedEntity.status === 'overlap' ? (
                                        <span className="text-purple-400 font-bold">🔥 Highly Connected: Dense overlapping hub. This entity is central to multiple thematic files and relationships.</span>
                                    ) : (
                                        <span className="text-green-400 font-bold">✓ Perfectly Balanced: Structurally integrated with stable mentions and connections.</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
