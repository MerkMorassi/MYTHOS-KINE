

import { vectorDb, VectorRecord } from './vectorDbService';
import { GraphNode, GraphEdge, TripletEdge } from '../types.ts';
import { 
    getEmbeddings, 
    extractTripletsFromText, 
    calculateDynamicWaitMs, 
    isQuotaOrRateLimitError, 
    geminiCircuitBreaker, 
    CircuitBreakerOpenError 
} from './geminiService';

const LAST_SYNC_KEY = 'mythos_lorepack_last_sync';

export interface LorepackRetryOptions {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    taskName?: string;
    onRetry?: (attempt: number, delayMs: number, error: any, reason: string) => void;
}

class FactoryService {
    private isSyncing = false;

    // --- DYNAMIC RETRY & WAIT TIMER ENGINE ---

    /**
     * Calculates the dynamic wait delay based on the specific error code received:
     * - 429 / Rate Limit: Exponential backoff with jitter to allow token bucket to replenish
     * - 500 / 502: Immediate / minimal retry (150-300ms) for transient socket glitches
     * - 503 / 504 / Overload: Moderate backoff
     * - Network glitches: Quick retry
     */
    calculateRetryDelay(error: any, attempt: number, options?: { initialDelayMs?: number; maxDelayMs?: number; backoffFactor?: number }) {
        return calculateDynamicWaitMs(error, attempt, options);
    }

    /**
     * Executes an operation with error-code-specific dynamic wait timer and circuit-breaker awareness.
     */
    async executeWithDynamicRetry<T>(
        taskName: string,
        operation: () => Promise<T>,
        opts: LorepackRetryOptions = {}
    ): Promise<T> {
        const maxRetries = opts.maxRetries ?? 4;
        let lastError: any = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            // Check circuit breaker state if applicable
            const circuit = geminiCircuitBreaker.canExecute();
            if (!circuit.allowed) {
                const waitSec = Math.ceil(circuit.timeRemainingMs / 1000);
                throw new CircuitBreakerOpenError(
                    `[${taskName}] Paused by Gemini Circuit Breaker. System is recovering (${waitSec}s remaining).`,
                    circuit.timeRemainingMs
                );
            }

            try {
                const result = await operation();
                return result;
            } catch (error: any) {
                lastError = error;
                const errMsg = error?.message || String(error);

                // Fast-fail on non-retryable errors
                const isRateLimit = isQuotaOrRateLimitError(error);
                if (
                    !isRateLimit &&
                    (
                        errMsg.includes("API Key is missing") ||
                        errMsg.includes("API_KEY_INVALID") ||
                        error.status === 401 ||
                        error.status === 403 ||
                        error.status === 400
                    )
                ) {
                    console.error(`[${taskName}] Non-retryable error:`, errMsg);
                    throw error;
                }

                if (attempt === maxRetries - 1) {
                    console.error(`[${taskName}] All ${maxRetries} retry attempts exhausted. Final error:`, errMsg);
                    throw error;
                }

                // Dynamic wait timer calculated from error code
                const waitInfo = this.calculateRetryDelay(error, attempt, {
                    initialDelayMs: opts.initialDelayMs,
                    maxDelayMs: opts.maxDelayMs,
                    backoffFactor: opts.backoffFactor
                });

                console.warn(
                    `[${taskName}] Attempt ${attempt + 1}/${maxRetries} failed. ${waitInfo.description}. [${errMsg.slice(0, 100)}]`
                );

                if (opts.onRetry) {
                    opts.onRetry(attempt + 1, waitInfo.delayMs, error, waitInfo.reason);
                }

                await new Promise(r => setTimeout(r, waitInfo.delayMs));
            }
        }

