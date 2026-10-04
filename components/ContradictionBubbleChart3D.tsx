import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface ContradictionBubbleItem {
    id: string;
    severity: 'high' | 'medium' | 'low';
    thematicDomain?: string;
    status: string;
    source?: string;
    context?: string;
    explanation?: string;
}

interface ContradictionBubbleChart3DProps {
    discrepancies: ContradictionBubbleItem[];
    onSelectDomain?: (domain: string | null) => void;
    selectedDomain?: string | null;
}

interface DomainNode extends d3.SimulationNodeDatum {
    domain: string;
    count: number;
    highCount: number;
    medCount: number;
    lowCount: number;
    r: number;
    color: string;
    gradientId: string;
    discrepancies: ContradictionBubbleItem[];
}

export const ContradictionBubbleChart3D: React.FC<ContradictionBubbleChart3DProps> = ({
    discrepancies,
    onSelectDomain,
    selectedDomain
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [hoveredNode, setHoveredNode] = useState<DomainNode | null>(null);

    // Filter to unresolved contradictions
    const unresolved = discrepancies.filter(d => d.status !== 'resolved');

    // Aggregate by domain
    const DOMAINS = [
        { name: 'Timeline Errors', baseColor: '#ef4444', gradientId: 'grad-timeline' },
        { name: 'Physical Inconsistencies', baseColor: '#f97316', gradientId: 'grad-physical' },
        { name: 'Character Arc Conflicts', baseColor: '#a855f7', gradientId: 'grad-arc' },
        { name: 'World & Environmental Rules', baseColor: '#3b82f6', gradientId: 'grad-world' },
        { name: 'Faction & Political Alignment', baseColor: '#eab308', gradientId: 'grad-faction' }
    ];

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;

        const width = containerRef.current.clientWidth || 550;
        const height = 340;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        svg.attr('viewBox', `0 0 ${width} ${height}`)
           .attr('width', '100%')
           .attr('height', height);

        // SVG Defs: 3D Spherical Radial Gradients and Glow Filters
        const defs = svg.append('defs');

        // Drop shadow for 3D depth
        const filter = defs.append('filter')
            .attr('id', 'bubble-3d-shadow')
            .attr('x', '-30%')
            .attr('y', '-30%')
            .attr('width', '160%')
            .attr('height', '160%');

        filter.append('feDropShadow')
            .attr('dx', '4')
            .attr('dy', '8')
            .attr('stdDeviation', '6')
            .attr('flood-color', '#000000')
            .attr('flood-opacity', '0.7');

        // Define radial gradients for 3D orb appearance
        DOMAINS.forEach(d => {
            const radGrad = defs.append('radialGradient')
                .attr('id', d.gradientId)
                .attr('cx', '32%')
                .attr('cy', '32%')
                .attr('r', '68%')
                .attr('fx', '28%')
                .attr('fy', '28%');

            // 1. Specular highlight
            radGrad.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', '#ffffff')
                .attr('stop-opacity', '0.85');

            // 2. Light body
            radGrad.append('stop')
                .attr('offset', '25%')
                .attr('stop-color', d.baseColor)
                .attr('stop-opacity', '0.9');

            // 3. Deep spherical shadow
            radGrad.append('stop')
                .attr('offset', '80%')
                .attr('stop-color', d.baseColor)
                .attr('stop-opacity', '0.65');

            // 4. Ambient dark rim
            radGrad.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', '#050505')
                .attr('stop-opacity', '0.95');
        });

        // Prepare data nodes
        const nodes: DomainNode[] = DOMAINS.map(dom => {
            const items = unresolved.filter(item => {
                const itemDom = item.thematicDomain || 'Timeline Errors';
                return itemDom === dom.name;
            });
            const high = items.filter(i => i.severity === 'high').length;
            const med = items.filter(i => i.severity === 'medium').length;
            const low = items.filter(i => i.severity === 'low').length;

            // Radius scales with count, with minimum for aesthetic balance
            const r = items.length === 0 ? 30 : Math.max(36, Math.min(65, 36 + items.length * 10));

            return {
                domain: dom.name,
                count: items.length,
                highCount: high,
                medCount: med,
                lowCount: low,
                r,
                color: dom.baseColor,
                gradientId: dom.gradientId,
                discrepancies: items
            };
        });

        const g = svg.append('g').attr('class', 'chart-group');

        // Force simulation for dynamic positioning
        const simulation = d3.forceSimulation<DomainNode>(nodes)
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('charge', d3.forceManyBody().strength(-80))
            .force('collide', d3.forceCollide<DomainNode>().radius(d => d.r + 14).iterations(3))
            .on('tick', () => {
                nodeGroups.attr('transform', d => {
                    const clampedX = Math.max(d.r + 10, Math.min(width - d.r - 10, d.x || width / 2));
                    const clampedY = Math.max(d.r + 10, Math.min(height - d.r - 10, d.y || height / 2));
                    return `translate(${clampedX},${clampedY})`;
                });
            });

        // Node group
        const nodeGroups = g.selectAll('.node-group')
            .data(nodes)
            .enter()
            .append('g')
            .attr('class', 'node-group cursor-pointer transition-transform duration-200')
            .on('mouseenter', (_event, d) => setHoveredNode(d))
            .on('mouseleave', () => setHoveredNode(null))
            .on('click', (_event, d) => {
                if (onSelectDomain) {
                    onSelectDomain(selectedDomain === d.domain ? null : d.domain);
                }
            });

        // 3D Spherical Outer Glow / Selection Halo
        nodeGroups.append('circle')
            .attr('r', d => d.r + 5)
            .attr('fill', 'none')
            .attr('stroke', d => d.color)
            .attr('stroke-width', d => selectedDomain === d.domain ? 3 : 1)
            .attr('stroke-dasharray', d => selectedDomain === d.domain ? 'none' : '3,3')
            .attr('opacity', d => selectedDomain === d.domain ? 0.9 : 0.3)
            .attr('class', 'selection-halo');

        // 3D Sphere Body with Shadow and Radial Gradient
        nodeGroups.append('circle')
            .attr('r', d => d.r)
            .attr('fill', d => `url(#${d.gradientId})`)
            .attr('filter', 'url(#bubble-3d-shadow)')
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 0.8)
            .attr('stroke-opacity', 0.4);

        // Specular highlight gleam on top right
        nodeGroups.append('ellipse')
            .attr('cx', d => -d.r * 0.3)
            .attr('cy', d => -d.r * 0.35)
            .attr('rx', d => d.r * 0.35)
            .attr('ry', d => d.r * 0.2)
            .attr('fill', '#ffffff')
            .attr('opacity', 0.6)
            .attr('transform', 'rotate(-25)');

        // Node count badge in center
        nodeGroups.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '-0.1em')
            .attr('fill', '#ffffff')
            .attr('font-size', d => Math.max(14, d.r * 0.42))
            .attr('font-weight', '900')
            .attr('font-family', 'monospace')
            .style('text-shadow', '0 2px 4px rgba(0,0,0,0.9)')
            .text(d => d.count);

        // Subtitle count label
        nodeGroups.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.3em')
            .attr('fill', '#e5e5e5')
            .attr('font-size', '9px')
            .attr('font-weight', '800')
            .attr('letter-spacing', '0.08em')
            .style('text-shadow', '0 2px 4px rgba(0,0,0,0.9)')
            .text('CONFLICTS');

        // Domain label below or inside bubble
        nodeGroups.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', d => d.r + 14)
            .attr('fill', d => selectedDomain === d.domain ? '#ffffff' : '#a3a3a3')
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .text(d => d.domain.length > 20 ? d.domain.slice(0, 18) + '...' : d.domain);

        return () => {
            simulation.stop();
        };
    }, [discrepancies, selectedDomain]);

    return (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl relative overflow-hidden font-sans space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-neutral-800 pb-3">
                <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <span>🔮</span> 3D Thematic Contradiction Spheres
                    </h3>
                    <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
                        D3 physics simulation clustering open narrative conflicts by thematic domain
                    </p>
                </div>
                {selectedDomain && (
                    <button
                        onClick={() => onSelectDomain && onSelectDomain(null)}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold rounded-lg border border-neutral-700 transition"
                    >
                        Clear Filter ({selectedDomain})
                    </button>
                )}
            </div>

            <div ref={containerRef} className="w-full relative min-h-[340px] flex items-center justify-center bg-black/40 rounded-xl border border-neutral-850">
                <svg ref={svgRef} className="w-full h-[340px]" />

                {/* Floating Inspection Card on Hover */}
                {hoveredNode && (
                    <div className="absolute bottom-3 left-3 bg-neutral-950/95 border border-neutral-700/80 p-3.5 rounded-xl shadow-2xl backdrop-blur-md max-w-xs text-xs space-y-1.5 pointer-events-none z-20 animate-fade-in">
                        <div className="flex justify-between items-center gap-2">
                            <span className="font-black text-white text-[11px] truncate">{hoveredNode.domain}</span>
                            <span className="text-[9px] font-mono px-2 py-0.5 rounded font-black uppercase text-white" style={{ backgroundColor: hoveredNode.color }}>
                                {hoveredNode.count} Active
                            </span>
                        </div>
                        <div className="flex gap-2 text-[9px] font-mono pt-1 text-neutral-400 border-t border-neutral-800">
                            <span className="text-red-400 font-bold">High: {hoveredNode.highCount}</span>
                            <span className="text-amber-400 font-bold">Med: {hoveredNode.medCount}</span>
                            <span className="text-blue-400 font-bold">Low: {hoveredNode.lowCount}</span>
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-snug">
                            {hoveredNode.count === 0 
                                ? "No open contradictions in this thematic domain. Verified clean."
                                : "Click bubble to filter continuity table to this specific domain."}
                        </p>
                    </div>
                )}
            </div>

            {/* Domain Pills Selector */}
            <div className="flex flex-wrap gap-2 pt-1">
                {DOMAINS.map(d => {
                    const count = unresolved.filter(i => (i.thematicDomain || 'Timeline Errors') === d.name).length;
                    const isSelected = selectedDomain === d.name;
                    return (
                        <button
                            key={d.name}
                            onClick={() => onSelectDomain && onSelectDomain(isSelected ? null : d.name)}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border ${
                                isSelected
                                    ? 'bg-neutral-800 text-white border-neutral-600 shadow-md ring-1 ring-white/20'
                                    : 'bg-black/40 text-neutral-400 hover:text-white border-neutral-850'
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.baseColor }} />
                            <span>{d.name}</span>
                            <span className="text-[9px] font-mono font-black px-1.5 py-0.2 rounded bg-neutral-900 border border-neutral-800">
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
