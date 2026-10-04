/**
 * Utility to generate a downloadable, valid PDF report for Lore Integrity & Factual Contradictions.
 * Generates an authentic PDF-1.4 binary format with proper font dictionaries, streams, and xref table.
 */

export interface ContradictionReportItem {
    id: string;
    source: string;
    context: string;
    explanation?: string;
    reason?: string;
    severity: 'high' | 'medium' | 'low';
    status: string;
    thematicDomain?: string;
    suggestedResolution?: string;
}

export function generateContradictionsPdfReport(params: {
    projectName: string;
    score: number;
    discrepancies: ContradictionReportItem[];
}) {
    const { projectName, score, discrepancies } = params;
    const unresolved = discrepancies.filter(d => d.status !== 'resolved');
    const dateStr = new Date().toLocaleString();

    // Sanitize string for PDF standard fonts (WinAnsiEncoding compatible)
    const sanitize = (str: string) => {
        return (str || '')
            .replace(/[^\x20-\x7E\r\n]/g, ' ')
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
    };

    const highCount = unresolved.filter(d => d.severity === 'high').length;
    const medCount = unresolved.filter(d => d.severity === 'medium').length;
    const lowCount = unresolved.filter(d => d.severity === 'low').length;

    // Build pages
    const pages: string[] = [];

    // --- Page 1: Executive Summary & First Batch of Conflicts ---
    let page1Content = `
BT
/F1 20 Tf
50 780 Td
(${sanitize(`ZOE FILMS - LORE INTEGRITY REPORT`)}) Tj
/F2 10 Tf
0 -18 Td
(${sanitize(`Project: ${projectName}   |   Generated: ${dateStr}`)}) Tj
0 -14 Td
(${sanitize(`Continuity Integrity Score: ${score}%   |   Active Unresolved Conflicts: ${unresolved.length}`)}) Tj
0 -14 Td
(${sanitize(`Breakdown: [High: ${highCount}]   [Medium: ${medCount}]   [Low: ${lowCount}]`)}) Tj
/F1 12 Tf
0 -26 Td
(${sanitize(`EXECUTIVE AUDIT SUMMARY`)}) Tj
/F2 9 Tf
0 -14 Td
(${sanitize(`This automated continuity report audits all open factual contradictions across your knowledge base,`)}) Tj
0 -12 Td
(${sanitize(`neural graph triplets, character profiles, and scene script transcripts.`)} ) Tj
0 -24 Td
/F1 12 Tf
(${sanitize(`CATALOG OF UNRESOLVED FACTUAL CONTRADICTIONS`)}) Tj
ET
`;

    let currentY = 630;
    let pageIndex = 1;
    let currentPageContent = page1Content;

    unresolved.forEach((item, idx) => {
        // Estimate height needed for this item (approx 90-120 pt)
        if (currentY < 130) {
            // Push current page
            pages.push(currentPageContent);
            pageIndex++;
            currentY = 750;
            currentPageContent = `
BT
/F1 14 Tf
50 ${currentY} Td
(${sanitize(`ZOE FILMS - LORE INTEGRITY REPORT (Cont. Page ${pageIndex})`)}) Tj
/F2 9 Tf
0 -15 Td
(${sanitize(`Project: ${projectName}   |   Unresolved Conflicts`)}) Tj
0 -25 Td
ET
`;
            currentY -= 40;
        }

        const sevLabel = item.severity === 'high' ? 'CRITICAL HIGH' : item.severity === 'medium' ? 'WARNING MEDIUM' : 'LOW CONTINUITY';
        const domain = item.thematicDomain || 'Timeline Errors';
        const sourceDoc = item.source || 'Script / Lore Intake';
        const contextExcerpt = item.context ? item.context.slice(0, 110) : 'No passage cited.';
        const explanation = item.explanation || item.reason || 'Continuity contradiction detected in lore archive.';
        const resolution = item.suggestedResolution || 'Align lore passage with canon character timeline.';

        currentPageContent += `
BT
/F1 10 Tf
50 ${currentY} Td
(${sanitize(`[#${idx + 1}]  SEVERITY: ${sevLabel}  |  DOMAIN: ${domain}`)}) Tj
/F2 8 Tf
0 -12 Td
(${sanitize(`Source Document: ${sourceDoc}`)}) Tj
0 -12 Td
(${sanitize(`Conflicting Passage: "${contextExcerpt}"`)}) Tj
0 -12 Td
(${sanitize(`Contradiction: ${explanation.slice(0, 120)}`)}) Tj
0 -12 Td
(${sanitize(`Suggested Resolution: ${resolution.slice(0, 120)}`)}) Tj
ET
`;
        currentY -= 65;
    });

    // If unresolved is empty
    if (unresolved.length === 0) {
        currentPageContent += `
BT
/F1 12 Tf
50 580 Td
(${sanitize(`NO UNRESOLVED CONTRADICTIONS FOUND.`)}) Tj
/F2 9 Tf
0 -16 Td
(${sanitize(`All registered lore entities and character profiles are 100% harmonized.`)} ) Tj
ET
`;
    }

    // Push the final page
    pages.push(currentPageContent);

    // Assemble valid PDF-1.4 document
    const objects: string[] = [];
    let offset = 0;
    const xrefOffsets: number[] = [];

    // Helper to add PDF object
    const addObject = (content: string) => {
        const objNumber = objects.length + 1;
        const objStr = `${objNumber} 0 obj\n${content}\nendobj\n`;
        objects.push(objStr);
        return objNumber;
    };

    // Object 1: Catalog
    const catalogObjIndex = 1;
    // Object 2: Pages
    const pagesObjIndex = 2;
    // Object 3: Font F1 (Helvetica-Bold)
    // Object 4: Font F2 (Helvetica)

    const font1Index = 3;
    const font2Index = 4;

    const pageObjIndices: number[] = [];
    const contentObjIndices: number[] = [];

    let nextObjNum = 5;
    pages.forEach(() => {
        pageObjIndices.push(nextObjNum++);
        contentObjIndices.push(nextObjNum++);
    });

    const catalogContent = `<< /Type /Catalog /Pages ${pagesObjIndex} 0 R >>`;
    const font1Content = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
    const font2Content = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

    const kidsStr = pageObjIndices.map(id => `${id} 0 R`).join(' ');
    const pagesContent = `<< /Type /Pages /Kids [${kidsStr}] /Count ${pages.length} >>`;

    objects.push(`1 0 obj\n${catalogContent}\nendobj\n`);
    objects.push(`2 0 obj\n${pagesContent}\nendobj\n`);
    objects.push(`3 0 obj\n${font1Content}\nendobj\n`);
    objects.push(`4 0 obj\n${font2Content}\nendobj\n`);

    pages.forEach((pText, i) => {
        const pObjNum = pageObjIndices[i];
        const cObjNum = contentObjIndices[i];

        const streamBytes = pText.trim();
        const contentStr = `<< /Length ${streamBytes.length} >>\nstream\n${streamBytes}\nendstream`;
        const pageStr = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${cObjNum} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;

        objects.push(`${pObjNum} 0 obj\n${pageStr}\nendobj\n`);
        objects.push(`${cObjNum} 0 obj\n${contentStr}\nendobj\n`);
    });

    let pdfBody = `%PDF-1.4\n`;
    offset = pdfBody.length;

    objects.forEach(obj => {
        xrefOffsets.push(offset);
        pdfBody += obj;
        offset += obj.length;
    });

    const startXref = offset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    xrefOffsets.forEach(pos => {
        xref += `${String(pos).padStart(10, '0')} 00000 n \n`;
    });

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
    const fullPdf = pdfBody + xref + trailer;

    // Trigger browser download
    const blob = new Blob([fullPdf], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeProject = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    link.download = `${safeProject}_Lore_Integrity_Contradictions_Report.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}
