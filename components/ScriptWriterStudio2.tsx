import React, { useState } from 'react';
import { ActiveView, PromptTemplate, DynamicPromptList, Character, LoreEntry, ScriptFile } from '../types.ts';
import { EditIcon, ScriptIcon } from './icons.tsx';
import { normalizeToFountain } from '../utils/textFormatting.ts';

interface ScriptWriterStudio2Props {
    onSendToScriptsBin?: (script: Omit<ScriptFile, 'id' | 'date'>) => void;
    onNavigate?: (view: ActiveView) => void;
    promptTemplates?: PromptTemplate[];
    dynamicPromptLists?: DynamicPromptList[];
    characters?: Character[];
    lore?: LoreEntry[];
}

export const ScriptWriterStudio2: React.FC<ScriptWriterStudio2Props> = ({
    onSendToScriptsBin,
    onNavigate,
    promptTemplates = [],
    dynamicPromptLists = [],
    characters = [],
    lore = []
}) => {
    const [title, setTitle] = useState('UNTITLED SCREENPLAY 2');
    const [genre, setGenre] = useState('Sci-Fi / Neo-Noir');
    const [draftContent, setDraftContent] = useState(
        'EXT. NEO-TOKYO CITADEL - NIGHT\n\nRain hammers against obsidian monolithic towers. Neon kanji reflects across the wet asphalt.\n\nELENA (30s, cybernetics engineer) wipes water from her neural optical visor.\n\nELENA\nThe signal originated from the lower bedrock. We are running out of time.'
    );

    return (
        <div className="flex flex-col h-full w-full bg-neutral-950 text-white font-sans overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 bg-neutral-900 border-b border-neutral-800 px-8 py-5 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                            <span className="text-amber-500">✍️</span> Scriptwriter 2
                        </h2>
                        <span className="text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                            Studio v2.0
                        </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                        Next-generation screenplay drafting room and narrative synthesizer. Ready for code integration.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (onSendToScriptsBin && draftContent.trim()) {
                                onSendToScriptsBin({
                                    title: title.trim() || 'Untitled Script 2',
                                    content: normalizeToFountain(draftContent),
                                    type: 'screenplay'
                                });
                                alert('Script sent to Scripts Bin!');
                            }
                        }}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg transition-colors shadow cursor-pointer"
                    >
                        Save to Scripts Bin
                    </button>
                    {onNavigate && (
                        <button
                            onClick={() => onNavigate('scripts-bin')}
                            className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                            Open Scripts Bin
                        </button>
                    )}
                </div>
            </div>

            {/* Studio Workspace Canvas */}
            <div className="flex-grow p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-mono font-bold uppercase text-neutral-400 block mb-1.5">
                                Screenplay Title
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-black/60 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-amber-500/80 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-mono font-bold uppercase text-neutral-400 block mb-1.5">
                                Cinematic Genre & Tone
                            </label>
                            <input
                                type="text"
                                value={genre}
                                onChange={(e) => setGenre(e.target.value)}
                                className="w-full bg-black/60 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-neutral-200 focus:outline-none focus:border-amber-500/80 transition-colors"
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1.5">
                            <label className="text-[10px] font-mono font-bold uppercase text-neutral-400">
                                Standard Screenplay Manuscript Editor
                            </label>
                            <span className="text-[9px] font-mono text-neutral-500">
                                Courier / Final Draft layout
                            </span>
                        </div>
                        <textarea
                            value={draftContent}
                            onChange={(e) => setDraftContent(e.target.value)}
                            rows={16}
                            className="w-full bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-amber-500/80 resize-y leading-relaxed"
                            placeholder="Begin writing screenplay or paste scene manuscript..."
                        />
                    </div>

                    {/* Studio Information Card */}
                    <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">🎬</span>
                            <div>
                                <h4 className="text-xs font-bold text-amber-200">Scriptwriter 2 Provisioned</h4>
                                <p className="text-[11px] text-neutral-400">
                                    Project context loaded ({characters.length} characters, {lore.length} lore entries, {promptTemplates.length} templates).
                                </p>
                            </div>
                        </div>
                        <span className="text-[10px] font-mono text-amber-400/80 uppercase font-bold">
                            Ready for Custom Code
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
