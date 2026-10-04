import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { TripletEdge } from '../types';

export interface ContradictionSubgraphProps {
    discrepancies: any[];
    tripletEdges?: TripletEdge[];
    onResolveDiscrepancy?: (id: string) => void;
}

interface SubgraphNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    type: 'conflict_entity' | 'conflict_event' | 'context_entity';
    severity?: 'high' | 'medium' | 'low';
    discrepancyId?: string;
    details?: any;
    radius: number;
}

interface SubgraphLink extends d3.SimulationLinkDatum<SubgraphNode> {
    source: string | SubgraphNode;
    target: string | SubgraphNode;
    relation: string;
    isConflict: boolean;
}

export const ContradictionSubgraphGraph: React.FC<ContradictionSubgraphProps> = ({
    discrepancies,
    tripletEdges = [],
    onResolveDiscrepancy
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [selectedNode, setSelectedNode] = useState<SubgraphNode | null>(null);
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [searchFilter, setSearchFilter] = useState('');

    const unresolved = discrepancies.filter(d => d.status !== 'resolved');

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 800;
        const height = containerRef.current.clientHeight || 520;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('width', '100%')
           .attr('height', height);

        // Filter unresolved by severity
        const activeDiscrepancies = severityFilter === 'all'
            ? unresolved
            : unresolved.filter(d => d.severity === severityFilter);

        // 1. Build Subgraph Nodes & Links
        const nodeMap = new Map<string, SubgraphNode>();
        const links: SubgraphLink[] = [];

        // For each active contradiction, create a conflict event node & conflict entity nodes
        activeDiscrepancies.forEach((disc, idx) => {
            const eventId = `event_${disc.id || idx}`;
            const eventNode: SubgraphNode = {
                id: eventId,
                label: `⚠️ Conflict #${idx + 1}`,
                type: 'conflict_event',
                severity: disc.severity || 'high',
                discrepancyId: disc.id,
                details: disc,
                radius: disc.severity === 'high' ? 22 : 18
            };
            nodeMap.set(eventId, eventNode);

            // Extract conflicting entities (from disc.conflictingEntities or keywords in context)
            const entities: string[] = disc.conflictingEntities && disc.conflictingEntities.length > 0
                ? disc.conflictingEntities
                : [disc.source?.replace(/\.[^/.]+$/, "") || 'Primary Source', 'World Canon'];

            entities.forEach(ent => {
                const entKey = `ent_${ent.trim().toLowerCase()}`;
                if (!nodeMap.has(entKey)) {
                    nodeMap.set(entKey, {
                        id: entKey,
                        label: ent.trim(),
                        type: 'conflict_entity',
                        severity: disc.severity,
                        discrepancyId: disc.id,
                        details: disc,
                        radius: 20
                    });
                }

                // Connect entity to conflict event
                links.push({
                    source: entKey,
                    target: eventId,
                    relation: 'CONFLICTS_IN',
                    isConflict: true
                });
            });

            // If at least 2 entities, link them directly with contradiction edge
            if (entities.length >= 2) {
                const e1 = `ent_${entities[0].trim().toLowerCase()}`;
                const e2 = `ent_${entities[1].trim().toLowerCase()}`;
                links.push({
                    source: e1,
                    target: e2,
                    relation: 'CONTRADICTS',
                    isConflict: true
                });
            }
        });

        // Add neighboring context nodes from existing triplet edges
        const conflictEntityNames = Array.from(nodeMap.values())
            .filter(n => n.type === 'conflict_entity')
            .map(n => n.label.toLowerCase());

        tripletEdges.slice(0, 40).forEach(edge => {
            const sName = edge.s.trim();
            const oName = edge.o.trim();
            const sMatch = conflictEntityNames.includes(sName.toLowerCase());
            const oMatch = conflictEntityNames.includes(oName.toLowerCase());

            if (sMatch || oMatch) {
                const sKey = `ctx_${sName.toLowerCase()}`;
                const oKey = `ctx_${oName.toLowerCase()}`;

                if (!nodeMap.has(sKey)) {
                    nodeMap.set(sKey, {
                        id: sKey,
                        label: sName,
                        type: sMatch ? 'conflict_entity' : 'context_entity',
                        radius: 12
                    });
                }
                if (!nodeMap.has(oKey)) {
                    nodeMap.set(oKey, {
                        id: oKey,
                        label: oName,
                        type: oMatch ? 'conflict_entity' : 'context_entity',
                        radius: 12
                    });
                }

                links.push({
                    source: sKey,
                    target: oKey,
                    relation: edge.p,
                    isConflict: false
                });
            }
        });

        const nodes = Array.from(nodeMap.values());

        // Defs: Filters, Arrowheads, Glows
        const defs = svg.append('defs');

        // Red Glow for Conflicting Nodes
        const glowFilter = defs.append('filter')
            .attr('id', 'red-conflict-glow')
            .attr('x', '-50%')
            .attr('y', '-50%')
            .attr('width', '200%')
            .attr('height', '200%');

        glowFilter.append('feGaussianBlur')
            .attr('stdDeviation', '4')
            .attr('result', 'coloredBlur');
        const feMerge = glowFilter.append('feMerge');
        feMerge.append('feMergeNode').attr('in', 'coloredBlur');
        feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

        // Conflict arrow marker
        defs.append('marker')
            .attr('id', 'arrow-conflict')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 22)
            .attr('refY', 0)
            .attr('markerWidth', 6)
            .attr('markerHeight', 6)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#ef4444');

        // Context arrow marker
        defs.append('marker')
            .attr('id', 'arrow-context')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 18)
            .attr('refY', 0)
            .attr('markerWidth', 5)
            .attr('markerHeight', 5)
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#525252');

        const g = svg.append('g').attr('class', 'subgraph-container');

        // Zoom Behavior
        const zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.4, 3])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Simulation
        const simulation = d3.forceSimulation<SubgraphNode>(nodes)
            .force('link', d3.forceLink<SubgraphNode, SubgraphLink>(links).id(d => d.id).distance(d => d.isConflict ? 95 : 75))
            .force('charge', d3.forceManyBody().strength(-240))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(d => (d as SubgraphNode).radius + 18));

        // Links
        const link = g.append('g')
            .selectAll('line')
            .data(links)
            .enter()
            .append('line')
            .attr('stroke', d => d.isConflict ? '#ef4444' : '#404040')
            .attr('stroke-width', d => d.isConflict ? 2.5 : 1)
            .attr('stroke-dasharray', d => d.isConflict ? '5,4' : 'none')
            .attr('stroke-opacity', d => d.isConflict ? 0.9 : 0.4)
            .attr('marker-end', d => d.isConflict ? 'url(#arrow-conflict)' : 'url(#arrow-context)');

        // Link labels for conflicts
        const linkLabel = g.append('g')
            .selectAll('text')
            .data(links.filter(l => l.isConflict))
            .enter()
            .append('text')
            .attr('font-size', '8px')
            .attr('font-family', 'monospace')
            .attr('font-weight', '900')
            .attr('fill', '#ef4444')
            .attr('text-anchor', 'middle')
            .attr('dy', -3)
            .text(d => d.relation);

        // Drag handlers
        const drag = d3.drag<SVGGElement, SubgraphNode>()
            .on('start', (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            });

        // Nodes
        const node = g.append('g')
            .selectAll('.node')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node cursor-pointer')
            .call(drag)
            .on('click', (_event, d) => setSelectedNode(d));

        // Pulsing outer warning ring for conflicts
        node.filter(d => d.type !== 'context_entity')
            .append('circle')
            .attr('r', d => d.radius + 6)
            .attr('fill', 'none')
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '3,3')
            .attr('opacity', 0.8)
            .attr('class', 'animate-pulse');

        // Node circle
        node.append('circle')
            .attr('r', d => d.radius)
            .attr('fill', d => {
                if (d.type === 'conflict_event') return '#7f1d1d';
                if (d.type === 'conflict_entity') return '#ef4444';
                return '#262626';
            })
            .attr('stroke', d => {
                if (d.type === 'conflict_event') return '#f87171';
                if (d.type === 'conflict_entity') return '#ffffff';
                return '#525252';
            })
            .attr('stroke-width', d => d.type !== 'context_entity' ? 2 : 1)
            .attr('filter', d => d.type !== 'context_entity' ? 'url(#red-conflict-glow)' : 'none');

        // Node icon / symbol in center
        node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('font-size', d => d.type === 'conflict_event' ? '11px' : '9px')
            .attr('fill', '#ffffff')
            .attr('font-weight', 'bold')
            .text(d => {
                if (d.type === 'conflict_event') return '⚡';
                if (d.type === 'conflict_entity') return '⚠️';
                return '•';
            });

        // Node labels
        node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', d => d.radius + 12)
            .attr('font-size', '9px')
            .attr('font-weight', '800')
            .attr('fill', d => d.type !== 'context_entity' ? '#fca5a5' : '#a3a3a3')
            .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '...' : d.label);

        simulation.on('tick', () => {
            link
                .attr('x1', d => (d.source as SubgraphNode).x || 0)
                .attr('y1', d => (d.source as SubgraphNode).y || 0)
                .attr('x2', d => (d.target as SubgraphNode).x || 0)
                .attr('y2', d => (d.target as SubgraphNode).y || 0);

            linkLabel
                .attr('x', d => (((d.source as SubgraphNode).x || 0) + ((d.target as SubgraphNode).x || 0)) / 2)
                .attr('y', d => (((d.source as SubgraphNode).y || 0) + ((d.target as SubgraphNode).y || 0)) / 2);

            node.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
        });

        return () => {
            simulation.stop();
        };
    }, [discrepancies, tripletEdges, severityFilter]);

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl relative flex flex-col font-sans space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-neutral-800 pb-3">
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <span className="text-red-500">🕸️</span> Factual Contradictions Subgraph
                        <span className="text-[9px] bg-red-950/80 text-red-400 border border-red-900/60 font-mono px-2 py-0.5 rounded-full uppercase">
                            Conflict Priority Mode
                        </span>
                    </h3>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                        D3 subgraph isolating contradictory entities in red with their relational links
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500 font-bold uppercase">Severity:</span>
                    <div className="flex bg-black/50 p-1 rounded-xl border border-neutral-800">
                        {(['all', 'high', 'medium', 'low'] as const).map(sev => (
                            <button
                                key={sev}
                                onClick={() => setSeverityFilter(sev)}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition ${
                                    severityFilter === sev
                                        ? 'bg-red-600 text-white shadow-md'
                                        : 'text-neutral-500 hover:text-white'
                                }`}
                            >
                                {sev}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* D3 Graph Viewport */}
            <div ref={containerRef} className="w-full relative h-[480px] bg-neutral-950 rounded-xl border border-neutral-850 overflow-hidden flex items-center justify-center">
                <svg ref={svgRef} className="w-full h-full" />

                {/* Subgraph Legend */}
                <div className="absolute top-3 left-3 bg-black/80 border border-neutral-800/80 p-2.5 rounded-xl backdrop-blur-md text-[9px] space-y-1.5 font-mono text-neutral-400 pointer-events-none">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                        <span className="text-white font-bold">Conflicting Entity</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-900 border border-red-500" />
                        <span className="text-red-300 font-bold">Contradiction Event</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-700" />
                        <span>Connected Context</span>
                    </div>
                </div>

                {/* Selected Node Inspector Drawer */}
                {selectedNode && (
                    <div className="absolute top-3 right-3 bottom-3 w-80 bg-neutral-900/95 border border-red-900/40 p-4 rounded-xl shadow-2xl backdrop-blur-lg flex flex-col justify-between z-20 animate-fade-in overflow-y-auto custom-scrollbar">
                        <div className="space-y-3">
                            <div className="flex justify-between items-start border-b border-neutral-800 pb-2">
                                <div>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-400 block">
                                        {selectedNode.type === 'conflict_event' ? 'Contradiction Alert' : 'Conflicted Entity'}
                                    </span>
                                    <h4 className="text-sm font-bold text-white mt-0.5">{selectedNode.label}</h4>
                                </div>
                                <button
                                    onClick={() => setSelectedNode(null)}
                                    className="text-neutral-500 hover:text-white text-xs font-bold p-1"
                                >
                                    ✕
                                </button>
                            </div>

                            {selectedNode.details ? (
                                <div className="space-y-2 text-xs">
                                    <div>
                                        <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Source Document</span>
                                        <p className="text-[11px] text-neutral-300 truncate">📄 {selectedNode.details.source || 'Script / Intake'}</p>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Conflicting Passage</span>
                                        <p className="text-[10px] font-mono text-neutral-300 bg-black/60 p-2 rounded border border-neutral-800 italic mt-0.5">
                                            "{selectedNode.details.context}"
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-[9px] font-mono text-neutral-500 uppercase font-black">Violation Diagnosis</span>
                                        <p className="text-[11px] text-neutral-400 leading-snug mt-0.5">
                                            {selectedNode.details.explanation || selectedNode.details.reason}
                                        </p>
                                    </div>
                                    {selectedNode.details.suggestedResolution && (
                                        <div>
                                            <span className="text-[9px] font-mono text-emerald-400 uppercase font-black">Suggested Resolution</span>
                                            <p className="text-[11px] text-emerald-300/90 leading-snug mt-0.5 bg-emerald-950/20 p-2 rounded border border-emerald-900/30">
                                                💡 {selectedNode.details.suggestedResolution}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-neutral-400 leading-relaxed">
                                    Contextual lore entity linked directly to contradictory narrative elements. Clean up conflicting links to stabilize this entity's graph position.
                                </p>
                            )}
                        </div>

                        {selectedNode.discrepancyId && onResolveDiscrepancy && (
                            <div className="pt-3 border-t border-neutral-800">
                                <button
                                    onClick={() => {
                                        onResolveDiscrepancy(selectedNode.discrepancyId!);
                                        setSelectedNode(null);
                                    }}
                                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition shadow-lg flex items-center justify-center gap-1.5"
                                >
                                    <span>✓</span> Mark Conflict Resolved
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
