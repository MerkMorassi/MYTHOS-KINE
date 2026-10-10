import React, { useState, useEffect, useRef } from 'react';
import { ActiveView, ScriptFile } from '../types.ts';
import MythosBreakdown from '../utils/breakdown-standalone.js';
import { normalizeToFountain } from '../utils/textFormatting.ts';
import { BreakdownViewModal } from './BreakdownViewModal.tsx';
import { runScribeAgent } from '../services/geminiService.ts';

interface ScriptWriterStudio2Props {
    onSendToScriptsBin?: (script: Omit<ScriptFile, 'id' | 'date'>) => void;
    onNavigate?: (view: ActiveView) => void;
    promptTemplates?: any[];
    dynamicPromptLists?: any[];
    characters?: any[];
    lore?: any[];
}

// Perchance archetypes, traits, genres, themes, and muse definitions
const ARCHETYPES = [
    "Leader", "Caregiver", "Seducer", "Castaway", "Rebel", "Wildcard", "Professor", "Warrior",
    "Hero", "Mentor", "Innocent", "Explorer", "Creator", "Ruler", "Magician", "Everyman",
    "Lover", "Jester", "Outlaw", "Sage", "Trickster", "Orphan", "Avenger", "Underdog",
    "Anti-Hero", "Villain", "Sidekick", "Mother", "Father", "Child", "Saboteur", "Bully",
    "Weakling", "Monk", "Manipulator", "Actor", "Peacemaker", "Shapeshifter", "Vampire",
    "Psychopath", "Prostitute", "Detective", "Femme Fatale", "Knight", "Pirate", "Double Agent",
    "Healer", "Judge", "Destroyer", "Martyr", "Victim", "Thief", "Maiden", "Crone",
    "Revolutionary", "Wanderer", "Monster", "Storyteller", "Addict", "Messenger", "Miser",
    "Priest", "Prophet", "Scapegoat", "Scientist", "Apprentice", "Witch", "Gambler",
    "Godfather", "Hunter", "Journalist", "Nemesis", "Right Hand", "Shadow", "Skeptic", "Threshold Guardian"
];

const GENRES = [
    "action", "adventure", "comedy", "drama", "romance", "sci-fi",
    "fantasy", "thriller", "horror", "crime", "mystery", "western"
];

const THEMES = [
    "love and relationships", "identity and self-discovery", "coming of age",
    "redemption and forgiveness", "power and corruption", "justice and morality",
    "survival and perseverance", "loss and grief", "freedom and oppression",
    "betrayal and loyalty", "courage and bravery", "tradition and change",
    "prejudice and discrimination", "hope and optimism", "honor and duty",
    "sacrifice and selflessness", "ambition and success", "fear and insecurity",
    "friendship and loyalty", "nature and the environment", "family and home",
    "transformation and growth", "dreams and aspirations", "aging and mortality",
    "guilt and shame", "faith and spirituality", "revenge and justice",
    "war and conflict", "conformity and individuality", "loss of innocence",
    "fear of the unknown", "technology and progress"
];

const CONFLICTS = [
    "self", "a rival", "society", "nature", "technology", "fate", "the supernatural", "time", "the unknown", "evil"
];

const STRUCTURES = [
    "three-act", "freytag pyramid", "hero's journey", "harmon circle", "fichtean curve", "save the cat", "seven-point"
];

