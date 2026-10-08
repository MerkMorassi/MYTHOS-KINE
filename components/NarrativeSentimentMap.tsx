
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface SentimentData {
    segment: string;
    tone: string;
    score: number; // -1 to 1
    intensity: number; // 0 to 1
}

interface NarrativeSentimentMapProps {
    data: SentimentData[];
    width?: number;
    height?: number;
}

export const NarrativeSentimentMap: React.FC<NarrativeSentimentMapProps> = ({ 
    data, 
    width = 800, 
    height = 400 
}) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || !data || data.length === 0) return;

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();

        const margin = { top: 40, right: 40, bottom: 60, left: 100 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Scales
        const xScale = d3.scaleBand()
            .domain(data.map(d => d.segment))
            .range([0, innerWidth])
            .padding(0.05);

        const colorScale = d3.scaleLinear<string>()
            .domain([-1, 0, 1])
            .range(['#ef4444', '#71717a', '#22c55e']); // Red, Gray, Green

        // Tooltip
        const tooltip = d3.select('body').append('div')
            .attr('class', 'absolute hidden bg-neutral-900 border border-neutral-700 p-2 rounded text-[10px] text-white pointer-events-none shadow-xl z-[1000]');

        // Rects
        g.selectAll('rect')
            .data(data)
            .enter()
            .append('rect')
            .attr('x', d => xScale(d.segment) || 0)
            .attr('y', 0)
            .attr('width', xScale.bandwidth())
            .attr('height', innerHeight)
            .attr('fill', d => colorScale(d.score))
            .attr('opacity', d => 0.3 + d.intensity * 0.7)
            .attr('rx', 4)
            .on('mouseover', (event, d) => {
                tooltip.style('display', 'block')
                    .html(`
                        <div class="font-bold uppercase tracking-widest text-blue-400 mb-1">${d.segment}</div>
                        <div class="flex justify-between gap-4">
                            <span class="text-neutral-400">Tone:</span>
                            <span class="font-mono">${d.tone}</span>
                        </div>
                        <div class="flex justify-between gap-4">
                            <span class="text-neutral-400">Score:</span>
                            <span class="font-mono">${d.score.toFixed(2)}</span>
                        </div>
                    `);
            })
            .on('mousemove', (event) => {
                tooltip.style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            })
            .on('mouseout', () => {
                tooltip.style('display', 'none');
            });

        // X-Axis
        g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .style('font-size', '8px')
            .style('fill', '#9ca3af');

        // Labels
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', margin.top / 2)
            .attr('text-anchor', 'middle')
            .attr('class', 'text-xs font-black uppercase tracking-[0.2em] fill-neutral-400')
            .text('Narrative Sentiment Flow');

        return () => {
            tooltip.remove();
        };
    }, [data, width, height]);

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-4 overflow-hidden shadow-inner">
            <svg ref={svgRef} width={width} height={height} className="max-w-full h-auto"></svg>
        </div>
    );
};
