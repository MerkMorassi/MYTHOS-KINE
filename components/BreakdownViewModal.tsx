import React, { useState, useMemo } from 'react';
import MythosBreakdown from '../utils/breakdown-standalone.js';
import type { BreakdownResult, BreakdownScene, ShotItem } from '../utils/breakdown-standalone.d.ts';
import { ScriptFile } from '../types.ts';
import { DownloadIcon, CloseIcon, ScriptIcon } from './icons.tsx';

interface BreakdownViewModalProps {
    script: ScriptFile;
    onClose: () => void;
}

export const BreakdownViewModal: React.FC<BreakdownViewModalProps> = ({ script, onClose }) => {
    const [activeTab, setActiveTab] = useState<'breakdown' | 'stripboard' | 'shots'>('breakdown');
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState<string>('');

    // Parse the script content using the Breakdown Chip
    const breakdownData: BreakdownResult = useMemo(() => {
        try {
            const paras = MythosBreakdown.parasFromFountain(script.content);
            return MythosBreakdown.breakdown(paras);
        } catch (e) {
            console.error("MythosBreakdown parsing error:", e);
            const emptyParas = [{ type: 'action', text: script.content || '' }];
            return MythosBreakdown.breakdown(emptyParas);
        }
    }, [script.content]);

    // Stripboard grouping and scene order
    const stripboardData = useMemo(() => {
        return MythosBreakdown.stripboard(breakdownData);
    }, [breakdownData]);

    // Shots list
    const shotItems: ShotItem[] = useMemo(() => {
        return MythosBreakdown.toShots(breakdownData);
    }, [breakdownData]);

    // Filter scenes
    const filteredScenes = useMemo(() => {
        return breakdownData.scenes.filter(s => {
            const matchesSearch = !searchTerm || 
                s.header.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.set.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.cast.some(c => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
                s.onSet.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()));

            if (!matchesSearch) return false;

            if (filterCategory === 'all') return true;
            if (filterCategory === 'vfx') return s.vfx.length > 0;
            if (filterCategory === 'props') return s.props.length > 0;
            if (filterCategory === 'wardrobe') return s.wardrobe.length > 0;
            if (filterCategory === 'vehicles') return s.vehicles.length > 0;
            if (filterCategory === 'stunts') return s.stunts.length > 0;
            if (filterCategory === 'sound_sfx') return s.sfx.length > 0 || s.sound.length > 0;
            return true;
        });
    }, [breakdownData.scenes, searchTerm, filterCategory]);

    // Download Breakdown CSV
    const handleDownloadBreakdownCSV = () => {
        const csvContent = MythosBreakdown.toCSV(breakdownData);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${script.title.replace(/\s+/g, '_')}_Breakdown.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Download Pre-Shot List CSV
    const handleDownloadShotlistCSV = () => {
        const csvContent = MythosBreakdown.toShotlistCSV(breakdownData);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${script.title.replace(/\s+/g, '_')}_ShotList.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const renderTagList = (label: string, items: string[], colorClass: string) => {
        if (!items || items.length === 0) return null;
        return (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 font-bold">{label}:</span>
                {items.map((item, idx) => (
                    <span key={idx} className={`px-2 py-0.5 rounded text-[11px] font-mono border ${colorClass}`}>
                        {item}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[120] p-4 md:p-8 flex flex-col animate-fade-in" onClick={onClose}>
            <div className="max-w-7xl mx-auto w-full h-full bg-neutral-900 border border-neutral-700 rounded-2xl flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 md:p-6 border-b border-neutral-800 flex flex-wrap justify-between items-center bg-neutral-950/80 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
                            <ScriptIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight">{script.title}</h2>
                                <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                                    breakdown-chip/v1
                                </span>
                            </div>
                            <p className="text-xs text-neutral-400 mt-0.5">
                                Automated Script-to-Production Breakdown & Stripboard Engine
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        <button
                            onClick={handleDownloadBreakdownCSV}
                            className="px-3 md:px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                            title="Export Breakdown CSV conforming to breakdown-chip/v1 csvColumns"
                        >
                            <DownloadIcon className="w-4 h-4" /> Export Breakdown CSV
                        </button>
                        <button
                            onClick={handleDownloadShotlistCSV}
                            className="px-3 md:px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                            title="Export Pre-Shot List CSV conforming to breakdown-chip/v1 shotColumns"
                        >
                            <DownloadIcon className="w-4 h-4" /> Export Shot List CSV
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-full text-neutral-400 hover:text-white transition-colors cursor-pointer">
                            <CloseIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Totals Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 px-6 py-3.5 bg-neutral-900 border-b border-neutral-800 text-center">
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Scenes</div>
                        <div className="text-lg font-black text-white">{breakdownData.totals.scenes}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Sets / Locs</div>
                        <div className="text-lg font-black text-amber-400">{breakdownData.totals.sets}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Speaking Cast</div>
                        <div className="text-lg font-black text-emerald-400">{breakdownData.totals.cast}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Est. Pages</div>
                        <div className="text-lg font-black text-purple-400">~{breakdownData.totals.estPages}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Words</div>
                        <div className="text-lg font-black text-neutral-300">{breakdownData.totals.words}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Props</div>
                        <div className="text-lg font-black text-sky-400">{breakdownData.totals.props}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">VFX Items</div>
                        <div className="text-lg font-black text-cyan-400">{breakdownData.totals.vfx}</div>
                    </div>
                    <div className="bg-neutral-950/60 p-2 rounded-lg border border-neutral-800/80">
                        <div className="text-[10px] font-mono uppercase text-neutral-500 font-bold">Pre-Shots</div>
                        <div className="text-lg font-black text-indigo-400">{shotItems.length}</div>
                    </div>
                </div>

                {/* Sub-navigation & Controls */}
                <div className="flex flex-wrap items-center justify-between px-6 py-2.5 bg-neutral-950 border-b border-neutral-800 gap-4">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setActiveTab('breakdown')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                activeTab === 'breakdown' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white bg-neutral-900'
                            }`}
                        >
                            Scene Breakdown ({breakdownData.scenes.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('stripboard')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                activeTab === 'stripboard' ? 'bg-amber-600 text-white' : 'text-neutral-400 hover:text-white bg-neutral-900'
                            }`}
                        >
                            Stripboard ({stripboardData.groups.length} Groups)
                        </button>
                        <button
                            onClick={() => setActiveTab('shots')}
                            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                                activeTab === 'shots' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white bg-neutral-900'
                            }`}
                        >
                            Pre-Shot List ({shotItems.length} Shots)
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeTab === 'breakdown' && (
                            <select
                                value={filterCategory}
                                onChange={e => setFilterCategory(e.target.value)}
                                className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:border-emerald-500"
                            >
                                <option value="all">All Needs</option>
                                <option value="props">With Props</option>
                                <option value="vfx">With VFX</option>
                                <option value="wardrobe">With Wardrobe</option>
                                <option value="vehicles">With Vehicles</option>
                                <option value="stunts">With Stunts</option>
                                <option value="sound_sfx">With SFX/Sound</option>
                            </select>
                        )}
                        <input
                            type="text"
                            placeholder="Search scenes or cast..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 text-neutral-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 w-44"
                        />
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-grow overflow-y-auto p-6 bg-neutral-950/40 custom-scrollbar">
                    {/* TAB 1: BREAKDOWN */}
                    {activeTab === 'breakdown' && (
                        <div className="space-y-4">
                            {filteredScenes.length === 0 ? (
                                <div className="text-center py-16 text-neutral-500 font-mono text-sm">
                                    No scenes matched filter criteria.
                                </div>
                            ) : (
                                filteredScenes.map((scene) => (
                                    <div key={scene.n} className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-all">
                                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/80 pb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center font-mono font-black text-sm text-emerald-400 border border-neutral-700">
                                                    #{scene.n}
                                                </span>
                                                <div>
                                                    <h3 className="font-mono font-black text-white text-base tracking-wide">
                                                        {scene.header || 'UNSLUGGED SCENE'}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[11px] font-mono text-neutral-400">
                                                        <span className="font-bold text-amber-400">{scene.intExt || '—'}</span>
                                                        <span>•</span>
                                                        <span>Set: <strong className="text-neutral-200">{scene.set || '—'}</strong></span>
                                                        <span>•</span>
                                                        <span>Time: <strong className="text-neutral-200">{scene.time || '—'}</strong></span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs font-mono">
                                                <div className="text-right">
                                                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Est. Pages</span>
                                                    <span className="text-purple-400 font-bold">~{scene.estPages} pg</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Lines</span>
                                                    <span className="text-neutral-300">{scene.dialogueLines} dlg / {scene.actionLines} act</span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-neutral-500 block text-[10px] uppercase font-bold">Words</span>
                                                    <span className="text-neutral-300">{scene.words}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Cast & On Set */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3 border-b border-neutral-800/60 text-xs">
                                            <div>
                                                <span className="text-[10px] font-mono uppercase text-neutral-500 font-bold block mb-1">
                                                    Speaking Cast ({scene.cast.length}):
                                                </span>
                                                {scene.cast.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {scene.cast.map((c, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 font-mono rounded text-[11px] font-semibold">
                                                                {c}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-neutral-500 font-mono">—</span>
                                                )}
                                            </div>

                                            <div>
                                                <span className="text-[10px] font-mono uppercase text-neutral-500 font-bold block mb-1">
                                                    On-Set Personnel (Speakers + Mentioned CAPS):
                                                </span>
                                                {scene.onSet.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {scene.onSet.map((c, i) => (
                                                            <span key={i} className="px-2 py-0.5 bg-neutral-800/80 border border-neutral-700 text-neutral-200 font-mono rounded text-[11px]">
                                                                {c}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-neutral-500 font-mono">—</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Production Tagged Needs */}
                                        <div className="pt-3 space-y-1.5">
                                            {renderTagList("Props", scene.props, "bg-sky-950/40 border-sky-800/60 text-sky-300")}
                                            {renderTagList("Wardrobe", scene.wardrobe, "bg-purple-950/40 border-purple-800/60 text-purple-300")}
                                            {renderTagList("Makeup", scene.makeup, "bg-rose-950/40 border-rose-800/60 text-rose-300")}
                                            {renderTagList("VFX", scene.vfx, "bg-cyan-950/40 border-cyan-800/60 text-cyan-300")}
                                            {renderTagList("SFX", scene.sfx, "bg-orange-950/40 border-orange-800/60 text-orange-300")}
                                            {renderTagList("Sound / Ambience", scene.sound, "bg-amber-950/40 border-amber-800/60 text-amber-300")}
                                            {renderTagList("Music", scene.music, "bg-indigo-950/40 border-indigo-800/60 text-indigo-300")}
                                            {renderTagList("Vehicles", scene.vehicles, "bg-yellow-950/40 border-yellow-800/60 text-yellow-300")}
                                            {renderTagList("Stunts", scene.stunts, "bg-red-950/40 border-red-800/60 text-red-300")}
                                            {renderTagList("Animals", scene.animals, "bg-emerald-950/40 border-emerald-800/60 text-emerald-300")}
                                            {renderTagList("Extras (from [extra:] tags only)", scene.extras, "bg-teal-950/40 border-teal-800/60 text-teal-300")}
                                            {renderTagList("Transitions", scene.transitions, "bg-neutral-800/50 border-neutral-700 text-neutral-400")}

                                            {!scene.props.length && !scene.wardrobe.length && !scene.makeup.length &&
                                             !scene.vfx.length && !scene.sfx.length && !scene.sound.length &&
                                             !scene.music.length && !scene.vehicles.length && !scene.stunts.length &&
                                             !scene.animals.length && !scene.extras.length && !scene.transitions.length && (
                                                <div className="text-[11px] font-mono text-neutral-500 italic">
                                                    No special production elements tagged in this scene (use inline tags like [prop: x], [vfx: x], [w: x]).
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* TAB 2: STRIPBOARD */}
                    {activeTab === 'stripboard' && (
                        <div className="space-y-6">
                            <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl text-xs font-mono text-neutral-400">
                                <strong>Stripboard Grouping Rule:</strong> Scenes are clustered by <code>SET :: TIME</code> to optimize shooting days, preserving narrative order within each production cluster.
                            </div>

                            {stripboardData.groups.map((groupKey, gIdx) => {
                                const sceneNumbers = stripboardData.sceneOrder.filter(n => {
                                    const s = breakdownData.scenes.find(sc => sc.n === n);
                                    return s && (s.set + " :: " + (s.time || "UNSPECIFIED")) === groupKey;
                                });

                                return (
                                    <div key={gIdx} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                                        <div className="bg-neutral-800/80 px-5 py-3 border-b border-neutral-700 flex justify-between items-center">
                                            <h4 className="font-mono font-black text-amber-400 text-sm tracking-wide">
                                                CLUSTER {gIdx + 1}: {groupKey}
                                            </h4>
                                            <span className="text-xs font-mono text-neutral-400 font-bold">
                                                {sceneNumbers.length} {sceneNumbers.length === 1 ? 'Scene' : 'Scenes'}
                                            </span>
                                        </div>
                                        <div className="divide-y divide-neutral-800/80">
                                            {sceneNumbers.map(sceneN => {
                                                const sc = breakdownData.scenes.find(s => s.n === sceneN);
                                                if (!sc) return null;
                                                return (
                                                    <div key={sceneN} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono hover:bg-neutral-800/30">
                                                        <div className="flex items-center gap-3">
                                                            <span className="w-7 h-7 rounded bg-neutral-800 text-emerald-400 font-bold flex items-center justify-center text-xs">
                                                                #{sc.n}
                                                            </span>
                                                            <div>
                                                                <div className="font-bold text-white">{sc.header}</div>
                                                                <div className="text-[11px] text-neutral-400 mt-0.5">
                                                                    Cast: {sc.cast.length > 0 ? sc.cast.join(', ') : '—'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-4 text-neutral-400">
                                                            <span>~{sc.estPages} pg</span>
                                                            <span className="text-neutral-500">|</span>
                                                            <span>{sc.words} words</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* TAB 3: PRE-SHOT LIST */}
                    {activeTab === 'shots' && (
                        <div className="space-y-4">
                            <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl text-xs font-mono text-neutral-400 flex justify-between items-center">
                                <div>
                                    <strong>Default Coverage Contract:</strong> One Wide Shot (WS) master per scene + One Medium Shot (MS) per speaker + One INSERT per prop/vfx item.
                                </div>
                                <span className="text-indigo-400 font-bold">All rows ship status: TODO</span>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left font-mono text-xs border border-neutral-800 rounded-xl overflow-hidden">
                                    <thead className="bg-neutral-900 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                                        <tr>
                                            <th className="p-3">Shot ID</th>
                                            <th className="p-3">Scene</th>
                                            <th className="p-3">Set</th>
                                            <th className="p-3">INT/EXT</th>
                                            <th className="p-3">Time</th>
                                            <th className="p-3">Size</th>
                                            <th className="p-3">Subject</th>
                                            <th className="p-3">Detail</th>
                                            <th className="p-3">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-800/80 bg-neutral-950/60">
                                        {shotItems.map(shot => (
                                            <tr key={shot.shot_id} className="hover:bg-neutral-900/40">
                                                <td className="p-3 font-bold text-emerald-400">{shot.shot_id}</td>
                                                <td className="p-3 text-neutral-300">#{shot.scene_n}</td>
                                                <td className="p-3 text-neutral-200">{shot.set || '—'}</td>
                                                <td className="p-3 text-amber-400">{shot.int_ext || '—'}</td>
                                                <td className="p-3 text-neutral-300">{shot.time || '—'}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        shot.size === 'WS' ? 'bg-purple-950/60 text-purple-300 border border-purple-800/60' :
                                                        shot.size === 'MS' ? 'bg-blue-950/60 text-blue-300 border border-blue-800/60' :
                                                        'bg-sky-950/60 text-sky-300 border border-sky-800/60'
                                                    }`}>
                                                        {shot.size}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-white font-medium">{shot.subject}</td>
                                                <td className="p-3 text-neutral-400 text-[11px]">{shot.detail}</td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 bg-neutral-800 border border-neutral-700 text-neutral-400 rounded text-[10px] font-bold">
                                                        {shot.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
