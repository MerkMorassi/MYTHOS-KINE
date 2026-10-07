import React, { useState } from 'react';
import { VoiceCommandLogEntry, ActiveView } from '../types.ts';
import { SpeakerIcon } from './icons.tsx';

interface VoiceCommandLogPanelProps {
    voiceCommands: VoiceCommandLogEntry[];
    voiceAssistantActive?: boolean;
    onToggleVoiceAssistant?: () => void;
    onNavigate?: (view: ActiveView) => void;
    onSimulateCommand?: (transcript: string) => void;
    onClearLogs?: () => void;
    embedded?: boolean; // Whether embedded inside VoiceLab or full-page view
}

export const VoiceCommandLogPanel: React.FC<VoiceCommandLogPanelProps> = ({
    voiceCommands = [],
    voiceAssistantActive = false,
    onToggleVoiceAssistant,
    onNavigate,
    onSimulateCommand,
    onClearLogs,
    embedded = false
}) => {
    const [filterStatus, setFilterStatus] = useState<'all' | 'executed' | 'unrecognized'>('all');
    const [testInput, setTestInput] = useState<string>('');
    const [copiedToast, setCopiedToast] = useState<boolean>(false);

    // Keep precisely last 10 commands
    const last10Commands = voiceCommands.slice(0, 10);

    const filtered = last10Commands.filter(cmd => {
        if (filterStatus === 'executed') return cmd.status === 'executed';
        if (filterStatus === 'unrecognized') return cmd.status === 'unrecognized';
        return true;
    });

    const executedCount = last10Commands.filter(c => c.status === 'executed').length;
    const unrecognizedCount = last10Commands.filter(c => c.status === 'unrecognized').length;
    const successRate = last10Commands.length > 0 
        ? Math.round((executedCount / last10Commands.length) * 100) 
        : 100;

    const handleRunTest = (text?: string) => {
        const query = (text || testInput).trim();
        if (!query || !onSimulateCommand) return;
        onSimulateCommand(query);
        setTestInput('');
    };

    const handleExportJson = () => {
        const jsonStr = JSON.stringify(last10Commands, null, 2);
        navigator.clipboard.writeText(jsonStr);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 3000);
    };

    const formatTimestamp = (ts: number) => {
        const date = new Date(ts);
        const diffMs = Date.now() - ts;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className={`flex flex-col w-full text-neutral-100 ${embedded ? 'p-0 space-y-5' : 'p-6 lg:p-8 space-y-6 h-full overflow-y-auto bg-[#0a0a0d]'}`}>
            {/* Header / Command Center */}
            <div className="bg-neutral-900/90 border border-neutral-800 p-5 lg:p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
                            <SpeakerIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                                <span>Voice Command Log</span>
                                <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono px-2 py-0.5 rounded-full">
                                    Last 10 Transcriptions
                                </span>
                            </h2>
                            <p className="text-neutral-400 text-xs">
                                Live chronological audit trail of transcribed spoken voice directives and execution status.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Live Hands-Free Mic Status / Toggle */}
                    {onToggleVoiceAssistant && (
                        <button
                            onClick={onToggleVoiceAssistant}
                            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 ${
                                voiceAssistantActive
                                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/40'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/40'
                            }`}
                        >
                            <span className={`w-2.5 h-2.5 rounded-full ${voiceAssistantActive ? 'bg-white animate-ping' : 'bg-indigo-300'}`} />
                            <span>{voiceAssistantActive ? 'Mic Active: Stop Listening' : 'Activate Voice Commands'}</span>
                        </button>
                    )}

                    {onClearLogs && (
                        <button
                            onClick={onClearLogs}
                            className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer border border-neutral-700/80"
                            title="Reset log history to default sample"
                        >
                            ↺ Reset Log
                        </button>
                    )}

                    <button
                        onClick={handleExportJson}
                        className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer border border-neutral-700/80"
                        title="Copy Last 10 Commands as JSON"
                    >
                        {copiedToast ? '✓ Copied JSON' : '📋 Copy JSON'}
                    </button>
                </div>
            </div>

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-neutral-900/70 border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Total Tracked</div>
                        <div className="text-2xl font-black text-white mt-0.5">{last10Commands.length} / 10</div>
                        <div className="text-[10px] text-neutral-500">Buffer limit</div>
                    </div>
                    <span className="text-xl">🎙️</span>
                </div>

                <div className="bg-neutral-900/70 border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Executed Directives</div>
                        <div className="text-2xl font-black text-emerald-400 mt-0.5">{executedCount}</div>
                        <div className="text-[10px] text-emerald-500/80 font-medium">Successfully routed</div>
                    </div>
                    <span className="text-xl">✅</span>
                </div>

                <div className="bg-neutral-900/70 border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Unrecognized</div>
                        <div className="text-2xl font-black text-rose-400 mt-0.5">{unrecognizedCount}</div>
                        <div className="text-[10px] text-rose-500/80 font-medium">No intent match</div>
                    </div>
                    <span className="text-xl">⚠️</span>
                </div>

                <div className="bg-neutral-900/70 border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-neutral-400">Execution Rate</div>
                        <div className="text-2xl font-black text-indigo-400 mt-0.5">{successRate}%</div>
                        <div className="text-[10px] text-indigo-300/80 font-medium">Routing accuracy</div>
                    </div>
                    <span className="text-xl">📈</span>
                </div>
            </div>

            {/* Test & Simulation Input Bar */}
            <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-300 uppercase tracking-wider text-[10px] flex items-center gap-1.5 font-mono">
                        <span>🧪</span> Simulate Voice Input (Hardware Independent)
                    </span>
                    <span className="text-[10px] text-neutral-500">Test voice routing without microphone</span>
                </div>

                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="Type voice command (e.g., 'Take me to Lore Studio', 'Start recording', 'Open Dashboard')..."
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRunTest()}
                        className="flex-grow bg-black/60 border border-neutral-700/80 px-3.5 py-2 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                        onClick={() => handleRunTest()}
                        disabled={!testInput.trim()}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition cursor-pointer disabled:opacity-40"
                    >
                        Execute
                    </button>
                </div>

                {/* Quick Test Chips */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-neutral-500 mr-1">Quick presets:</span>
                    {[
                        'Take me to Lore Studio',
                        'Take me to Dashboard',
                        'Take me to Characters',
                        'Take me to Voice Lab',
                        'Take me to Asset Vault',
                        'Start Recording Session',
                        'Stop Recording Session',
                        'Take me to Scripts Bin'
                    ].map(preset => (
                        <button
                            key={preset}
                            onClick={() => handleRunTest(preset)}
                            className="px-2.5 py-1 bg-neutral-800/80 hover:bg-neutral-700 hover:text-white text-neutral-300 rounded-lg text-[10px] font-medium transition cursor-pointer border border-neutral-700/60"
                        >
                            "{preset}"
                        </button>
                    ))}
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFilterStatus('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            filterStatus === 'all' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                        }`}
                    >
                        All ({last10Commands.length})
                    </button>
                    <button
                        onClick={() => setFilterStatus('executed')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            filterStatus === 'executed' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'text-neutral-400 hover:text-white'
                        }`}
                    >
                        ✓ Executed ({executedCount})
                    </button>
                    <button
                        onClick={() => setFilterStatus('unrecognized')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                            filterStatus === 'unrecognized' ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'text-neutral-400 hover:text-white'
                        }`}
                    >
                        ⚠️ Unrecognized ({unrecognizedCount})
                    </button>
                </div>

                <div className="text-[10px] font-mono text-neutral-500">
                    Showing latest {filtered.length} entries
                </div>
            </div>

            {/* Log List */}
            {filtered.length === 0 ? (
                <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl p-10 text-center space-y-2">
                    <span className="text-3xl">🎙️</span>
                    <h4 className="text-sm font-bold text-neutral-300">No voice commands in this filter</h4>
                    <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                        Speak via hands-free mic or use the simulation field above to execute test voice directives.
                    </p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {filtered.map((cmd, idx) => {
                        const isExecuted = cmd.status === 'executed';
                        const isLatest = idx === 0 && filterStatus === 'all';

                        return (
                            <div
                                key={cmd.id}
                                className={`p-4 rounded-xl border transition-all ${
                                    isLatest
                                        ? 'bg-gradient-to-r from-neutral-900 to-neutral-900/80 border-indigo-700/80 shadow-md ring-1 ring-indigo-500/20'
                                        : 'bg-neutral-900/60 border-neutral-800 hover:border-neutral-700'
                                }`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        {/* Rank / Index Badge */}
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-6 h-6 rounded-lg bg-neutral-800 flex items-center justify-center text-xs font-mono font-black text-neutral-400">
                                                #{idx + 1}
                                            </span>
                                            {isLatest && (
                                                <span className="px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-200 text-[8px] font-black uppercase font-mono tracking-wider animate-pulse">
                                                    LATEST
                                                </span>
                                            )}
                                        </div>

                                        {/* Transcribed text */}
                                        <div>
                                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                                <span>"{cmd.transcript}"</span>
                                            </div>
                                            <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                                                <span className="font-mono text-neutral-500">Action:</span>
                                                <span className={isExecuted ? 'text-indigo-300 font-medium' : 'text-neutral-400 italic'}>
                                                    {cmd.actionDescription || cmd.commandName}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Status badge */}
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider font-mono flex items-center gap-1.5 border ${
                                            isExecuted
                                                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                                                : 'bg-rose-950/80 text-rose-300 border-rose-800/80'
                                        }`}>
                                            <span>{isExecuted ? '✓' : '⚠️'}</span>
                                            <span>{isExecuted ? 'Executed' : 'Unrecognized'}</span>
                                        </span>

                                        {/* Timestamp */}
                                        <span className="text-[10px] font-mono text-neutral-500 min-w-16 text-right" title={new Date(cmd.timestamp).toLocaleString()}>
                                            {formatTimestamp(cmd.timestamp)}
                                        </span>

                                        {/* Re-run button if navigation action exists */}
                                        {cmd.targetView && onNavigate && (
                                            <button
                                                onClick={() => onNavigate(cmd.targetView as ActiveView)}
                                                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition cursor-pointer border border-neutral-700"
                                                title={`Navigate to ${cmd.targetView}`}
                                            >
                                                Go ➜
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
