/**
 * Lore Markdown Exporter Utility
 * Generates an exhaustive, beautifully organized single Markdown (.md) document
 * containing all entries, character dossiers, entity-relationship triplets,
 * document archive records, and continuity/integrity metadata.
 */

import { LoreEntry, Character, TripletEdge, VectorRecord } from '../types';

export interface LoreExportData {
    projectName?: string;
    agentName?: string;
    loreEntries: LoreEntry[];
    characters?: Character[];
    tripletEdges?: TripletEdge[];
    vectors?: VectorRecord[];
    discrepancies?: any[];
    integrityScore?: number;
}

export function generateLoreMarkdown(data: LoreExportData): string {
    const {
        projectName = 'ZOE FILMS Universe',
        agentName = 'Director Core',
        loreEntries = [],
        characters = [],
        tripletEdges = [],
        vectors = [],
        discrepancies = [],
        integrityScore = 100
    } = data;

    const exportTimestamp = new Date().toISOString();
    const formattedDate = new Date().toLocaleString('en-US', {
        dateStyle: 'full',
        timeStyle: 'medium'
    });

    const uniqueEntities = Array.from(new Set(
        tripletEdges.flatMap(e => [e.s.trim(), e.o.trim()]).filter(Boolean)
    ));

    const resolvedContradictions = discrepancies.filter(d => d.status === 'resolved');
    const openContradictions = discrepancies.filter(d => d.status !== 'resolved');

    let md = '';

    // ==========================================
    // 01. HEADER & METADATA
    // ==========================================
    md += `# 🌌 ${projectName} — Complete Lore Repository\n\n`;
    md += `> **System Context:** ${agentName}  \n`;
    md += `> **Export Date:** ${formattedDate} (\`${exportTimestamp}\`)  \n`;
    md += `> **Lore Integrity Score:** **${integrityScore}%** (${resolvedContradictions.length} resolved / ${discrepancies.length} total contradictions)  \n\n`;

    md += `---\n\n`;

    // ==========================================
    // 02. EXECUTIVE SUMMARY & STATS
    // ==========================================
    md += `## 📊 1. Repository Overview & Statistics\n\n`;
    md += `| Metric | Count |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Lore Entries** | ${loreEntries.length} |\n`;
    md += `| **Character Dossiers** | ${characters.length} |\n`;
    md += `| **Semantic Triplet Relationships** | ${tripletEdges.length} |\n`;
    md += `| **Unique Graph Entities** | ${uniqueEntities.length} |\n`;
    md += `| **Indexed Documents & Chunks** | ${vectors.length} |\n`;
    md += `| **Open Factual Contradictions** | ${openContradictions.length} |\n`;
    md += `| **Resolved Contradictions** | ${resolvedContradictions.length} |\n\n`;

    // Table of contents
    md += `### Table of Contents\n`;
    md += `1. [Repository Overview & Statistics](#1-repository-overview--statistics)\n`;
    md += `2. [Lore Entries Archive (${loreEntries.length})](#2-lore-entries-archive)\n`;
    md += `3. [Character Dossiers (${characters.length})](#3-character-dossiers)\n`;
    md += `4. [Entity-Relationship Knowledge Graph (${tripletEdges.length})](#4-entity-relationship-knowledge-graph)\n`;
    md += `5. [Sacred Document Archive (${vectors.length})](#5-sacred-document-archive)\n`;
    md += `6. [Lore Integrity & Contradictions Log](#6-lore-integrity--contradictions-log)\n\n`;

    md += `---\n\n`;

    // ==========================================
    // 03. LORE ENTRIES ARCHIVE
    // ==========================================
    md += `## 📜 2. Lore Entries Archive\n\n`;
    if (loreEntries.length === 0) {
        md += `*No lore entries currently recorded in the repository.*\n\n`;
    } else {
        // Group entries by cluster if available
        const clustersMap = new Map<string, LoreEntry[]>();
        loreEntries.forEach(entry => {
            const cluster = entry.cluster || 'General Lore';
            if (!clustersMap.has(cluster)) clustersMap.set(cluster, []);
            clustersMap.get(cluster)!.push(entry);
        });

        clustersMap.forEach((entries, clusterName) => {
            md += `### 📁 Cluster: ${clusterName}\n\n`;
            entries.forEach((entry, idx) => {
                md += `#### 2.${idx + 1} ${entry.title}\n\n`;
                md += `- **ID:** \`${entry.id}\`\n`;
                if (entry.tags && entry.tags.length > 0) {
                    md += `- **Tags:** ${entry.tags.map(t => `\`#${t}\``).join(', ')}\n`;
                }
                if (entry.ragDocumentId) {
                    md += `- **RAG Document Link:** \`${entry.ragDocumentId}\`\n`;
                }
                md += `\n**Entry Content:**\n\n`;
                md += `${entry.content.trim()}\n\n`;

                // Associated relationship triplets for this entry/title
                const relatedTriplets = tripletEdges.filter(e => 
                    e.s.toLowerCase() === entry.title.toLowerCase() ||
                    e.o.toLowerCase() === entry.title.toLowerCase() ||
                    entry.content.toLowerCase().includes(e.s.toLowerCase())
                ).slice(0, 8);

                if (relatedTriplets.length > 0) {
                    md += `*Semantic Connections:*\n`;
                    relatedTriplets.forEach(t => {
                        md += `- **${t.s}** —[\`${t.p || t.r || 'relates to'}\`]→ **${t.o}**\n`;
                    });
                    md += `\n`;
                }
                md += `---\n\n`;
            });
        });
    }

    // ==========================================
    // 04. CHARACTER DOSSIERS
    // ==========================================
    md += `## 👥 3. Character Dossiers\n\n`;
    if (characters.length === 0) {
        md += `*No character profiles registered.*\n\n`;
    } else {
        characters.forEach((char, idx) => {
            md += `### 3.${idx + 1} ${char.name}\n\n`;
            md += `- **Archetype:** \`${char.archetype || 'Unspecified'}\`\n`;
            md += `- **ID:** \`${char.id}\`\n`;
            if (char.cluster) {
                md += `- **Faction / Group:** \`${char.cluster}\`\n`;
            }
            if (char.tags && char.tags.length > 0) {
                md += `- **Tags:** ${char.tags.map(t => `\`#${t}\``).join(', ')}\n`;
            }
            md += `\n**Description & Background:**\n\n`;
            md += `${char.description.trim()}\n\n`;

            // Filter triplets where this character is subject or object
            const charTriplets = tripletEdges.filter(e => 
                e.s.toLowerCase() === char.name.toLowerCase() || 
                e.o.toLowerCase() === char.name.toLowerCase()
            );

            if (charTriplets.length > 0) {
                md += `**Character Relationship Links (${charTriplets.length}):**\n\n`;
                md += `| Subject | Relationship | Target Entity | Context / Source |\n`;
                md += `| :--- | :--- | :--- | :--- |\n`;
                charTriplets.forEach(edge => {
                    md += `| **${edge.s}** | \`${edge.p || edge.r || 'connected'}\` | **${edge.o}** | ${edge.sourceId || 'Knowledge Base'} |\n`;
                });
                md += `\n`;
            }
            md += `---\n\n`;
        });
    }

    // ==========================================
    // 05. ENTITY-RELATIONSHIP KNOWLEDGE GRAPH
    // ==========================================
    md += `## 🕸️ 4. Entity-Relationship Knowledge Graph\n\n`;
    md += `This section documents all bidirectional and unidirectional semantic triplets extracted from scripts, lore entries, and user inputs.\n\n`;

    if (tripletEdges.length === 0) {
        md += `*No graph relationships currently established.*\n\n`;
    } else {
        md += `| # | Subject (Entity) | Predicate / Relationship | Object (Entity) | Source Record |\n`;
        md += `| :-: | :--- | :--- | :--- | :--- |\n`;
        tripletEdges.forEach((edge, index) => {
            const rel = edge.p || edge.r || 'relates to';
            md += `| ${index + 1} | **${edge.s}** | \`${rel}\` | **${edge.o}** | \`${edge.sourceId || 'direct'}\` |\n`;
        });
        md += `\n\n`;

        // Unique entity glossary
        md += `### Unique Entities Index (${uniqueEntities.length})\n\n`;
        md += uniqueEntities.map(e => `\`${e}\``).join(' • ') + '\n\n';
    }

    md += `---\n\n`;

    // ==========================================
    // 06. SACRED DOCUMENT ARCHIVE
    // ==========================================
    md += `## 🗄️ 5. Sacred Document Archive\n\n`;
    if (vectors.length === 0) {
        md += `*No vector chunks or document files uploaded.*\n\n`;
    } else {
        // Group vectors by source document
        const sourceMap = new Map<string, VectorRecord[]>();
        vectors.forEach(v => {
            const src = v.source || 'General Source';
            if (!sourceMap.has(src)) sourceMap.set(src, []);
            sourceMap.get(src)!.push(v);
        });

        md += `Total indexed documents: **${sourceMap.size}**\n\n`;

        sourceMap.forEach((chunks, srcName) => {
            const collection = chunks[0]?.metadata?.collection || 'Root Documents';
            const allTags = Array.from(new Set(
                chunks.flatMap(c => c.metadata?.tags || []).filter(Boolean)
            ));

            md += `### Document: \`${srcName}\`\n\n`;
            md += `- **Collection:** \`${collection}\`\n`;
            md += `- **Chunk Count:** ${chunks.length}\n`;
            if (allTags.length > 0) {
                md += `- **Extracted Tags:** ${allTags.map(t => `\`#${t}\``).join(', ')}\n`;
            }
            md += `\n**Sample Document Extracts:**\n\n`;
            chunks.slice(0, 3).forEach((chunk, cIdx) => {
                md += `> **[Part ${cIdx + 1}]** ${chunk.text.replace(/\n+/g, ' ')}\n\n`;
            });
            if (chunks.length > 3) {
                md += `*(+ ${chunks.length - 3} additional chunks indexed in vector space)*\n\n`;
            }
        });
    }

    md += `---\n\n`;

    // ==========================================
    // 07. LORE INTEGRITY & CONTRADICTIONS LOG
    // ==========================================
    md += `## ⚠️ 6. Lore Integrity & Contradictions Log\n\n`;
    md += `Tracked contradictions and continuity discrepancies across the universe narrative:\n\n`;

    if (discrepancies.length === 0) {
        md += `✅ **Zero Contradictions Detected.** The lore repository is 100% consistent.\n\n`;
    } else {
        md += `### Open Inconsistencies (${openContradictions.length})\n\n`;
        if (openContradictions.length === 0) {
            md += `*All detected contradictions have been resolved!*\n\n`;
        } else {
            openContradictions.forEach((disc, idx) => {
                const domain = disc.thematicDomain || 'General Lore';
                md += `#### 6.${idx + 1} [${disc.severity?.toUpperCase() || 'MEDIUM'}] ${domain}: ${disc.factA || 'Inconsistency'}\n\n`;
                md += `- **Thematic Domain:** \`${domain}\`\n`;
                md += `- **Severity:** \`${disc.severity || 'medium'}\`\n`;
                md += `- **Status:** \`${disc.status || 'flagged'}\`\n`;
                if (disc.sourceA || disc.sourceB) {
                    md += `- **Sources in Conflict:** \`${disc.sourceA || 'Unknown'}\` vs \`${disc.sourceB || 'Unknown'}\`\n`;
                }
                md += `- **Conflicting Assertion A:** ${disc.factA || 'N/A'}\n`;
                md += `- **Conflicting Assertion B:** ${disc.factB || 'N/A'}\n`;
                if (disc.suggestedResolution) {
                    md += `- **Suggested Resolution:** *${disc.suggestedResolution}*\n`;
                }
                md += `\n`;
            });
        }

        if (resolvedContradictions.length > 0) {
            md += `### Resolved Discrepancies (${resolvedContradictions.length})\n\n`;
            resolvedContradictions.forEach((disc, idx) => {
                md += `- **✓ Resolved:** ${disc.factA || disc.suggestedResolution || 'Resolved contradiction'} *(${disc.thematicDomain || 'General'})*\n`;
            });
            md += `\n`;
        }
    }

    md += `---\n\n`;
    md += `*Export generated by ZOE FILMS Lore Studio • End of Document*\n`;

    return md;
}

/**
 * Triggers a client-side file download of the generated Markdown file.
 */
export function downloadLoreMarkdownFile(markdownContent: string, filename?: string): void {
    const defaultFilename = `lore-repository-export-${new Date().toISOString().slice(0, 10)}.md`;
    const finalFilename = filename || defaultFilename;

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', finalFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
