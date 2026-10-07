import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { LoreEntry, Character } from '../types.ts';

interface LoreNetworkProps {
    lore: LoreEntry[];
    characters: Character[];
    activeProjectId: string;
    onSwitchTo3D?: () => void;
}

interface NetworkNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    type: 'character' | 'location' | 'event' | 'artifact_concept';
    description: string;
    details?: string;
}

interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
    source: string | NetworkNode;
    target: string | NetworkNode;
    similarity: number;
    isSameCluster?: boolean;
    clusterColor?: string;
}

export const CLUSTER_THEME_PALETTE = [
    { color: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.12)', stroke: '#8b5cf6', hex: '#8b5cf6', badge: 'bg-purple-950 text-purple-300 border-purple-800' },
    { color: '#3b82f6', fill: 'rgba(59, 130, 246, 0.12)', stroke: '#3b82f6', hex: '#3b82f6', badge: 'bg-blue-950 text-blue-300 border-blue-800' },
    { color: '#10b981', fill: 'rgba(16, 185, 129, 0.12)', stroke: '#10b981', hex: '#10b981', badge: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
    { color: '#f59e0b', fill: 'rgba(245, 158, 11, 0.12)', stroke: '#f59e0b', hex: '#f59e0b', badge: 'bg-amber-950 text-amber-300 border-amber-800' },
    { color: '#f43f5e', fill: 'rgba(244, 63, 94, 0.12)', stroke: '#f43f5e', hex: '#f43f5e', badge: 'bg-rose-950 text-rose-300 border-rose-800' },
    { color: '#06b6d4', fill: 'rgba(6, 182, 212, 0.12)', stroke: '#06b6d4', hex: '#06b6d4', badge: 'bg-cyan-950 text-cyan-300 border-cyan-800' },
    { color: '#ec4899', fill: 'rgba(236, 72, 153, 0.12)', stroke: '#ec4899', hex: '#ec4899', badge: 'bg-pink-950 text-pink-300 border-pink-800' },
    { color: '#6366f1', fill: 'rgba(99, 102, 241, 0.12)', stroke: '#6366f1', hex: '#6366f1', badge: 'bg-indigo-950 text-indigo-300 border-indigo-800' }
];

const CATEGORY_COLORS = {
    character: { bg: 'bg-purple-600', text: 'text-purple-400', border: 'border-purple-500', hex: '#a855f7' },
    location: { bg: 'bg-emerald-600', text: 'text-emerald-400', border: 'border-emerald-500', hex: '#10b981' },
    event: { bg: 'bg-rose-600', text: 'text-rose-400', border: 'border-rose-500', hex: '#f43f5e' },
    artifact_concept: { bg: 'bg-amber-600', text: 'text-amber-400', border: 'border-amber-500', hex: '#f59e0b' }
};

// Categorization helper based on simple keyword search
const categorizeLore = (title: string, content: string): 'location' | 'event' | 'artifact_concept' => {
    const text = `${title} ${content}`.toLowerCase();
    
    const locationKeywords = [
        'castle', 'city', 'lake', 'mountain', 'tower', 'palace', 'temple', 'forest', 
        'realm', 'region', 'land', 'station', 'sector', 'room', 'cave', 'dungeon', 'river', 'sea', 
        'ocean', 'valley', 'island', 'house', 'ruins', 'shrine', 'planet', 'continent', 'location', 'place'
    ];
    
    const eventKeywords = [
        'battle', 'war', 'coronation', 'collapse', 'event', 'meeting', 'ritual', 'plague', 
        'discovery', 'alliance', 'eclipse', 'founding', 'rebellion', 'uprising', 'massacre', 
        'summit', 'journey', 'voyage', 'expedition', 'incident', 'tragedy', 'celebration', 'festival'
    ];
    
    if (locationKeywords.some(kw => text.includes(kw))) {
        return 'location';
    }
    if (eventKeywords.some(kw => text.includes(kw))) {
        return 'event';
    }
    return 'artifact_concept';
};

const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const LoreNetwork: React.FC<LoreNetworkProps> = ({ lore, characters, activeProjectId, onSwitchTo3D }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    // Filter states
    const [threshold, setThreshold] = useState<number>(0.45);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
    const [graphViewMode, setGraphViewMode] = useState<'relational' | 'thematic-clusters'>('relational');
    const [activeClusterFilter, setActiveClusterFilter] = useState<string | null>(null);
    const [filterTypes, setFilterTypes] = useState<Record<string, boolean>>({
        character: true,
        location: true,
        event: true,
        artifact_concept: true
    });

    // Embeddings cache
    const [embeddings, setEmbeddings] = useState<Record<string, number[]>>(() => {
        try {
            const cached = localStorage.getItem(`lore_embeddings_${activeProjectId}`);
            return cached ? JSON.parse(cached) : {};
        } catch (e) {
            return {};
        }
    });

    const [isComputing, setIsComputing] = useState<boolean>(false);
    const [computeProgress, setComputeProgress] = useState<string>('');

    // Persisted Node Positions for D3 Force-Directed Graph Layout
    const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>(() => {
        try {
            const cached = localStorage.getItem(`lore_network_positions_${activeProjectId}`);
            return cached ? JSON.parse(cached) : {};
        } catch (e) {
            return {};
        }
    });
    const nodePositionsRef = useRef<Record<string, { x: number; y: number }>>(nodePositions);

    useEffect(() => {
        nodePositionsRef.current = nodePositions;
    }, [nodePositions]);

    const handleResetLayout = () => {
        setNodePositions({});
        nodePositionsRef.current = {};
        try {
            localStorage.removeItem(`lore_network_positions_${activeProjectId}`);
        } catch (e) {}
    };

    // Persist cache updates
    useEffect(() => {
        localStorage.setItem(`lore_embeddings_${activeProjectId}`, JSON.stringify(embeddings));
    }, [embeddings, activeProjectId]);

    const handleDownloadMap = () => {
        if (!svgRef.current) return;

        try {
            const svgEl = svgRef.current;
            
            // Get SVG source code
            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(svgEl);

            // Add namespaces if missing
            if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
                source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            if (!source.match(/^<svg[^>]+xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/)) {
                source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
            }

            // Append XML declaration
            source = '<?xml version="1.0" encoding="utf-8"?>\n' + source;

            // Convert to URL and trigger a virtual download trigger
            const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
            const downloadLink = document.createElement("a");
            downloadLink.href = url;
            downloadLink.download = `lore_network_constellation_${activeProjectId || 'project'}.svg`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch (err) {
            console.error("Failed to export Lore Network map:", err);
            alert("Failed to export network map as SVG.");
        }
    };

    const handleDownloadPNG = () => {
        if (!svgRef.current) return;

        try {
            const svgEl = svgRef.current;
            const serializer = new XMLSerializer();
            let source = serializer.serializeToString(svgEl);

            if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
                source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(svgBlob);

            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = svgEl.clientWidth || 800;
                canvas.height = 550;
                const context = canvas.getContext("2d");
                if (context) {
                    context.fillStyle = "#0a0a0a"; // Solid background so dark UI elements are visible
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0);

                    const pngUrl = canvas.toDataURL("image/png");
                    const downloadLink = document.createElement("a");
                    downloadLink.href = pngUrl;
                    downloadLink.download = `lore_network_constellation_${activeProjectId || 'project'}.png`;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                }
                URL.revokeObjectURL(url);
            };
            image.src = url;
        } catch (err) {
            console.error("Failed to convert Lore Network to PNG:", err);
            alert("Failed to export network map as PNG.");
        }
    };

    // Construct raw nodes representing characters and lore entries
    const allNodes: NetworkNode[] = [
        ...characters.map(c => ({
            id: c.id,
            name: c.name,
            type: 'character' as const,
            description: c.archetype,
            details: c.description
        })),
        ...lore.filter(l => l.projectId === activeProjectId).map(l => {
            const type = categorizeLore(l.title, l.content);
            return {
                id: l.id,
                name: l.title,
                type,
                description: type.toUpperCase().replace('_', ' '),
                details: l.content
            };
        })
    ];

    // Compute embeddings for any node lacking cache entries
    const computeMissingEmbeddings = async () => {
        const missingNodes = allNodes.filter(n => !embeddings[n.id]);
        if (missingNodes.length === 0) {
            alert("All lore elements are already embedded. Enjoy the semantic network!");
            return;
        }

        setIsComputing(true);
        setComputeProgress(`Preparing to embed ${missingNodes.length} elements...`);

        try {
            const batchSize = 10;
            const updatedEmbeddings = { ...embeddings };

            for (let i = 0; i < missingNodes.length; i += batchSize) {
                const batch = missingNodes.slice(i, i + batchSize);
                setComputeProgress(`Processing semantic vector batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missingNodes.length / batchSize)}...`);

                const texts = batch.map(n => `${n.name}\n${n.description}\n${n.details || ''}`);
                
                const res = await fetch('/api/embed-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ texts })
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Batch embedding calculation failed");
                }

                const data = await res.json();
                if (data.embeddings && Array.isArray(data.embeddings)) {
                    batch.forEach((node, index) => {
                        if (data.embeddings[index]) {
                            updatedEmbeddings[node.id] = data.embeddings[index];
                        }
                    });
                }
            }

            setEmbeddings(updatedEmbeddings);
            setComputeProgress('');
        } catch (err) {
            console.error("Embedding computations failed:", err);
            alert(`Semantic analysis failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsComputing(false);
        }
    };

    // Helper to extract metadata cluster for each node
    const getNodeClusterName = (nodeId: string, nodeType: string, nodeTitle: string, nodeDetails?: string): string => {
        const l = lore.find(x => x.id === nodeId);
        if (l) {
            if (l.cluster && l.cluster.trim()) return l.cluster.trim();
            if (l.tags && l.tags.length > 0 && l.tags[0].trim()) {
                const tag = l.tags[0].trim();
                return tag.charAt(0).toUpperCase() + tag.slice(1);
            }
            const cat = categorizeLore(l.title, l.content);
            if (cat === 'location') return 'Geographic Realms & Strongholds';
            if (cat === 'event') return 'Historical Battles & Chronology';
            return 'Relics & Mythic Artifacts';
        }
        const c = characters.find(x => x.id === nodeId);
        if (c) {
            if (c.cluster && c.cluster.trim()) return c.cluster.trim();
            if (c.archetype && c.archetype.trim()) return `${c.archetype} Archetype`;
            if (c.tags && c.tags.length > 0 && c.tags[0].trim()) {
                const tag = c.tags[0].trim();
                return tag.charAt(0).toUpperCase() + tag.slice(1);
            }
            return 'Character Protagonists & Allies';
        }
        return 'General Canon';
    };

    // Calculate metadata cluster groups and density percentages
    const clustersList = React.useMemo(() => {
        const map: Record<string, NetworkNode[]> = {};
        allNodes.forEach(n => {
            const clName = getNodeClusterName(n.id, n.type, n.name, n.details);
            if (!map[clName]) map[clName] = [];
            map[clName].push(n);
        });
        const total = Math.max(1, allNodes.length);
        return Object.entries(map).map(([name, nodes], idx) => {
            const pal = CLUSTER_THEME_PALETTE[idx % CLUSTER_THEME_PALETTE.length];
            return {
                id: name,
                name,
                nodes,
                count: nodes.length,
                densityPct: Math.round((nodes.length / total) * 100),
                color: pal.color,
                fill: pal.fill,
                stroke: pal.stroke,
                hex: pal.hex,
                badge: pal.badge
            };
        }).sort((a, b) => b.count - a.count);
    }, [allNodes, lore, characters]);

    // Filter nodes based on checkboxes, active cluster, and search query
    const filteredNodes = allNodes.filter(node => {
        if (!filterTypes[node.type]) return false;
        if (activeClusterFilter && getNodeClusterName(node.id, node.type, node.name, node.details) !== activeClusterFilter) {
            return false;
        }
        if (searchQuery.trim() !== '') {
            const q = searchQuery.toLowerCase();
            return node.name.toLowerCase().includes(q) || (node.details || '').toLowerCase().includes(q);
        }
        return true;
    });

    // Compute links based on cosine similarities of cached 3072D embeddings
    const links: NetworkLink[] = [];
    if (filteredNodes.length > 1) {
        for (let i = 0; i < filteredNodes.length; i++) {
            for (let j = i + 1; j < filteredNodes.length; j++) {
                const u = filteredNodes[i];
                const v = filteredNodes[j];
                const vecU = embeddings[u.id];
                const vecV = embeddings[v.id];

                const clusterU = getNodeClusterName(u.id, u.type, u.name, u.details);
                const clusterV = getNodeClusterName(v.id, v.type, v.name, v.details);
                const isSameCluster = clusterU === clusterV;
                const clusterMatch = clustersList.find(c => c.name === clusterU);

                if (vecU && vecV) {
                    const similarity = cosineSimilarity(vecU, vecV);
                    if (similarity >= threshold || (graphViewMode === 'thematic-clusters' && isSameCluster && similarity >= threshold * 0.75)) {
                        links.push({
                            source: u.id,
                            target: v.id,
                            similarity,
                            isSameCluster,
                            clusterColor: clusterMatch ? clusterMatch.color : '#818cf8'
                        });
                    }
                } else if (graphViewMode === 'thematic-clusters' && isSameCluster) {
                    links.push({
                        source: u.id,
                        target: v.id,
                        similarity: 0.8,
                        isSameCluster: true,
                        clusterColor: clusterMatch ? clusterMatch.color : '#818cf8'
                    });
                }
            }
        }
    }

    // D3 Simulation setup
    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 800;
        const height = 550;

        const svg = d3.select(svgRef.current)
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("width", width)
            .attr("height", height);

        // Clear previous graph elements
        svg.selectAll('*').remove();

        // Create main container group to support zooming
        const containerGroup = svg.append("g");

        // Set up zoom handler
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                containerGroup.attr("transform", event.transform);
            });

        svg.call(zoom as any);

        // Define linear gradients for edges
        const defs = svg.append("defs");
        const edgeGradient = defs.append("linearGradient")
            .attr("id", "edge-grad")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "100%");
        edgeGradient.append("stop").attr("offset", "0%").attr("stop-color", "#312e81").attr("stop-opacity", 0.4);
        edgeGradient.append("stop").attr("offset", "100%").attr("stop-color", "#1e1b4b").attr("stop-opacity", 0.4);

        // Highlight gradient
        const highlightGrad = defs.append("linearGradient")
            .attr("id", "edge-highlight-grad")
            .attr("x1", "0%").attr("y1", "0%")
            .attr("x2", "100%").attr("y2", "100%");
        highlightGrad.append("stop").attr("offset", "0%").attr("stop-color", "#818cf8").attr("stop-opacity", 0.9);
        highlightGrad.append("stop").attr("offset", "100%").attr("stop-color", "#c084fc").attr("stop-opacity", 0.9);

        // Setup force simulation
        const nodesData = filteredNodes.map(d => {
            const copy = { ...d } as any;
            copy.clusterName = getNodeClusterName(d.id, d.type, d.name, d.details);
            const saved = nodePositionsRef.current[d.id];
            if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
                copy.x = saved.x;
                copy.y = saved.y;
                copy.fx = saved.x;
                copy.fy = saved.y;
            }
            return copy;
        });
        
        // Match string references back to object references
        const linksData = links.map(l => {
            const srcId = typeof l.source === 'string' ? l.source : (l.source as any).id;
            const tgtId = typeof l.target === 'string' ? l.target : (l.target as any).id;
            return {
                source: nodesData.find(n => n.id === srcId)!,
                target: nodesData.find(n => n.id === tgtId)!,
                similarity: l.similarity,
                isSameCluster: l.isSameCluster,
                clusterColor: l.clusterColor
            };
        }).filter(l => l.source && l.target);

        const isClusterMode = graphViewMode === 'thematic-clusters';

        // Calculate cluster centroids across 2D canvas for thematic density clustering
        const clusterCentroids: Record<string, { x: number; y: number }> = {};
        if (isClusterMode) {
            const numClusters = Math.max(1, clustersList.length);
            const radius = Math.min(width, height) * 0.33;
            clustersList.forEach((cl, idx) => {
                const angle = (idx / numClusters) * 2 * Math.PI - Math.PI / 2;
                clusterCentroids[cl.name] = {
                    x: width / 2 + Math.cos(angle) * radius,
                    y: height / 2 + Math.sin(angle) * radius
                };
            });

            // Draw 2D density background contours and cluster identity hubs
            const clusterBgGroup = containerGroup.append("g").attr("class", "thematic-clusters-bg");
            clustersList.forEach(cl => {
                const centroid = clusterCentroids[cl.name];
                if (!centroid) return;
                const bubbleRadius = Math.max(65, Math.min(185, Math.sqrt(cl.count) * 44));
                const g = clusterBgGroup.append("g").attr("class", "cluster-bubble");

                // Translucent density hull circle
                g.append("circle")
                    .attr("cx", centroid.x)
                    .attr("cy", centroid.y)
                    .attr("r", bubbleRadius)
                    .attr("fill", cl.fill)
                    .attr("stroke", cl.stroke)
                    .attr("stroke-width", 1.8)
                    .attr("stroke-dasharray", "5 5")
                    .attr("stroke-opacity", 0.65);

                // Cluster Header Badge with metadata title & density index
                const labelWidth = Math.min(220, Math.max(120, cl.name.length * 7.5 + 40));
                g.append("rect")
                    .attr("x", centroid.x - labelWidth / 2)
                    .attr("y", centroid.y - bubbleRadius - 14)
                    .attr("width", labelWidth)
                    .attr("height", 22)
                    .attr("rx", 11)
                    .attr("fill", "#09090b")
                    .attr("stroke", cl.stroke)
                    .attr("stroke-width", 1.4);

                g.append("text")
                    .attr("x", centroid.x)
                    .attr("y", centroid.y - bubbleRadius)
                    .attr("text-anchor", "middle")
                    .attr("fill", cl.color)
                    .attr("font-size", "9.5px")
                    .attr("font-weight", "black")
                    .attr("letter-spacing", "0.5px")
                    .attr("pointer-events", "none")
                    .text(`${cl.name} (${cl.count} • ${cl.densityPct}%)`);
            });
        }

        const simulation = d3.forceSimulation(nodesData as any);

        if (isClusterMode) {
            simulation
                .force("clusterX", d3.forceX((d: any) => clusterCentroids[d.clusterName]?.x || width / 2).strength(0.72))
                .force("clusterY", d3.forceY((d: any) => clusterCentroids[d.clusterName]?.y || height / 2).strength(0.72))
                .force("charge", d3.forceManyBody().strength(-140))
                .force("collision", d3.forceCollide().radius(36).strength(0.85))
                .force("link", d3.forceLink(linksData).distance(75).strength(0.35));
        } else {
            simulation
                .force("link", d3.forceLink(linksData).distance(130).strength(0.5))
                .force("charge", d3.forceManyBody().strength(-280))
                .force("center", d3.forceCenter(width / 2, height / 2))
                .force("collision", d3.forceCollide().radius(40));
        }

        // Draw Links (lines)
        const link = containerGroup.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(linksData)
            .enter().append("line")
            .attr("stroke", (d: any) => {
                if (isClusterMode && d.isSameCluster && d.clusterColor) {
                    return d.clusterColor;
                }
                return "url(#edge-grad)";
            })
            .attr("stroke-width", (d: any) => Math.max(1, (d.similarity - 0.3) * 6))
            .attr("stroke-opacity", (d: any) => isClusterMode ? (d.isSameCluster ? 0.75 : 0.12) : 0.6)
            .attr("class", "transition-all duration-300");

        const tooltip = d3.select(tooltipRef.current);

        // Create group nodes
        const node = containerGroup.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(nodesData)
            .enter().append("g")
            .attr("cursor", "pointer")
            .attr("class", "group")
            .on("click", (event, d: any) => {
                event.stopPropagation();
                setSelectedNode(d);
                highlightConnections(d);
            })
            .on("mouseover", (event, d: any) => {
                // Compile the HTML content for tooltip
                let htmlContent = `
                    <div class="flex items-start gap-2.5">
                `;
                
                if (d.type === 'character') {
                    // Try to find full character details for avatar image
                    const fullChar = characters.find(c => c.id === d.id);
                    if (fullChar && fullChar.avatar) {
                        htmlContent += `
                            <img src="${fullChar.avatar.startsWith('data:') ? fullChar.avatar : 'data:image/jpeg;base64,' + fullChar.avatar}" 
                                 class="w-10 h-10 rounded-md object-cover border border-purple-500/30 flex-shrink-0" 
                                 alt="${d.name}" />
                        `;
                    }
                }

                htmlContent += `
                        <div class="space-y-0.5">
                            <span class="text-[9px] uppercase tracking-wider font-mono font-black text-neutral-400">
                                ${d.type.replace('_', ' ')}
                            </span>
                            <h5 class="text-xs font-black text-white leading-tight">${d.name}</h5>
                            <span class="text-[9px] font-bold text-neutral-400 font-mono tracking-wide block">${d.description}</span>
                        </div>
                    </div>
                    <p class="text-[11px] text-neutral-300 leading-relaxed border-t border-neutral-800 pt-2 mt-2">
                        ${d.details ? (d.details.length > 140 ? d.details.substring(0, 137) + '...' : d.details) : 'No details provided.'}
                    </p>
                `;

                // Add connection metadata if cached embeddings are ready
                const vecSel = embeddings[d.id];
                if (vecSel) {
                    const connectionsCount = allNodes.filter(n => {
                        const vecN = embeddings[n.id];
                        if (!vecN || n.id === d.id) return false;
                        return cosineSimilarity(vecSel, vecN) >= threshold;
                    }).length;
                    
                    htmlContent += `
                        <div class="flex justify-between items-center text-[9px] text-neutral-500 font-bold border-t border-neutral-800/60 pt-1.5 mt-1.5">
                            <span>Relational Affinity</span>
                            <span class="text-purple-400 font-mono font-black">${connectionsCount} links</span>
                        </div>
                    `;
                }

                const [x, y] = d3.pointer(event, containerRef.current);
                tooltip.html(htmlContent)
                    .style("left", `${x + 15}px`)
                    .style("top", `${y + 15}px`)
                    .classed("hidden", false)
                    .style("opacity", 1.0);
            })
            .on("mousemove", (event) => {
                const [x, y] = d3.pointer(event, containerRef.current);
                tooltip
                    .style("left", `${x + 15}px`)
                    .style("top", `${y + 15}px`);
            })
            .on("mouseout", () => {
                tooltip
                    .style("opacity", 0)
                    .classed("hidden", true);
            });

        // Add node background circle
        node.append("circle")
            .attr("r", 18)
            .attr("fill", "#0a0a0a")
            .attr("stroke", (d: any) => CATEGORY_COLORS[d.type].hex)
            .attr("stroke-width", 2.5)
            .attr("class", "transition-all duration-300 hover:scale-125")
            .style("filter", "drop-shadow(0px 0px 4px rgba(0,0,0,0.8))");

        // Centered label letter inside node
        node.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", ".3em")
            .attr("fill", "#f5f5f5")
            .attr("font-size", "10px")
            .attr("font-weight", "black")
            .attr("pointer-events", "none")
            .text((d: any) => d.name.substring(0, 1).toUpperCase());

        // Node descriptions/titles underneath
        node.append("text")
            .attr("dy", 32)
            .attr("text-anchor", "middle")
            .attr("fill", "#e5e5e5")
            .attr("font-size", "11px")
            .attr("font-weight", "bold")
            .attr("pointer-events", "none")
            .text((d: any) => d.name.length > 15 ? `${d.name.substring(0, 12)}...` : d.name)
            .style("text-shadow", "0px 1px 3px rgba(0,0,0,0.9)");

        // Add small subtitle showing archetype or category
        node.append("text")
            .attr("dy", 43)
            .attr("text-anchor", "middle")
            .attr("fill", (d: any) => CATEGORY_COLORS[d.type].hex)
            .attr("font-size", "8px")
            .attr("font-weight", "black")
            .attr("text-transform", "uppercase")
            .attr("pointer-events", "none")
            .text((d: any) => d.description);

        // Highlight routine for clicked/focused nodes
        function highlightConnections(activeNode: any) {
            // Fade others
            node.style("opacity", (n: any) => {
                if (n.id === activeNode.id) return 1.0;
                const isConnected = linksData.some(l => 
                    (l.source.id === activeNode.id && l.target.id === n.id) ||
                    (l.target.id === activeNode.id && l.source.id === n.id)
                );
                return isConnected ? 1.0 : 0.15;
            });

            link
                .attr("stroke", (l: any) => {
                    const isRelated = l.source.id === activeNode.id || l.target.id === activeNode.id;
                    return isRelated ? "url(#edge-highlight-grad)" : "url(#edge-grad)";
                })
                .attr("stroke-opacity", (l: any) => {
                    const isRelated = l.source.id === activeNode.id || l.target.id === activeNode.id;
                    return isRelated ? 1.0 : 0.05;
                });
        }

        // Reset highlights when clicking background
        svg.on("click", () => {
            setSelectedNode(null);
            node.style("opacity", 1.0);
            link.attr("stroke", "url(#edge-grad)").attr("stroke-opacity", 0.6);
        });

        // Drag handlers
        const drag = d3.drag()
            .on("start", (event, d: any) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", (event, d: any) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on("end", (event, d: any) => {
                if (!event.active) simulation.alphaTarget(0);
                const finalX = Math.round(event.x);
                const finalY = Math.round(event.y);
                d.fx = finalX;
                d.fy = finalY;

                const next = {
                    ...nodePositionsRef.current,
                    [d.id]: { x: finalX, y: finalY }
                };
                nodePositionsRef.current = next;
                setNodePositions(next);
                try {
                    localStorage.setItem(`lore_network_positions_${activeProjectId}`, JSON.stringify(next));
                } catch (e) {}
            });

        node.call(drag as any);

        // Update forces on each tick
        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y);

            node
                .attr("transform", (d: any) => `translate(${d.x},${d.y})`);
        });

        return () => {
            simulation.stop();
        };
    }, [filteredNodes, links, threshold, graphViewMode, activeClusterFilter]);

    // Gather connection lists of the currently selected element
    const directConnections = selectedNode 
        ? allNodes.filter(n => {
            const vecSel = embeddings[selectedNode.id];
            const vecN = embeddings[n.id];
            if (!vecSel || !vecN || n.id === selectedNode.id) return false;
            return cosineSimilarity(vecSel, vecN) >= threshold;
        }).map(n => ({
            node: n,
            score: cosineSimilarity(embeddings[selectedNode.id], embeddings[n.id])
        })).sort((a, b) => b.score - a.score)
        : [];

    return (
        <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                    <div>
                        <h3 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
                            <span>🔮 Lore Network</span>
                            <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 font-black uppercase px-2 py-0.5 rounded-full tracking-wider font-mono">
                                Gemini Embedding 2 (3072D)
                            </span>
                        </h3>
                        <p className="text-xs text-neutral-400 mt-1">
                            Interactive semantic constellation graph mapping relational clusters and thematic linkages based on cosine similarity of 3072-dimensional vector embeddings.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* 2D View Mode Toggle: Relational Graph vs Thematic Clusters */}
                        <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-neutral-800">
                            <button
                                type="button"
                                onClick={() => { setGraphViewMode('relational'); setActiveClusterFilter(null); }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                    graphViewMode === 'relational'
                                        ? 'bg-purple-600 text-white shadow-md'
                                        : 'text-neutral-400 hover:text-white'
                                }`}
                                title="Relational Graph (Cosine Similarity Force-Directed Constellation)"
                            >
                                <span>🕸️</span>
                                <span>Relational Graph</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setGraphViewMode('thematic-clusters')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                    graphViewMode === 'thematic-clusters'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'text-neutral-400 hover:text-white'
                                }`}
                                title="Thematic Clusters (2D Density Clustering by Metadata)"
                            >
                                <span>🧬</span>
                                <span>Thematic Clusters</span>
                            </button>
                        </div>

                        {onSwitchTo3D && (
                            <button
                                onClick={onSwitchTo3D}
                                className="px-3.5 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                                title="Open 3D Force-Directed Cosmos Visualization"
                            >
                                <span>🪐</span>
                                <span>Switch to 3D Cosmos</span>
                            </button>
                        )}

                        <button
                            onClick={handleDownloadMap}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/80 font-bold text-xs rounded-lg shadow-md transition-all flex items-center gap-1.5"
                            title="Export map as high-resolution vector SVG"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>Download SVG</span>
                        </button>

                        <button
                            onClick={handleDownloadPNG}
                            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700/80 font-bold text-xs rounded-lg shadow-md transition-all flex items-center gap-1.5"
                            title="Export map as presentation-ready PNG"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span>Download PNG</span>
                        </button>

                        {Object.keys(nodePositions).length > 0 && (
                            <button
                                onClick={handleResetLayout}
                                className="px-3 py-1.5 bg-neutral-800 hover:bg-rose-950/60 text-neutral-300 hover:text-rose-400 border border-neutral-700/80 hover:border-rose-800 font-bold text-xs rounded-lg shadow-md transition-all flex items-center gap-1.5"
                                title="Reset all manually positioned/pinned nodes to automatic layout"
                            >
                                <span>↺</span> Reset Layout ({Object.keys(nodePositions).length})
                            </button>
                        )}

                        <button
                            onClick={computeMissingEmbeddings}
                            disabled={isComputing}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-lg shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            <span>⚡ Map Semantics</span>
                        </button>
                    </div>
                </div>

                {isComputing && (
                    <div className="bg-purple-950/20 border border-purple-500/20 p-4 rounded-lg flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-purple-300 font-medium">{computeProgress}</span>
                    </div>
                )}

                {/* THEMATIC CLUSTERS 2D DENSITY CONTROL BAR */}
                {graphViewMode === 'thematic-clusters' && (
                    <div className="bg-indigo-950/30 border border-indigo-800/50 rounded-xl p-4 space-y-3 animate-fadeIn">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-900/40 pb-2.5">
                            <div className="flex items-center gap-2">
                                <span className="text-sm">🧬</span>
                                <span className="text-xs font-black uppercase text-indigo-300 font-mono tracking-wider">
                                    Thematic Density Clusters (Metadata Grouping)
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                    • Related lore entries and characters grouped by metadata tags, categories, and archetypes in 2D density space
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono">
                                <span className="text-neutral-400">
                                    Total Clusters: <strong className="text-white">{clustersList.length}</strong>
                                </span>
                                {clustersList[0] && (
                                    <span className="text-neutral-400">
                                        Densest: <strong className="text-indigo-300">{clustersList[0].name} ({clustersList[0].densityPct}%)</strong>
                                    </span>
                                )}
                                {activeClusterFilter && (
                                    <button
                                        type="button"
                                        onClick={() => setActiveClusterFilter(null)}
                                        className="text-xs text-rose-400 hover:text-rose-300 font-bold ml-2 underline cursor-pointer"
                                    >
                                        ✕ Clear Filter
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Cluster Density Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                            {clustersList.map(cl => {
                                const isSelected = activeClusterFilter === cl.name;
                                return (
                                    <button
                                        key={cl.name}
                                        type="button"
                                        onClick={() => setActiveClusterFilter(isSelected ? null : cl.name)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 cursor-pointer ${
                                            isSelected
                                                ? 'bg-white text-black border-white shadow-lg scale-105'
                                                : `${cl.badge} hover:brightness-125`
                                        }`}
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cl.color }}></span>
                                        <span>{cl.name}</span>
                                        <span className="font-mono text-[10px] opacity-80">
                                            {cl.count} ({cl.densityPct}%)
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Filters block */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-neutral-950/50 p-4 rounded-lg border border-neutral-850">
                    {/* Checkboxes */}
                    <div className="space-y-2">
                        <span className="block text-[10px] font-black uppercase text-neutral-500 tracking-wider">Node Type Filter</span>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.keys(filterTypes).map(type => (
                                <label key={type} className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={filterTypes[type]}
                                        onChange={() => setFilterTypes(prev => ({ ...prev, [type]: !prev[type] }))}
                                        className="rounded border-neutral-800 bg-black text-purple-600 focus:ring-purple-500/50 focus:ring-offset-black"
                                    />
                                    <span className={`text-xs font-bold capitalize transition-colors ${CATEGORY_COLORS[type].text} group-hover:text-white`}>
                                        {type.replace('_', ' ')}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Similarity Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase text-neutral-500 tracking-wider">
                            <span>Similarity Threshold</span>
                            <span className="text-purple-400 font-mono font-bold">{(threshold * 100).toFixed(0)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0.30"
                            max="0.90"
                            step="0.05"
                            value={threshold}
                            onChange={(e) => setThreshold(parseFloat(e.target.value))}
                            className="w-full accent-purple-600 bg-neutral-800"
                        />
                        <div className="flex justify-between text-[8px] text-neutral-500 font-black tracking-widest font-mono">
                            <span>LOOSE CLUSTERING</span>
                            <span>TIGHT CLUSTERING</span>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="space-y-2">
                        <span className="block text-[10px] font-black uppercase text-neutral-500 tracking-wider">Search Node</span>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Type name, location, or lore..."
                            className="w-full bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-200 p-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                    </div>
                </div>

                {/* Graph Workspace Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div ref={containerRef} className="relative lg:col-span-3 bg-black/40 border border-neutral-850/80 rounded-xl overflow-hidden h-[550px] shadow-inner">
                        <svg ref={svgRef} className="w-full h-full" />
                        
                        {/* Interactive Absolute Tooltip */}
                        <div 
                          ref={tooltipRef}
                          className="absolute hidden pointer-events-none bg-neutral-950/95 border border-neutral-800 p-3 rounded-lg shadow-2xl z-50 text-xs w-64 space-y-2 max-w-sm transition-all duration-150"
                          style={{ backdropFilter: 'blur(8px)' }}
                        />
                        
                        <div className="absolute bottom-4 left-4 flex gap-3 text-[10px] text-neutral-400 font-bold bg-neutral-900/95 border border-neutral-800 p-3 rounded-lg backdrop-blur-md shadow-lg pointer-events-none">
                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block border border-purple-400/40" />Characters</div>
                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block border border-emerald-400/40" />Locations</div>
                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block border border-rose-400/40" />Events</div>
                            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block border border-amber-400/40" />Artifacts</div>
                        </div>

                        {filteredNodes.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-black/60 backdrop-blur-xs">
                                <span className="text-4xl"> Constellation Empty</span>
                                <h4 className="text-md font-bold text-neutral-400 mt-3">No Elements Matched</h4>
                                <p className="text-xs text-neutral-500 mt-1">Adjust your node type filters or search query to begin modeling.</p>
                            </div>
                        )}
                    </div>

                    {/* Detailed info panel */}
                    <div className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-4 h-[550px] flex flex-col overflow-hidden">
                        {selectedNode ? (
                            <div className="flex flex-col h-full space-y-4">
                                <div className="border-b border-neutral-850 pb-3">
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${CATEGORY_COLORS[selectedNode.type].border} bg-neutral-900 inline-block tracking-wider mb-2 ${CATEGORY_COLORS[selectedNode.type].text}`}>
                                        {selectedNode.type.replace('_', ' ')}
                                    </span>
                                    <h4 className="text-base font-bold text-neutral-100">{selectedNode.name}</h4>
                                    <p className="text-[10px] text-neutral-500 font-mono tracking-wider font-bold mt-0.5">{selectedNode.description}</p>
                                </div>

                                <div className="flex-grow overflow-y-auto custom-scrollbar text-xs text-neutral-300 space-y-4 pr-1">
                                    <p className="whitespace-pre-wrap leading-relaxed bg-neutral-900/30 p-2.5 rounded-lg border border-neutral-900">{selectedNode.details || 'No details provided.'}</p>

                                    <div className="space-y-2 pt-2 border-t border-neutral-900">
                                        <h5 className="text-[10px] font-black uppercase text-neutral-500 tracking-wider">Semantic Connections ({directConnections.length})</h5>
                                        <div className="space-y-1.5">
                                            {directConnections.map(({ node: n, score }) => (
                                                <div 
                                                    key={n.id} 
                                                    onClick={() => setSelectedNode(n)}
                                                    className="p-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-850/50 hover:border-neutral-700/50 rounded-lg flex justify-between items-center transition-all cursor-pointer"
                                                >
                                                    <div>
                                                        <span className="text-xs font-bold text-neutral-200 block truncate max-w-[120px]">{n.name}</span>
                                                        <span className={`text-[8px] font-bold capitalize ${CATEGORY_COLORS[n.type].text}`}>{n.type.replace('_', ' ')}</span>
                                                    </div>
                                                    <span className="text-[10px] font-mono text-purple-400 font-bold bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/10">
                                                        {(score * 100).toFixed(0)}%
                                                    </span>
                                                </div>
                                            ))}
                                            {directConnections.length === 0 && (
                                                <div className="text-[10px] text-neutral-600 italic text-center py-4">No connections found above the threshold similarity.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center h-full text-neutral-500 space-y-3">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                                </svg>
                                <div>
                                    <h4 className="text-xs font-bold text-neutral-400">Constellation Reader</h4>
                                    <p className="text-[10px] text-neutral-500 mt-1 max-w-[160px] mx-auto leading-relaxed">Click any node or link in the semantic vector network to analyze connection details and cosine scores.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
