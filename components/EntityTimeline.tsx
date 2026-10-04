import React, { useState, useMemo } from 'react';
import { LoreEntry, TripletEdge, CustomMilestone, SavedTranscript } from '../types';

interface EntityTimelineProps {
    characters: any[];
    lore: LoreEntry[];
    tripletEdges?: TripletEdge[];
    customMilestones?: CustomMilestone[];
    transcripts?: SavedTranscript[];
    onAddMilestoneToLore?: (title: string, content: string) => void;
}

interface TimelineEvent {
    id: string;
    title: string;
    chronologyEra: string;
    source: string;
    excerpt: string;
    linkedEntities: string[];
    relations: string[];
    dramaticImpact: 'critical' | 'major' | 'subtle';
    timestamp?: number;
    audioTimestamp?: string;
    audioQuote?: string;
    historicalSignificance?: string;
    isVoiceAnnotation?: boolean;
}

export const EntityTimeline: React.FC<EntityTimelineProps> = ({
    characters = [],
    lore = [],
    tripletEdges = [],
    customMilestones = [],
    transcripts = [],
    onAddMilestoneToLore
}) => {
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>(
        characters[0]?.id || ''
    );
    const [filterQuery, setFilterQuery] = useState('');
    const [timelineFilter, setTimelineFilter] = useState<'all' | 'voice_only' | 'lore_only'>('all');
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEra, setNewEra] = useState('Act I');
    const [newTitle, setNewTitle] = useState('');
    const [newExcerpt, setNewExcerpt] = useState('');

    const activeCharacter = characters.find(c => c.id === selectedCharacterId) || characters[0];

    // Compute chronological events by character mention across lore and triplet edges
    const timelineEvents = useMemo(() => {
        if (!activeCharacter) return [];
        const charName = activeCharacter.name.trim().toLowerCase();
        const events: TimelineEvent[] = [];

        // 1. Gather from Lore Entries mentioning character
        lore.forEach(entry => {
            const contentLower = entry.content.toLowerCase();
            const titleLower = entry.title.toLowerCase();

            if (contentLower.includes(charName) || titleLower.includes(charName)) {
                // Determine era marker from text
                let era = 'Chronicle Era';
                if (/prologue|origin|early years|pre-fall/i.test(entry.content)) era = 'Prologue / Origin';
                else if (/act i\b|beginning|inciting/i.test(entry.content)) era = 'Act I: Inciting Incident';
                else if (/act ii\b|midpoint|escalation|conspiracy/i.test(entry.content)) era = 'Act II: Rising Action';
                else if (/act iii\b|climax|resolution|aftermath/i.test(entry.content)) era = 'Act III: Climax';
                else if (/flashback|memory|ancient/i.test(entry.content)) era = 'Historical Flashback';

                // Find other mentioned characters
                const otherMentioned = characters
                    .filter(c => c.id !== activeCharacter.id && (contentLower.includes(c.name.toLowerCase()) || titleLower.includes(c.name.toLowerCase())))
                    .map(c => c.name);

                events.push({
                    id: `lore_ev_${entry.id}`,
                    title: entry.title,
                    chronologyEra: era,
                    source: `Lore Bible: ${entry.title}`,
                    excerpt: entry.content.slice(0, 260) + (entry.content.length > 260 ? '...' : ''),
                    linkedEntities: otherMentioned,
                    relations: ['CHRONICLED_IN'],
                    dramaticImpact: /betrayal|death|breach|relic|war/i.test(entry.content) ? 'critical' : 'major',
                    timestamp: (entry as any).createdAt ? new Date((entry as any).createdAt).getTime() : Date.now()
                });
            }
        });

        // 2. Gather from Triplet Edges involving this character
        tripletEdges.forEach((edge, idx) => {
            const sLower = edge.s.trim().toLowerCase();
            const oLower = edge.o.trim().toLowerCase();

            if (sLower === charName || oLower === charName) {
                const partner = sLower === charName ? edge.o : edge.s;
                const relation = edge.p;

                events.push({
                    id: `triplet_ev_${idx}`,
                    title: `${activeCharacter.name} — ${relation.replace(/_/g, ' ')} — ${partner}`,
                    chronologyEra: 'Relational Graph Node',
                    source: `Relational Triplets`,
                    excerpt: `Neural relationship established: ${edge.s} [${edge.p}] ${edge.o}`,
                    linkedEntities: [partner],
                    relations: [relation],
                    dramaticImpact: /kills|betrays|steals|destroys/i.test(relation) ? 'critical' : 'subtle',
                    timestamp: Date.now() - idx * 60000
                });
            }
        });

        // 3. Gather Voice-Annotated Timestamps from Transcripts
        transcripts.forEach(t => {
            // Process structured voice timeline events
            if (t.voiceTimelineEvents && t.voiceTimelineEvents.length > 0) {
                t.voiceTimelineEvents.forEach(vte => {
                    const matchesChar = !activeCharacter || 
                        (vte.characterName && vte.characterName.toLowerCase().includes(charName)) ||
                        vte.audioQuote.toLowerCase().includes(charName) ||
                        vte.historicalContext.toLowerCase().includes(charName) ||
                        vte.eventTitle.toLowerCase().includes(charName);

                    if (matchesChar) {
                        events.push({
                            id: `vte_ev_${vte.id || Math.random()}`,
                            title: vte.eventTitle,
                            chronologyEra: vte.chronologyEra || 'Historical Flashback',
                            source: `🎙️ Audio Moment in "${t.title}"`,
                            excerpt: vte.historicalContext,
                            linkedEntities: vte.characterName ? [vte.characterName] : [activeCharacter.name],
                            relations: ['SPOKEN_HISTORICAL_RECORD'],
                            dramaticImpact: vte.dramaticImpact || 'major',
                            timestamp: t.timestamp + (vte.timestampSeconds || 0) * 1000,
                            audioTimestamp: vte.audioTimestamp,
                            audioQuote: vte.audioQuote,
                            historicalSignificance: vte.historicalSignificance,
                            isVoiceAnnotation: true
                        });
                    }
                });
            } else if (t.text && t.text.toLowerCase().includes(charName)) {
                // Parse timestamp matches from raw transcript text (e.g. [01:23] line)
                const regex = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*([^\n\r]+)/g;
                let match;
                let count = 0;
                while ((match = regex.exec(t.text)) !== null && count < 5) {
                    const timeStr = match[1];
                    const line = match[2]?.trim() || '';
                    if (line.toLowerCase().includes(charName)) {
                        events.push({
                            id: `vte_raw_${t.id}_${count}`,
                            title: `Spoken Testimony: ${activeCharacter.name}`,
                            chronologyEra: /origin|past|before/i.test(line) ? 'Prologue / Origin' : 'Historical Flashback',
                            source: `🎙️ Voice Transcript: "${t.title}"`,
                            excerpt: line,
                            linkedEntities: [activeCharacter.name],
                            relations: ['AUDIO_MOMENT'],
                            dramaticImpact: /kill|betray|war|death/i.test(line) ? 'critical' : 'major',
                            timestamp: t.timestamp + count * 60000,
                            audioTimestamp: timeStr,
                            audioQuote: line,
                            historicalSignificance: `Voice recording captures narrative disclosure about ${activeCharacter.name}.`,
                            isVoiceAnnotation: true
                        });
                        count++;
                    }
                }
            }
        });

        // 4. Gather Custom Milestones with audio timestamps
        customMilestones.forEach(m => {
            const matchesChar = !activeCharacter ||
                (m.characterName && m.characterName.toLowerCase().includes(charName)) ||
                m.description.toLowerCase().includes(charName) ||
                m.title.toLowerCase().includes(charName);

            if (matchesChar && m.audioTimestamp) {
                events.push({
                    id: `ms_ev_${m.id}`,
                    title: m.historicalEvent || m.title,
                    chronologyEra: m.date || 'Historical Flashback',
                    source: m.transcriptTitle ? `🎙️ Voice Track: "${m.transcriptTitle}"` : `🎙️ Voice Milestone`,
                    excerpt: m.description,
                    linkedEntities: m.characterName ? [m.characterName] : [activeCharacter.name],
                    relations: ['VOICE_ANNOTATION'],
                    dramaticImpact: m.color === 'rose' ? 'critical' : 'major',
                    timestamp: m.timestamp || Date.now(),
                    audioTimestamp: m.audioTimestamp,
                    audioQuote: m.audioQuote,
                    historicalSignificance: m.description,
                    isVoiceAnnotation: true
                });
            }
        });

        // Sort events chronologically (Prologue -> Act I -> Act II -> Act III -> other)
        const eraOrder: Record<string, number> = {
            'Historical Flashback': 1,
            'Prologue / Origin': 2,
            'Act I: Inciting Incident': 3,
            'Act II: Rising Action': 4,
            'Act III: Climax': 5,
            'Relational Graph Node': 6,
            'Chronicle Era': 7
        };

        events.sort((a, b) => (eraOrder[a.chronologyEra] || 99) - (eraOrder[b.chronologyEra] || 99));

        // Filter by search query
        let filtered = events;
        if (filterQuery) {
            const q = filterQuery.toLowerCase();
            filtered = filtered.filter(e =>
                e.title.toLowerCase().includes(q) ||
                e.excerpt.toLowerCase().includes(q) ||
                (e.audioQuote && e.audioQuote.toLowerCase().includes(q)) ||
                e.linkedEntities.some(ent => ent.toLowerCase().includes(q))
            );
        }

        // Filter by category: all / voice_only / lore_only
        if (timelineFilter === 'voice_only') {
            filtered = filtered.filter(e => e.isVoiceAnnotation);
        } else if (timelineFilter === 'lore_only') {
            filtered = filtered.filter(e => !e.isVoiceAnnotation);
        }

        return filtered;
    }, [activeCharacter, lore, tripletEdges, transcripts, customMilestones, filterQuery, timelineFilter]);

    const handleCreateMilestone = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim() || !newExcerpt.trim()) return;

        if (onAddMilestoneToLore && activeCharacter) {
            onAddMilestoneToLore(
                `[${newEra}] ${activeCharacter.name}: ${newTitle}`,
                `${newExcerpt}\n\nCharacter: ${activeCharacter.name}\nTimeline Era: ${newEra}`
            );
        }

        setNewTitle('');
        setNewExcerpt('');
        setShowAddForm(false);
    };

    if (characters.length === 0) {
        return (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-neutral-400 font-sans">
                <span className="text-3xl block mb-2">👤</span>
                <p className="text-sm font-bold text-neutral-200">No Characters Registered</p>
                <p className="text-xs text-neutral-500 mt-1">Create characters in the Characters Studio to activate Entity Timelines.</p>
            </div>
        );
    }

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl font-sans space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-neutral-800 pb-4">
                <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <span>⏳</span> Vertical Entity Timeline Panel
                        <span className="text-[9px] bg-purple-950/80 text-purple-400 border border-purple-900/60 font-mono px-2 py-0.5 rounded-full uppercase">
                            Entity-Relationship Mapped
                        </span>
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
                        Chronological sequence of narrative events and relational interactions filtered by character mention
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-md flex items-center gap-1.5"
                    >
                        <span>{showAddForm ? '✕ Cancel' : '+ Add Event to Arc'}</span>
                    </button>
                </div>
            </div>

            {/* Character Selector Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                <span className="text-[10px] font-bold text-neutral-500 uppercase shrink-0">Focus Character:</span>
                {characters.map(char => {
                    const isSelected = char.id === selectedCharacterId;
                    return (
                        <button
                            key={char.id}
                            onClick={() => setSelectedCharacterId(char.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold tracking-wide flex items-center gap-2 transition-all shrink-0 border ${
                                isSelected
                                    ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
                                    : 'bg-black/40 text-neutral-400 hover:text-white border-neutral-800'
                            }`}
                        >
                            <span className="w-5 h-5 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-[10px] font-mono">
                                {char.name.charAt(0)}
                            </span>
                            <span>{char.name}</span>
                            {char.archetype && (
                                <span className="text-[9px] font-mono opacity-60">({char.archetype})</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Filter by Type & Search bar */}
            <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-neutral-800">
                        <button
                            onClick={() => setTimelineFilter('all')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                timelineFilter === 'all'
                                    ? 'bg-purple-600 text-white shadow'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            All Arc Events
                        </button>
                        <button
                            onClick={() => setTimelineFilter('voice_only')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                timelineFilter === 'voice_only'
                                    ? 'bg-amber-600 text-white shadow'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            <span>🎙️</span> Voice Annotations Only
                        </button>
                        <button
                            onClick={() => setTimelineFilter('lore_only')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                timelineFilter === 'lore_only'
                                    ? 'bg-blue-600 text-white shadow'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                        >
                            <span>📜</span> Lore & Triplets Only
                        </button>
                    </div>

                    <span className="text-[10px] font-mono text-neutral-500">
                        {timelineEvents.length} Events on Timeline
                    </span>
                </div>

                <div className="flex justify-between items-center gap-4 bg-black/30 p-2 rounded-xl border border-neutral-850">
                    <input
                        type="text"
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder={`Filter timeline events for ${activeCharacter?.name || 'character'}...`}
                        className="w-full bg-transparent border-none text-xs text-white placeholder-neutral-500 focus:outline-none px-2"
                    />
                </div>
            </div>

            {/* Add Milestone Form */}
            {showAddForm && (
                <form onSubmit={handleCreateMilestone} className="bg-neutral-950 p-4 rounded-xl border border-neutral-750 space-y-3 animate-fade-in">
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Append Narrative Milestone for {activeCharacter.name}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <select
                            value={newEra}
                            onChange={(e) => setNewEra(e.target.value)}
                            className="bg-neutral-900 border border-neutral-800 text-white text-xs p-2 rounded-lg"
                        >
                            <option value="Prologue / Origin">Prologue / Origin</option>
                            <option value="Act I: Inciting Incident">Act I: Inciting Incident</option>
                            <option value="Act II: Rising Action">Act II: Rising Action</option>
                            <option value="Act III: Climax">Act III: Climax</option>
                            <option value="Historical Flashback">Historical Flashback</option>
                        </select>
                        <input
                            type="text"
                            placeholder="Event Title (e.g. Infiltration of Sector 7)"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            className="sm:col-span-2 bg-neutral-900 border border-neutral-800 text-white text-xs p-2 rounded-lg"
                            required
                        />
                    </div>
                    <textarea
                        placeholder="Detailed narrative description of the event, choices, or actions..."
                        value={newExcerpt}
                        onChange={(e) => setNewExcerpt(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-800 text-white text-xs p-2 rounded-lg h-20"
                        required
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs rounded-lg hover:bg-neutral-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow"
                        >
                            Save to Lore Bible
                        </button>
                    </div>
                </form>
            )}

            {/* Vertical Timeline Track */}
            {timelineEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500 italic bg-black/20 rounded-xl border border-neutral-850">
                    No narrative events or relational edges currently reference <strong>{activeCharacter.name}</strong>. Add lore entries mentioning this character to construct their timeline.
                </div>
            ) : (
                <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-purple-500 before:via-blue-500 before:to-neutral-800">
                    {timelineEvents.map((ev, idx) => (
                        <div key={ev.id} className="relative group">
                            {/* Glowing Timeline Node Dot */}
                            <div className={`absolute -left-6 sm:-left-8 top-1.5 w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                                ev.isVoiceAnnotation
                                    ? 'bg-amber-400 border-white shadow-[0_0_12px_#f59e0b] ring-2 ring-amber-500/50'
                                    : ev.dramaticImpact === 'critical'
                                        ? 'bg-rose-500 border-white shadow-[0_0_10px_#f43f5e]'
                                        : ev.dramaticImpact === 'major'
                                            ? 'bg-purple-500 border-purple-200 shadow-[0_0_8px_#a855f7]'
                                            : 'bg-neutral-700 border-neutral-400'
                            }`} />

                            {/* Event Card */}
                            <div className={`p-4 rounded-xl transition-all shadow-md space-y-2 border ${
                                ev.isVoiceAnnotation
                                    ? 'bg-gradient-to-br from-amber-950/20 via-purple-950/20 to-black/60 border-amber-500/40 hover:border-amber-400/80 shadow-amber-900/10'
                                    : 'bg-black/40 border-neutral-850 hover:border-neutral-700'
                            }`}>
                                <div className="flex flex-wrap justify-between items-center gap-2">
                                    <div className="flex items-center gap-2">
                                        {ev.isVoiceAnnotation && (
                                            <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/50 flex items-center gap-1">
                                                <span>🎙️</span> Audio Moment [{ev.audioTimestamp || 'Voice'}]
                                            </span>
                                        )}
                                        <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-900/40">
                                            {ev.chronologyEra}
                                        </span>
                                    </div>
                                    <span className="text-[9px] font-mono text-neutral-500">
                                        {ev.source}
                                    </span>
                                </div>

                                <h4 className={`text-sm font-bold transition flex items-center gap-2 ${
                                    ev.isVoiceAnnotation ? 'text-amber-200' : 'text-neutral-100 group-hover:text-purple-300'
                                }`}>
                                    {ev.isVoiceAnnotation && <span className="text-amber-400">📜</span>}
                                    <span>{ev.title}</span>
                                </h4>

                                {ev.audioQuote && (
                                    <blockquote className="text-xs text-amber-100/90 italic pl-3 border-l-2 border-amber-500/70 bg-black/40 py-1.5 rounded-r">
                                        "{ev.audioQuote}"
                                    </blockquote>
                                )}

                                <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                                    {ev.excerpt}
                                </p>

                                {ev.historicalSignificance && (
                                    <p className="text-[10px] text-neutral-400 bg-neutral-900/60 p-2 rounded border border-neutral-800">
                                        <strong className="text-amber-400/90 uppercase font-mono">Historical Event Anchor:</strong> {ev.historicalSignificance}
                                    </p>
                                )}

                                {/* Action bar & linked entities */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-850">
                                    {ev.linkedEntities.length > 0 ? (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-[9px] font-mono text-neutral-500 uppercase">Co-occurring:</span>
                                            {ev.linkedEntities.map((ent, i) => (
                                                <span
                                                    key={i}
                                                    className="text-[9px] font-mono bg-neutral-800/80 text-neutral-300 px-2 py-0.5 rounded border border-neutral-750"
                                                >
                                                    {ent}
                                                </span>
                                            ))}
                                        </div>
                                    ) : <div />}

                                    {ev.isVoiceAnnotation && onAddMilestoneToLore && (
                                        <button
                                            onClick={() => {
                                                onAddMilestoneToLore(
                                                    `[Voice Note ${ev.audioTimestamp}] ${ev.title}`,
                                                    `${ev.excerpt}\n\nSpoken Audio Quote [${ev.audioTimestamp}]: "${ev.audioQuote}"\nHistorical Significance: ${ev.historicalSignificance || ''}`
                                                );
                                                alert(`Saved voice-annotated event "${ev.title}" to Lore Bible!`);
                                            }}
                                            className="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-700/60 text-amber-300 text-[9px] font-black uppercase rounded transition flex items-center gap-1"
                                            title="Save this historical moment to the Lore Bible"
                                        >
                                            <span>💾</span> Save to Lore Bible
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
