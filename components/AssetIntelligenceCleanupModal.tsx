import React, { useState, useEffect } from 'react';
import { ImageState, DuplicateImageSet } from '../types';
import { detectVisualDuplicateAssetsService } from '../services/geminiService';
import { vectorDb } from '../services/vectorDbService';

interface AssetIntelligenceCleanupModalProps {
    isOpen: boolean;
    onClose: () => void;
    images?: ImageState[];
    onUpdateImages?: (images: ImageState[]) => void;
    onRefreshGrid?: () => void;
}

export const AssetIntelligenceCleanupModal: React.FC<AssetIntelligenceCleanupModalProps> = ({
    isOpen,
    onClose,
    images = [],
    onUpdateImages,
    onRefreshGrid
}) => {
    const [isScanning, setIsScanning] = useState(false);
    const [duplicateSets, setDuplicateSets] = useState<DuplicateImageSet[]>([]);
    const [scannedCount, setScannedCount] = useState(0);
    const [statusToast, setStatusToast] = useState<string | null>(null);
    const [actionLog, setActionLog] = useState<string[]>([]);
    const [dismissedSetIds, setDismissedSetIds] = useState<Set<string>>(new Set());

    // Gather unified list of images to audit (from props or vector DB)
    const [allAssets, setAllAssets] = useState<Array<{
        id: string;
        name: string;
        url?: string;
        base64?: string;
        tags?: string[];
        folder?: string;
        metadata?: any;
    }>>([]);

    useEffect(() => {
        if (!isOpen) return;

        const gatherAssets = async () => {
            setIsScanning(true);
            const gathered: Array<{
                id: string;
                name: string;
                url?: string;
                base64?: string;
                tags?: string[];
                folder?: string;
                metadata?: any;
            }> = [];

            // 1. Gather Project Images
            images.forEach((img, idx) => {
                gathered.push({
                    id: img.id,
                    name: img.metadata?.filename || `Project_Image_${idx + 1}`,
                    url: img.url,
                    base64: img.base64,
                    tags: img.tags || [],
                    folder: img.folder || 'Root Assets',
                    metadata: img.metadata
                });
            });

            // 2. Gather Vector Records with image data
            try {
                const vectorRecords = await vectorDb.getAllVectors();
                vectorRecords.forEach(v => {
                    if (v.metadata?.type === 'image_asset' || v.metadata?.thumbnail) {
                        const existing = gathered.some(g => g.id === v.id);
                        if (!existing) {
                            gathered.push({
                                id: v.id,
                                name: v.source || `Archive_Asset_${v.id.slice(0, 6)}`,
                                url: v.metadata?.url,
                                base64: v.metadata?.thumbnail,
                                tags: v.metadata?.tags || [],
                                folder: v.metadata?.collection || 'Sacred Archive',
                                metadata: v.metadata
                            });
                        }
                    }
                });
            } catch (err) {
                console.warn("Vector records retrieval for cleanup:", err);
            }

            setAllAssets(gathered);
            setScannedCount(gathered.length);

            // Run detection with Gemini
            try {
                const results = await detectVisualDuplicateAssetsService(gathered);
                setDuplicateSets(results);
            } catch (e: any) {
                console.error("Duplicate detection error:", e);
            } finally {
                setIsScanning(false);
            }
        };

        gatherAssets();
    }, [isOpen, images]);

    if (!isOpen) return null;

    // Helper to find asset
    const getAsset = (id: string) => allAssets.find(a => a.id === id);

    // Apply Merge action on a specific set
    const handleMergeSet = async (set: DuplicateImageSet) => {
        const keeper = getAsset(set.keeperAssetId);
        if (!keeper) return;

        const duplicateAssets = set.duplicateAssetIds.map(id => getAsset(id)).filter(Boolean);
        const dupIdsSet = new Set(set.duplicateAssetIds);

        // Combine tags from duplicates into keeper
        const allTags = new Set(keeper.tags || []);
        duplicateAssets.forEach(d => {
            (d?.tags || []).forEach(t => allTags.add(t));
        });
        const mergedTags = Array.from(allTags);

        // Update Project Images: keep keeper with merged tags, filter out duplicate ids
        if (onUpdateImages) {
            const updatedImages = images
                .filter(img => !dupIdsSet.has(img.id))
                .map(img => img.id === keeper.id ? { ...img, tags: mergedTags } : img);
            onUpdateImages(updatedImages);
        }

        // Delete duplicates from Vector DB if present
        for (const dupId of set.duplicateAssetIds) {
            try {
                await vectorDb.deleteVector(dupId);
            } catch (e) {}
        }

        // Update local state
        setDuplicateSets(prev => prev.filter(s => s.id !== set.id));
        setAllAssets(prev => prev.filter(a => !dupIdsSet.has(a.id)).map(a => a.id === keeper.id ? { ...a, tags: mergedTags } : a));
        setActionLog(prev => [`Merged ${set.duplicateAssetIds.length} redundant assets into master "${keeper.name}"`, ...prev]);
        setStatusToast(`Successfully merged redundant assets into master "${keeper.name}"!`);
        setTimeout(() => setStatusToast(null), 3500);

        if (onRefreshGrid) onRefreshGrid();
    };

    // Apply Delete action on a specific set
    const handleDeleteDuplicates = async (set: DuplicateImageSet) => {
        const dupIdsSet = new Set(set.duplicateAssetIds);

        // Remove duplicates from project images
        if (onUpdateImages) {
            const updatedImages = images.filter(img => !dupIdsSet.has(img.id));
            onUpdateImages(updatedImages);
        }

        // Delete from Vector DB
        for (const dupId of set.duplicateAssetIds) {
            try {
                await vectorDb.deleteVector(dupId);
            } catch (e) {}
        }

        setDuplicateSets(prev => prev.filter(s => s.id !== set.id));
        setAllAssets(prev => prev.filter(a => !dupIdsSet.has(a.id)));
        setActionLog(prev => [`Deleted ${set.duplicateAssetIds.length} redundant duplicates`, ...prev]);
        setStatusToast(`Removed ${set.duplicateAssetIds.length} redundant duplicate images!`);
        setTimeout(() => setStatusToast(null), 3500);

        if (onRefreshGrid) onRefreshGrid();
    };

    // Dismiss set
    const handleDismissSet = (setId: string) => {
        setDismissedSetIds(prev => new Set([...prev, setId]));
    };

    // Batch Execute All Recommended Cleanups
    const handleExecuteAllCleanups = async () => {
        const activeSets = duplicateSets.filter(s => !dismissedSetIds.has(s.id));
        if (activeSets.length === 0) return;

        for (const set of activeSets) {
            if (set.recommendedAction === 'merge') {
                await handleMergeSet(set);
            } else {
                await handleDeleteDuplicates(set);
            }
        }

        setStatusToast(`Batch cleanup complete! Cleaned ${activeSets.length} duplicate sets.`);
        setTimeout(() => setStatusToast(null), 4000);
    };

    const visibleSets = duplicateSets.filter(s => !dismissedSetIds.has(s.id));

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            {/* Status Toast */}
            {statusToast && (
                <div className="fixed bottom-6 right-6 z-50 bg-emerald-950/95 border border-emerald-500 text-emerald-200 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold animate-fade-in flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{statusToast}</span>
                </div>
            )}

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden font-sans">
                {/* Header */}
                <div className="p-6 border-b border-neutral-800 flex justify-between items-center bg-neutral-950/60">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-amber-950/80 border border-amber-600/40 flex items-center justify-center text-xl">
                            🧹
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-white uppercase tracking-wider">
                                    Asset Intelligence Cleanup Tool
                                </h3>
                                <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded-full font-mono uppercase">
                                    Gemini Multimodal
                                </span>
                            </div>
                            <p className="text-xs text-neutral-400 mt-0.5">
                                Detect duplicate and redundant visual assets based on semantic visual similarity, suggesting merge or delete workflows.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="text-neutral-400 hover:text-white p-2 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 transition cursor-pointer text-sm font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* Sub-Header Stats & Batch Action */}
                <div className="px-6 py-3 bg-black/40 border-b border-neutral-850 flex flex-wrap justify-between items-center gap-4 text-xs font-mono">
                    <div className="flex items-center gap-4 text-neutral-400">
                        <span>Audited: <strong className="text-white">{scannedCount}</strong> Assets</span>
                        <span>•</span>
                        <span>Duplicate Sets: <strong className="text-amber-400">{visibleSets.length}</strong></span>
                        {isScanning && (
                            <span className="flex items-center gap-1.5 text-blue-400">
                                <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                                <span>Scanning visual signatures...</span>
                            </span>
                        )}
                    </div>

                    {visibleSets.length > 0 && (
                        <button
                            onClick={handleExecuteAllCleanups}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition shadow-md flex items-center gap-1.5 cursor-pointer"
                        >
                            <span>⚡</span> Execute Batch Cleanup ({visibleSets.length} Sets)
                        </button>
                    )}
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto custom-scrollbar flex-grow space-y-5">
                    {isScanning ? (
                        <div className="py-20 text-center space-y-4">
                            <div className="w-12 h-12 rounded-full border-4 border-neutral-800 border-t-amber-500 animate-spin mx-auto" />
                            <div>
                                <p className="text-sm font-bold text-neutral-200">
                                    Analyzing Visual Composition & Redundancy...
                                </p>
                                <p className="text-xs text-neutral-500 font-mono mt-1">
                                    Gemini 3.8 Flash evaluating visual similarity matrices across {allAssets.length} assets
                                </p>
                            </div>
                        </div>
                    ) : visibleSets.length === 0 ? (
                        <div className="py-16 text-center space-y-3 bg-neutral-950/40 rounded-2xl border border-neutral-800">
                            <span className="text-4xl block">✨</span>
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                                Repository Clean & Optimized
                            </h4>
                            <p className="text-xs text-neutral-400 max-w-md mx-auto">
                                No redundant or duplicate assets detected across your active project and Sacred Archive. All asset signatures are distinct.
                            </p>
                        </div>
                    ) : (
                        visibleSets.map((set, idx) => {
                            const keeper = getAsset(set.keeperAssetId);
                            const duplicates = set.duplicateAssetIds.map(id => getAsset(id)).filter(Boolean);

                            return (
                                <div 
                                    key={set.id}
                                    className="bg-neutral-950 border border-neutral-800 hover:border-neutral-700/80 rounded-2xl p-5 shadow-lg space-y-4 transition"
                                >
                                    {/* Set Header */}
                                    <div className="flex flex-wrap justify-between items-center gap-2 border-b border-neutral-850 pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black uppercase text-amber-400 font-mono">
                                                Set #{idx + 1}
                                            </span>
                                            <span className="text-[10px] font-mono font-bold bg-amber-950/80 text-amber-300 border border-amber-800/40 px-2 py-0.5 rounded">
                                                {set.similarityScore}% Visual Match
                                            </span>
                                            <span className="text-[9px] font-mono uppercase bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded">
                                                Recommended: {set.recommendedAction.toUpperCase()}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleMergeSet(set)}
                                                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition shadow cursor-pointer flex items-center gap-1"
                                                title="Consolidate tags into master asset and delete duplicates"
                                            >
                                                <span>🏷</span> Merge Tags
                                            </button>
                                            <button
                                                onClick={() => handleDeleteDuplicates(set)}
                                                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition shadow cursor-pointer flex items-center gap-1"
                                                title="Delete redundant duplicates"
                                            >
                                                <span>🗑</span> Delete Redundant
                                            </button>
                                            <button
                                                onClick={() => handleDismissSet(set.id)}
                                                className="px-2 py-1 text-neutral-400 hover:text-white text-[10px] font-bold uppercase rounded-lg hover:bg-neutral-800 transition cursor-pointer"
                                            >
                                                Keep Both
                                            </button>
                                        </div>
                                    </div>

                                    {/* AI Reason */}
                                    <p className="text-xs text-neutral-300 italic bg-black/40 p-2.5 rounded-xl border border-neutral-850">
                                        "{set.reason}"
                                    </p>

                                    {/* Comparison Visual Grid */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {/* Keeper Master Card */}
                                        {keeper && (
                                            <div className="bg-neutral-900 border border-emerald-500/50 p-3 rounded-xl relative space-y-2">
                                                <div className="absolute top-2 left-2 z-10 bg-emerald-600 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow">
                                                    ★ Master (Keep)
                                                </div>
                                                <div className="w-full h-32 bg-black rounded-lg overflow-hidden flex items-center justify-center border border-neutral-800">
                                                    {keeper.base64 || keeper.url ? (
                                                        <img
                                                            src={keeper.base64 || keeper.url}
                                                            alt={keeper.name}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-2xl">🖼️</span>
                                                    )}
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-bold text-white truncate font-mono">{keeper.name}</p>
                                                    <p className="text-[9px] text-neutral-500 uppercase font-mono">{keeper.folder}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(keeper.tags || []).map(t => (
                                                            <span key={t} className="text-[8px] bg-neutral-800 text-neutral-400 px-1 rounded font-mono">
                                                                #{t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Duplicate Redundant Candidates */}
                                        {duplicates.map((dup, dIdx) => (
                                            <div key={dup.id || dIdx} className="bg-neutral-900 border border-rose-500/40 p-3 rounded-xl relative space-y-2">
                                                <div className="absolute top-2 left-2 z-10 bg-rose-600/90 text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow">
                                                    ✕ Redundant Duplicate
                                                </div>
                                                <div className="w-full h-32 bg-black rounded-lg overflow-hidden flex items-center justify-center border border-neutral-800">
                                                    {dup.base64 || dup.url ? (
                                                        <img
                                                            src={dup.base64 || dup.url}
                                                            alt={dup.name}
                                                            className="w-full h-full object-cover opacity-80"
                                                        />
                                                    ) : (
                                                        <span className="text-2xl">🖼️</span>
                                                    )}
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-xs font-bold text-neutral-300 truncate font-mono">{dup.name}</p>
                                                    <p className="text-[9px] text-neutral-500 uppercase font-mono">{dup.folder}</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {(dup.tags || []).map(t => (
                                                            <span key={t} className="text-[8px] bg-neutral-800 text-neutral-400 px-1 rounded font-mono">
                                                                #{t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* Action Logs */}
                    {actionLog.length > 0 && (
                        <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-850 space-y-1 font-mono text-[10px]">
                            <span className="text-neutral-500 uppercase font-black block mb-1">Execution Audit Trail:</span>
                            {actionLog.map((log, i) => (
                                <p key={i} className="text-neutral-400">✓ {log}</p>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-neutral-800 flex justify-end bg-neutral-950/60">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
