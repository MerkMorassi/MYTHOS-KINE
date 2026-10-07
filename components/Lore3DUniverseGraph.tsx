import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { LoreEntry, Character, ScriptFile, Lore3DGraphWeightsReport, Lore3DConnectionWeightResult } from '../types.ts';
import { calculateLore3DConnectionWeightsWithGemini } from '../services/geminiService.ts';

interface Lore3DUniverseGraphProps {
    lore: LoreEntry[];
    characters: Character[];
    scriptsBin?: any[];
    activeProjectId?: string;
    onSelectLore?: (loreId: string) => void;
}

export type NodeType3D = 'character' | 'lore' | 'script';

export interface Node3D {
    id: string;
    name: string;
    type: NodeType3D;
    category?: string;
    description: string;
    fullContent: string;
    tags: string[];
    // 3D physics coordinates and velocities
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    radius: number;
    // Projected 2D coordinates for rendering and hit-testing
    projX: number;
    projY: number;
    projZ: number;
    projScale: number;
    visible: boolean;
}

export interface ScriptEvidence {
    scriptTitle: string;
    scriptId: string;
    sceneSnippet?: string;
    occurrences: number;
}

export interface Link3D {
    id: string;
    source: string;
    target: string;
    reason: string;
    strength: number;
    isInfluenceLine?: boolean;
    characterId?: string;
    characterName?: string;
    loreId?: string;
    loreTitle?: string;
    scriptEvidence?: ScriptEvidence[];
    totalScriptMentions?: number;
    thematicContext?: string;
    isGeminiWeight?: boolean;
    thematicKeywordOverlap?: string[];
    characterCoOccurrences?: string[];
    narrativeSignificance?: string;
}

interface RelationshipDetail {
    targetNode: Node3D;
    reason: string;
    type: NodeType3D;
    isInfluenceLine?: boolean;
    strength?: number;
    scriptEvidence?: ScriptEvidence[];
    isGeminiWeight?: boolean;
    thematicKeywordOverlap?: string[];
    characterCoOccurrences?: string[];
    narrativeSignificance?: string;
}

const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
};

const TYPE_COLORS: Record<NodeType3D, { primary: string; glow: string; text: string; label: string; hex: string }> = {
    character: {
        primary: '#a855f7', // Purple
        glow: 'rgba(168, 85, 247, 0.45)',
        text: 'text-purple-400',
        label: 'Character',
        hex: '#a855f7'
    },
    lore: {
        primary: '#06b6d4', // Cyan
        glow: 'rgba(6, 182, 212, 0.45)',
        text: 'text-cyan-400',
        label: 'Lore Entry',
        hex: '#06b6d4'
    },
    script: {
        primary: '#f59e0b', // Amber / Gold
        glow: 'rgba(245, 158, 11, 0.45)',
        text: 'text-amber-400',
        label: 'Script / Scene',
        hex: '#f59e0b'
    }
};

