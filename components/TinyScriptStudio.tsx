import React, { useState } from 'react';
import { ActiveView, ScriptFile } from '../types.ts';

interface TinyScriptStudioProps {
    onSendToScriptsBin?: (script: Omit<ScriptFile, 'id' | 'date'>) => void;
    onNavigate?: (view: ActiveView) => void;
}

export const TinyScriptStudio: React.FC<TinyScriptStudioProps> = ({
    onSendToScriptsBin,
    onNavigate
}) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    return (
        <div className="flex flex-col h-full w-full bg-neutral-950 text-white font-sans overflow-hidden">
            {/* Studio Header */}
            <div className="flex-shrink-0 bg-neutral-900 border-b border-neutral-800 px-8 py-5 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                            <span>📄</span> Tiny Script
                        </h2>
                        <span className="text-[10px] font-mono uppercase bg-neutral-800 text-neutral-300 border border-neutral-700 px-2 py-0.5 rounded-full font-bold">
                            Studio
                        </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">
                        Minimalist, distraction-free scene script drafting workspace.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (onSendToScriptsBin && content.trim()) {
                                onSendToScriptsBin({
                                    title: title.trim() || 'Tiny Script Draft',
                                    content: content.trim(),
                                    type: 'script'
                                });
                                alert('Script saved to Scripts Bin!');
                            }
                        }}
                        disabled={!content.trim()}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors shadow cursor-pointer"
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

            {/* Blank Canvas Workspace */}
            <div className="flex-grow p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-6">
                    <div>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Title..."
                            className="w-full bg-black/60 border border-neutral-800 rounded-xl px-4 py-2.5 text-base font-bold text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
                        />
                    </div>

                    <div>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={18}
                            placeholder="Start typing your script here..."
                            className="w-full bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 resize-y leading-relaxed"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
