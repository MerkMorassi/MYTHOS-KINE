import React, { useState, useEffect } from 'react';
import { LoreEntry, Character, ThematicTaxonomyItem } from '../types';
import { generateThematicTaxonomyService } from '../services/geminiService';

interface ThematicNavigatorProps {
    lore: LoreEntry[];
    characters: Character[];
    projectName?: string;
    onSelectTheme?: (theme: ThematicTaxonomyItem | null) => void;
    activeThemeId?: string | null;
}

export const ThematicNavigator: React.FC<ThematicNavigatorProps> = ({
    lore = [],
    characters = [],
    projectName = 'ZOE FILMS Universe',
    onSelectTheme,
    activeThemeId = null
}) => {
    const [themes, setThemes] = useState<ThematicTaxonomyItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedThemeId, setSelectedThemeId] = useState<string | null>(activeThemeId);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Load from cache or generate
    useEffect(() => {
        const cacheKey = `mythos_thematic_taxonomy_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setThemes(parsed);
                    return;
                }
            }
        } catch (e) {}

        // Initial generation if no cache
        handleGenerateTaxonomy();
    }, [projectName, lore.length, characters.length]);

    useEffect(() => {
        setSelectedThemeId(activeThemeId || null);
    }, [activeThemeId]);

    const handleGenerateTaxonomy = async () => {
        setIsLoading(true);
        try {
            const taxonomy = await generateThematicTaxonomyService(lore, characters, projectName);
            setThemes(taxonomy);
            const cacheKey = `mythos_thematic_taxonomy_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            try {
                localStorage.setItem(cacheKey, JSON.stringify(taxonomy));
            } catch (e) {}
            setToastMessage("Thematic taxonomy updated successfully.");
            setTimeout(() => setToastMessage(null), 3500);
        } catch (err: any) {
            console.error("Thematic taxonomy generation error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleThemeClick = (theme: ThematicTaxonomyItem) => {
        if (selectedThemeId === theme.id) {
            // Deselect
            setSelectedThemeId(null);
            if (onSelectTheme) onSelectTheme(null);
        } else {
            setSelectedThemeId(theme.id);
            if (onSelectTheme) onSelectTheme(theme);
        }
    };

    const handleClearFilter = () => {
        setSelectedThemeId(null);
        if (onSelectTheme) onSelectTheme(null);
    };

    // Filter themes by category
    const categories = Array.from(new Set(themes.map(t => t.category || 'General')));
    const filteredThemes = activeCategory === 'all' 
        ? themes 
        : themes.filter(t => (t.category || 'General') === activeCategory);

    // Active theme object
    const activeTheme = themes.find(t => t.id === selectedThemeId);

    // Associated lore & characters for active theme
    const activeLoreEntries = activeTheme 
        ? lore.filter(l => activeTheme.associatedLoreIds.includes(l.id) || 
            (activeTheme.keywords && activeTheme.keywords.some(k => `${l.title} ${l.content}`.toLowerCase().includes(k.toLowerCase()))))
        : [];

    const activeCharacters = activeTheme
        ? characters.filter(c => activeTheme.associatedCharacterIds.includes(c.id) ||
            (activeTheme.keywords && activeTheme.keywords.some(k => `${c.name} ${c.description}`.toLowerCase().includes(k.toLowerCase()))))
        : [];

    return (
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-6">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-800 pb-5">
                <div>
                    <div className="flex items-center gap-2.5">
                        <span className="text-xl">🧭</span>
                        <h3 className="text-base font-black text-white uppercase tracking-wider">Thematic Navigator</h3>
                        <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded font-mono font-bold">
                            Gemini Narrative Taxonomy
                        </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                        Click any world theme to instantly filter interconnected lore entries and character profiles across the universe.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {selectedThemeId && (
                        <button
                            onClick={handleClearFilter}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-bold transition-all border border-neutral-700 cursor-pointer"
                        >
                            ✕ Clear Filter
                        </button>
                    )}
                    <button
                        onClick={handleGenerateTaxonomy}
                        disabled={isLoading}
                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        title="Regenerate world themes taxonomy using Gemini"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Analyzing World Themes...</span>
                            </>
                        ) : (
                            <>
                                <span>⚡</span>
                                <span>Generate Taxonomy</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {toastMessage && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2 animate-fade-in">
                    <span>✓</span> {toastMessage}
                </div>
            )}

            {/* Category Pills */}
            {categories.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] uppercase font-mono text-neutral-500 font-bold mr-1">Filter Domain:</span>
                    <button
                        onClick={() => setActiveCategory('all')}
                        className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                            activeCategory === 'all' 
                                ? 'bg-neutral-200 text-black shadow' 
                                : 'bg-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                    >
                        All Themes ({themes.length})
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                                activeCategory === cat 
                                    ? 'bg-blue-600 text-white shadow' 
                                    : 'bg-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {/* Interactive Theme Taxonomy Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredThemes.map(theme => {
                    const isSelected = selectedThemeId === theme.id;
                    return (
                        <div
                            key={theme.id}
                            onClick={() => handleThemeClick(theme)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 group ${
                                isSelected
                                    ? 'bg-gradient-to-br from-blue-950/80 to-purple-950/60 border-blue-500 shadow-xl ring-2 ring-blue-500/30'
                                    : 'bg-black/40 hover:bg-neutral-850/60 border-neutral-800 hover:border-neutral-700'
                            }`}
                        >
                            <div>
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-neutral-500 group-hover:text-blue-400 transition-colors">
                                        {theme.category || 'Theme'}
                                    </span>
                                    {theme.relevanceScore && (
                                        <span className="text-[9px] font-mono bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
                                            {theme.relevanceScore}% fit
                                        </span>
                                    )}
                                </div>
                                <h4 className={`text-sm font-black mt-1 tracking-tight transition-colors ${
                                    isSelected ? 'text-white' : 'text-neutral-200 group-hover:text-white'
                                }`}>
                                    {theme.name}
                                </h4>
                                <p className="text-xs text-neutral-400 mt-1.5 line-clamp-2 leading-relaxed">
                                    {theme.description}
                                </p>
                            </div>

                            {/* Keywords & Associated Counts Footer */}
                            <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-[10px] font-mono">
                                <div className="flex items-center gap-2 text-neutral-400">
                                    <span className="flex items-center gap-1">
                                        <span>📜</span> {theme.associatedLoreIds?.length || 0} Lore
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                        <span>👤</span> {theme.associatedCharacterIds?.length || 0} Chars
                                    </span>
                                </div>
                                <span className={`font-bold uppercase text-[9px] px-2 py-0.5 rounded ${
                                    isSelected ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700'
                                }`}>
                                    {isSelected ? 'Active Filter ✓' : 'Filter ➔'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* INSTANT FILTERED RESULTS DRAWER (When a theme is clicked) */}
            {activeTheme && (
                <div className="bg-black/60 border border-blue-900/40 rounded-xl p-5 space-y-4 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-800">
                        <div className="flex items-center gap-2.5">
                            <span className="text-lg">🎯</span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono uppercase text-blue-400 font-bold">Filtered By Theme:</span>
                                    <h4 className="text-sm font-black text-white">{activeTheme.name}</h4>
                                </div>
                                <p className="text-xs text-neutral-400 mt-0.5">{activeTheme.description}</p>
                            </div>
                        </div>
                        <button
                            onClick={handleClearFilter}
                            className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded bg-neutral-800/80 cursor-pointer"
                        >
                            Reset to All Entries
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Associated Lore Entries */}
                        <div className="space-y-2">
                            <h5 className="text-xs font-black uppercase text-neutral-400 tracking-wider font-mono flex items-center justify-between">
                                <span>📜 Linked Lore Bible Entries</span>
                                <span className="text-blue-400">{activeLoreEntries.length} found</span>
                            </h5>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {activeLoreEntries.length === 0 ? (
                                    <p className="text-xs text-neutral-500 italic p-2">No lore entries tagged to this theme yet.</p>
                                ) : (
                                    activeLoreEntries.map(l => (
                                        <div key={l.id} className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg">
                                            <h6 className="text-xs font-bold text-white truncate">{l.title}</h6>
                                            <p className="text-[11px] text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                                                {l.content}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Associated Characters */}
                        <div className="space-y-2">
                            <h5 className="text-xs font-black uppercase text-neutral-400 tracking-wider font-mono flex items-center justify-between">
                                <span>👤 Linked Characters</span>
                                <span className="text-purple-400">{activeCharacters.length} found</span>
                            </h5>
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {activeCharacters.length === 0 ? (
                                    <p className="text-xs text-neutral-500 italic p-2">No characters tagged to this theme yet.</p>
                                ) : (
                                    activeCharacters.map(c => (
                                        <div key={c.id} className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center gap-3">
                                            {c.avatar ? (
                                                <img
                                                    src={c.avatar.startsWith('data:') ? c.avatar : 'data:image/jpeg;base64,' + c.avatar}
                                                    alt={c.name}
                                                    className="w-8 h-8 rounded-full object-cover border border-purple-500/40 flex-shrink-0"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400 flex-shrink-0">
                                                    {c.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h6 className="text-xs font-bold text-white truncate">{c.name}</h6>
                                                    {c.archetype && (
                                                        <span className="text-[9px] font-mono text-neutral-500 truncate">
                                                            ({c.archetype})
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-neutral-400 truncate mt-0.5">
                                                    {c.description}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