const MUSES = [
    { name: "CALLIOPE 'Cali' (1)", domain: "epic poetry; 3-axis YELLOW Bright (741) / GREEN Shadow (147)" },
    { name: "CLIO (2)", domain: "history; 6-axis BLUE Bright (852) / PURPLE Shadow (258)" },
    { name: "ERATO 'Coco' (3)", domain: "love poetry; 9-axis RED Bright (963) / ORANGE Shadow (369)" },
    { name: "EUTERPE (4)", domain: "music; 3-axis YELLOW Bright (741) / GREEN Shadow (147)" },
    { name: "MELPOMENE (5)", domain: "tragedy; 6-axis BLUE Bright (852) / PURPLE Shadow (258)" },
    { name: "POLYHYMNIA 'Poly' (6)", domain: "sacred hymn; 9-axis RED Bright (963) / ORANGE Shadow (369)" },
    { name: "TERPSICHORE (7)", domain: "dance; 3-axis YELLOW Bright (741) / GREEN Shadow (147)" },
    { name: "THALIA (8)", domain: "comedy; 6-axis BLUE Bright (852) / PURPLE Shadow (258)" },
    { name: "URANIA 'Skye' (9)", domain: "astronomy; 9-axis RED Bright (963) / ORANGE Shadow (369)" }
];

const SAMPLE_SCRIPTS: Record<string, string> = {
    terminal: `INT. ABANDONED TERMINAL REALM - NIGHT

A script writer activates the append-only logs layer. Event entries begin to stream into the ledger [prop: quantum terminal].

ORIN
The chronicle is synchronized. We have unbroken continuity.

ILSE (O.S.)
(through speaker)
Confirm the hash before committing the block.`,
    vault: `INT. VAULT - NIGHT
Silence [prop: drill].

ORIN
Open it. [w: grease-stained coveralls]

DUBE
(whispering)
The sensors are still pulsing. [sfx: low hum]`,
    alley: `EXT. RAIN-SLICK ALLEY - DAWN

Steam billows from broken storm drains. Neon glyphs flicker above the asphalt.

CORPORAL DUBE
Hold perimeter. We do not advance until the signal drops.

MERCHANT
Get your fresh water here! [extra: market crowd]`
};

interface CastMember {
    name: string;
    archetype: string;
}

interface ChronicleEntry {
    time: string;
    event: string;
    tag?: string;
}