export const Lore3DUniverseGraph: React.FC<Lore3DUniverseGraphProps> = ({
    lore = [],
    characters = [],
    scriptsBin = [],
    activeProjectId,
    onSelectLore
}) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const animFrameRef = useRef<number | null>(null);

    // Filters and Display states
    const [filterCharacters, setFilterCharacters] = useState<boolean>(true);
    const [filterLore, setFilterLore] = useState<boolean>(true);
    const [filterScripts, setFilterScripts] = useState<boolean>(true);
    const [filterInfluenceLines, setFilterInfluenceLines] = useState<boolean>(true);
    const [onlyInfluenceLines, setOnlyInfluenceLines] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [autoRotate, setAutoRotate] = useState<boolean>(true);
    const [isolateSelection, setIsolateSelection] = useState<boolean>(false);

    // Selected & Hovered Nodes and Influence Lines
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [selectedInfluenceLineId, setSelectedInfluenceLineId] = useState<string | null>(null);
    const [hoveredInfluenceLineId, setHoveredInfluenceLineId] = useState<string | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);

    // Camera 3D Orbit parameters
    const cameraRef = useRef({
        yaw: 0.4,       // Azimuth angle (radians)
        pitch: 0.25,    // Elevation angle (radians)
        distance: 750,  // Distance from origin
        panX: 0,
        panY: 0,
        targetYaw: 0.4,
        targetPitch: 0.25,
        targetDistance: 750,
        targetPanX: 0,
        targetPanY: 0,
        isDragging: false,
        lastMouseX: 0,
        lastMouseY: 0,
        isPanning: false
    });

    // 3D Nodes and Links data structures
    const nodesRef = useRef<Node3D[]>([]);
    const linksRef = useRef<Link3D[]>([]);

    // 1. Build 3D Graph Nodes & Interconnected Links from lore, characters, and scripts
    const graphData = useMemo(() => {
        const nodes: Node3D[] = [];
        const links: Link3D[] = [];
        const existingNodeIds = new Set<string>();

        // (a) Character Nodes
        characters.forEach((char, idx) => {
            const id = `char_${char.id}`;
            existingNodeIds.add(id);
            // Distribute in a 3D spherical shell initially
            const phi = Math.acos(-1 + (2 * idx) / Math.max(1, characters.length));
            const theta = Math.sqrt(characters.length * Math.PI) * phi;
            const r = 240;
            nodes.push({
                id,
                name: char.name,
                type: 'character',
                category: char.archetype || 'Archetype',
                description: `${char.archetype || 'Character'}: ${char.description || ''}`,
                fullContent: char.description || '',
                tags: char.tags || [],
                x: r * Math.cos(theta) * Math.sin(phi) + (Math.random() - 0.5) * 40,
                y: r * Math.sin(theta) * Math.sin(phi) + (Math.random() - 0.5) * 40,
                z: r * Math.cos(phi) + (Math.random() - 0.5) * 40,
                vx: 0,
                vy: 0,
                vz: 0,
                radius: 14,
                projX: 0,
                projY: 0,
                projZ: 0,
                projScale: 1,
                visible: true
            });
        });

        // (b) Lore Nodes
        lore.forEach((l, idx) => {
            const id = `lore_${l.id}`;
            existingNodeIds.add(id);
            const phi = Math.acos(-1 + (2 * idx) / Math.max(1, lore.length));
            const theta = Math.sqrt(lore.length * Math.PI) * phi;
            const r = 320;
            nodes.push({
                id,
                name: l.title,
                type: 'lore',
                category: l.cluster || 'Canon Lore',
                description: l.content?.slice(0, 160) + (l.content?.length > 160 ? '...' : ''),
                fullContent: l.content || '',
                tags: l.tags || [],
                x: r * Math.cos(theta) * Math.sin(phi) + (Math.random() - 0.5) * 50,
                y: r * Math.sin(theta) * Math.sin(phi) + (Math.random() - 0.5) * 50,
                z: r * Math.cos(phi) + (Math.random() - 0.5) * 50,
                vx: 0,
                vy: 0,
                vz: 0,
                radius: 16,
                projX: 0,
                projY: 0,
                projZ: 0,
                projScale: 1,
                visible: true
            });
        });

        // (c) Script / Screenplay Nodes
        scriptsBin.forEach((s, idx) => {
            const id = `script_${s.id || idx}`;
            existingNodeIds.add(id);
            const phi = Math.acos(-1 + (2 * idx) / Math.max(1, scriptsBin.length));
            const theta = Math.sqrt(scriptsBin.length * Math.PI) * phi;
            const r = 280;
            nodes.push({
                id,
                name: s.title || `Scene Draft #${idx + 1}`,
                type: 'script',
                category: 'Screenplay Draft',
                description: s.content ? s.content.slice(0, 150) + '...' : 'Script scene snippet',
                fullContent: s.content || '',
                tags: ['script', 'scene', 'draft'],
                x: r * Math.cos(theta) * Math.sin(phi) + (Math.random() - 0.5) * 50,
                y: r * Math.sin(theta) * Math.sin(phi) + (Math.random() - 0.5) * 50,
                z: r * Math.cos(phi) + (Math.random() - 0.5) * 50,
                vx: 0,
                vy: 0,
                vz: 0,
                radius: 15,
                projX: 0,
                projY: 0,
                projZ: 0,
                projScale: 1,
                visible: true
            });
        });

        // (d) Build Cross-Entity Interconnections
        // 1. Script <-> Character mentions
        scriptsBin.forEach((s, sIdx) => {
            const scriptId = `script_${s.id || sIdx}`;
            const scriptText = (s.content || '').toLowerCase();
            characters.forEach(c => {
                const charId = `char_${c.id}`;
                if (c.name && scriptText.includes(c.name.toLowerCase())) {
                    links.push({
                        id: `link_${scriptId}_${charId}`,
                        source: scriptId,
                        target: charId,
                        reason: `Character "${c.name}" featured in screenplay scene`,
                        strength: 0.8
                    });
                }
            });

            // 2. Script <-> Lore mentions
            lore.forEach(l => {
                const loreId = `lore_${l.id}`;
                const loreWords = l.title.toLowerCase().split(/\W+/).filter(w => w.length > 3);
                const hasMention = loreWords.some(w => scriptText.includes(w));
                if (hasMention) {
                    links.push({
                        id: `link_${scriptId}_${loreId}`,
                        source: scriptId,
                        target: loreId,
                        reason: `Lore motif "${l.title}" referenced in screenplay narrative`,
                        strength: 0.65
                    });
                }
            });
        });

        // 3. Character <-> Lore Script Influence Lines (based on script metadata & canon affinities)
        characters.forEach(c => {
            const charId = `char_${c.id}`;
            const charNameLower = (c.name || '').toLowerCase();
            const charText = `${c.name} ${c.description} ${(c.tags || []).join(' ')}`.toLowerCase();

            lore.forEach(l => {
                const loreId = `lore_${l.id}`;
                const loreTitleLower = (l.title || '').toLowerCase();
                const loreKeywords = loreTitleLower.split(/\W+/).filter(w => w.length > 3);
                const loreText = `${l.title} ${l.content} ${(l.tags || []).join(' ')}`.toLowerCase();

                // Scan scriptsBin for co-occurrences of character and lore in same scene/script
                const scriptEvidence: ScriptEvidence[] = [];
                let totalScriptMentions = 0;

                scriptsBin.forEach((s, sIdx) => {
                    const scriptText = (s.content || '').toLowerCase();
                    const mentionsChar = charNameLower && scriptText.includes(charNameLower);
                    const mentionsLore = loreKeywords.some(kw => scriptText.includes(kw)) ||
                        (l.tags && l.tags.some(t => scriptText.includes(t.toLowerCase())));

                    if (mentionsChar && mentionsLore) {
                        let snippet = '';
                        const charIdx = scriptText.indexOf(charNameLower);
                        if (charIdx !== -1) {
                            const start = Math.max(0, charIdx - 50);
                            const end = Math.min(scriptText.length, charIdx + 110);
                            snippet = '...' + s.content.slice(start, end).trim() + '...';
                        }
                        const countInScript = (scriptText.match(new RegExp(charNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
                        totalScriptMentions += countInScript;
                        scriptEvidence.push({
                            scriptTitle: s.title || `Scene Draft #${sIdx + 1}`,
                            scriptId: s.id || `script_${sIdx}`,
                            sceneSnippet: snippet,
                            occurrences: Math.max(1, countInScript)
                        });
                    }
                });

                const directMention = loreText.includes(charNameLower);
                const sharedCluster = c.cluster && l.cluster && c.cluster === l.cluster;
                const hasScriptLink = scriptEvidence.length > 0;

                if (hasScriptLink || directMention || sharedCluster) {
                    // Calculate influence strength based on script metadata
                    let strength = 0.35;
                    if (hasScriptLink) {
                        strength = Math.min(1.0, 0.45 + scriptEvidence.length * 0.18 + totalScriptMentions * 0.04);
                    }
                    if (directMention) strength = Math.min(1.0, strength + 0.2);
                    if (sharedCluster) strength = Math.min(1.0, strength + 0.15);

                    const roundedStrength = Math.round(strength * 100) / 100;
                    const influenceId = `influence_${c.id}_${l.id}`;

                    links.push({
                        id: influenceId,
                        source: charId,
                        target: loreId,
                        isInfluenceLine: true,
                        characterId: c.id,
                        characterName: c.name,
                        loreId: l.id,
                        loreTitle: l.title,
                        strength: roundedStrength,
                        scriptEvidence,
                        totalScriptMentions,
                        thematicContext: hasScriptLink
                            ? `Script metadata indicates ${c.name} directly impacts "${l.title}" across ${scriptEvidence.length} screenplay drafts.`
                            : directMention
                            ? `Canon Lore documents establish direct character agency for ${c.name} regarding "${l.title}".`
                            : `Shared thematic alignment within the "${c.cluster}" cluster.`,
                        reason: hasScriptLink
                            ? `Script Influence: ${scriptEvidence.length} scenes feature ${c.name} interacting with ${l.title}`
                            : directMention 
                            ? `Lore document references character "${c.name}"`
                            : `Shared thematic cluster: "${c.cluster}"`
                    });
                }
            });
        });

        // 4. Lore <-> Lore thematic affinity
        for (let i = 0; i < lore.length; i++) {
            for (let j = i + 1; j < lore.length; j++) {
                const l1 = lore[i];
                const l2 = lore[j];
                const sharedCluster = l1.cluster && l2.cluster && l1.cluster === l2.cluster;
                const sharedTags = (l1.tags || []).filter(t => (l2.tags || []).includes(t));

                if (sharedCluster || sharedTags.length > 0) {
                    links.push({
                        id: `link_lore_${l1.id}_lore_${l2.id}`,
                        source: `lore_${l1.id}`,
                        target: `lore_${l2.id}`,
                        reason: sharedCluster ? `Shared cluster: ${l1.cluster}` : `Shared tags: #${sharedTags.join(', #')}`,
                        strength: 0.4
                    });
                }
            }
        }

        // Validate links
        const validLinks = links.filter(l => existingNodeIds.has(l.source) && existingNodeIds.has(l.target));

        return { nodes, links: validLinks };
    }, [lore, characters, scriptsBin]);

    // Keep node and link refs in sync
    useEffect(() => {
        nodesRef.current = graphData.nodes;
        linksRef.current = graphData.links;
    }, [graphData]);

    // 2. 3D D3 Physics Simulation Engine
    useEffect(() => {
        let isRunning = true;
        const nodes = nodesRef.current;
        const links = linksRef.current;

        // Fast node lookup
        const nodeMap = new Map<string, Node3D>();
        nodes.forEach(n => nodeMap.set(n.id, n));

        // Physics step parameters
        const REPULSION = 1400;
        const SPRING_STRENGTH = 0.04;
        const TARGET_LINK_LEN = 140;
        const CENTER_GRAVITY = 0.008;
        const DAMPING = 0.88;

        const step3D = () => {
            if (!isRunning) return;

            // (a) Repulsion between all node pairs in 3D
            for (let i = 0; i < nodes.length; i++) {
                const a = nodes[i];
                for (let j = i + 1; j < nodes.length; j++) {
                    const b = nodes[j];
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const dz = b.z - a.z;
                    const distSq = dx * dx + dy * dy + dz * dz + 100;
                    const dist = Math.sqrt(distSq);

                    const force = REPULSION / distSq;
                    const fx = (dx / dist) * force;
                    const fy = (dy / dist) * force;
                    const fz = (dz / dist) * force;

                    a.vx -= fx;
                    a.vy -= fy;
                    a.vz -= fz;
                    b.vx += fx;
                    b.vy += fy;
                    b.vz += fz;
                }
            }

            // (b) Spring attraction along links
            for (let i = 0; i < links.length; i++) {
                const link = links[i];
                const a = nodeMap.get(link.source);
                const b = nodeMap.get(link.target);
                if (!a || !b) continue;

                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dz = b.z - a.z;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

                const delta = dist - TARGET_LINK_LEN;
                const force = delta * SPRING_STRENGTH * (link.strength || 1);
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                const fz = (dz / dist) * force;

                a.vx += fx;
                a.vy += fy;
                a.vz += fz;
                b.vx -= fx;
                b.vy -= fy;
                b.vz -= fz;
            }

            // (c) Center Gravity & Position integration
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                n.vx -= n.x * CENTER_GRAVITY;
                n.vy -= n.y * CENTER_GRAVITY;
                n.vz -= n.z * CENTER_GRAVITY;

                n.vx *= DAMPING;
                n.vy *= DAMPING;
                n.vz *= DAMPING;

                n.x += n.vx;
                n.y += n.vy;
                n.z += n.vz;
            }
        };

        // Run simulation timer
        const timer = d3.timer(() => {
            step3D();
        });

        return () => {
            isRunning = false;
            timer.stop();
        };
    }, [graphData]);

    // 3. Render 3D Scene onto Canvas with perspective projection and depth sorting
    const renderScene = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;

        const cam = cameraRef.current;

        // Smooth camera interpolation towards target
        cam.yaw += (cam.targetYaw - cam.yaw) * 0.1;
        cam.pitch += (cam.targetPitch - cam.pitch) * 0.1;
        cam.distance += (cam.targetDistance - cam.distance) * 0.1;
        cam.panX += (cam.targetPanX - cam.panX) * 0.1;
        cam.panY += (cam.targetPanY - cam.panY) * 0.1;

        if (autoRotate && !cam.isDragging) {
            cam.targetYaw += 0.002;
        }

        // Camera trigonometric terms
        const cosY = Math.cos(cam.yaw);
        const sinY = Math.sin(cam.yaw);
        const cosX = Math.cos(cam.pitch);
        const sinX = Math.sin(cam.pitch);

        const focalLength = 650;

        // Clear canvas
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(0, 0, width, height);

        // Cosmic background grid / nebula stars effect
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const gridSpacing = 80;
        for (let x = 0; x < width; x += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSpacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.restore();

        const nodes = nodesRef.current;
        const links = linksRef.current;
        const nodeMap = new Map<string, Node3D>();

        // Selected node and its connected neighbor set
        const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
        const neighborIds = new Set<string>();
        if (selectedNodeId) {
            neighborIds.add(selectedNodeId);
            links.forEach(l => {
                if (l.source === selectedNodeId) neighborIds.add(l.target);
                if (l.target === selectedNodeId) neighborIds.add(l.source);
            });
        }

        // Project nodes into 3D camera space
        nodes.forEach(n => {
            nodeMap.set(n.id, n);

            // Filter check
            let visible = true;
            if (n.type === 'character' && !filterCharacters) visible = false;
            if (n.type === 'lore' && !filterLore) visible = false;
            if (n.type === 'script' && !filterScripts) visible = false;
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matches = n.name.toLowerCase().includes(query) || (n.category || '').toLowerCase().includes(query);
                if (!matches) visible = false;
            }
            if (isolateSelection && selectedNodeId && !neighborIds.has(n.id)) {
                visible = false;
            }
            n.visible = visible;

            // 3D rotation transform (Yaw around Y, then Pitch around X)
            const x1 = n.x * cosY + n.z * sinY;
            const z1 = -n.x * sinY + n.z * cosY;

            const y1 = n.y * cosX - z1 * sinX;
            const z2 = n.y * sinX + z1 * cosX + cam.distance;

            const safeZ = Math.max(10, z2);
            const scale = focalLength / safeZ;

            n.projX = centerX + x1 * scale + cam.panX;
            n.projY = centerY + y1 * scale + cam.panY;
            n.projZ = safeZ;
            n.projScale = scale;
        });

        // (a) Render Links with Depth Fading, Influence Line highlights, and Pulsing Energy
        links.forEach(link => {
            const a = nodeMap.get(link.source);
            const b = nodeMap.get(link.target);
            if (!a || !b || !a.visible || !b.visible) return;

            // Visibility filter check for influence lines
            if (link.isInfluenceLine && !filterInfluenceLines) return;
            if (onlyInfluenceLines && !link.isInfluenceLine) return;

            const isLinkHovered = hoveredInfluenceLineId === link.id;
            const isLinkSelected = selectedInfluenceLineId === link.id;
            const isHighlighted = (selectedNodeId && (link.source === selectedNodeId || link.target === selectedNodeId)) || isLinkSelected;
            const isDimmed = (selectedNodeId && !isHighlighted) || (selectedInfluenceLineId && !isLinkSelected);

            const avgZ = (a.projZ + b.projZ) / 2;
            const depthAlpha = Math.max(0.12, Math.min(0.85, 650 / avgZ));
            const projScale = Math.min(a.projScale, b.projScale);

            ctx.save();

            if (link.isInfluenceLine) {
                // --- INFLUENCE LINE RENDERING (CHARACTER <-> LORE SCRIPT RELATIONSHIP) ---
                // 1. Dynamic Width directly proportional to script influence strength
                const baseWidth = 2.4 + (link.strength || 0.5) * 5.0;
                const lineWidth = Math.max(1.5, Math.min(10, baseWidth * projScale));

                // 2. Linear Gradient: Character Purple -> Lore Cyan (or Gold when selected)
                const grad = ctx.createLinearGradient(a.projX, a.projY, b.projX, b.projY);
                if (isLinkSelected) {
                    grad.addColorStop(0, '#f472b6'); // Pink / Magenta
                    grad.addColorStop(0.5, '#fbbf24'); // Gold
                    grad.addColorStop(1, '#38bdf8'); // Electric Cyan
                } else if (isLinkHovered) {
                    grad.addColorStop(0, '#c084fc');
                    grad.addColorStop(1, '#67e8f9');
                } else {
                    grad.addColorStop(0, 'rgba(168, 85, 247, 0.85)'); // Character
                    grad.addColorStop(1, 'rgba(6, 182, 212, 0.85)'); // Lore
                }

                ctx.beginPath();
                ctx.moveTo(a.projX, a.projY);
                ctx.lineTo(b.projX, b.projY);

                ctx.strokeStyle = grad;
                ctx.lineWidth = isLinkSelected ? lineWidth + 3 : isLinkHovered ? lineWidth + 1.8 : lineWidth;
                ctx.shadowColor = isLinkSelected ? '#fbbf24' : isLinkHovered ? '#38bdf8' : 'rgba(6, 182, 212, 0.6)';
                ctx.shadowBlur = isLinkSelected ? 18 : isLinkHovered ? 12 : 5;
                ctx.globalAlpha = isDimmed ? 0.2 : isLinkSelected || isLinkHovered ? 1.0 : depthAlpha;
                ctx.stroke();

                // 3. Animated Energy Pulse / Dashed Particle flow along the influence line
                const animOffset = (performance.now() / 35) % 24;
                ctx.setLineDash([6, 10]);
                ctx.lineDashOffset = -animOffset;
                ctx.strokeStyle = isLinkSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.75)';
                ctx.lineWidth = Math.max(1, lineWidth * 0.5);
                ctx.beginPath();
                ctx.moveTo(a.projX, a.projY);
                ctx.lineTo(b.projX, b.projY);
                ctx.stroke();
                ctx.setLineDash([]); // Reset line dash

                // 4. Midpoint 3D Strength Indicator Badge ("⚡ XX%")
                const midX = (a.projX + b.projX) / 2;
                const midY = (a.projY + b.projY) / 2;
                const strengthPct = Math.round((link.strength || 0.5) * 100);

                if (projScale > 0.45 || isLinkHovered || isLinkSelected) {
                    const badgeText = `⚡ ${strengthPct}%`;
                    const fontSize = Math.max(8.5, Math.min(12, Math.round(9.5 * projScale)));
                    ctx.font = `bold ${fontSize}px monospace`;
                    const textMetrics = ctx.measureText(badgeText);
                    const badgeW = textMetrics.width + 10;
                    const badgeH = fontSize + 8;

                    ctx.fillStyle = isLinkSelected
                        ? 'rgba(245, 158, 11, 0.95)'
                        : isLinkHovered
                        ? 'rgba(6, 182, 212, 0.95)'
                        : 'rgba(15, 23, 42, 0.88)';
                    ctx.strokeStyle = isLinkSelected ? '#fbbf24' : isLinkHovered ? '#67e8f9' : 'rgba(255, 255, 255, 0.25)';
                    ctx.lineWidth = 1;

                    ctx.beginPath();
                    ctx.roundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 4);
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = isLinkSelected ? '#000000' : '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(badgeText, midX, midY);
                }
            } else {
                // --- REGULAR SYNAPTIC LINK RENDERING ---
                ctx.beginPath();
                ctx.moveTo(a.projX, a.projY);
                ctx.lineTo(b.projX, b.projY);

                if (isHighlighted) {
                    ctx.strokeStyle = '#38bdf8'; // Glowing sky blue
                    ctx.lineWidth = 2.5;
                    ctx.shadowColor = '#0284c7';
                    ctx.shadowBlur = 10;
                    ctx.globalAlpha = 0.95;
                } else if (isDimmed) {
                    ctx.strokeStyle = 'rgba(100, 116, 139, 0.12)';
                    ctx.lineWidth = 0.8;
                    ctx.globalAlpha = 0.15;
                } else {
                    const strokeColor = a.type === b.type 
                        ? TYPE_COLORS[a.type].hex 
                        : 'rgba(148, 163, 184, 0.4)';
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = Math.max(0.8, 1.8 * projScale);
                    ctx.globalAlpha = depthAlpha;
                }
                ctx.stroke();
            }

            ctx.restore();
        });

        // (b) Depth Sorting: render background nodes first, foreground last (Painter's Algorithm)
        const sortedNodes = [...nodes].filter(n => n.visible).sort((a, b) => b.projZ - a.projZ);

        sortedNodes.forEach(node => {
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNodeId === node.id;
            const isNeighbor = selectedNodeId && neighborIds.has(node.id);
            const isDimmed = selectedNodeId && !isSelected && !isNeighbor;

            const colors = TYPE_COLORS[node.type];
            const baseR = node.radius * node.projScale;
            const r = Math.max(4, Math.min(36, isSelected ? baseR * 1.35 : isHovered ? baseR * 1.2 : baseR));

            // Depth opacity
            const depthFade = Math.max(0.25, Math.min(1.0, 750 / node.projZ));
            const alpha = isDimmed ? 0.18 : depthFade;

            ctx.save();
            ctx.globalAlpha = alpha;

            // Outer Glow ring
            if (isSelected || isHovered) {
                ctx.beginPath();
                ctx.arc(node.projX, node.projY, r + 7, 0, Math.PI * 2);
                ctx.fillStyle = colors.glow;
                ctx.fill();

                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            }

            // Node core sphere
            ctx.beginPath();
            ctx.arc(node.projX, node.projY, r, 0, Math.PI * 2);

            // 3D Spherical Radial Gradient
            const grad = ctx.createRadialGradient(
                node.projX - r * 0.35, node.projY - r * 0.35, r * 0.1,
                node.projX, node.projY, r
            );
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.35, colors.hex);
            grad.addColorStop(1, '#050505');

            ctx.fillStyle = grad;
            ctx.fill();

            ctx.lineWidth = 1.5;
            ctx.strokeStyle = isSelected ? '#ffffff' : colors.hex;
            ctx.stroke();

            // Type icon badge inside node
            const iconChar = node.type === 'character' ? '👤' : node.type === 'script' ? '🎬' : '📜';
            if (r > 12) {
                ctx.font = `${Math.round(r * 0.85)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(iconChar, node.projX, node.projY);
            }

            // Node Label
            if (!isDimmed || isHovered) {
                const fontSize = Math.max(10, Math.min(15, Math.round(12 * node.projScale)));
                ctx.font = `bold ${fontSize}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';

                const textY = node.projY + r + 4;
                const label = node.name.length > 24 ? node.name.slice(0, 22) + '...' : node.name;

                // Label background pill for readability
                const textWidth = ctx.measureText(label).width;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
                ctx.fillRect(node.projX - textWidth / 2 - 4, textY - 2, textWidth + 8, fontSize + 4);

                ctx.fillStyle = isSelected ? '#38bdf8' : isHovered ? '#ffffff' : '#e2e8f0';
                ctx.fillText(label, node.projX, textY);
            }

            ctx.restore();
        });
    }, [filterCharacters, filterLore, filterScripts, searchQuery, autoRotate, isolateSelection, selectedNodeId, hoveredNodeId]);

    // 4. Animation Frame Loop
    useEffect(() => {
        const loop = () => {
            renderScene();
            animFrameRef.current = requestAnimationFrame(loop);
        };
        animFrameRef.current = requestAnimationFrame(loop);

        return () => {
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [renderScene]);

    // Handle canvas resizing
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;

            const rect = container.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;

            const ctx = canvas.getContext('2d');
            if (ctx) ctx.scale(dpr, dpr);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 5. Mouse Orbit, Pan, and Hit-Testing Handlers
    const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const cam = cameraRef.current;
        cam.isDragging = true;
        cam.lastMouseX = e.clientX;
        cam.lastMouseY = e.clientY;
        cam.isPanning = e.shiftKey || e.button === 2; // Right click or shift+drag for pan
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const cam = cameraRef.current;
        if (cam.isDragging) {
            const dx = e.clientX - cam.lastMouseX;
            const dy = e.clientY - cam.lastMouseY;
            cam.lastMouseX = e.clientX;
            cam.lastMouseY = e.clientY;

            if (cam.isPanning) {
                cam.targetPanX += dx;
                cam.targetPanY += dy;
            } else {
                cam.targetYaw += dx * 0.007;
                cam.targetPitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, cam.targetPitch + dy * 0.007));
            }
            return;
        }

        // Raycasting / Hit-testing closest node or influence line under mouse
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        let closestNode: Node3D | null = null;
        let minDistance = 25; // hit radius

        const nodes = nodesRef.current;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n.visible) continue;
            const dx = mouseX - n.projX;
            const dy = mouseY - n.projY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < Math.max(minDistance, n.radius * n.projScale)) {
                closestNode = n;
                break;
            }
        }

        // If no node hovered, test for influence lines
        let closestLine: Link3D | null = null;
        if (!closestNode && filterInfluenceLines) {
            const nodeMap = new Map<string, Node3D>();
            nodes.forEach(n => nodeMap.set(n.id, n));
            let minLineDist = 14;

            for (const link of linksRef.current) {
                if (!link.isInfluenceLine) continue;
                const a = nodeMap.get(link.source);
                const b = nodeMap.get(link.target);
                if (!a || !b || !a.visible || !b.visible) continue;

                const d = distToSegment(mouseX, mouseY, a.projX, a.projY, b.projX, b.projY);
                if (d < minLineDist) {
                    minLineDist = d;
                    closestLine = link;
                }
            }
        }

        setHoveredNodeId(closestNode ? closestNode.id : null);
        setHoveredInfluenceLineId(closestLine ? closestLine.id : null);
        canvas.style.cursor = (closestNode || closestLine) ? 'pointer' : cam.isDragging ? 'grabbing' : 'grab';
    };

    const handleMouseUp = () => {
        cameraRef.current.isDragging = false;
        cameraRef.current.isPanning = false;
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        const cam = cameraRef.current;
        const zoomDelta = e.deltaY * 0.8;
        cam.targetDistance = Math.max(250, Math.min(2200, cam.targetDistance + zoomDelta));
    };

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // 1. Check if a node was clicked
        let clickedNode: Node3D | null = null;
        const nodes = nodesRef.current;

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (!n.visible) continue;
            const dx = mouseX - n.projX;
            const dy = mouseY - n.projY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < Math.max(22, n.radius * n.projScale + 4)) {
                clickedNode = n;
                break;
            }
        }

        if (clickedNode) {
            setSelectedNodeId(clickedNode.id);
            setSelectedInfluenceLineId(null);
            setInspectorOpen(true);
            return;
        }

        // 2. Check if a clickable Influence Line was clicked
        if (filterInfluenceLines) {
            const nodeMap = new Map<string, Node3D>();
            nodes.forEach(n => nodeMap.set(n.id, n));
            let clickedLine: Link3D | null = null;
            let minLineDist = 16;

            for (const link of linksRef.current) {
                if (!link.isInfluenceLine) continue;
                const a = nodeMap.get(link.source);
                const b = nodeMap.get(link.target);
                if (!a || !b || !a.visible || !b.visible) continue;

                const d = distToSegment(mouseX, mouseY, a.projX, a.projY, b.projX, b.projY);
                if (d < minLineDist) {
                    minLineDist = d;
                    clickedLine = link;
                }
            }

            if (clickedLine) {
                setSelectedInfluenceLineId(clickedLine.id);
                setSelectedNodeId(null);
                setInspectorOpen(true);
                return;
            }
        }

        // 3. Click on empty space deselects all
        setSelectedNodeId(null);
        setSelectedInfluenceLineId(null);
        setInspectorOpen(false);
    };

    // Smooth Camera Focus on Selected Node in 3D
    const handleFocusNode = (node: Node3D) => {
        const cam = cameraRef.current;
        cam.targetPanX = 0;
        cam.targetPanY = 0;
        cam.targetDistance = 450;
        const targetYaw = Math.atan2(node.x, node.z);
        const horizDist = Math.sqrt(node.x * node.x + node.z * node.z);
        const targetPitch = -Math.atan2(node.y, horizDist);

        cam.targetYaw = targetYaw;
        cam.targetPitch = targetPitch;
    };

    // Smooth Camera Focus on an Influence Line in 3D
    const handleFocusInfluenceLine = (line: Link3D) => {
        const nodeMap = new Map<string, Node3D>();
        nodesRef.current.forEach(n => nodeMap.set(n.id, n));
        const a = nodeMap.get(line.source);
        const b = nodeMap.get(line.target);
        if (!a || !b) return;

        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const midZ = (a.z + b.z) / 2;

        const cam = cameraRef.current;
        cam.targetPanX = 0;
        cam.targetPanY = 0;
        cam.targetDistance = 480;
        cam.targetYaw = Math.atan2(midX, midZ);
        const horizDist = Math.sqrt(midX * midX + midZ * midZ);
        cam.targetPitch = -Math.atan2(midY, horizDist);
    };

    // Reset Camera
    const handleResetCamera = () => {
        const cam = cameraRef.current;
        cam.targetYaw = 0.4;
        cam.targetPitch = 0.25;
        cam.targetDistance = 750;
        cam.targetPanX = 0;
        cam.targetPanY = 0;
        setSelectedNodeId(null);
        setSelectedInfluenceLineId(null);
        setInspectorOpen(false);
        setIsolateSelection(false);
    };

    // High-Resolution 3D Snapshot Export
    const handleExportSnapshot = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `mythos_lore_universe_3d_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // Selected node and detailed relationship links
    const activeSelectedNode = useMemo(() => {
        if (!selectedNodeId) return null;
        return nodesRef.current.find(n => n.id === selectedNodeId) || null;
    }, [selectedNodeId]);

    // Selected influence line
    const activeSelectedInfluenceLine = useMemo(() => {
        if (!selectedInfluenceLineId) return null;
        return linksRef.current.find(l => l.id === selectedInfluenceLineId && l.isInfluenceLine) || null;
    }, [selectedInfluenceLineId]);

    const activeRelationships = useMemo(() => {
        if (!selectedNodeId) return [];
        const links = linksRef.current;
        const nodes = nodesRef.current;
        const nodeMap = new Map<string, Node3D>();
        nodes.forEach(n => nodeMap.set(n.id, n));

        const rels: RelationshipDetail[] = [];
        links.forEach(l => {
            if (l.source === selectedNodeId) {
                const target = nodeMap.get(l.target);
                if (target) {
                    rels.push({
                        targetNode: target,
                        reason: l.reason,
                        type: target.type,
                        isInfluenceLine: l.isInfluenceLine,
                        strength: l.strength,
                        scriptEvidence: l.scriptEvidence
                    });
                }
            } else if (l.target === selectedNodeId) {
                const source = nodeMap.get(l.source);
                if (source) {
                    rels.push({
                        targetNode: source,
                        reason: l.reason,
                        type: source.type,
                        isInfluenceLine: l.isInfluenceLine,
                        strength: l.strength,
                        scriptEvidence: l.scriptEvidence
                    });
                }
            }
        });
        return rels;
    }, [selectedNodeId]);

    const counts = useMemo(() => {
        const chars = graphData.nodes.filter(n => n.type === 'character').length;
        const loreCount = graphData.nodes.filter(n => n.type === 'lore').length;
        const scriptsCount = graphData.nodes.filter(n => n.type === 'script').length;
        const influenceCount = graphData.links.filter(l => l.isInfluenceLine).length;
        return { chars, loreCount, scriptsCount, totalLinks: graphData.links.length, influenceCount };
    }, [graphData]);

    return (
        <div ref={containerRef} className="relative w-full h-[750px] bg-[#0a0a0c] rounded-2xl overflow-hidden border border-neutral-800 shadow-2xl flex flex-col font-sans select-none">
            {/* Top Toolbar */}
            <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap justify-between items-center gap-3 pointer-events-none">
                {/* Left: Universe Title & Search */}
                <div className="flex items-center gap-3 bg-neutral-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-neutral-800 shadow-lg pointer-events-auto">
                    <span className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 font-mono">
                        <span>🪐</span> 3D Lore Cosmos
                    </span>
                    <div className="w-px h-4 bg-neutral-700 mx-1" />
                    <input
                        type="text"
                        placeholder="Search entities, motifs, scripts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-black/60 border border-neutral-700/80 px-3 py-1 rounded-lg text-xs text-white placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44 sm:w-56"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-white text-xs cursor-pointer">✕</button>
                    )}
                </div>

                {/* Center / Right: Filter Pills & Camera Controls */}
                <div className="flex flex-wrap items-center gap-2 bg-neutral-900/90 backdrop-blur-md p-1.5 rounded-xl border border-neutral-800 shadow-lg pointer-events-auto">
                    {/* Character Filter */}
                    <button
                        onClick={() => setFilterCharacters(prev => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                            filterCharacters
                                ? 'bg-purple-950/80 text-purple-300 border border-purple-800/80'
                                : 'text-neutral-500 hover:text-neutral-300 bg-neutral-800/40'
                        }`}
                        title="Toggle Character Nodes"
                    >
                        <span className="w-2 h-2 rounded-full bg-purple-500" />
                        <span>Characters ({counts.chars})</span>
                    </button>

                    {/* Lore Filter */}
                    <button
                        onClick={() => setFilterLore(prev => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                            filterLore
                                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80'
                                : 'text-neutral-500 hover:text-neutral-300 bg-neutral-800/40'
                        }`}
                        title="Toggle Lore Bible Nodes"
                    >
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>Lore ({counts.loreCount})</span>
                    </button>

                    {/* Script Filter */}
                    <button
                        onClick={() => setFilterScripts(prev => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                            filterScripts
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                                : 'text-neutral-500 hover:text-neutral-300 bg-neutral-800/40'
                        }`}
                        title="Toggle Script Nodes"
                    >
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        <span>Scripts ({counts.scriptsCount})</span>
                    </button>

                    {/* Clickable Influence Lines Toggle */}
                    <button
                        onClick={() => setFilterInfluenceLines(prev => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                            filterInfluenceLines
                                ? 'bg-gradient-to-r from-purple-950 to-cyan-950 text-cyan-300 border border-cyan-700/80 shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                                : 'text-neutral-500 hover:text-neutral-300 bg-neutral-800/40'
                        }`}
                        title="Toggle Clickable Character ⟷ Lore Influence Lines based on Script Metadata"
                    >
                        <span>⚡</span>
                        <span>Influence Lines ({counts.influenceCount})</span>
                    </button>

                    {/* Isolate Only Influence Lines */}
                    {filterInfluenceLines && counts.influenceCount > 0 && (
                        <button
                            onClick={() => setOnlyInfluenceLines(prev => !prev)}
                            className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                onlyInfluenceLines
                                    ? 'bg-cyan-500 text-black font-black'
                                    : 'text-neutral-400 hover:text-cyan-300 bg-neutral-800/50'
                            }`}
                            title="Show ONLY Influence Lines"
                        >
                            {onlyInfluenceLines ? '✓ Influence Only' : 'Influence Focus'}
                        </button>
                    )}

                    <div className="w-px h-4 bg-neutral-700 mx-1" />

                    {/* Auto Rotate Toggle */}
                    <button
                        onClick={() => setAutoRotate(prev => !prev)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                            autoRotate
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-neutral-400 hover:text-white bg-neutral-800/60'
                        }`}
                        title="Toggle Automatic Orbit Rotation"
                    >
                        {autoRotate ? '⏸ Pause Orbit' : '▶ Auto-Rotate'}
                    </button>

                    {/* Reset Camera */}
                    <button
                        onClick={handleResetCamera}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        title="Reset 3D Camera Angles & Position"
                    >
                        🎥 Reset Camera
                    </button>

                    {/* Snapshot Export */}
                    <button
                        onClick={handleExportSnapshot}
                        className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-1"
                        title="Save High-Resolution PNG of Current 3D Graph"
                    >
                        <span>📸 Snapshot</span>
                    </button>
                </div>
            </div>

            {/* Bottom Status & Orbit Instructions Overlay */}
            <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-3 bg-neutral-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-neutral-800/80 text-[10px] font-mono text-neutral-400 shadow-lg pointer-events-none">
                <span className="flex items-center gap-1.5 text-neutral-300 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>3D Force Simulation Active</span>
                </span>
                <span className="text-neutral-600">•</span>
                <span>🖱️ Click Nodes or ⚡ Influence Lines</span>
                <span className="text-neutral-600">•</span>
                <span>Drag to Orbit</span>
                <span className="text-neutral-600">•</span>
                <span>Shift+Drag to Pan</span>
                <span className="text-neutral-600">•</span>
                <span className="text-cyan-400 font-bold">{counts.influenceCount} Script Influence Lines</span>
            </div>

            {/* Interactive 3D Canvas */}
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onClick={handleClick}
                className="w-full h-full block touch-none"
            />

            {/* Detailed Relationship / Influence Inspector Drawer */}
            {inspectorOpen && (
                <div className="absolute top-18 right-4 bottom-4 w-96 max-w-[calc(100%-2rem)] bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl p-5 shadow-2xl z-30 flex flex-col justify-between animate-fade-in text-xs overflow-hidden">
                    {/* View A: Clicked Influence Line Details */}
                    {activeSelectedInfluenceLine ? (
                        <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 flex-grow">
                            {/* Drawer Header */}
                            <div className="flex justify-between items-start border-b border-neutral-800 pb-3 gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500 flex items-center justify-center text-white text-base shadow-lg">
                                        ⚡
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-white text-sm">
                                                Script Influence Line
                                            </h4>
                                            <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded">
                                                {Math.round((activeSelectedInfluenceLine.strength || 0) * 100)}% Coupling
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-neutral-400 font-mono">
                                            Character ⟷ Lore Script Interconnection
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setInspectorOpen(false)}
                                    className="text-neutral-500 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Relationship Entities Breakdown */}
                            <div className="grid grid-cols-2 gap-2 bg-black/40 border border-neutral-800 p-3 rounded-xl">
                                <div className="bg-purple-950/40 border border-purple-900/60 p-2.5 rounded-lg space-y-1">
                                    <span className="text-[8px] font-mono uppercase text-purple-400 font-bold block">Character Entity</span>
                                    <div className="font-bold text-white text-xs truncate">{activeSelectedInfluenceLine.characterName}</div>
                                </div>
                                <div className="bg-cyan-950/40 border border-cyan-900/60 p-2.5 rounded-lg space-y-1">
                                    <span className="text-[8px] font-mono uppercase text-cyan-400 font-bold block">Lore Entry</span>
                                    <div className="font-bold text-white text-xs truncate">{activeSelectedInfluenceLine.loreTitle}</div>
                                </div>
                            </div>

                            {/* Influence Strength Meter */}
                            <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-3.5 space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-mono">
                                    <span className="text-neutral-400 uppercase font-bold">Script Influence Strength</span>
                                    <span className="text-cyan-400 font-bold">{Math.round((activeSelectedInfluenceLine.strength || 0) * 100)}% / 100%</span>
                                </div>
                                <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 rounded-full transition-all duration-300"
                                        style={{ width: `${Math.round((activeSelectedInfluenceLine.strength || 0) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-neutral-300 leading-relaxed font-sans mt-1">
                                    {activeSelectedInfluenceLine.thematicContext || activeSelectedInfluenceLine.reason}
                                </p>
                            </div>

                            {/* Script Evidence & Scene Mentions */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-mono font-black uppercase text-amber-400 tracking-wider">
                                        Script Metadata Evidence ({activeSelectedInfluenceLine.scriptEvidence?.length || 0} Drafts)
                                    </span>
                                    <span className="text-[9px] font-mono text-neutral-400">
                                        Total Co-Occurrences: {activeSelectedInfluenceLine.totalScriptMentions || 1}
                                    </span>
                                </div>

                                {(!activeSelectedInfluenceLine.scriptEvidence || activeSelectedInfluenceLine.scriptEvidence.length === 0) ? (
                                    <div className="p-3 bg-black/30 rounded-xl text-center text-[11px] text-neutral-500 italic">
                                        Synthesized from canon lore document references and cluster alignments.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                        {activeSelectedInfluenceLine.scriptEvidence.map((ev, idx) => (
                                            <div key={idx} className="p-2.5 bg-black/50 border border-neutral-800 rounded-xl space-y-1.5">
                                                <div className="flex justify-between items-center text-xs">
                                                    <strong className="text-amber-300 font-medium">{ev.scriptTitle}</strong>
                                                    <span className="text-[9px] font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">
                                                        {ev.occurrences}x Mentions
                                                    </span>
                                                </div>
                                                {ev.sceneSnippet && (
                                                    <p className="text-[10px] text-neutral-300 font-mono italic bg-neutral-900/60 p-2 rounded border border-neutral-800/80 leading-relaxed">
                                                        {ev.sceneSnippet}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Drawer Footer Actions */}
                            <div className="pt-3 border-t border-neutral-800 flex flex-col gap-2">
                                <button
                                    onClick={() => handleFocusInfluenceLine(activeSelectedInfluenceLine)}
                                    className="w-full py-2 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition shadow cursor-pointer text-center"
                                >
                                    🎯 Focus Connection in 3D
                                </button>
                                {activeSelectedInfluenceLine.loreId && onSelectLore && (
                                    <button
                                        onClick={() => onSelectLore(activeSelectedInfluenceLine.loreId!)}
                                        className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold uppercase text-[10px] tracking-wider rounded-xl transition cursor-pointer text-center"
                                    >
                                        Inspect Lore Entry in Bible 📖
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : activeSelectedNode ? (
                        /* View B: Clicked Node Details */
                        <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1 flex-grow">
                            {/* Drawer Header */}
                            <div className="flex justify-between items-start border-b border-neutral-800 pb-3 gap-2">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-xl">
                                        {activeSelectedNode.type === 'character' ? '👤' : activeSelectedNode.type === 'script' ? '🎬' : '📜'}
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-white text-sm truncate max-w-[190px]">
                                                {activeSelectedNode.name}
                                            </h4>
                                            <span className={`text-[8px] font-mono font-black uppercase px-1.5 py-0.5 rounded border ${
                                                activeSelectedNode.type === 'character' 
                                                    ? 'bg-purple-950/80 text-purple-300 border-purple-800/80' 
                                                    : activeSelectedNode.type === 'script'
                                                        ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                                                        : 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                                            }`}>
                                                {activeSelectedNode.type}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-neutral-400 font-mono">
                                            {activeSelectedNode.category || 'Entity'}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setInspectorOpen(false)}
                                    className="text-neutral-500 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition cursor-pointer"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Node Description */}
                            <div className="bg-black/40 border border-neutral-800 rounded-xl p-3 space-y-1.5">
                                <span className="text-[9px] font-mono font-bold uppercase text-neutral-500 tracking-wider block">
                                    Contextual Synopsis
                                </span>
                                <p className="text-neutral-300 text-[11px] leading-relaxed line-clamp-4">
                                    {activeSelectedNode.fullContent || activeSelectedNode.description}
                                </p>
                                {activeSelectedNode.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 pt-1 border-t border-neutral-800/60">
                                        {activeSelectedNode.tags.map((t, idx) => (
                                            <span key={idx} className="text-[8px] font-mono text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">
                                                #{t}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Connected Relationships list */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-mono font-black uppercase text-blue-400 tracking-wider">
                                        Synaptic Connections ({activeRelationships.length})
                                    </span>
                                    <button
                                        onClick={() => setIsolateSelection(prev => !prev)}
                                        className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border transition cursor-pointer ${
                                            isolateSelection 
                                                ? 'bg-blue-600 text-white border-blue-500' 
                                                : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
                                        }`}
                                    >
                                        {isolateSelection ? '✓ Isolated' : '🔍 Isolate Cluster'}
                                    </button>
                                </div>

                                {activeRelationships.length === 0 ? (
                                    <div className="p-4 bg-black/20 rounded-xl text-center text-[11px] text-neutral-500 italic">
                                        No direct synaptic links registered for this entity.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                        {activeRelationships.map((rel, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => {
                                                    setSelectedNodeId(rel.targetNode.id);
                                                    handleFocusNode(rel.targetNode);
                                                }}
                                                className="p-2.5 bg-black/50 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-700 rounded-xl space-y-1 transition cursor-pointer group"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-neutral-200 group-hover:text-blue-300 text-xs truncate max-w-[170px]">
                                                        {rel.targetNode.name}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        {rel.isInfluenceLine && (
                                                            <span className="text-[8px] font-mono font-bold uppercase px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                                                                ⚡ {Math.round((rel.strength || 0.5) * 100)}%
                                                            </span>
                                                        )}
                                                        <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                                                            rel.type === 'character' ? 'bg-purple-950/60 text-purple-400 border border-purple-900/40' :
                                                            rel.type === 'script' ? 'bg-amber-950/60 text-amber-400 border border-amber-900/40' :
                                                            'bg-cyan-950/60 text-cyan-400 border border-cyan-900/40'
                                                        }`}>
                                                            {rel.type}
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-neutral-400 font-mono italic leading-tight">
                                                    {rel.reason}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Drawer Footer Actions */}
                            <div className="pt-3 border-t border-neutral-800 flex items-center justify-between gap-2">
                                <button
                                    onClick={() => handleFocusNode(activeSelectedNode)}
                                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-wider rounded-xl transition shadow cursor-pointer text-center"
                                >
                                    🎯 Focus 3D Camera
                                </button>
                                {activeSelectedNode.type === 'lore' && onSelectLore && (
                                    <button
                                        onClick={() => {
                                            const rawId = activeSelectedNode.id.replace('lore_', '');
                                            onSelectLore(rawId);
                                        }}
                                        className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold uppercase text-[10px] tracking-wider rounded-xl transition cursor-pointer"
                                        title="Open in Lore Bible List"
                                    >
                                        Inspect 📖
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};