        throw lastError || new Error(`[${taskName}] Failed after ${maxRetries} retries.`);
    }

    // --- UTILITIES ---
    
    genSigil(t: string): string {
        return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
    }

    chunk(text: string, maxChars = 2000): string[] {
        const raw = (text || '')
          .replace(/\r/g, '')
          .replace(/([.?!])\s+(?=[A-Z0-9@])/g, '$1|')
          .split('|')
          .map(s => s.trim())
          .filter(Boolean);
    
        const out: string[] = [];
        let buf = '';
        for (const s of raw) {
          if (!buf) {
            buf = s;
            continue;
          }
          if ((buf.length + 1 + s.length) > maxChars) {
            out.push(buf);
            buf = s;
          } else {
            buf += ' ' + s;
          }
        }
        if (buf) out.push(buf);
        return out;
    }

    async getStats(agentId: string) {
        const vectors = await vectorDb.getVectorsByAgent(agentId);
        const edges = await vectorDb.getTripletEdgesByAgent(agentId);
        return { totalNodes: vectors.length, totalEdges: edges.length };
    }

    // --- INGESTION ---

    async ingestBatches(batches: { text: string, source: string, metadata?: any }[], opts: {
        agentId: string,
        onProgress: (progress: { processed: number, written: number, total: number }) => void,
        signal?: AbortSignal
    }) {
        const { agentId, onProgress, signal } = opts;
        // METERED CONCURRENCY: Keep batch size to 6 chunks and concurrency to 2 to prevent quota exhaustion
        const BATCH_SIZE = 6;
        const CONCURRENCY = 2;
        
        let processed = 0;
        let written = 0;

        const groups: { text: string, source: string, metadata?: any }[][] = [];
        for (let i = 0; i < batches.length; i += BATCH_SIZE) {
            groups.push(batches.slice(i, i + BATCH_SIZE));
        }

        const runOne = async (chunkGroup: { text: string, source: string, metadata?: any }[]) => {
            if (signal?.aborted) throw new Error('Aborted');
            
            // Sequential / paced embedding generation with error-specific dynamic retry
            const vectors: (number[] | null)[] = [];
            for (const chunk of chunkGroup) {
                if (signal?.aborted) throw new Error('Aborted');
                try {
                    const vec = await this.executeWithDynamicRetry(
                        `Ingest Embedding (${chunk.source.slice(0, 25)})`,
                        () => getEmbeddings(chunk.text),
                        { maxRetries: 4 }
                    );
                    vectors.push(vec);
                } catch (embErr) {
                    console.warn(`[Lorepack Ingest] Embedding failed after dynamic retries for chunk in "${chunk.source}", continuing:`, embErr);
                    vectors.push(null);
                }
                // Paced throttle between sequential embeddings in the same group to maintain token bucket
                await new Promise(r => setTimeout(r, 150));
            }

            const nowISO = new Date().toISOString();
            const nodes: VectorRecord[] = chunkGroup.map((x, i) => ({
                id: crypto.randomUUID(),
                agentId,
                text: x.text,
                vector: vectors[i]!,
                numMarkId: this.genSigil(x.text),
                source: x.source || 'UNKNOWN',
                timestamp: Date.now(),
                metadata: { 
                    timestamp: nowISO,
                    ...(x.metadata || {})
                }
            })).filter(n => n.vector && Array.isArray(n.vector));

            if (nodes.length > 0) {
                await vectorDb.addVectors(nodes);
                written += nodes.length;
            }
            processed += chunkGroup.length;
            if (onProgress) onProgress({ processed, written, total: batches.length });
        };
        
        const inFlight = new Set<Promise<void>>();
        let idx = 0;
        while (idx < groups.length) {
            if (signal?.aborted) throw new Error('Aborted');
            while(inFlight.size < CONCURRENCY && idx < groups.length) {
                const group = groups[idx++];
                const promise = runOne(group).finally(() => inFlight.delete(promise));
                inFlight.add(promise);
            }
            if (inFlight.size > 0) await Promise.race(Array.from(inFlight));
        }
        await Promise.all(Array.from(inFlight));
        return { ingested: written };
    }

    async ingestConversationalTurn(agentId: string, agentHandle: string, userText: string, modelText: string) {
        const combinedText = `[USER]: ${userText}\n\n[${agentHandle.toUpperCase()}]: ${modelText}`;
        if (combinedText.length < 50) return; // Don't store trivial turns
    
        try {
            const vector = await this.executeWithDynamicRetry(
                `Conversational Turn Embedding (${agentHandle})`,
                () => getEmbeddings(combinedText),
                { maxRetries: 3 }
            );
            if (!vector) return;
    
            const record: VectorRecord = {
                id: crypto.randomUUID(),
                agentId,
                agent: agentHandle,
                text: combinedText,
                vector,
                source: `chat-log-${new Date().toISOString()}`,
                timestamp: Date.now(),
            };
    
            await vectorDb.addVectors([record]);
            console.log(`[LOREPACK] Ingested conversational turn for ${agentHandle}.`);
        } catch (e) {
            console.error(`[LOREPACK] Failed to ingest conversational turn after dynamic retries:`, e);
        }
    }

    // --- GRAPH GENERATION ---
    async buildGraphLite(agentId: string, onProgress: (current: number, total: number, created: number) => void) {
        const nodes = await vectorDb.getVectorsByAgent(agentId);
        let created = 0;
        // Paced concurrency: batch size 3 to respect free and standard tier rate limits
        const BATCH_SIZE = 3;
        let idx = 0;

        while (idx < nodes.length) {
          const batch = nodes.slice(idx, idx + BATCH_SIZE);
          const promises = batch.map(async (node) => {
            try {
              const triplets = await this.executeWithDynamicRetry(
                  `Triplet Extraction (${node.id?.slice(0, 8)})`,
                  () => extractTripletsFromText(node.text),
                  { maxRetries: 4 }
              );
              if (Array.isArray(triplets) && triplets.length > 0) {
                const edges: TripletEdge[] = triplets.map(t => ({
                  id: crypto.randomUUID(),
                  type: 'edge',
                  agentId: agentId.toUpperCase(),
                  sourceId: node.id as string,
                  s: t.s,
                  r: t.r,
                  o: t.o,
                  timestamp: new Date().toISOString()
                }));
                await vectorDb.addTripletEdges(edges);
                return edges.length;
              }
            } catch (e) { 
                console.error("Triplet extraction failed after dynamic retries for a node:", e); 
            }
            return 0;
          });
    
          const results = await Promise.all(promises);
          created += results.reduce((a, b) => a + b, 0);
          idx += BATCH_SIZE;
          if (onProgress) onProgress(Math.min(idx, nodes.length), nodes.length, created);

          // Pacing delay between batches to prevent quota bursts
          if (idx < nodes.length) {
            await new Promise(r => setTimeout(r, 400));
          }
        }
        return created;
    }

    // --- EXPORT ---
    async *yieldExportBatches(agentId: string, batchSize = 1000) {
        const nodes = await vectorDb.getVectorsByAgent(agentId);
        for (let i = 0; i < nodes.length; i += batchSize) {
          yield nodes.slice(i, i + batchSize).map(o => ({
            v: 2, 
            type: 'vector',
            id: o.id,
            a: o.agentId, 
            h: o.agentHandle || '', 
            t: o.text, 
            vec: o.vector,
            m: o.numMarkId, 
            d: o.metadata || {},
            src: o.source,
            ts: o.timestamp,
            p: o.permissions
          }));
        }

        const edges = await vectorDb.getTripletEdgesByAgent(agentId);
        for (let i = 0; i < edges.length; i += batchSize) {
          yield edges.slice(i, i + batchSize).map(e => ({
            v: 2, type: 'edge',
            id: e.id, aid: e.agentId, src: e.sourceId,
            s: e.s, r: e.r, o: e.o,
            ts: e.timestamp
          }));
        }
    }

    // --- IMPORT ---
    async importLorepack(file: File, agentId: string, onProgress: (progress: { processed: number; vectors: number; edges: number }) => void) {
        let isGzip = false;
        try {
            const headerBuffer = await file.slice(0, 2).arrayBuffer();
            const header = new Uint8Array(headerBuffer);
            isGzip = header.length === 2 && header[0] === 0x1f && header[1] === 0x8b;
        } catch (e) {
            console.warn("Failed to check file magic bytes, relying on extension:", e);
            isGzip = file.name.endsWith('.gz');
        }

        let stream = file.stream();
        if (isGzip) {
            stream = stream.pipeThrough(new DecompressionStream('gzip'));
        }
        const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

        let buffer = '';
        let vectorBatch: VectorRecord[] = [];
        let edgeBatch: TripletEdge[] = [];
        const BATCH_WRITE = 500;

        let totalVectors = 0;
        let totalEdges = 0;

        const writeBatches = async () => {
            if (vectorBatch.length) await vectorDb.addVectors(vectorBatch);
            if (edgeBatch.length) await vectorDb.addTripletEdges(edgeBatch);
            
            totalVectors += vectorBatch.length;
            totalEdges += edgeBatch.length;
            const count = totalVectors + totalEdges;

            vectorBatch = [];
            edgeBatch = [];
            if (onProgress) onProgress({ processed: count, vectors: totalVectors, edges: totalEdges });
        };
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += value;
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const n = JSON.parse(line);
                        if (n.type === 'edge') {
                            edgeBatch.push({
                                id: n.id || crypto.randomUUID(), type: 'edge', 
                                agentId: agentId, // OVERRIDE agentId
                                sourceId: n.src,
                                s: n.s, r: n.r, o: n.o,
                                timestamp: n.ts || new Date().toISOString()
                            });
                        } else if (n.t && n.vec) { // Assume it's a vector if it has text and vector
                             const vNode: VectorRecord = {
                                id: n.id || crypto.randomUUID(),
                                agentId: agentId, // OVERRIDE agentId
                                text: n.t || n.text,
                                vector: n.vec || n.vector,
                                source: n.src || file.name || n.source || n.d?.source || 'Imported',
                                timestamp: n.ts || n.timestamp || Date.now(),
                                metadata: n.metadata || n.d || {},
                                numMarkId: n.m,
                                agentHandle: n.h || '',
                                permissions: n.p || n.permissions
                            };
                            vectorBatch.push(vNode);
                        }
                    } catch(e) { console.warn("Skipping malformed line in JSONL", e); }
                    if (vectorBatch.length + edgeBatch.length >= BATCH_WRITE) await writeBatches();
                }
            }
        } catch (error: any) {
            let errorToThrow = error;
            if (error?.message && (error.message.includes("compressed data") || error.message.includes("header check") || error.message.includes("decompressed"))) {
                errorToThrow = new Error(`The compressed data is not valid or corrupted (incorrect header check). If this is a plain JSON or JSONL file, please make sure it does not have a .gz extension.`);
            }
            console.error("Error reading from import stream:", errorToThrow);
            await writeBatches();
            throw errorToThrow; // Re-throw so the UI can catch it
        }

        if (buffer.trim()) {
            try { 
                const n = JSON.parse(buffer.trim());
                if (n.type === 'edge') {
                    edgeBatch.push({
                        id: n.id || crypto.randomUUID(), type: 'edge', 
                        agentId: agentId, // OVERRIDE agentId
                        sourceId: n.src,
                        s: n.s, r: n.r, o: n.o,
                        timestamp: n.ts || new Date().toISOString()
                    });
                } else if (n.t && n.vec) {
                    const vNode: VectorRecord = {
                        id: n.id || crypto.randomUUID(),
                        agentId: agentId, // OVERRIDE agentId
                        text: n.t || n.text,
                        vector: n.vec || n.vector,
                        source: n.src || file.name || n.source || n.d?.source || 'Imported',
                        timestamp: n.ts || n.timestamp || Date.now(),
                        metadata: n.metadata || n.d || {},
                        numMarkId: n.m,
                        agentHandle: n.h || '',
                        permissions: n.p || n.permissions
                    };
                    vectorBatch.push(vNode);
                }
            } catch(e) {
                console.warn("Skipping malformed final line in JSONL", e);
            }
        }

        await writeBatches();
        return { success: true, importedVectors: totalVectors, importedEdges: totalEdges };
    }

    // --- SERVER SYNC ---
    async syncLorepackToServer() {
        if (this.isSyncing) {
            console.log('[LOREPACK SYNC] Background sync already active in another task, skipping duplicate cycle.');
            return;
        }

        this.isSyncing = true;
        console.log('[LOREPACK SYNC] Starting periodic sync to server...');
        const lastSyncTimestamp = parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10);
        const now = Date.now();

        try {
            const allVectors = await vectorDb.getAllVectors();
            const allEdges = await vectorDb.getAllTripletEdges();

            const newVectors = allVectors.filter(v => v.timestamp > lastSyncTimestamp);
            const newEdges = allEdges.filter(e => new Date(e.timestamp).getTime() > lastSyncTimestamp);

            if (newVectors.length === 0 && newEdges.length === 0) {
                console.log('[LOREPACK SYNC] No new data to sync.');
                localStorage.setItem(LAST_SYNC_KEY, String(now));
                return;
            }

            console.log(`[LOREPACK SYNC] Found ${newVectors.length} new vectors and ${newEdges.length} new edges to sync.`);

            const nodesToSync = [
                ...newVectors.map(v => ({ ...v, type: 'vector' })),
                ...newEdges.map(e => ({ ...e, type: 'edge' }))
            ];
            
            // Batching to prevent '413 Request Entity Too Large' errors
            const SYNC_BATCH_SIZE = 500;
            let totalSynced = 0;

            for (let i = 0; i < nodesToSync.length; i += SYNC_BATCH_SIZE) {
                const batch = nodesToSync.slice(i, i + SYNC_BATCH_SIZE);
                const batchIndex = Math.floor(i / SYNC_BATCH_SIZE) + 1;
                console.log(`[LOREPACK SYNC] Sending batch ${batchIndex} with ${batch.length} items...`);
                
                // Wrap server sync in dynamic retry with error code discrimination:
                // 500 -> immediate retry; 429 -> exponential backoff
                const result = await this.executeWithDynamicRetry(
                    `Server Sync Batch ${batchIndex}`,
                    async () => {
                        const response = await fetch('/api/sync', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nodes: batch })
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            const err: any = new Error(`Server sync failed on batch with status ${response.status}: ${errorText}`);
                            err.status = response.status;
                            throw err;
                        }

                        return await response.json();
                    },
                    { maxRetries: 4 }
                );

                totalSynced += batch.length;
                console.log(`[LOREPACK SYNC] Batch successful. Server vault size: ${result?.vaultSize}`);
            }
            
            console.log(`[LOREPACK SYNC] Successfully synced a total of ${totalSynced} items in batches.`);
            
            // Only update the timestamp if all batches succeed
            localStorage.setItem(LAST_SYNC_KEY, String(now));

        } catch (error) {
            console.error('[LOREPACK SYNC] Error syncing with server:', error);
            // Do not update timestamp on error, allowing retry of failed data on next cycle
        } finally {
            this.isSyncing = false;
        }
    }
}

export const factoryService = new FactoryService();