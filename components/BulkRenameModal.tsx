import React, { useState, useEffect } from 'react';
import { BulkRenameSuggestion } from '../types';
import { suggestBulkFilenamesService } from '../services/geminiService';

interface BulkRenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedAssets: Array<{
        id: string;
        currentName: string;
        tags?: string[];
        folder?: string;
        metadata?: any;
        type?: string;
    }>;
    onApplyRename: (renames: Array<{ id: string; oldName: string; newName: string }>) => Promise<void> | void;
}

export const BulkRenameModal: React.FC<BulkRenameModalProps> = ({
    isOpen,
    onClose,
    selectedAssets,
    onApplyRename
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [suggestions, setSuggestions] = useState<BulkRenameSuggestion[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editedNames, setEditedNames] = useState<Record<string, string>>({});
    const [isApplying, setIsApplying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || selectedAssets.length === 0) return;

        const loadSuggestions = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const res = await suggestBulkFilenamesService(selectedAssets);
                setSuggestions(res);
                const allIds = new Set(res.map(r => r.id));
                setSelectedIds(allIds);

                const initialEdits: Record<string, string> = {};
                res.forEach(r => {
                    initialEdits[r.id] = r.suggestedName;
                });
                setEditedNames(initialEdits);
            } catch (err: any) {
                console.error("Bulk rename suggestion error:", err);
                setError("Failed to generate AI filename suggestions. Please try again.");
            } finally {
                setIsLoading(false);
            }
        };

        loadSuggestions();
    }, [isOpen, selectedAssets]);

    if (!isOpen) return null;

    const toggleSelectAll = () => {
        if (selectedIds.size === suggestions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(suggestions.map(s => s.id)));
        }
    };

    const toggleId = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const handleApply = async () => {
        const renamesToApply = suggestions
            .filter(s => selectedIds.has(s.id))
            .map(s => ({
                id: s.id,
                oldName: s.currentName,
                newName: editedNames[s.id] || s.suggestedName
            }));

        if (renamesToApply.length === 0) {
            onClose();
            return;
        }

        setIsApplying(true);
        try {
            await onApplyRename(renamesToApply);
            onClose();
        } catch (e: any) {
            setError(e.message || "Failed to apply bulk renames.");
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
                {/* Modal Header */}
                <div className="px-6 py-4 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <span className="text-xl">✏️</span>
                        <div>
                            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                                Bulk Filename Intelligence Tool
                                <span className="text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded font-mono">
                                    Gemini 3.8 Flash
                                </span>
                            </h3>
                            <p className="text-xs text-neutral-400">
                                Standardizes asset filenames based on narrative tags, categories, and document metadata.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-white text-lg font-mono p-1"
                    >
                        ✕
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 space-y-4">
                            <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs font-mono text-purple-300">
                                Gemini is analyzing asset metadata and generating standardized filenames...
                            </p>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-rose-950/40 border border-rose-800/40 rounded-xl text-rose-300 text-xs">
                            {error}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Toolbar */}
                            <div className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-neutral-800">
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-neutral-300">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size > 0 && selectedIds.size === suggestions.length}
                                            onChange={toggleSelectAll}
                                            className="rounded border-neutral-700 bg-black text-purple-600 focus:ring-0"
                                        />
                                        <span>Select All ({selectedIds.size}/{suggestions.length})</span>
                                    </label>
                                </div>
                                <span className="text-[11px] font-mono text-neutral-400">
                                    Click any suggested filename to modify before updating.
                                </span>
                            </div>

                            {/* Suggestions List Table */}
                            <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60 divide-y divide-neutral-850">
                                {suggestions.map(s => {
                                    const isChecked = selectedIds.has(s.id);
                                    return (
                                        <div
                                            key={s.id}
                                            className={`p-4 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                                isChecked ? 'bg-purple-950/15' : 'opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-start gap-3 min-w-0 flex-1">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleId(s.id)}
                                                    className="mt-1 rounded border-neutral-700 bg-black text-purple-600 focus:ring-0 cursor-pointer"
                                                />
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-mono text-neutral-400 truncate max-w-[200px]" title={s.currentName}>
                                                            {s.currentName}
                                                        </span>
                                                        <span className="text-neutral-600 text-xs">➔</span>
                                                    </div>
                                                    
                                                    {/* Editable Suggested Filename */}
                                                    <input
                                                        type="text"
                                                        value={editedNames[s.id] ?? s.suggestedName}
                                                        onChange={(e) => setEditedNames(prev => ({ ...prev, [s.id]: e.target.value }))}
                                                        className="w-full bg-neutral-900 border border-neutral-700 focus:border-purple-500 rounded-lg px-3 py-1.5 text-xs font-mono text-purple-200 font-bold outline-none transition-colors"
                                                    />

                                                    {/* Reasoning & Tags */}
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                        <span className="text-[10px] text-neutral-400 font-sans italic">
                                                            💡 {s.reasoning}
                                                        </span>
                                                        {s.tags?.map((t, idx) => (
                                                            <span key={idx} className="text-[9px] bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded font-mono">
                                                                #{t}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-neutral-950 border-t border-neutral-800 flex justify-between items-center">
                    <span className="text-xs text-neutral-500 font-mono">
                        {selectedIds.size} files queued for batch rename
                    </span>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={isApplying || selectedIds.size === 0 || isLoading}
                            className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg disabled:opacity-50 cursor-pointer flex items-center gap-2"
                        >
                            {isApplying ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Renaming Files...</span>
                                </>
                            ) : (
                                <>
                                    <span>✓</span>
                                    <span>Apply Bulk Rename ({selectedIds.size})</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