export const ScriptWriterStudio2: React.FC<ScriptWriterStudio2Props> = ({
    onSendToScriptsBin,
    onNavigate,
    characters = [],
    lore = []
}) => {
    // Editor State (Warner Bros standard screenplay content)
    const [editorText, setEditorText] = useState<string>(
        `INT. ABANDONED TERMINAL REALM - NIGHT\n\nA script writer activates the append-only logs layer. Event entries begin to stream into the ledger.\n\nORIN\nThe chronicle is synchronized. We have unbroken continuity.\n\nILSE (O.S.)\n(through speaker)\nConfirm the hash before committing the block.`
    );
    const editorRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sidebar & Navigation Tab
    const [activeTab, setActiveTab] = useState<'beats' | 'cast' | 'break' | 'log'>('log');
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
    const [syncHost, setSyncHost] = useState<string>('');
    const [chipStatus, setChipStatus] = useState<string>('LOCAL');

    // Snapshots State
    const [snapshots, setSnapshots] = useState<Record<string, string>>({
        "default-draft": `INT. ABANDONED TERMINAL REALM - NIGHT\n\nA script writer activates the append-only logs layer.`
    });
    const [snapshotNameInput, setSnapshotNameInput] = useState<string>('');
    const [selectedSnapshot, setSelectedSnapshot] = useState<string>('');

    // Cast Tab State
    const [castList, setCastList] = useState<CastMember[]>([
        { name: "ORIN", archetype: "Leader" },
        { name: "ILSE", archetype: "Detective" },
        { name: "DUBE", archetype: "Warrior" }
    ]);
    const [newCastName, setNewCastName] = useState<string>('');
    const [newCastArch, setNewCastArch] = useState<string>(ARCHETYPES[0]);

    // Beats Tab State
    const [selectedStructure, setSelectedStructure] = useState<string>("three-act");
    const [beatProgress, setBeatProgress] = useState<number>(33);
    const [beatItems, setBeatItems] = useState<string[]>([
        "Act I: Status Quo & Inciting Incident",
        "Act II: Rising Stakes & Midpoint Reversal",
        "Act III: Climax & Resolute Resolution"
    ]);

    // Chronicle Stream
    const [chronicle, setChronicle] = useState<ChronicleEntry[]>([
        { time: new Date().toLocaleTimeString(), event: "Console initialized in local mode.", tag: "BOOT" },
        { time: new Date().toLocaleTimeString(), event: "breakdown-chip/v1 loaded and verified.", tag: "SYS" }
    ]);

    // Breakdown Modal
    const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    // Status & Metrics
    const [metrics, setMetrics] = useState({ chars: 0, words: 0, lines: 0 });

    useEffect(() => {
        const text = editorText || '';
        const chars = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const lines = text.split('\n').length;
        setMetrics({ chars, words, lines });
    }, [editorText]);

    const logEvent = (event: string, tag: string = "OP") => {
        setChronicle(prev => [
            { time: new Date().toLocaleTimeString(), event, tag },
            ...prev.slice(0, 50)
        ]);
    };

    // Toolbar element insertion helpers
    const insertElement = (prefix: string, defaultText: string = "") => {
        setEditorText(prev => `${prev.trim()}\n\n${prefix}${defaultText}`);
        logEvent(`Appended ${prefix.trim() || 'element'} block`, "EDIT");
    };

    // AI Line Generation
    const handleNativeAiLine = async () => {
        setIsGeneratingAi(true);
        logEvent("Requesting AI line from Gemini...", "AI");
        try {
            const prompt = `Given the following screenplay, generate the NEXT 2-3 lines adhering to Warner Bros format (scene, action, character, parenthetical, or dialogue):\n\n${editorText.slice(-800)}`;
            const response = await runScribeAgent({
                workingTitle: "Screenplay Prompt",
                genre: "Drama",
                cast: castList.map(c => c.name).join(", "),
                beatSheet: editorText.slice(-400)
            });
            if (response) {
                const cleaned = normalizeToFountain(response).trim();
                setEditorText(prev => `${prev}\n\n${cleaned}`);
                logEvent("AI line synthesized and appended to draft.", "AI");
            }
        } catch (e) {
            // Offline fallback
            const fallbackChar = castList[Math.floor(Math.random() * castList.length)]?.name || "ORIN";
            const fallbackLine = `\n\n${fallbackChar}\nWe proceed according to the baseline parameters.`;
            setEditorText(prev => `${prev}${fallbackLine}`);
            logEvent("Offline heuristic line appended.", "LOCAL");
        } finally {
            setIsGeneratingAi(false);
        }
    };

    // Trope Generator
    const handleGenerateTrope = () => {
        const a = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
        const g = GENRES[Math.floor(Math.random() * GENRES.length)];
        const t = THEMES[Math.floor(Math.random() * THEMES.length)];
        const c = CONFLICTS[Math.floor(Math.random() * CONFLICTS.length)];
        const trope = `/* TROPE SEED: ${g.toUpperCase()} ${t} — [${a}] vs [${c}] */`;
        setEditorText(prev => `${prev}\n\n${trope}`);
        logEvent(`Injected trope seed: ${a} vs ${c}`, "SEED");
    };

    // Story Seed Generator
    const handleStorySeed = () => {
        const a = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
        const s = STRUCTURES[Math.floor(Math.random() * STRUCTURES.length)];
        const t = THEMES[Math.floor(Math.random() * THEMES.length)];
        const c = CONFLICTS[Math.floor(Math.random() * CONFLICTS.length)];
        const seedBlock = `/* STRUCTURE SEED: ${s} */\n/* The ${a} seeks ${t} against ${c} */`;
        setEditorText(prev => `${prev}\n\n${seedBlock}`);
        logEvent(`Injected structure seed: ${s}`, "SEED");
    };

    // Profile Generator
    const handleProfile = () => {
        const a = ARCHETYPES[Math.floor(Math.random() * ARCHETYPES.length)];
        const name = "OPERATIVE_" + Math.floor(Math.random() * 900 + 100);
        const profile = `/* DOSSIER: ${name} (${a}) */\n[prop: ${name.toLowerCase()}_badge] [w: standard tactical uniform]`;
        setEditorText(prev => `${prev}\n\n${profile}`);
        setCastList(prev => [...prev, { name, archetype: a }]);
        logEvent(`Generated character profile: ${name} [${a}]`, "CAST");
    };

    // Muse Invocation
    const handleMuse = () => {
        const m = MUSES[Math.floor(Math.random() * MUSES.length)];
        const museText = `/* MUSE INVOCATION: ${m.name} — ${m.domain} */`;
        setEditorText(prev => `${prev}\n\n${museText}`);
        logEvent(`Invoked Muse: ${m.name}`, "MUSE");
    };

    // File Import / Export
    const handleExport = () => {
        const blob = new Blob([editorText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Screenplay_${Date.now()}.fountain`;
        a.click();
        URL.revokeObjectURL(url);
        logEvent("Exported screenplay file to disk.", "EXPORT");
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => {
                const content = ev.target?.result as string;
                if (content) {
                    setEditorText(normalizeToFountain(content));
                    logEvent(`Imported file "${file.name}" into console.`, "IMPORT");
                }
            };
            reader.readAsText(file);
        }
        e.target.value = '';
    };

    const handleSaveSnapshot = () => {
        const name = snapshotNameInput.trim() || `snap_${Date.now()}`;
        setSnapshots(prev => ({ ...prev, [name]: editorText }));
        setSnapshotNameInput('');
        setSelectedSnapshot(name);
        logEvent(`Saved snapshot "${name}".`, "SNAP");
    };

    const handleLoadSnapshot = () => {
        if (selectedSnapshot && snapshots[selectedSnapshot]) {
            setEditorText(snapshots[selectedSnapshot]);
            logEvent(`Loaded snapshot "${selectedSnapshot}".`, "SNAP");
        }
    };

    const handleDeleteSnapshot = () => {
        if (selectedSnapshot) {
            setSnapshots(prev => {
                const next = { ...prev };
                delete next[selectedSnapshot];
                return next;
            });
            logEvent(`Deleted snapshot "${selectedSnapshot}".`, "SNAP");
            setSelectedSnapshot('');
        }
    };

    const handleSaveToBin = () => {
        if (onSendToScriptsBin) {
            onSendToScriptsBin({
                title: "Mythos Screenplay Console Draft",
                content: normalizeToFountain(editorText),
                type: 'screenplay'
            });
            logEvent("Screenplay draft synchronized to project Scripts Bin.", "BIN");
        }
    };

    // Breakdown computations
    const breakdownData = MythosBreakdown.breakdown(
        MythosBreakdown.parasFromFountain(editorText)
    );

    return (
        <div className={`mythos-console-wrapper flex flex-col h-full w-full ${themeMode === 'dark' ? 'bg-[#111113] text-[#e0e0e0]' : 'bg-[#f4f4f6] text-[#222]'} font-mono select-none overflow-hidden text-xs`}>
            {/* ROW 1: MYTHOS TOOLBAR */}
            <div className="mythos-toolbar flex flex-wrap items-center gap-1.5 px-3 py-2 bg-[#18181b] border-b border-[#27272a] shadow-sm z-20">
                <button type="button" onClick={() => insertElement('INT. ')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">SCENE</button>
                <button type="button" onClick={() => insertElement('')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">ACTION</button>
                <button type="button" onClick={() => insertElement('ORIN\n')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">CHAR</button>
                <button type="button" onClick={() => insertElement('')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">DIAL</button>
                <button type="button" onClick={() => insertElement('(whispering)\n')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">PAREN</button>
                <button type="button" onClick={() => insertElement('CUT TO:\n')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">TRANS</button>
                
                <div className="h-4 w-px bg-[#3f3f46] mx-1"></div>

                <button type="button" onClick={handleNativeAiLine} disabled={isGeneratingAi} className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded text-[11px] uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50">
                    {isGeneratingAi ? 'GENERATING...' : 'AI LINE'}
                </button>
                <button type="button" onClick={handleGenerateTrope} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">TROPES</button>
                <button type="button" onClick={handleStorySeed} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">SEED</button>
                <button type="button" onClick={handleProfile} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">PROFILE</button>
                <button type="button" onClick={handleMuse} className="px-2.5 py-1 bg-purple-900/70 hover:bg-purple-800 text-purple-200 font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">MUSE</button>

                <div className="h-4 w-px bg-[#3f3f46] mx-1"></div>

                <button type="button" onClick={handleSaveToBin} className="px-2.5 py-1 bg-blue-800 hover:bg-blue-700 text-white font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">SAVE</button>
                <button type="button" onClick={handleExport} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">EXPORT</button>
                <button type="button" onClick={() => window.print()} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">PRINT</button>
                <button type="button" onClick={() => { if (confirm("Clear screenplay canvas?")) { setEditorText(""); logEvent("Screenplay purged.", "CLEAR"); } }} className="px-2.5 py-1 bg-red-950/70 hover:bg-red-900 text-red-300 font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">PURGE</button>
                <button type="button" onClick={() => setIsBreakdownOpen(true)} className="px-2.5 py-1 bg-amber-900/70 hover:bg-amber-800 text-amber-200 font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">AUDIT</button>
                <button type="button" onClick={() => setThemeMode(prev => prev === 'dark' ? 'light' : 'dark')} className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] font-bold rounded text-[11px] uppercase tracking-wider transition-colors cursor-pointer">
                    {themeMode === 'dark' ? 'LIGHT' : 'DARK'}
                </button>

                <div className="ml-auto flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {chipStatus}
                    </span>
                </div>
            </div>

            {/* ROW 2: SYNC ROW */}
            <div className="mythos-syncrow flex items-center gap-2 px-3 py-1.5 bg-[#141416] border-b border-[#222226]">
                <input
                    type="text"
                    value={syncHost}
                    onChange={e => setSyncHost(e.target.value)}
                    placeholder="sync host (empty = local only)"
                    className="flex-grow max-w-sm bg-[#1c1c20] border border-[#2e2e34] px-2.5 py-1 rounded text-neutral-300 font-mono text-[11px] focus:outline-none focus:border-neutral-500"
                />
                <button
                    type="button"
                    onClick={() => {
                        setChipStatus(syncHost.trim() ? "CONNECTED" : "LOCAL");
                        logEvent(syncHost.trim() ? `Synchronized to host: ${syncHost}` : "Reverted to local memory storage.", "SYNC");
                    }}
                    className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-neutral-200 font-bold rounded text-[10px] uppercase cursor-pointer"
                >
                    SET
                </button>
            </div>

            {/* ROW 3: SAMPLES & SNAPSHOTS LIB ROW */}
            <div className="mythos-librow flex flex-wrap items-center gap-2 px-3 py-1.5 bg-[#18181b] border-b border-[#27272a]">
                <select
                    onChange={(e) => {
                        const val = e.target.value;
                        if (val && SAMPLE_SCRIPTS[val]) {
                            setEditorText(SAMPLE_SCRIPTS[val]);
                            logEvent(`Loaded sample screenplay "${val}".`, "SAMPLE");
                        }
                    }}
                    className="bg-[#222226] border border-[#33333a] text-neutral-300 text-[11px] px-2 py-1 rounded font-mono focus:outline-none"
                >
                    <option value="">sample...</option>
                    <option value="terminal">Abandoned Terminal (Default)</option>
                    <option value="vault">The Vault (Breakdown Test)</option>
                    <option value="alley">Neon Alley (Full Tags)</option>
                </select>

                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-neutral-200 font-bold rounded text-[10px] uppercase cursor-pointer"
                >
                    IMPORT
                </button>
                <input ref={fileInputRef} type="file" accept=".fountain,.txt,.html,.md" onChange={handleImportFile} hidden />

                <div className="h-3 w-px bg-[#3f3f46] mx-1"></div>

                <input
                    type="text"
                    value={snapshotNameInput}
                    onChange={e => setSnapshotNameInput(e.target.value)}
                    placeholder="snapshot name"
                    className="bg-[#1c1c20] border border-[#2e2e34] px-2 py-1 rounded text-neutral-300 text-[11px] font-mono focus:outline-none w-36"
                />
                <button
                    type="button"
                    onClick={handleSaveSnapshot}
                    className="px-2 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-neutral-200 font-bold rounded text-[10px] uppercase cursor-pointer"
                >
                    SNAP
                </button>
                <select
                    value={selectedSnapshot}
                    onChange={e => setSelectedSnapshot(e.target.value)}
                    className="bg-[#222226] border border-[#33333a] text-neutral-300 text-[11px] px-2 py-1 rounded font-mono focus:outline-none"
                >
                    <option value="">snapshot...</option>
                    {Object.keys(snapshots).map(k => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={handleLoadSnapshot}
                    className="px-2 py-1 bg-[#27272a] hover:bg-[#3f3f46] text-neutral-200 font-bold rounded text-[10px] uppercase cursor-pointer"
                >
                    LOAD
                </button>
                <button
                    type="button"
                    onClick={handleDeleteSnapshot}
                    className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 font-bold rounded text-[10px] uppercase cursor-pointer"
                >
                    DEL
                </button>
            </div>

            {/* ROW 4: MAIN COLUMNS (SCRIPT EDITABLE PAGE + SCRIPT SIDEBAR) */}
            <div className="mythos-cols flex flex-grow overflow-hidden relative">
                {/* Screenplay Page Column */}
                <div className={`mythos-page flex-1 overflow-y-auto p-4 md:p-8 flex justify-center ${themeMode === 'dark' ? 'bg-[#0b0b0d]' : 'bg-[#e5e5e8]'}`}>
                    <div className="w-full max-w-[850px] shadow-2xl rounded-sm">
                        <textarea
                            ref={editorRef as any}
                            value={editorText}
                            onChange={(e) => setEditorText(e.target.value)}
                            spellCheck={false}
                            className={`w-full min-h-[750px] p-8 md:p-12 font-mono text-sm leading-relaxed border focus:outline-none resize-none transition-colors ${
                                themeMode === 'dark' 
                                    ? 'bg-[#18181b] text-[#f4f4f5] border-[#27272a] focus:border-[#52525b]' 
                                    : 'bg-white text-black border-[#d4d4d8] focus:border-[#a1a1aa]'
                            }`}
                            style={{ fontFamily: 'Courier, "Courier New", monospace' }}
                            placeholder="INT. SCENE HEADER - TIME..."
                        />
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="mythos-side w-80 md:w-96 flex-shrink-0 flex flex-col bg-[#141416] border-l border-[#27272a] overflow-hidden">
                    {/* Sidetabs Navigation */}
                    <div className="mythos-sidetabs flex items-center bg-[#1c1c20] border-b border-[#27272a]">
                        <button
                            type="button"
                            onClick={() => setActiveTab('beats')}
                            className={`flex-1 py-2 font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer ${
                                activeTab === 'beats' ? 'bg-[#141416] text-white border-b-2 border-emerald-500' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            BEATS
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('cast')}
                            className={`flex-1 py-2 font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer ${
                                activeTab === 'cast' ? 'bg-[#141416] text-white border-b-2 border-emerald-500' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            CAST
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('break')}
                            className={`flex-1 py-2 font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer ${
                                activeTab === 'break' ? 'bg-[#141416] text-white border-b-2 border-emerald-500' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            BREAK
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('log')}
                            className={`flex-1 py-2 font-bold text-[11px] uppercase tracking-wider transition-colors cursor-pointer ${
                                activeTab === 'log' ? 'bg-[#141416] text-white border-b-2 border-emerald-500' : 'text-neutral-500 hover:text-neutral-300'
                            }`}
                        >
                            LOG
                        </button>
                    </div>

                    {/* Sidetab Pane: BEATS */}
                    {activeTab === 'beats' && (
                        <div className="p-4 flex flex-col gap-4 flex-grow overflow-y-auto">
                            <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-500 block mb-1">Dramatic Framework</label>
                                <select
                                    value={selectedStructure}
                                    onChange={(e) => setSelectedStructure(e.target.value)}
                                    className="w-full bg-[#1c1c20] border border-[#2e2e34] text-neutral-200 text-xs p-2 rounded font-mono focus:outline-none"
                                >
                                    {STRUCTURES.map(st => (
                                        <option key={st} value={st}>{st.toUpperCase()}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <div className="flex justify-between text-[10px] text-neutral-400 mb-1 font-bold">
                                    <span>PROGRESSION</span>
                                    <span>{beatProgress}%</span>
                                </div>
                                <div className="w-full h-1.5 bg-[#27272a] rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${beatProgress}%` }}></div>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {beatItems.map((b, idx) => (
                                    <div key={idx} className="p-2.5 bg-[#1c1c20] border border-[#27272a] rounded text-[11px] text-neutral-300 flex items-start gap-2">
                                        <span className="text-emerald-400 font-bold">#{idx + 1}</span>
                                        <span>{b}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setBeatItems(prev => [...prev, `Beat ${prev.length + 1}: Escalation & Consequence`]);
                                    setBeatProgress(Math.min(100, beatProgress + 20));
                                    logEvent("Added structural beat marker.", "BEAT");
                                }}
                                className="w-full py-2 bg-[#27272a] hover:bg-[#3f3f46] text-neutral-200 text-[10px] font-bold uppercase rounded cursor-pointer mt-auto"
                            >
                                + APPEND BEAT
                            </button>
                        </div>
                    )}

                    {/* Sidetab Pane: CAST */}
                    {activeTab === 'cast' && (
                        <div className="p-4 flex flex-col gap-3 flex-grow overflow-y-auto">
                            <div className="space-y-2 flex-grow overflow-y-auto">
                                {castList.map((c, i) => (
                                    <div key={i} className="p-2.5 bg-[#1c1c20] border border-[#27272a] rounded flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-white text-[12px]">{c.name}</div>
                                            <div className="text-[10px] text-emerald-400 font-mono">{c.archetype}</div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCastList(prev => prev.filter((_, idx) => idx !== i));
                                                logEvent(`Removed character "${c.name}" from roster.`, "CAST");
                                            }}
                                            className="text-neutral-500 hover:text-red-400 text-xs px-1"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="pt-3 border-t border-[#27272a] space-y-2">
                                <input
                                    type="text"
                                    value={newCastName}
                                    onChange={e => setNewCastName(e.target.value)}
                                    placeholder="character name"
                                    className="w-full bg-[#1c1c20] border border-[#2e2e34] px-2.5 py-1.5 rounded text-neutral-200 font-mono text-xs focus:outline-none"
                                />
                                <select
                                    value={newCastArch}
                                    onChange={e => setNewCastArch(e.target.value)}
                                    className="w-full bg-[#1c1c20] border border-[#2e2e34] text-neutral-200 text-xs p-1.5 rounded font-mono focus:outline-none"
                                >
                                    {ARCHETYPES.map(a => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (newCastName.trim()) {
                                            setCastList(prev => [...prev, { name: newCastName.trim().toUpperCase(), archetype: newCastArch }]);
                                            setNewCastName('');
                                            logEvent(`Registered character ${newCastName.trim().toUpperCase()} [${newCastArch}]`, "CAST");
                                        }
                                    }}
                                    className="w-full py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded text-xs uppercase cursor-pointer"
                                >
                                    ADD CHARACTER
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Sidetab Pane: BREAKDOWN */}
                    {activeTab === 'break' && (
                        <div className="p-4 flex flex-col gap-3 flex-grow overflow-y-auto">
                            <div className="bg-[#1c1c20] p-3 rounded border border-[#27272a] grid grid-cols-2 gap-2 text-[11px] font-mono">
                                <div><span className="text-neutral-500">SCENES:</span> <strong>{breakdownData.totals.scenes}</strong></div>
                                <div><span className="text-neutral-500">SETS:</span> <strong>{breakdownData.totals.sets}</strong></div>
                                <div><span className="text-neutral-500">SPEAKERS:</span> <strong>{breakdownData.totals.cast}</strong></div>
                                <div><span className="text-neutral-500">EST PGS:</span> <strong>~{breakdownData.totals.estPages}</strong></div>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => logEvent("Refreshed breakdown telemetry.", "BREAK")}
                                    className="py-1.5 bg-[#27272a] hover:bg-[#3f3f46] text-neutral-200 text-[10px] font-bold uppercase rounded cursor-pointer"
                                >
                                    REFRESH
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsBreakdownOpen(true)}
                                    className="py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold uppercase rounded cursor-pointer"
                                >
                                    OPEN VIEW
                                </button>
                            </div>

                            <div className="space-y-2 flex-grow overflow-y-auto">
                                {breakdownData.scenes.map(sc => (
                                    <div key={sc.n} className="p-2.5 bg-[#1c1c20] border border-[#27272a] rounded text-[11px] font-mono">
                                        <div className="flex justify-between font-bold text-white mb-1">
                                            <span>#{sc.n} {sc.header}</span>
                                            <span className="text-amber-400">~{sc.estPages}p</span>
                                        </div>
                                        <div className="text-[10px] text-neutral-400">
                                            Cast: {sc.cast.join(', ') || '—'}
                                        </div>
                                        {sc.props.length > 0 && (
                                            <div className="text-[9px] text-sky-400 mt-1">
                                                Props: {sc.props.join(', ')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sidetab Pane: CHRONICLE LOG */}
                    {activeTab === 'log' && (
                        <div className="flex flex-col flex-grow overflow-hidden">
                            <div className="px-4 py-2 bg-[#18181b] border-b border-[#27272a] text-[10px] font-bold tracking-widest text-neutral-500 uppercase">
                                WORKSPACE CHRONICLE
                            </div>
                            <div className="flex-grow overflow-y-auto p-4 space-y-2 font-mono text-[11px]">
                                {chronicle.map((log, idx) => (
                                    <div key={idx} className="border-b border-[#1f1f23] pb-1.5">
                                        <div className="flex items-center gap-1.5 text-[9px] text-neutral-500">
                                            <span className="text-neutral-400">{log.time}</span>
                                            <span className="px-1 rounded bg-[#27272a] text-emerald-400 font-bold">{log.tag}</span>
                                        </div>
                                        <div className="text-neutral-300 mt-0.5">{log.event}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ROW 5: FOOTER STATUS & METRICS */}
            <div className="mythos-foot flex items-center justify-between px-4 py-2 bg-[#141416] border-t border-[#27272a] text-[11px] font-mono text-neutral-400">
                <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Status: check</span>
                </span>
                <span className="flex items-center gap-4">
                    <span>{metrics.lines} lines</span>
                    <span>{metrics.words} words</span>
                    <span>{metrics.chars} chars</span>
                </span>
            </div>

            {/* AUDIT / BREAKDOWN FULL MODAL */}
            {isBreakdownOpen && (
                <BreakdownViewModal
                    script={{
                        id: 'mythos_active_draft',
                        title: 'Mythos Screenplay Console Manuscript',
                        content: normalizeToFountain(editorText),
                        date: new Date().toLocaleDateString(),
                        type: 'screenplay'
                    }}
                    onClose={() => setIsBreakdownOpen(false)}
                />
            )}
        </div>
    );
};
