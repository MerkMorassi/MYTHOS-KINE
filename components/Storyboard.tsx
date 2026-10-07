
import React, { useState } from 'react';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import { StoryboardFrame as StoryboardFrameType } from '../types.ts';
import { DownloadIcon, StoryboardIcon, GridIcon } from './icons.tsx';
import { PlusIcon } from './icons/PlusIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';
import { StoryboardTimeline } from './StoryboardTimeline.tsx';

interface StoryboardProps {
    frames: StoryboardFrameType[];
    projectName?: string;
    onUpdateNote: (id: string, notes: string) => void;
    onRemove: (id: string) => void;
    onReorder: (startIndex: number, endIndex: number) => void;
    onUpdateFrame?: (id: string, updates: Partial<StoryboardFrameType>) => void;
}

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const downloadSingleImage = (base64Image: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const formatTimestamp = (frame: StoryboardFrameType, index: number): string => {
    if (frame.timestamp && frame.timestamp.trim()) {
        return frame.timestamp.trim();
    }
    const totalSec = index * 5;
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `00:${m}:${s}`;
};

// Print View Component - Optimized for Browser Print / PDF
const PrintView: React.FC<{ frames: StoryboardFrameType[]; projectName?: string }> = ({ frames, projectName }) => {
    return (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999] text-black overflow-y-auto">
            <div className="max-w-[21cm] mx-auto p-8 h-full">
                {/* Header */}
                <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                    <div>
                        <h1 className="text-4xl font-black uppercase tracking-tighter leading-none">Storyboard</h1>
                        <p className="text-sm font-bold mt-2 text-gray-600 tracking-widest uppercase">
                            Production: {projectName || 'ZOE FILMS Project'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Generated</div>
                        <div className="text-sm font-mono font-bold">{new Date().toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500 font-mono">{frames.length} Total Shots</div>
                    </div>
                </div>

                {/* Frames List */}
                <div className="flex flex-col gap-6">
                    {frames.map((frame, index) => {
                        const ts = formatTimestamp(frame, index);
                        const shotLetter = String.fromCharCode(65 + (index % 26));
                        return (
                            <div key={frame.id} className="break-inside-avoid flex border-2 border-black h-48 bg-white">
                                {/* Visual Reference */}
                                <div className="w-[300px] flex-shrink-0 border-r-2 border-black relative bg-gray-100 flex items-center justify-center overflow-hidden">
                                    <img 
                                        src={frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`} 
                                        className="w-full h-full object-cover"
                                        alt={`Shot ${index + 1}`}
                                    />
                                    <div className="absolute top-0 left-0 bg-black text-white px-2 py-1 text-xs font-bold z-10">
                                        #{index + 1}
                                    </div>
                                    <div className="absolute bottom-0 right-0 bg-black/80 text-white px-2 py-0.5 text-[10px] font-mono font-bold z-10">
                                        ⏱ {ts}
                                    </div>
                                </div>

                                {/* Data & Notes */}
                                <div className="flex-grow flex flex-col">
                                    <div className="flex border-b border-black divide-x divide-black bg-gray-50">
                                        <div className="px-3 py-1.5 text-xs font-bold uppercase w-24">
                                            {frame.sceneName || `SCENE 1`}
                                        </div>
                                        <div className="px-3 py-1.5 text-xs font-bold uppercase w-28">
                                            SHOT {shotLetter}
                                        </div>
                                        <div className="px-3 py-1.5 text-xs font-bold uppercase w-28 font-mono text-gray-700">
                                            {ts}
                                        </div>
                                        <div className="px-3 py-1.5 text-xs font-bold uppercase flex-grow">
                                            {frame.shotType ? `TYPE: ${frame.shotType}` : 'NOTES'}
                                        </div>
                                    </div>

                                    <div className="p-4 flex-grow relative">
                                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap font-mono text-gray-800">
                                            {frame.notes || <span className="text-gray-400 italic">No description provided.</span>}
                                        </p>
                                        {frame.prompt && (
                                            <div className="mt-2 pt-2 border-t border-gray-200">
                                                <p className="text-[10px] text-gray-500 line-clamp-2 italic">
                                                    Prompt: {frame.prompt}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Footer */}
                <div className="fixed bottom-0 left-0 w-full text-center py-4 bg-white border-t border-black text-[10px] font-bold uppercase tracking-widest text-gray-400 print:block hidden">
                    ZOE FILMS • Mythos Director Pro • AI Storyboard Generator
                </div>
            </div>
        </div>
    );
};

const ShotCard: React.FC<{
    frame: StoryboardFrameType;
    index: number;
    onUpdateNote: (id: string, notes: string) => void;
    onRemove: (id: string) => void;
    onUpdateFrame?: (id: string, updates: Partial<StoryboardFrameType>) => void;
    onDragStart: (e: React.DragEvent, index: number) => void;
    onDragEnter: (e: React.DragEvent, index: number) => void;
    onDragEnd: (e: React.DragEvent) => void;
    draggedOverIndex: number | null;
}> = ({ frame, index, onUpdateNote, onRemove, onUpdateFrame, onDragStart, onDragEnter, onDragEnd, draggedOverIndex }) => {
    
    const isBeingDraggedOver = draggedOverIndex === index;
    const shotLetter = String.fromCharCode(65 + (index % 26)); // A, B, C...
    const currentTimestamp = formatTimestamp(frame, index);

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragEnter={(e) => onDragEnter(e, index)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={`
                group relative flex flex-col bg-neutral-900/80 border rounded-xl overflow-hidden shadow-lg transition-all duration-200 backdrop-blur-sm
                ${isBeingDraggedOver ? 'border-blue-500 ring-2 ring-blue-500/20 scale-[1.02] z-10' : 'border-neutral-800 hover:border-neutral-600 hover:shadow-2xl hover:-translate-y-1'}
            `}
        >
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-2.5 bg-neutral-800/80 border-b border-neutral-700/50">
                <div className="flex items-center gap-2">
                    <span className="bg-black/40 text-neutral-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-white/5">
                        #{index + 1}
                    </span>
                    <span className="text-xs font-bold text-neutral-200 tracking-wide">SHOT {shotLetter}</span>
                </div>

                {/* Timestamp & Actions */}
                <div className="flex items-center gap-2">
                    {/* Editable Timestamp */}
                    <div 
                        className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded border border-neutral-700/60"
                        title="Script timestamp (e.g. 00:01:25)"
                    >
                        <span className="text-[10px] text-neutral-500">⏱</span>
                        <input
                            type="text"
                            value={frame.timestamp ?? currentTimestamp}
                            onChange={(e) => onUpdateFrame?.(frame.id, { timestamp: e.target.value })}
                            placeholder="00:00:00"
                            className="bg-transparent text-neutral-300 hover:text-white focus:text-cyan-300 font-mono text-[11px] w-16 focus:outline-none"
                        />
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                downloadSingleImage(frame.base64Image, `shot_${index + 1}_${shotLetter}.jpeg`); 
                            }}
                            className="text-neutral-500 hover:text-white transition-colors p-1"
                            title="Download Image"
                        >
                            <DownloadIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onRemove(frame.id); }}
                            className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                            title="Remove Shot"
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Image Area */}
            <div className="relative aspect-video bg-black cursor-move group/image">
                <img 
                    src={frame.base64Image.startsWith('data:') ? frame.base64Image : `data:image/jpeg;base64,${frame.base64Image}`} 
                    alt={`Shot ${shotLetter}`} 
                    className="w-full h-full object-cover opacity-90 group-hover/image:opacity-100 transition-opacity" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900/80 to-transparent opacity-0 group-hover/image:opacity-100 transition-opacity pointer-events-none" />
                <div className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-neutral-300 border border-white/10">
                    ⏱ {currentTimestamp}
                </div>
            </div>

            {/* Meta & Notes Area */}
            <div className="flex-grow p-4 bg-neutral-900 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-neutral-500 uppercase tracking-wider">
                    <span>Action / Script Notes</span>
                    <input
                        type="text"
                        value={frame.shotType || ''}
                        onChange={(e) => onUpdateFrame?.(frame.id, { shotType: e.target.value })}
                        placeholder="Shot Type (e.g. Medium Close-Up)"
                        className="bg-transparent text-right text-neutral-400 hover:text-neutral-200 focus:text-neutral-100 outline-none text-[10px] w-36 uppercase"
                    />
                </div>
                <textarea
                    value={frame.notes}
                    onChange={(e) => onUpdateNote(frame.id, e.target.value)}
                    placeholder="Describe action, camera movement, dialogue, or script notes..."
                    className="w-full h-24 bg-neutral-800/50 border border-neutral-700/50 rounded-lg p-3 text-sm text-neutral-300 placeholder-neutral-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:bg-neutral-800 transition-all leading-relaxed"
                />
            </div>
        </div>
    );
};

export const Storyboard: React.FC<StoryboardProps> = ({ frames, projectName, onUpdateNote, onRemove, onReorder, onUpdateFrame }) => {
    const dragItem = React.useRef<number | null>(null);
    const dragOverItem = React.useRef<number | null>(null);
    const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
    const [isExporting, setIsExporting] = useState<'pdf' | 'zip' | null>(null);
    const [exportNotice, setExportNotice] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');

    const handleDragStart = (e: React.DragEvent, position: number) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent, position: number) => {
        dragOverItem.current = position;
        setDraggedOverIndex(position);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            onReorder(dragItem.current, dragOverItem.current);
        }
        dragItem.current = null;
        dragOverItem.current = null;
        setDraggedOverIndex(null);
    };

    const handlePrint = () => {
        window.print();
    };

    // 1. Export as Downloadable ZIP Archive containing frames, notes, and timestamps
    const handleExportZip = async () => {
        if (frames.length === 0) return;
        setIsExporting('zip');
        setExportNotice('Packaging storyboard frames and script notes into ZIP...');

        try {
            const zip = new JSZip();
            const folder = zip.folder('frames') || zip;
            const projectTitle = projectName || 'ZOE FILMS Production';
            const timestampNow = new Date().toISOString();

            // (a) Add high-res image files
            frames.forEach((frame, idx) => {
                const shotNum = String(idx + 1).padStart(2, '0');
                const shotLetter = String.fromCharCode(65 + (idx % 26));
                const filename = `shot_${shotNum}_${shotLetter}.jpg`;
                
                // Clean base64 string
                const cleanBase64 = frame.base64Image.replace(/^data:image\/\w+;base64,/, '');
                folder.file(filename, cleanBase64, { base64: true });
            });

            // (b) Formatted Script Notes & Timestamps (.txt)
            let textNotes = `================================================================================\n`;
            textNotes += `ZOE FILMS • PRODUCTION STORYBOARD SCRIPT NOTES\n`;
            textNotes += `Project: ${projectTitle}\n`;
            textNotes += `Generated: ${new Date().toLocaleString()}\n`;
            textNotes += `Total Shots: ${frames.length}\n`;
            textNotes += `================================================================================\n\n`;

            frames.forEach((frame, idx) => {
                const shotLetter = String.fromCharCode(65 + (idx % 26));
                const ts = formatTimestamp(frame, idx);
                textNotes += `--------------------------------------------------------------------------------\n`;
                textNotes += `[SHOT #${idx + 1}] - SHOT ${shotLetter}\n`;
                textNotes += `TIMESTAMP: ${ts}\n`;
                if (frame.sceneName) textNotes += `SCENE:     ${frame.sceneName}\n`;
                if (frame.shotType) textNotes += `SHOT TYPE: ${frame.shotType}\n`;
                if (frame.prompt) textNotes += `PROMPT:    ${frame.prompt}\n`;
                textNotes += `SCRIPT NOTES / ACTION:\n${frame.notes || '(No script notes provided)'}\n\n`;
            });
            zip.file('storyboard_notes.txt', textNotes);

            // (c) Markdown Storyboard Production Document (.md)
            let mdNotes = `# ${projectTitle} - Storyboard Production Notes\n\n`;
            mdNotes += `**Generated:** ${new Date().toLocaleString()}  \n`;
            mdNotes += `**Total Shots:** ${frames.length} frames  \n\n`;
            mdNotes += `## Shot Sequence Breakdown\n\n`;

            frames.forEach((frame, idx) => {
                const shotLetter = String.fromCharCode(65 + (idx % 26));
                const ts = formatTimestamp(frame, idx);
                mdNotes += `### Shot #${idx + 1} (${shotLetter}) — \`${ts}\`\n\n`;
                if (frame.sceneName) mdNotes += `- **Scene:** ${frame.sceneName}\n`;
                if (frame.shotType) mdNotes += `- **Camera / Framing:** ${frame.shotType}\n`;
                if (frame.prompt) mdNotes += `- **Visual Prompt:** *${frame.prompt}*\n`;
                mdNotes += `\n**Script Notes & Action:**\n> ${frame.notes ? frame.notes.replace(/\n/g, '\n> ') : '*No action notes recorded*'}\n\n`;
                mdNotes += `![Shot ${idx + 1}](./frames/shot_${String(idx + 1).padStart(2, '0')}_${shotLetter}.jpg)\n\n---\n\n`;
            });
            zip.file('storyboard_notes.md', mdNotes);

            // (d) Machine-Readable JSON Manifest
            const manifest = {
                project: projectTitle,
                generatedAt: timestampNow,
                totalFrames: frames.length,
                sequence: frames.map((frame, idx) => ({
                    order: idx + 1,
                    shotLetter: String.fromCharCode(65 + (idx % 26)),
                    imageFile: `frames/shot_${String(idx + 1).padStart(2, '0')}_${String.fromCharCode(65 + (idx % 26))}.jpg`,
                    timestamp: formatTimestamp(frame, idx),
                    sceneName: frame.sceneName || 'SCENE 1',
                    shotType: frame.shotType || 'Standard',
                    notes: frame.notes || '',
                    prompt: frame.prompt || null
                }))
            };
            zip.file('storyboard_manifest.json', JSON.stringify(manifest, null, 2));

            // Generate ZIP Blob and trigger download
            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            const slug = (projectTitle || 'storyboard').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
            downloadBlob(zipBlob, `storyboard_${slug}_${Date.now()}.zip`);
            setExportNotice('ZIP archive generated and downloaded!');
            setTimeout(() => setExportNotice(null), 4000);
        } catch (err: any) {
            console.error('Failed to export Storyboard ZIP:', err);
            setExportNotice(`Export error: ${err.message || 'Failed to create ZIP'}`);
            setTimeout(() => setExportNotice(null), 5000);
        } finally {
            setIsExporting(null);
        }
    };

    // 2. Export as Downloadable PDF Document containing frames, notes, and timestamps
    const handleExportPdf = async () => {
        if (frames.length === 0) return;
        setIsExporting('pdf');
        setExportNotice('Generating cinematic Storyboard PDF document...');

        try {
            // A4 Portrait: 210mm x 297mm
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const projectTitle = projectName || 'ZOE FILMS Production';
            const totalFrames = frames.length;
            const framesPerPage = 2; // 2 frames per page gives cinematic size and readable script notes
            const totalPages = Math.ceil(totalFrames / framesPerPage);

            for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                if (pageIdx > 0) {
                    doc.addPage();
                }

                // Page Header
                doc.setFillColor(15, 15, 18);
                doc.rect(0, 0, 210, 22, 'F');

                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text('ZOE FILMS  •  PRODUCTION STORYBOARD', 14, 11);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(160, 160, 175);
                doc.text(`PROJECT: ${projectTitle.toUpperCase()}  |  ${totalFrames} SHOTS`, 14, 18);

                doc.setFont('helvetica', 'bold');
                doc.text(`PAGE ${pageIdx + 1} OF ${totalPages}`, 196, 14, { align: 'right' });

                // Render 2 Frames on this page
                const startIdx = pageIdx * framesPerPage;
                const pageFrames = frames.slice(startIdx, startIdx + framesPerPage);

                pageFrames.forEach((frame, subIdx) => {
                    const globalIdx = startIdx + subIdx;
                    const shotLetter = String.fromCharCode(65 + (globalIdx % 26));
                    const ts = formatTimestamp(frame, globalIdx);
                    
                    // Card position: subIdx 0 at y=28, subIdx 1 at y=156
                    const cardY = 28 + subIdx * 128;
                    const cardHeight = 122;

                    // Outer Card Border
                    doc.setFillColor(250, 250, 252);
                    doc.setDrawColor(220, 224, 230);
                    doc.setLineWidth(0.4);
                    doc.roundedRect(12, cardY, 186, cardHeight, 3, 3, 'FD');

                    // Card Header Bar
                    doc.setFillColor(238, 242, 246);
                    doc.rect(12, cardY, 186, 9, 'F');
                    doc.setDrawColor(200, 205, 215);
                    doc.line(12, cardY + 9, 198, cardY + 9);

                    // Shot Badge
                    doc.setFillColor(15, 23, 42); // slate-900
                    doc.roundedRect(15, cardY + 1.5, 24, 6, 1.5, 1.5, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.text(`SHOT #${globalIdx + 1}`, 27, cardY + 5.7, { align: 'center' });

                    // Shot Letter & Scene
                    doc.setTextColor(30, 41, 59);
                    doc.setFontSize(9);
                    doc.text(`SHOT ${shotLetter}`, 43, cardY + 6);

                    if (frame.shotType) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7.5);
                        doc.setTextColor(71, 85, 105);
                        doc.text(`[ ${frame.shotType.toUpperCase()} ]`, 62, cardY + 6);
                    }

                    // Timestamp Badge on Right
                    doc.setFillColor(224, 242, 254); // cyan-100
                    doc.roundedRect(162, cardY + 1.5, 32, 6, 1.5, 1.5, 'F');
                    doc.setTextColor(3, 105, 161); // cyan-700
                    doc.setFont('courier', 'bold');
                    doc.setFontSize(8);
                    doc.text(`TIMECODE: ${ts}`, 178, cardY + 5.8, { align: 'center' });

                    // Visual Frame Thumbnail (16:9 ratio: 82mm x 46.1mm)
                    const imgX = 16;
                    const imgY = cardY + 13;
                    const imgW = 82;
                    const imgH = 46.125;

                    // Image border & background placeholder
                    doc.setFillColor(20, 20, 25);
                    doc.rect(imgX, imgY, imgW, imgH, 'F');

                    try {
                        const imgData = frame.base64Image.startsWith('data:') 
                            ? frame.base64Image 
                            : `data:image/jpeg;base64,${frame.base64Image}`;
                        doc.addImage(imgData, 'JPEG', imgX, imgY, imgW, imgH);
                    } catch (imgErr) {
                        doc.setTextColor(255, 255, 255);
                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(8);
                        doc.text('[ Frame Visual ]', imgX + imgW / 2, imgY + imgH / 2, { align: 'center' });
                    }

                    // Right Side: Script Notes & Specifications
                    const rightX = 104;
                    const rightW = 90;

                    // Notes Section Header
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(7.5);
                    doc.setTextColor(100, 116, 139);
                    doc.text('ACTION & SCRIPT NOTES:', rightX, cardY + 16);

                    // Script Notes Content with Wrapping
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8.5);
                    doc.setTextColor(15, 23, 42);
                    
                    const noteText = frame.notes && frame.notes.trim() 
                        ? frame.notes.trim() 
                        : '(No script notes provided for this shot)';
                    const splitNotes = doc.splitTextToSize(noteText, rightW);
                    // Max 7 lines of notes to prevent overlap
                    const visibleNotes = splitNotes.slice(0, 8);
                    doc.text(visibleNotes, rightX, cardY + 22);

                    // Bottom metadata inside card
                    const metaY = cardY + cardHeight - 20;

                    // Visual Prompt Box if available
                    if (frame.prompt) {
                        doc.setFillColor(241, 245, 249);
                        doc.roundedRect(imgX, metaY - 14, 178, 14, 1.5, 1.5, 'F');

                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(6.5);
                        doc.setTextColor(100, 116, 139);
                        doc.text('VISUAL GENERATION PROMPT:', imgX + 3, metaY - 9.5);

                        doc.setFont('helvetica', 'italic');
                        doc.setFontSize(6.5);
                        doc.setTextColor(71, 85, 105);
                        const splitPrompt = doc.splitTextToSize(frame.prompt, 172);
                        doc.text(splitPrompt.slice(0, 2), imgX + 3, metaY - 5.5);
                    }

                    // Footer Row of Card
                    doc.setDrawColor(226, 232, 240);
                    doc.line(imgX, cardY + cardHeight - 7, 194, cardY + cardHeight - 7);

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(6.5);
                    doc.setTextColor(148, 163, 184);
                    doc.text(`FRAME ID: ${frame.id.slice(0, 16)}`, imgX, cardY + cardHeight - 2.5);
                    doc.text(`SEQUENCE SCENE: ${frame.sceneName || 'SCENE 01'}`, 104, cardY + cardHeight - 2.5);
                    doc.text(`TIMECODE: ${ts}`, 194, cardY + cardHeight - 2.5, { align: 'right' });
                });

                // Document Footer
                doc.setDrawColor(200, 205, 215);
                doc.setLineWidth(0.3);
                doc.line(14, 287, 196, 287);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text('ZOE FILMS • PRODUCTION SUITE • AI STORYBOARD DIRECTOR', 14, 292);
                doc.text(new Date().toLocaleDateString(), 196, 292, { align: 'right' });
            }

            const slug = (projectTitle || 'storyboard').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
            doc.save(`storyboard_${slug}_${Date.now()}.pdf`);
            setExportNotice('PDF Storyboard successfully generated and downloaded!');
            setTimeout(() => setExportNotice(null), 4000);
        } catch (err: any) {
            console.error('Failed to export Storyboard PDF:', err);
            setExportNotice(`PDF export error: ${err.message || 'Failed to render PDF'}`);
            setTimeout(() => setExportNotice(null), 5000);
        } finally {
            setIsExporting(null);
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-primary overflow-hidden">
            <PrintView frames={frames} projectName={projectName} />
            
            {/* Header */}
            <div className="flex-shrink-0 bg-neutral-900 border-b border-neutral-800 px-8 py-5 flex flex-wrap items-center justify-between gap-4 print:hidden z-10">
                <div>
                    <h2 className="text-3xl font-bold text-neutral-200 mb-1">Storyboard</h2>
                    <p className="text-neutral-400 text-sm">
                        Assemble your narrative sequence. Drag and drop to reorder shots, edit timestamps, and export for production.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="px-4 py-2 bg-neutral-800 rounded-lg border border-neutral-700 flex items-center gap-3">
                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Total Shots</span>
                        <span className="text-lg font-bold text-white">{frames.length}</span>
                    </div>

                    {/* View Mode Switcher: Grid vs Timeline */}
                    <div className="flex items-center gap-1 bg-black/50 p-1 rounded-xl border border-neutral-800">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                viewMode === 'grid'
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                            title="Grid View"
                        >
                            <GridIcon className="w-3.5 h-3.5" />
                            <span>Grid</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('timeline')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                viewMode === 'timeline'
                                    ? 'bg-cyan-600 text-white shadow-md'
                                    : 'text-neutral-400 hover:text-white'
                            }`}
                            title="Storyboard Timeline: Cinematic Pacing & Overlays"
                        >
                            <span>🎞️</span>
                            <span>Storyboard Timeline</span>
                        </button>
                    </div>

                    {/* Export Actions Suite */}
                    <div className="flex items-center gap-2">
                        {/* Download PDF Button */}
                        <button 
                            onClick={handleExportPdf}
                            disabled={frames.length === 0 || isExporting !== null}
                            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 rounded-lg transition-all shadow-lg hover:shadow-rose-600/20 active:scale-95 text-sm"
                            title="Generate and download high-resolution PDF with frames, script notes, and timestamps"
                        >
                            {isExporting === 'pdf' ? (
                                <>
                                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span>Rendering PDF...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span>Download PDF</span>
                                </>
                            )}
                        </button>

                        {/* Download ZIP Button */}
                        <button 
                            onClick={handleExportZip}
                            disabled={frames.length === 0 || isExporting !== null}
                            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-4 py-2.5 rounded-lg transition-all shadow-lg hover:shadow-cyan-600/20 active:scale-95 text-sm"
                            title="Download ZIP package containing all frame images, script notes txt, and manifest"
                        >
                            {isExporting === 'zip' ? (
                                <>
                                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                    </svg>
                                    <span>Packaging ZIP...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    <span>Download ZIP</span>
                                </>
                            )}
                        </button>

                        {/* Print / System Dialog */}
                        <button 
                            onClick={handlePrint}
                            disabled={frames.length === 0}
                            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-medium px-3.5 py-2.5 rounded-lg transition-all active:scale-95 text-sm"
                            title="Open browser print dialog"
                        >
                            <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            <span>Print</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Export Notice / Toast */}
            {exportNotice && (
                <div className="bg-neutral-800 border-b border-neutral-700 px-8 py-2 text-xs font-mono text-cyan-300 flex items-center justify-between animate-fadeIn">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        <span>{exportNotice}</span>
                    </div>
                    <button onClick={() => setExportNotice(null)} className="text-neutral-500 hover:text-white">✕</button>
                </div>
            )}

            {/* Main Content */}
            {viewMode === 'timeline' ? (
                <div className="flex-grow overflow-hidden print:hidden">
                    <StoryboardTimeline
                        frames={frames}
                        projectName={projectName}
                        onUpdateNote={onUpdateNote}
                        onRemove={onRemove}
                        onReorder={onReorder}
                        onUpdateFrame={onUpdateFrame}
                    />
                </div>
            ) : (
                <div className="flex-grow overflow-y-auto p-8 bg-neutral-900/50 print:hidden scrollbar-thin scrollbar-thumb-neutral-700">
                    {frames.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-60">
                            <div className="w-24 h-24 bg-neutral-800/50 rounded-3xl flex items-center justify-center mb-6 border-2 border-dashed border-neutral-700">
                                <StoryboardIcon className="w-10 h-10 text-neutral-600" />
                            </div>
                            <h3 className="text-xl font-bold text-neutral-300 mb-2">Storyboard Empty</h3>
                            <p className="text-neutral-500 max-w-md text-center">
                                Generate images in the Studio and click "Add to Storyboard" to start building your sequence.
                            </p>
                        </div>
                    ) : (
                        <div className="max-w-[1920px] mx-auto pb-20">
                            {/* Scene Divider */}
                            <div className="flex items-center gap-4 mb-8 text-neutral-500">
                                <div className="h-px bg-gradient-to-r from-transparent via-neutral-700 to-transparent flex-grow"></div>
                                <span className="text-xs font-bold uppercase tracking-[0.2em]">Sequence 01</span>
                                <div className="h-px bg-gradient-to-r from-transparent via-neutral-700 to-transparent flex-grow"></div>
                            </div>

                            {/* Grid */}
                            <div 
                                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6"
                                onDrop={handleDrop}
                                onDragOver={(e) => e.preventDefault()}
                                onDragLeave={() => setDraggedOverIndex(null)}
                            >
                                {frames.map((frame, index) => (
                                    <ShotCard
                                        key={frame.id}
                                        frame={frame}
                                        index={index}
                                        onUpdateNote={onUpdateNote}
                                        onRemove={onRemove}
                                        onUpdateFrame={onUpdateFrame}
                                        onDragStart={handleDragStart}
                                        onDragEnter={handleDragEnter}
                                        onDragEnd={handleDrop}
                                        draggedOverIndex={draggedOverIndex}
                                    />
                                ))}
                                
                                {/* Add Placeholder */}
                                <div className="border-2 border-dashed border-neutral-800 bg-neutral-900/30 rounded-xl flex flex-col items-center justify-center aspect-video hover:bg-neutral-800/50 hover:border-neutral-700 transition-all group cursor-pointer">
                                    <div className="p-4 rounded-full bg-neutral-800 group-hover:bg-neutral-700 transition-colors mb-3">
                                        <PlusIcon className="w-6 h-6 text-neutral-500 group-hover:text-neutral-300" />
                                    </div>
                                    <span className="font-bold text-xs text-neutral-600 uppercase tracking-wider group-hover:text-neutral-400">Add from Gallery</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

