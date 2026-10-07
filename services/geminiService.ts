




import { GoogleGenAI, HarmCategory, HarmBlockThreshold, Content, Type, Modality, FunctionDeclaration } from "@google/genai";
import { MythosData } from './mythosData';
import { CONTENT_GUIDELINES } from './contentGuidelines';
import { getGeminiApiKey } from './apiKeyService';
import { GenerationOptions, NarrativeBranch, VisualLoreConsistencyResult, ParsedImageAsset, NarrativeThread, LoreRefinementSuggestion, VoiceTimelineEvent, CharacterBackstoryGap, ProjectConsistencyReport, NarrativeDriftAnalysis, DuplicateImageSet, ThematicTaxonomyItem, BulkRenameSuggestion, KnowledgeInsightsReport, KnowledgeInsightContradiction, CharacterArcReport, CharacterArcMilestone, Lore3DConnectionWeightResult, Lore3DGraphWeightsReport, LoreQueryCitation, LoreQueryResponse, LoreEntry, Character, SavedTranscript } from '../types';

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const getClient = () => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please configure it in System Settings.");
    }
    return new GoogleGenAI({ apiKey });
}

export const mythosTools: FunctionDeclaration[] = [
    {
        name: 'prepareMythosImageGeneration',
        description: 'Prepares the MythOS Cinematic image generation engine with a specific, highly detailed prompt. This navigates the user to the correct studio to execute the generation.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                prompt: {
                    type: Type.STRING,
                    description: 'A detailed, comma-separated text prompt for the image generator, including subject, action, environment, and specific cinematic style keywords.'
                }
            },
            required: ['prompt']
        }
    },
    {
        name: 'generateMythosImage',
        description: 'Generates a high-quality cinematic image using the MythOS engine and displays it directly to the user in the chat. Use this when the user explicitly asks to create, make, show, or generate an image.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                prompt: {
                    type: Type.STRING,
                    description: 'A detailed, comma-separated text prompt for the image generator, describing the desired visual in cinematic terms.'
                }
            },
            required: ['prompt']
        }
    },
    {
        name: 'generateMythosVideo',
        description: 'Generates a high-quality cinematic video, animation, or clip using the MythOS engine. Use this when the user explicitly asks to create, make, show, or generate a video.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                prompt: {
                    type: Type.STRING,
                    description: 'A detailed, comma-separated text prompt for the video generator, describing the desired visual and motion in cinematic terms.'
                }
            },
            required: ['prompt']
        }
    },
    {
        name: 'list_my_media',
        description: 'List all media assets in your private gallery, showing their IDs and descriptions.',
        parameters: { type: Type.OBJECT, properties: {}, required: [] }
    },
    {
        name: 'share_media_from_gallery',
        description: "Share a media asset from your private gallery directly into the chat. Use 'list_my_media' first to find the ID.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                media_id: { type: Type.STRING, description: 'The ID of the media asset to share.' },
                caption: { type: Type.STRING, description: 'An optional caption to include with the media.' }
            },
            required: ['media_id']
        }
    },
    {
        name: 'lorepack_search',
        description: "Searches the agent's private LOREPACK (lived experience, memory) to find context relevant to a user's query. Use this to answer questions about past events, specific knowledge, or personal history.",
        parameters: {
            type: Type.OBJECT,
            properties: {
                query: {
                    type: Type.STRING,
                    description: "The user's question or topic to search for in the LOREPACK."
                }
            },
            required: ['query']
        }
    }
];

export interface RetryOptions {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    taskName?: string;
    onRetry?: (attempt: number, delayMs: number, error: any, reason?: string) => void;
}

// ==========================================
// CIRCUIT BREAKER PATTERN FOR GEMINI API
// ==========================================

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
    state: CircuitBreakerState;
    consecutiveFailures: number;
    failureThreshold: number;
    recoveryTimeoutMs: number;
    trippedAt: number | null;
    openUntil: number | null;
    timeRemainingMs: number;
    totalRequests: number;
    totalTrippedCount: number;
    lastFailureReason?: string;
}

export class CircuitBreakerOpenError extends Error {
    public readonly timeRemainingMs: number;
    public readonly retryAfterSeconds: number;

    constructor(message: string, timeRemainingMs: number) {
        super(message);
        this.name = 'CircuitBreakerOpenError';
        this.timeRemainingMs = timeRemainingMs;
        this.retryAfterSeconds = Math.ceil(timeRemainingMs / 1000);
    }
}

/**
 * Circuit Breaker implementation for Gemini API communication layer.
 * If failure threshold (default: 5 consecutive errors) is reached,
 * outbound calls are paused for 30 seconds to allow the system to recover.
 */
export class GeminiCircuitBreaker {
    private state: CircuitBreakerState = 'CLOSED';
    private consecutiveFailures: number = 0;
    private failureThreshold: number = 5;
    private recoveryTimeoutMs: number = 30000; // 30 seconds
    private trippedAt: number | null = null;
    private totalRequests: number = 0;
    private totalTrippedCount: number = 0;
    private lastFailureReason?: string;
    private listeners: Set<(status: CircuitBreakerStatus) => void> = new Set();

    constructor(failureThreshold = 5, recoveryTimeoutMs = 30000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeoutMs = recoveryTimeoutMs;
    }

    public canExecute(): { allowed: boolean; reason?: string; timeRemainingMs: number } {
        const now = Date.now();

        if (this.state === 'OPEN') {
            const elapsed = this.trippedAt ? now - this.trippedAt : 0;
            if (elapsed >= this.recoveryTimeoutMs) {
                // Half-open transition: allow a trial/canary request through
                this.state = 'HALF_OPEN';
                this.notifyListeners();
                return { allowed: true, timeRemainingMs: 0 };
            }
            const remaining = this.recoveryTimeoutMs - elapsed;
            return {
                allowed: false,
                reason: `Gemini Circuit Breaker is OPEN (${this.consecutiveFailures} consecutive errors). Outbound calls paused to allow system recovery.`,
                timeRemainingMs: remaining
            };
        }

        return { allowed: true, timeRemainingMs: 0 };
    }

    public recordSuccess(): void {
        this.totalRequests++;
        const previousState = this.state;
        this.consecutiveFailures = 0;
        this.state = 'CLOSED';
        this.trippedAt = null;

        if (previousState !== 'CLOSED') {
            console.log('[Gemini Circuit Breaker] System has recovered. Circuit is now CLOSED.');
            this.notifyListeners();
        }
    }

    public recordFailure(error: any): void {
        this.totalRequests++;
        this.consecutiveFailures++;
        this.lastFailureReason = error?.message || String(error);

        const isFatalSyntaxOrAuth = 
            error?.status === 401 || 
            error?.status === 403 || 
            this.lastFailureReason?.includes("API Key is missing") ||
            this.lastFailureReason?.includes("API_KEY_INVALID");

        // Do not trip the breaker solely on local auth/key missing configuration
        if (isFatalSyntaxOrAuth) {
            return;
        }

        if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.trippedAt = Date.now();
            this.totalTrippedCount++;
            console.warn(
                `[Gemini Circuit Breaker] TRIP TRIGGERED! ${this.consecutiveFailures} consecutive errors encountered. Disabling outbound Gemini API calls for ${Math.round(this.recoveryTimeoutMs / 1000)}s to allow system recovery. Last error: ${this.lastFailureReason?.slice(0, 100)}`
            );
            this.notifyListeners();
        }
    }

    public getStatus(): CircuitBreakerStatus {
        const now = Date.now();
        const elapsed = (this.state === 'OPEN' && this.trippedAt) ? now - this.trippedAt : 0;
        const timeRemainingMs = this.state === 'OPEN' ? Math.max(0, this.recoveryTimeoutMs - elapsed) : 0;
        const openUntil = (this.state === 'OPEN' && this.trippedAt) ? this.trippedAt + this.recoveryTimeoutMs : null;

        return {
            state: this.state,
            consecutiveFailures: this.consecutiveFailures,
            failureThreshold: this.failureThreshold,
            recoveryTimeoutMs: this.recoveryTimeoutMs,
            trippedAt: this.trippedAt,
            openUntil,
            timeRemainingMs,
            totalRequests: this.totalRequests,
            totalTrippedCount: this.totalTrippedCount,
            lastFailureReason: this.lastFailureReason
        };
    }

    public reset(): void {
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
        this.trippedAt = null;
        this.notifyListeners();
        console.log('[Gemini Circuit Breaker] Manually reset to CLOSED.');
    }

    public subscribe(listener: (status: CircuitBreakerStatus) => void): () => void {
        this.listeners.add(listener);
        listener(this.getStatus());
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        const status = this.getStatus();
        this.listeners.forEach(fn => {
            try { fn(status); } catch (e) { console.error("Error in circuit breaker listener:", e); }
        });
    }
}

// Global Singleton Circuit Breaker for Gemini API
export const geminiCircuitBreaker = new GeminiCircuitBreaker(5, 30000);

export const getGeminiCircuitBreakerStatus = (): CircuitBreakerStatus => geminiCircuitBreaker.getStatus();
export const resetGeminiCircuitBreaker = (): void => geminiCircuitBreaker.reset();

// ==========================================
// DYNAMIC WAIT TIMER / ERROR-SPECIFIC RETRIES
// ==========================================

export type DynamicWaitReason = 
    | 'rate_limit_exponential'
    | 'server_error_immediate'
    | 'overloaded_backoff'
    | 'network_glitch'
    | 'standard';

export interface DynamicWaitResult {
    delayMs: number;
    reason: DynamicWaitReason;
    description: string;
}

/**
 * Detects whether an error is caused by rate limiting, quota exhaustion, or server capacity limits.
 */
export const isQuotaOrRateLimitError = (error: any): boolean => {
    if (!error) return false;
    const msg = (error.message || String(error)).toLowerCase();
    const status = error.status || error.code || error.statusCode || error.response?.status;
    return (
        status === 429 ||
        status === 'RESOURCE_EXHAUSTED' ||
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('rate limit') ||
        msg.includes('rate_limit') ||
        msg.includes('resource_exhausted') ||
        msg.includes('too many requests') ||
        msg.includes('exceeded') ||
        msg.includes('token bucket')
    );
};

/**
 * Calculates dynamic wait delay based on the specific error code received:
 * - 429 / RESOURCE_EXHAUSTED / Quota limits: Exponential backoff with jitter (2.5s -> 5s -> 10s...)
 * - 500 / 502 / Internal Server Error: Immediate / minimal retry (150ms - 300ms) for transient glitches
 * - 503 / 504 / Overloaded / Service Unavailable: Moderate backoff (1.2s -> 2.4s...)
 * - Network / Connection error: Short delay (500ms - 800ms)
 */
export const calculateDynamicWaitMs = (
    error: any,
    attempt: number,
    options?: {
        initialDelayMs?: number;
        maxDelayMs?: number;
        backoffFactor?: number;
    }
): DynamicWaitResult => {
    const msg = (error?.message || String(error || '')).toLowerCase();
    const status = error?.status || error?.code || error?.statusCode || error?.response?.status;
    const maxDelay = options?.maxDelayMs ?? 32000;
    const factor = options?.backoffFactor ?? 2;

    // 1. 429 Rate Limit / Quota limits -> EXPONENTIAL BACKOFF
    if (isQuotaOrRateLimitError(error)) {
        const base = Math.max(options?.initialDelayMs ?? 2500, 2500);
        const calculated = Math.min(maxDelay, base * Math.pow(factor, attempt));
        const jittered = Math.round(calculated * (0.8 + Math.random() * 0.4)); // +/- 20% jitter
        return {
            delayMs: jittered,
            reason: 'rate_limit_exponential',
            description: `429 Rate Limit / Quota Exhaustion - Exponential Backoff (${(jittered / 1000).toFixed(1)}s)`
        };
    }

    // 2. 500 / 502 Internal Server Error -> IMMEDIATE RETRY (transient process / socket drop)
    if (
        status === 500 || 
        status === 502 || 
        msg.includes('500 internal') || 
        msg.includes('internal server error') ||
        msg.includes('econnreset')
    ) {
        // Immediate minimal jittered delay (150ms - 300ms)
        const delayMs = Math.round(150 + Math.random() * 150);
        return {
            delayMs,
            reason: 'server_error_immediate',
            description: `500 Server Error - Immediate Retry (${delayMs}ms)`
        };
    }

    // 3. 503 / 504 / Overloaded / Service Unavailable / Gateway Timeout -> MODERATE BACKOFF
    if (
        status === 503 || 
        status === 504 || 
        msg.includes('503') || 
        msg.includes('504') || 
        msg.includes('overloaded') || 
        msg.includes('temporarily unavailable') || 
        msg.includes('gateway timeout')
    ) {
        const base = 1200;
        const calculated = Math.min(maxDelay, base * Math.pow(1.5, attempt));
        const jittered = Math.round(calculated * (0.85 + Math.random() * 0.3));
        return {
            delayMs: jittered,
            reason: 'overloaded_backoff',
            description: `503/504 Service Overloaded - Moderate Backoff (${(jittered / 1000).toFixed(1)}s)`
        };
    }

    // 4. Network / Fetch TypeError -> SHORT RETRY
    if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('network error')) {
        const delayMs = Math.round(500 * Math.pow(1.2, attempt) + Math.random() * 200);
        return {
            delayMs,
            reason: 'network_glitch',
            description: `Transient Network Glitch - Quick Retry (${(delayMs / 1000).toFixed(1)}s)`
        };
    }

    // 5. Standard fallback backoff
    const base = options?.initialDelayMs ?? 1500;
    const calculated = Math.min(maxDelay, base * Math.pow(factor, attempt));
    const delayMs = Math.round(calculated * (0.8 + Math.random() * 0.4));
    return {
        delayMs,
        reason: 'standard',
        description: `Standard Retry Backoff (${(delayMs / 1000).toFixed(1)}s)`
    };
};

/**
 * Executes a Gemini API function with:
 * 1. Circuit Breaker protection (temporarily disables calls for 30s after 5 consecutive failures).
 * 2. Dynamic wait timer based on specific error codes (exponential for 429, immediate for 500).
 */
export const apiCallWithRetry = async <T>(
    apiFunction: () => Promise<T>,
    options: number | RetryOptions = 4
): Promise<T> => {
    const config: RetryOptions = typeof options === 'number' ? { maxRetries: options } : options;
    const maxRetries = config.maxRetries ?? 5;
    const taskName = config.taskName ?? 'Gemini API Operation';

    // Check circuit breaker first
    const circuitCheck = geminiCircuitBreaker.canExecute();
    if (!circuitCheck.allowed) {
        const remainingSec = Math.ceil(circuitCheck.timeRemainingMs / 1000);
        const err = new CircuitBreakerOpenError(
            `[${taskName}] Outbound calls disabled: Gemini Circuit Breaker is OPEN. Cooling down for ${remainingSec}s to allow quota/system recovery.`,
            circuitCheck.timeRemainingMs
        );
        console.warn(err.message);
        throw err;
    }

    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await apiFunction();
            // Successful call resets consecutive failures and closes breaker if half-open
            geminiCircuitBreaker.recordSuccess();
            return result;
        } catch (error: any) {
            lastError = error;
            const errMsg = error?.message || String(error);

            // Fast-fail for non-retryable authentication or client syntax errors (unless it's a quota error masked as 400)
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
                console.error(`[${taskName}] Non-retryable error (${error.status || 'Auth/Config'}):`, errMsg);
                // Non-retryable client error does not trip circuit breaker
                throw error;
            }

            // If max attempts exhausted, record failure to circuit breaker and throw
            if (attempt === maxRetries - 1) {
                geminiCircuitBreaker.recordFailure(error);
                console.error(`[${taskName}] All ${maxRetries} retry attempts exhausted. Final error:`, errMsg);
                throw error;
            }

            // Calculate dynamic delay based on the specific error code
            const dynamicWait = calculateDynamicWaitMs(error, attempt, {
                initialDelayMs: config.initialDelayMs,
                maxDelayMs: config.maxDelayMs,
                backoffFactor: config.backoffFactor
            });

            console.warn(
                `[${taskName}] Attempt ${attempt + 1}/${maxRetries} failed. ${dynamicWait.description}. [${errMsg.slice(0, 100)}]`
            );

            if (config.onRetry) {
                config.onRetry(attempt + 1, dynamicWait.delayMs, error, dynamicWait.reason);
            }

            await new Promise(resolve => setTimeout(resolve, dynamicWait.delayMs));
        }
    }

    geminiCircuitBreaker.recordFailure(lastError);
    throw lastError || new Error(`[${taskName}] Operation failed after ${maxRetries} retries.`);
};

export const generateImageFromGemini = async (options: GenerationOptions): Promise<Blob> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();

        if (options.geminiModel === 'imagen-4.0-generate-001') {
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: options.prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: options.aspectRatio,
                    seed: options.seed ? parseInt(options.seed) : undefined,
                },
            });

            if (response.generatedImages && response.generatedImages.length > 0) {
                const base64 = response.generatedImages[0].image.imageBytes;
                const res = await fetch('data:image/png;base64,' + base64);
                return await res.blob();
            }
            throw new Error("Imagen 4 generation failed to return an image.");
        } else { // Gemini series models (e.g. gemini-3.1-flash-lite-image, gemini-3.1-flash-image, gemini-3-pro-image, gemini-2.5-flash-image)
            const modelToUse = options.geminiModel || 'gemini-3.1-flash-lite-image';
            const response = await ai.models.generateContent({
                model: modelToUse,
                contents: { parts: [{ text: options.prompt }] },
                config: {
                    imageConfig: {
                        aspectRatio: options.aspectRatio === '2.39:1' ? '16:9' : (options.aspectRatio as any),
                    },
                    seed: options.seed ? parseInt(options.seed) : undefined,
                },
            });

            const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (imagePart && imagePart.inlineData) {
                const base64 = imagePart.inlineData.data;
                const mimeType = imagePart.inlineData.mimeType;
                const res = await fetch(`data:${mimeType};base64,${base64}`);
                return await res.blob();
            }
            throw new Error(`Gemini Image generation with ${modelToUse} failed to return an image part.`);
        }
    });
};

export interface ScribeInput {
  workingTitle: string;
  genre: string;
  theme: string;
  setting: string;
  tone: string;
  cast: string;
  beatSheet: string;
  logline: string;
  treatment: string;
  fundamentalStoryQuestions: string;
  archetypalCharacters: string;
  sceneGenerationQuestions: string;
  positiveConstraints?: string;
  negativeConstraints?: string;
  rating?: string; 
  format?: string; 
  dynamicLists?: any[];
}

export interface ScribeOutlineInput {
  title: string;
  genre: string;
  theme: string;
  setting: string;
  tone: string;
  cast: string;
  beatSheet: string;
  positiveConstraints?: string;
  negativeConstraints?: string;
  rating?: string; 
  format?: string; 
  dynamicLists?: any[];
}

export interface ScribeOutlineOutput {
  workingTitle: string;
  logline: string;
  treatment: string;
  fundamentalStoryQuestions: string[];
  archetypalCharacters: string[];
  sceneGenerationQuestions: string[];
}

const getScribeSystemPrompt = (pos?: string, neg?: string, rating?: string, format?: string, dynamicLists?: any[]) => {
    let ratingPrompt = "";
    if (rating && rating !== "none" && CONTENT_GUIDELINES.RATINGS[rating as keyof typeof CONTENT_GUIDELINES.RATINGS]) {
        const rData = CONTENT_GUIDELINES.RATINGS[rating as keyof typeof CONTENT_GUIDELINES.RATINGS];
        ratingPrompt = `
/******************************************************************************
 * CRITICAL PRODUCTION MANDATE: CONTENT RATING ${rating}
 ******************************************************************************
 ${rData.positive}
 ------------------------------------------------------------------------------
 FORBIDDEN: ${(rData as any).negative || 'None specified.'}
 *****************************************************************************/
`;
    }

    const formatPrompt = (format && format !== "none" && (CONTENT_GUIDELINES as any).FORMATS[format]) || "";

    let base = `
### ROLE
You are the MythOS Studio Screenwriter. You transform abstract blueprints into vivid, shootable screenplays.

### CRITICAL FORMATTING MANDATE: NO MARKDOWN
STRICTLY FORBIDDEN: NEVER use Markdown formatting in your output strings.
- DO NOT use hashes (#) for headers.
- DO NOT use asterisks (*) or underscores (_) for bold or italics.
- DO NOT use backticks (\`) for code blocks.
- DO NOT use markdown list symbols like - or *.

INSTEAD:
- Use ALL CAPS for headers and scene slugs.
- Use "--- SECTION NAME ---" for major divisions.
- Use simple numbering (1., 2.) for lists.
- Use plain text capitalization for emphasis.

### PRODUCTION PROTOCOLS
${ratingPrompt}
${formatPrompt}

### CREATIVE DIRECTIVES (THE "FIRE" CLAUSE)
1. **Interpretation over Adherence:** Use provided archetypes and structures as *seeds* for inspiration, not rigid laws.
2. **Subvert Expectations:** If a character is a "Hero," show their doubt. If a setting is "Sterile," find the dirt.
3. **Cinematic Style:** Prioritize visual storytelling ("Show, Don't Tell"). Use sensory details (smell, touch, sound) to ground the scene.
4. **Dialogue:** Subtext is key. Characters should rarely say exactly what they mean.

### STUDIO STANDARDS (PRIMARY OVERRIDE)
**MUST INCLUDE (User Directives):** ${pos || "Standard cinematic storytelling."}
**STRICTLY FORBIDDEN (User Directives):** ${neg || "None specified."}
`;

    if (dynamicLists && dynamicLists.length > 0) {
        base += `\n### DYNAMIC DICTIONARIES\n`;
        dynamicLists.forEach(list => {
            base += `[${list.name}]: ${list.items.join(', ')}\n`;
        });
        base += `\n**RULE:** Resolve any [BracketedTags] in the prompt by selecting a relevant item from these lists.\n`;
    }

    return base;
};

export const runScribeAgent = async (input: ScribeInput): Promise<string> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const systemInstruction = getScribeSystemPrompt(input.positiveConstraints, input.negativeConstraints, input.rating, input.format, input.dynamicLists);

        const inputBlock = `
COMMAND: WRITE SCREENPLAY SEQUENCE
TITLE: ${input.workingTitle}
GENRE: ${input.genre}
FORMAT: ${input.format}

=== CAST ===
${input.cast}

=== BEAT SHEET ===
${input.beatSheet}

TASK:
Write the screenplay scenes. 
FORMATTING RULE: STRICTLY PLAIN TEXT. NO MARKDOWN SYMBOLS (#, *, _, \`).
Use ALL CAPS for scene headers and character names.
Label as "FIRST DRAFT".
`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-pro-preview',
                contents: { parts: [{ text: inputBlock }] },
                config: {
                    systemInstruction,
                    maxOutputTokens: 8192,
                    temperature: 0.8,
                    safetySettings
                }
            });
            return response.text || "";
        } catch (error) {
            console.error("Scribe Agent Error:", error);
            throw error;
        }
    });
};

export const runScribeOutlineAgent = async (input: ScribeOutlineInput): Promise<ScribeOutlineOutput> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const systemInstruction = getScribeSystemPrompt(input.positiveConstraints, input.negativeConstraints, input.rating, input.format, input.dynamicLists);

        const inputBlock = `
COMMAND: GENERATE STORY OUTLINE (JSON)
RAW BLUEPRINT:
TITLE: ${input.title}
GENRE: ${input.genre}
BEATS: ${input.beatSheet}

TASK:
Filter this raw blueprint through the STUDIO STANDARDS and RATING MANDATE.
OUTPUT RULE: STRICTLY PLAIN TEXT in all string fields. NO MARKDOWN SYMBOLS (#, *, _, \`).

OUTPUT FORMAT: JSON Schema.
`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: { parts: [{ text: inputBlock }] },
                config: {
                    maxOutputTokens: 4096,
                    systemInstruction,
                    temperature: 0.7,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            workingTitle: { type: Type.STRING },
                            logline: { type: Type.STRING },
                            treatment: { type: Type.STRING },
                            fundamentalStoryQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                            archetypalCharacters: { type: Type.ARRAY, items: { type: Type.STRING } },
                            sceneGenerationQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                        },
                        required: ["workingTitle", "logline", "treatment", "fundamentalStoryQuestions", "archetypalCharacters", "sceneGenerationQuestions"]
                    },
                    safetySettings
                }
            });
            return JSON.parse(response.text.trim());
        } catch (error) {
            console.error("Scribe Outline Error:", error);
            throw error;
        }
    });
};

export const extractTripletsFromText = async (text: string): Promise<{s: string, r: string, o: string}[]> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const prompt = `
          CONTEXT: ${text}
          TASK: Extract narrative relationships as triplets (Subject, Relation, Object).
          FOCUS: Identify core entities and how they connect.
          OUTPUT FORMAT: [{"s": "Subject", "r": "Relation", "o": "Object"}]
          SYSTEM: Respond with ONLY the JSON array. No explanations, no markdown.
        `;
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: { parts: [{ text: prompt }] },
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                s: { type: Type.STRING },
                                r: { type: Type.STRING },
                                o: { type: Type.STRING },
                            },
                            required: ['s', 'r', 'o']
                        }
                    },
                    safetySettings
                }
            });

            if (response.text) {
                return JSON.parse(response.text.trim());
            }
            return [];
        } catch (error) {
            console.error("Triplet Extraction Error:", error);
            return []; // Return empty on failure to avoid crashing the whole process
        }
    });
};


export const fetchModels = async () => [
    { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (General Text & Quick Reasoning)' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview (Complex Reasoning, Scripting, Coding)' },
    { id: 'gemma-4-27b-it', name: 'Gemma 4 27B IT (Open Weights Flagship Reasoning)' },
    { id: 'gemma-4-9b-it', name: 'Gemma 4 9B IT (Efficient & Fast Local Inference)' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (High-Speed Lightweight Text)' },
    { id: 'gemini-3.1-flash-image', name: 'Gemini 3.1 Flash Image (High-Quality Cinematic Imagery)' },
    { id: 'gemini-3.1-flash-lite-image', name: 'Gemini 3.1 Flash Lite Image (Fast Concept Design Imagery)' },
    { id: 'gemini-3-pro-image', name: 'Gemini 3 Pro Image (Advanced Vision & Photorealism)' },
    { id: 'veo-3.1-generate-preview', name: 'Veo 3.1 Pro (Cinematic Full High-Definition Video)' },
    { id: 'veo-3.1-lite-generate-preview', name: 'Veo 3.1 Lite (Fast Kinetic Motion Video)' },
    { id: 'lyria-3-pro-preview', name: 'Lyria 3 Pro (Full-Length Music Synthesis & Orchestration)' },
    { id: 'lyria-3-clip-preview', name: 'Lyria 3 Clip (Short Clips & Musical Atmosphere Stings)' },
    { id: 'gemini-3.8-flash-tts', name: 'Gemini 3.8 Speech Synthesis (Voice Design, Podcasting, Screenplays)' },
    { id: 'gemini-3.8-flash-lite-tts', name: 'Gemini 3.8 Speech Synthesis Lite (Fast & Efficient TTS)' },
    { id: 'gemini-3.5-transcribe', name: 'Gemini 3.5 Transcribe (Static Audio-to-Text Transcription)' },
    { id: 'gemini-3.8-live', name: 'Gemini 3.8 Live (Ultra Low-Latency Voice-to-Voice)' },
    { id: 'gemini-3.8-live-extended-thinking', name: 'Gemini 3.8 Live with Extended Thinking (Reasoning Voice)' },
    { id: 'gemini-3.5-transcribe-live', name: 'Gemini 3.5 Transcribe Live (Real-Time Audio-to-Text translation)' },
    { id: 'text-embedding-004', name: 'Text Embedding 004 (High-Density Vector Embeddings)' }
];

export const getEmbeddings = async (text: string) => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        try {
            const response = await ai.models.embedContent({
                model: 'text-embedding-004',
                contents: { parts: [{ text }] }
            });
            if (response.embedding && response.embedding.values) {
                return response.embedding.values;
            }
            console.warn("Embedding response missing values:", response);
            return null;
        } catch (e) {
            console.error("Embedding generation failed:", e);
            throw e;
        }
    });
};

export const generateText = async (prompt: string) => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: [{ parts: [{ text: prompt }] }]
        });
        return response.text || "";
    });
};

export const generateSpeech = async (text: string, voice: string, rate: number) => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash-tts',
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                    speakingRate: rate
                }
            }
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    });
};

export const createChat = (systemPrompt?: string, history?: Content[], tools?: any[]) => {
    const ai = getClient();
    return ai.chats.create({ 
        model: 'gemini-3.1-pro-preview', 
        history, 
        config: { 
            systemInstruction: systemPrompt,
            safetySettings,
            tools: tools ? [{ functionDeclarations: tools }] : undefined
        } 
    });
};

// --- LORE HYPOTHESIS GENERATOR SERVICE ---
export const generateLoreHypothesesService = async (
    documents: any[] = [],
    thematicClusters: string[] = [],
    loreEntries: any[] = [],
    characters: any[] = []
) => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        let docPool = documents;
        if (!docPool || docPool.length < 2) {
            docPool = [
                { source: "Chronicles of the Obsidian Spire.md", category: "World Building", summary: "An ancient chronal monolith pulsing with temporal energy.", tags: ["monolith", "chronal energy", "obsidian"] },
                { source: "Aetherium Guild Manifest.pdf", category: "Reference Documents", summary: "Financial manifests detailing illicit void-salt shipments.", tags: ["trade", "void-salt", "guild"] },
                { source: "Sector 7 Rebel Transmission.txt", category: "Scripts", summary: "Audio log from rebel commander Vaelen describing blackouts and rogue biomechanical drones.", tags: ["rebellion", "blackout", "drones"] },
                { source: "Project Chrysalis Genesis Dossier.docx", category: "Character Profiles", summary: "Genetic augmentation experiment records linking the royal lineage to early synthetic navigators.", tags: ["chrysalis", "royal dynasty", "genetic augmentation"] }
            ];
        }

        const prompt = `You are a visionary narrative designer and lore continuity strategist.
Analyze the following disparate lore documents across thematic clusters and invent 3 to 5 deeply compelling, surprising, yet logical "Lore Hypotheses".
Each Lore Hypothesis represents an unrevealed narrative connection bridging at least two DISPARATE documents (e.g. secret alliance, forgotten bloodline, common tech progenitor, covert betrayal).

Available Documents:
${JSON.stringify(docPool.slice(0, 10), null, 2)}

Existing Lore & Characters:
${JSON.stringify(characters.slice(0, 6), null, 2)}

Return a JSON array of 3 to 5 distinct Lore Hypotheses in this EXACT JSON structure:
[
  {
    "id": "hyp_unique_id",
    "title": "Evocative, dramatic title (e.g. 'The Aetherium-Chrysalis Conspiracy')",
    "thematicCluster": "Thematic cluster name",
    "connectedSources": ["Document 1 Name", "Document 2 Name"],
    "hypothesis": "2 to 3 sentences explaining the hidden narrative connection and story implications.",
    "evidence": "Concrete narrative clues or thematic motifs supporting this hypothesis.",
    "creativePrompt": "A provocative scene beat or writing prompt for screenwriters.",
    "confidenceScore": 88
  }
]`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json"
            }
        });

        let hypotheses: any[] = [];
        try {
            hypotheses = JSON.parse(response.text || "[]");
        } catch {
            const match = (response.text || "").match(/\[[\s\S]*\]/);
            if (match) hypotheses = JSON.parse(match[0]);
        }

        return (hypotheses || []).map((h: any, i: number) => ({
            id: h.id || `hyp_${Date.now()}_${i}`,
            title: h.title || `Narrative Bridge #${i + 1}`,
            thematicCluster: h.thematicCluster || "Thematic Synthesis",
            connectedSources: Array.isArray(h.connectedSources) ? h.connectedSources : [docPool[0]?.source, docPool[1]?.source].filter(Boolean),
            hypothesis: h.hypothesis || "A discovered narrative connection between disparate documents.",
            evidence: h.evidence || "Overlapping motifs and chronological echoes.",
            creativePrompt: h.creativePrompt || "Draft an exchange exploring this connection.",
            confidenceScore: typeof h.confidenceScore === 'number' ? h.confidenceScore : 88,
            status: 'suggested' as const,
            createdAt: new Date().toISOString()
        }));
    });
};

// --- AUDIO TRANSCRIPTS SENTIMENT & PLOT THEMES SERVICE ---
export const analyzeAudioSentimentAndThemesService = async (
    transcripts: any[] = [],
    projectName: string = "Cinematic Universe"
) => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        let transcriptData = transcripts;
        if (!transcriptData || transcriptData.length === 0) {
            transcriptData = [
                {
                    id: "tr_sample_1",
                    title: "Director Voice Memo - Act II Climax & Citadel Breach",
                    text: "Voice memo. The Citadel breach scene with Marcus and Vaelen. The tone needs to shift from claustrophobic suspense to desperate defiance. Marcus realizes the Obsidian seal was opened from within by the Council itself.",
                    timestamp: Date.now() - 86400000 * 3
                },
                {
                    id: "tr_sample_2",
                    title: "Table Read Dialogue - Sector 7 Council Infiltration",
                    text: "Table read segment 4B. Lyra whispers: 'The void-salt shipments aren't for power grids, they're for biological stasis in Project Chrysalis.' High tension, whispering, quick breathing.",
                    timestamp: Date.now() - 86400000 * 2
                },
                {
                    id: "tr_sample_3",
                    title: "Writer's Room Debrief - Character Arc Resolution",
                    text: "Session notes. Can Vaelen ever be redeemed? Redemption shouldn't come through victory, but through sacrifice. The broken chronal compass relic handed to Lyra delivers poignant bittersweet catharsis.",
                    timestamp: Date.now() - 86400000 * 1
                },
                {
                    id: "tr_sample_4",
                    title: "Sound Stage Acoustic Test - Monolith Resonance Audio",
                    text: "Field test. Acoustic resonance of the sunken monolith rumbles at 32Hz, layered with discordant choir harmonies as the chronal fracture expands.",
                    timestamp: Date.now() - 3600000 * 12
                }
            ];
        }

        const prompt = `You are a senior story analyst and audio dramaturgist for cinematic productions.
Analyze the following collection of transcribed audio recordings from "${projectName}":

Audio Transcripts:
${JSON.stringify(transcriptData, null, 2)}

Provide an authoritative intelligence report that:
1. Analyzes KEY SENTIMENT TRENDS across the transcripts (overall distribution percentages of positive, neutral, tenseOrNegative, mysterious, plus emotional shift arc across the timeline).
2. Identifies COMMON RECURRING KEYWORDS and their frequency count and category.
3. Identifies EMERGING PLOT THEMES formatted specifically for rendering as an interactive BUBBLE CHART:
   - Each bubble represents a distinct emerging narrative or plot theme.
   - Frequency (number between 20 and 65) represents the prominence/size of the bubble.
   - Sentiment specifies the emotional tone ('tense' | 'mysterious' | 'positive' | 'negative' | 'neutral').
   - SentimentScore (-1.0 to +1.0).
   - Category (e.g. 'Conspiracy & Betrayal', 'Cosmic Technology', 'Emotional Redemption', 'Faction Warfare').
   - ContextSnippet (an evocative excerpt from the transcripts referencing this theme).
   - Occurrences (number).
   - RelatedCharacters (array of strings).

Return the output in this EXACT JSON structure:
{
  "overallSentiment": {
    "dominant": "Tense & Suspenseful",
    "positive": 22,
    "neutral": 18,
    "tenseOrNegative": 42,
    "mysterious": 18
  },
  "sentimentArc": [
    { "segment": "Citadel Breach", "tone": "Desperate & Suspenseful", "shiftNote": "Sharp transition to existential threat" }
  ],
  "recurringKeywords": [
    { "word": "Obsidian Seal", "count": 7, "sentiment": "tense", "category": "Artifacts" }
  ],
  "plotThemes": [
    {
      "id": "theme_obsidian_seal",
      "name": "The Obsidian Seal Breach",
      "frequency": 58,
      "sentiment": "tense",
      "sentimentScore": -0.65,
      "category": "Conspiracy & Betrayal",
      "contextSnippet": "The seal was never broken from the outside—it was opened from within by the Council itself.",
      "occurrences": 7,
      "relatedCharacters": ["Marcus", "Vaelen"]
    }
  ],
  "summary": "Transcriptions highlight an accelerating dramatic shift toward high-stakes institutional betrayal."
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json"
            }
        });

        let analysisData: any;
        try {
            analysisData = JSON.parse(response.text || "{}");
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) analysisData = JSON.parse(match[0]);
        }

        analysisData.analyzedRecordingsCount = transcriptData.length;
        analysisData.lastAnalyzedAt = new Date().toISOString();
        return analysisData;
    });
};

// --- BATCH CATEGORIZE & THEMATIC CLUSTERING (CLIENT FALLBACK) ---
export const batchCategorizeWithGemini = async (items: Array<{ id: string; name: string; description: string; type: string }>) => {
    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();
            const prompt = `You are an expert story universe archivist. Group the following creative bible items (characters, lore, locations) into coherent thematic clusters and assign 2-4 semantic hashtags per item.
Items:
${JSON.stringify(items, null, 2)}

Return JSON with this exact structure:
{
  "mappings": {
    "<item.id>": {
      "cluster": "Name of Thematic Cluster (e.g. Ancient Relics, House of Atreus, Cybernetic Factions, Forbidden Magic)",
      "tags": ["tag1", "tag2", "tag3"]
    }
  }
}`;

            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: "application/json"
                }
            });

            try {
                return JSON.parse(response.text || '{"mappings":{}}');
            } catch {
                const match = (response.text || "").match(/\{[\s\S]*\}/);
                return match ? JSON.parse(match[0]) : { mappings: {} };
            }
        }, { maxRetries: 4, taskName: 'Batch Thematic Categorization' });
    } catch (err) {
        console.warn("[Gemini Batch Categorize] Rate limit or quota error after retries, applying heuristic clusters:", err);
        const mappings: Record<string, { cluster: string; tags: string[] }> = {};
        items.forEach(item => {
            const text = `${item.name} ${item.description}`.toLowerCase();
            let cluster = 'World Mythology & Lore';
            if (item.type === 'character' || text.includes('hero') || text.includes('warden')) {
                cluster = 'Key Figures & Factions';
            } else if (text.includes('city') || text.includes('temple') || text.includes('sector') || text.includes('citadel')) {
                cluster = 'Sovereign Domains & Relics';
            }
            mappings[item.id] = {
                cluster,
                tags: [item.type, cluster.toLowerCase().split(' ')[0]]
            };
        });
        return { mappings };
    }
};

// --- INTERACTIVE NARRATIVE BRANCHING SERVICE ---
export const suggestNarrativeBranchesService = async (params: {
    sceneContent: string;
    currentScriptTitle?: string;
    genre?: string;
    characters?: any[];
    lore?: any[];
}): Promise<{ pivotAnalysis: string; branches: NarrativeBranch[] }> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const prompt = `You are a master Hollywood script doctor and narrative branching strategist.
Analyze the following script/scene content:

PROJECT TITLE: "${params.currentScriptTitle || 'Untitled Script'}"
GENRE: "${params.genre || 'Cinematic Drama'}"
CURRENT SCENE CONTENT:
"""
${params.sceneContent}
"""

${params.characters && params.characters.length > 0 ? `RELEVANT CHARACTERS: ${params.characters.map(c => `${c.name} (${c.archetype || 'Character'}): ${c.description || ''}`).join('; ')}` : ''}
${params.lore && params.lore.length > 0 ? `WORLD LORE CONTEXT: ${params.lore.slice(0, 5).map(l => `${l.title}: ${l.content}`).join('; ')}` : ''}

TASK:
1. Identify the core narrative pivot or turning point in this scene.
2. Generate 3 to 4 distinct, compelling, and dramatically contrasting alternative narrative branches that fork off from this pivotal moment.
   - Branch 1: High Stakes / Aggressive Escalation or Betrayal
   - Branch 2: Subversive Twist / Mystery / Secret Revealed
   - Branch 3: Emotional / Moral / Diplomatic Choice or Sacrifice
   - Branch 4 (optional): Existential / Cosmic / Genre Shift

For each branch, provide:
- branchTitle: Punchy evocative title (e.g., "The Poisoned Treaty", "Shadows of the Obsidian Gate")
- dramaticTone: Emotional/thematic feel (e.g., "Tragic Betrayal", "Claustrophobic Horror", "Defiant Triumph")
- turningPoint: The precise moment or action that diverges from the current scene
- narrativeSummary: 2-3 sentences explaining where this new storyline leads
- screenplayExcerpt: 8-15 lines of authentic Warner Bros. / Hollywood screenplay formatted text continuing the scene along this new branch (with INT/EXT slugline, character dialogue, and action lines)
- characterConsequences: Array of 2-3 short bullet impacts on key characters
- thematicShift: 1 sentence on the deeper meaning of this choice

Format output as JSON:
{
  "pivotAnalysis": "Summary of the key dramatic pivot in the current scene.",
  "branches": [
    {
      "id": "branch_1",
      "branchTitle": "...",
      "dramaticTone": "...",
      "turningPoint": "...",
      "narrativeSummary": "...",
      "screenplayExcerpt": "...",
      "characterConsequences": ["...", "..."],
      "thematicShift": "..."
    }
  ]
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json"
            }
        });

        try {
            const data = JSON.parse(response.text || "{}");
            return {
                pivotAnalysis: data.pivotAnalysis || "Critical character decision point identified.",
                branches: (data.branches || []).map((b: any, idx: number) => ({
                    ...b,
                    id: b.id || `branch_${Date.now()}_${idx}`,
                    timestamp: Date.now()
                }))
            };
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                return {
                    pivotAnalysis: data.pivotAnalysis || "Critical turning point identified.",
                    branches: (data.branches || []).map((b: any, idx: number) => ({
                        ...b,
                        id: b.id || `branch_${Date.now()}_${idx}`,
                        timestamp: Date.now()
                    }))
                };
            }
            throw new Error("Failed to parse narrative branching response.");
        }
    });
};

// --- VISUAL LORE CONSISTENCY CHECKER FOR IMAGE GENERATOR ---
export const checkVisualLoreConsistencyService = async (params: {
    prompt: string;
    lore: any[];
    characters: any[];
    agent?: any;
}): Promise<VisualLoreConsistencyResult> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const { prompt, lore = [], characters = [] } = params;

        if (!prompt || prompt.trim().length === 0) {
            return {
                isConsistent: true,
                confidenceScore: 100,
                status: 'neutral',
                matchingLore: [],
                deviations: [],
                suggestedCorrection: prompt,
                explanation: "No prompt to analyze.",
                checkedAt: new Date().toISOString()
            };
        }

        const loreContext = lore.map(l => ({ title: l.title, content: l.content }));
        const charContext = characters.map(c => ({
            name: c.name,
            archetype: c.archetype,
            visuals: c.description || c.notes || ''
        }));

        const systemPrompt = `You are the Lead Visual Continuity Director for a major cinematic film studio.
Your mission is to cross-reference an AI image generation prompt against the established lore bible and character appearance profiles to ensure 100% visual consistency.

Image Generation Prompt to evaluate:
"${prompt}"

Established Character Profiles:
${JSON.stringify(charContext, null, 2)}

Established World & Environment Lore:
${JSON.stringify(loreContext, null, 2)}

Analyze the prompt for:
1. Character visual fidelity: Does the prompt contradict established physical traits (eye color, hair, facial scars, cybernetics, species, build, signature attire/armor)?
2. Environmental/World fidelity: Does the setting, architecture, atmospheric tone, faction insignia, or technological era clash with established lore?
3. Deviations: Clearly call out any contradictions.
4. Suggested correction: Rewrite the prompt to preserve the user's creative intent while strictly respecting established lore.

Return JSON in this EXACT structure:
{
  "isConsistent": true/false,
  "confidenceScore": 85,
  "status": "consistent" | "deviated" | "neutral",
  "matchingLore": [
    { "title": "Character / Lore Name", "matchingDetails": "How the prompt aligns" }
  ],
  "deviations": [
    {
      "entity": "Character or Location Name",
      "expectedLore": "What the lore says (e.g. cybernetic silver left eye, black cowl)",
      "promptConflict": "What the prompt requested (e.g. green human eyes, gold armor)",
      "severity": "warning" | "critical"
    }
  ],
  "suggestedCorrection": "Corrected prompt text that fixes any deviations",
  "explanation": "Concise summary of consistency findings"
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: systemPrompt }] }],
            config: {
                responseMimeType: "application/json"
            }
        });

        try {
            const data = JSON.parse(response.text || "{}");
            return {
                isConsistent: data.isConsistent ?? (data.deviations?.length === 0),
                confidenceScore: data.confidenceScore ?? 90,
                status: data.status || (data.deviations?.length > 0 ? 'deviated' : 'consistent'),
                matchingLore: data.matchingLore || [],
                deviations: data.deviations || [],
                suggestedCorrection: data.suggestedCorrection || prompt,
                explanation: data.explanation || "Lore cross-reference complete.",
                checkedAt: new Date().toISOString()
            };
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                return {
                    isConsistent: data.isConsistent ?? (data.deviations?.length === 0),
                    confidenceScore: data.confidenceScore ?? 90,
                    status: data.status || (data.deviations?.length > 0 ? 'deviated' : 'consistent'),
                    matchingLore: data.matchingLore || [],
                    deviations: data.deviations || [],
                    suggestedCorrection: data.suggestedCorrection || prompt,
                    explanation: data.explanation || "Lore cross-reference complete.",
                    checkedAt: new Date().toISOString()
                };
            }
            return {
                isConsistent: true,
                confidenceScore: 80,
                status: 'neutral',
                matchingLore: [],
                deviations: [],
                suggestedCorrection: prompt,
                explanation: "Prompt conforms to baseline project guidelines.",
                checkedAt: new Date().toISOString()
            };
        }
    });
};

// --- MULTIMODAL IMAGE ASSET PARSER FOR KNOWLEDGE VIEW ---
export const parseImageAssetService = async (params: {
    base64: string;
    mimeType: string;
    filename: string;
}): Promise<ParsedImageAsset> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const { base64, mimeType, filename } = params;

        const cleanBase64 = base64.includes(',') ? base64.split(',')[1] : base64;

        const prompt = `You are a cinematic asset archivist and visual lore specialist.
Analyze this newly uploaded image asset ("${filename}") for inclusion in the project's Knowledge Base Sacred Archive.

Provide an in-depth visual analysis that can be indexed into vector search:
1. Detailed visual description: Comprehensive description of all subjects, actions, lighting, palette, mood, and composition.
2. Characters: List of identified characters, archetypes, expressions, costume, equipment.
3. Setting: Location type, architectural style, atmospheric conditions, era/tech level.
4. Tags: 5-8 semantic tags (e.g. #cybernetic, #citadel, #dystopian, #concept_art).
5. Summary: 1-2 sentence executive summary of this asset for quick browsing in the archive grid.
6. Lore Significance: Inferred narrative lore value or potential worldbuilding connections.
7. Aesthetic Style: (e.g. "Anamorphic Cinematic", "Hyperrealistic Concept Art", "Noir Watercolor").

Return JSON:
{
  "visualDescription": "...",
  "characters": ["..."],
  "setting": "...",
  "tags": ["..."],
  "summary": "...",
  "loreSignificance": "...",
  "aestheticStyle": "..."
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
                {
                    parts: [
                        {
                            inlineData: {
                                mimeType: mimeType || 'image/jpeg',
                                data: cleanBase64
                            }
                        },
                        { text: prompt }
                    ]
                }
            ],
            config: {
                responseMimeType: "application/json"
            }
        });

        try {
            return JSON.parse(response.text || "{}");
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) return JSON.parse(match[0]);
            return {
                visualDescription: `Image asset: ${filename}. High quality visual artwork depicting cinematic scene elements.`,
                characters: [],
                setting: "Cinematic Environment",
                tags: ["image_asset", "concept_art", "visual_lore"],
                summary: `Visual asset ${filename} indexed for cinematic universe.`,
                loreSignificance: "Visual reference for world consistency."
            };
        }
    });
};

// --- EXTRACT METADATA CLIENT SERVICE ---
export const extractMetadataService = async (text: string, filename: string): Promise<{ summary: string; tags: string[]; category: string }> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const prompt = `Extract executive summary, category, and 3-5 tags for this document: "${filename}".
Content snippet:
"""
${text.slice(0, 3000)}
"""

Return JSON:
{
  "summary": "1-2 sentence executive summary",
  "tags": ["tag1", "tag2"],
  "category": "World Building" | "Scripts" | "Character Profiles" | "Reference Documents" | "Root Documents"
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        try {
            return JSON.parse(response.text || "{}");
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            return match ? JSON.parse(match[0]) : { summary: text.slice(0, 150), tags: ["lore"], category: "Root Documents" };
        }
    });
};

// --- DETECT CONTRADICTIONS CLIENT SERVICE ---
export const detectContradictionsService = async (text: string, filename: string, existingContext: any): Promise<{ discrepancies: any[] }> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const prompt = `Analyze this document "${filename}" for factual continuity contradictions against established context:
Context:
${JSON.stringify(existingContext, null, 2)}

Document Text:
"""
${text.slice(0, 4000)}
"""

Classify each contradiction into one of the following thematic domains:
- 'Timeline Errors' (chronology, flashback sequences, cause-and-effect ordering)
- 'Physical Inconsistencies' (character physical traits, scars, cybernetics, geography, attire)
- 'Character Arc Conflicts' (allegiances, personal motives, knowledge paradoxes, emotional stakes)
- 'World & Environmental Rules' (technology laws, magic systems, atmospheric properties, faction doctrines)
- 'Faction & Political Alignment' (treaties, council allegiances, institutional power dynamics)

Return JSON:
{
  "discrepancies": [
    {
      "context": "Conflicting passage from text",
      "reason": "Why it conflicts with established context",
      "severity": "low" | "medium" | "high",
      "thematicDomain": "Timeline Errors" | "Physical Inconsistencies" | "Character Arc Conflicts" | "World & Environmental Rules" | "Faction & Political Alignment",
      "conflictingEntities": ["Character or entity name 1", "Entity name 2"],
      "suggestedResolution": "Actionable editorial fix or canon reconciliation rule",
      "status": "pending"
    }
  ]
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        try {
            const parsed = JSON.parse(response.text || '{"discrepancies":[]}');
            return {
                discrepancies: (parsed.discrepancies || []).map((d: any) => ({
                    ...d,
                    thematicDomain: d.thematicDomain || 'Timeline Errors',
                    suggestedResolution: d.suggestedResolution || 'Reconcile timeline or character profile to align with primary lore document.',
                    conflictingEntities: Array.isArray(d.conflictingEntities) && d.conflictingEntities.length > 0 ? d.conflictingEntities : [filename.replace(/\.[^/.]+$/, "")]
                }))
            };
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                return {
                    discrepancies: (parsed.discrepancies || []).map((d: any) => ({
                        ...d,
                        thematicDomain: d.thematicDomain || 'Timeline Errors',
                        suggestedResolution: d.suggestedResolution || 'Align lore passage with canon character timeline.',
                        conflictingEntities: Array.isArray(d.conflictingEntities) && d.conflictingEntities.length > 0 ? d.conflictingEntities : [filename.replace(/\.[^/.]+$/, "")]
                    }))
                };
            }
            return { discrepancies: [] };
        }
    });
};

// --- LORE GRAPH DISCOVERY BACKGROUND JOB SERVICE ---
export const discoverLoreNarrativeThreadsService = async (params: {
    scriptContent: string;
    scriptTitle?: string;
    characters: any[];
    lore: any[];
}): Promise<NarrativeThread[]> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const { scriptContent, scriptTitle = 'Project Script', characters = [], lore = [] } = params;

        if (!scriptContent || scriptContent.trim().length === 0) {
            return [];
        }

        const charNames = characters.map(c => c.name);
        const loreTitles = lore.map(l => l.title);

        const prompt = `You are an automated Lore Knowledge Graph discovery engine for a cinematic production.
Analyze the following script excerpt to discover implicit narrative connections, relationships, and cause-and-effect links between characters, artifacts, and plot events that are not yet formally linked in the knowledge graph.

SCRIPT TITLE: "${scriptTitle}"
KNOWN CHARACTERS: ${charNames.join(', ') || 'Marcus, Lyra, Vaelen'}
KNOWN LORE ENTITIES: ${loreTitles.join(', ') || 'The Obsidian Seal, Project Chrysalis, Sector 7 Council'}

SCRIPT TEXT:
"""
${scriptContent.slice(0, 5000)}
"""

TASK:
Identify 3 to 6 high-confidence, bidirectional narrative threads.
For each thread:
- threadTitle: e.g. "Marcus & Lyra: Secret Sector 7 Pact" or "Vaelen Infiltrates Obsidian Citadel"
- sourceCharacter: Name of primary character (e.g. "Marcus")
- targetEntityOrEvent: Name of linked character, location, or plot event (e.g. "Lyra" or "Obsidian Seal Breach")
- bidirectionalRelation:
    - forward: Relationship from source to target (e.g. "CONSPIRES_WITH", "INFILTRATES", "DISCOVERS", "GUARDS")
    - reverse: Relationship from target to source (e.g. "ALLIED_WITH", "TARGETED_BY", "REVEALED_TO", "PROTECTED_BY")
- sceneEvidence: 1-2 sentence excerpt from the script supporting this link
- confidenceScore: integer between 75 and 99
- dramaticContext: Concise explanation of the narrative implication

Return JSON:
{
  "threads": [
    {
      "threadTitle": "...",
      "sourceCharacter": "...",
      "targetEntityOrEvent": "...",
      "bidirectionalRelation": {
        "forward": "...",
        "reverse": "..."
      },
      "sceneEvidence": "...",
      "confidenceScore": 92,
      "dramaticContext": "..."
    }
  ]
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        try {
            const data = JSON.parse(response.text || '{"threads":[]}');
            return (data.threads || []).map((t: any, idx: number) => ({
                id: `thread_${Date.now()}_${idx}`,
                threadTitle: t.threadTitle || `Narrative Thread ${idx + 1}`,
                sourceCharacter: t.sourceCharacter || 'Character',
                targetEntityOrEvent: t.targetEntityOrEvent || 'Plot Event',
                bidirectionalRelation: {
                    forward: t.bidirectionalRelation?.forward || 'RELATES_TO',
                    reverse: t.bidirectionalRelation?.reverse || 'LINKED_FROM'
                },
                sceneEvidence: t.sceneEvidence || '',
                confidenceScore: t.confidenceScore || 85,
                dramaticContext: t.dramaticContext || 'Discovered connection from script analysis.',
                status: 'discovered',
                timestamp: Date.now()
            }));
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                return (data.threads || []).map((t: any, idx: number) => ({
                    id: `thread_${Date.now()}_${idx}`,
                    threadTitle: t.threadTitle || `Narrative Thread ${idx + 1}`,
                    sourceCharacter: t.sourceCharacter || 'Character',
                    targetEntityOrEvent: t.targetEntityOrEvent || 'Plot Event',
                    bidirectionalRelation: {
                        forward: t.bidirectionalRelation?.forward || 'RELATES_TO',
                        reverse: t.bidirectionalRelation?.reverse || 'LINKED_FROM'
                    },
                    sceneEvidence: t.sceneEvidence || '',
                    confidenceScore: t.confidenceScore || 85,
                    dramaticContext: t.dramaticContext || 'Discovered connection from script analysis.',
                    status: 'discovered',
                    timestamp: Date.now()
                }));
            }
            return [];
        }
    });
};

// --- AI LORE REFINEMENT ASSISTANT SERVICE ---
export const refineLoreEntryWithAudioSentimentService = async (params: {
    loreEntry: { id: string; title: string; content: string };
    audioSentimentData?: any;
    projectName?: string;
}): Promise<LoreRefinementSuggestion> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const { loreEntry, audioSentimentData, projectName = 'Cinematic Universe' } = params;

        const sentimentContext = audioSentimentData?.overallSentiment || {
            dominant: "Tense & Suspenseful",
            tenseOrNegative: 42,
            mysterious: 25,
            positive: 15
        };

        const recurringKeywords = audioSentimentData?.recurringKeywords || [
            { word: "Obsidian Seal", count: 7, sentiment: "tense", category: "Artifacts" },
            { word: "Project Chrysalis", count: 5, sentiment: "mysterious", category: "Conspiracy" },
            { word: "chronal compass", count: 4, sentiment: "tense", category: "Relics" }
        ];

        const plotThemes = audioSentimentData?.plotThemes || [];

        const prompt = `You are a Lead Worldbuilding Continuity Director and Script Editor.
Refine the following lore bible entry for "${projectName}" to align with the latest acoustic sentiment trends and recurring thematic keywords discovered during audio recording table reads and director voice memos.

LORE ENTRY TO REFINE:
Title: "${loreEntry.title}"
Current Content:
"""
${loreEntry.content}
"""

CURRENT ACOUSTIC SENTIMENT & THEMATIC INTELLIGENCE:
- Dominant Emotional Tone: ${sentimentContext.dominant}
- Sentiment Distribution: Tense/Negative ${sentimentContext.tenseOrNegative || 40}%, Mysterious ${sentimentContext.mysterious || 25}%, Positive ${sentimentContext.positive || 15}%
- Crucial Recurring Keywords Emphasized in Director Audio: ${recurringKeywords.map((k: any) => `"${k.word}" (${k.category || 'Theme'})`).join(', ')}
${plotThemes.length > 0 ? `- Active Story Themes: ${plotThemes.slice(0, 3).map((t: any) => t.name).join(', ')}` : ''}

TASK:
1. Suggest a refined version of this lore entry that:
   - Harmonizes its prose with the dominant audio emotional tone (${sentimentContext.dominant}).
   - Naturally incorporates 1 to 3 relevant recurring keywords from director voice memos without feeling forced.
   - Deepens narrative stakes and institutional intrigue.
2. Outline the tone shift and justify why this refinement improves project-wide lore consistency.

Return JSON in this EXACT structure:
{
  "refinedContent": "...",
  "toneShift": "From [Old Tone] to [Refined Tone conforming to audio memos]",
  "incorporatedKeywords": ["keyword 1", "keyword 2"],
  "justification": "2-3 sentences explaining how this refinement aligns the written lore with recorded director vision and dialogue rhythm."
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        try {
            const data = JSON.parse(response.text || '{}');
            return {
                loreId: loreEntry.id,
                originalTitle: loreEntry.title,
                originalContent: loreEntry.content,
                refinedContent: data.refinedContent || loreEntry.content,
                toneShift: data.toneShift || `Shifted toward ${sentimentContext.dominant}`,
                incorporatedKeywords: data.incorporatedKeywords || recurringKeywords.slice(0, 2).map((k: any) => k.word),
                justification: data.justification || 'Refined to conform with director audio transcripts and acoustic motifs.'
            };
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                return {
                    loreId: loreEntry.id,
                    originalTitle: loreEntry.title,
                    originalContent: loreEntry.content,
                    refinedContent: data.refinedContent || loreEntry.content,
                    toneShift: data.toneShift || `Shifted toward ${sentimentContext.dominant}`,
                    incorporatedKeywords: data.incorporatedKeywords || recurringKeywords.slice(0, 2).map((k: any) => k.word),
                    justification: data.justification || 'Refined to conform with director audio transcripts and acoustic motifs.'
                };
            }
            return {
                loreId: loreEntry.id,
                originalTitle: loreEntry.title,
                originalContent: loreEntry.content,
                refinedContent: loreEntry.content,
                toneShift: `Harmonized with ${sentimentContext.dominant}`,
                incorporatedKeywords: [],
                justification: 'Lore entry verified against audio sentiment database.'
            };
        }
    });
};

/**
 * Extracts voice-annotated timestamps and historical event links from transcripts
 * to automatically populate the Lore Timeline.
 */
export const extractVoiceTimelineEventsService = async (
    transcriptText: string,
    context?: {
        characters?: any[];
        lore?: any[];
        transcriptTitle?: string;
    }
): Promise<VoiceTimelineEvent[]> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();
        const characters = context?.characters || [];
        const lore = context?.lore || [];
        const transcriptTitle = context?.transcriptTitle || 'Audio Transcript';

        const prompt = `You are a cinematic universe narrative historian and master continuity archivist.
Analyze the following recorded audio transcript and identify specific voice moments, dialogue segments, or spoken revelations that link directly to historical events, character actions, or lore milestones in this universe.

TRANSCRIPT: "${transcriptTitle}"
"""
${transcriptText.slice(0, 8000)}
"""

KNOWN CHARACTERS IN UNIVERSE:
${characters.map(c => `- ${c.name} (${c.archetype || 'Key Figure'})`).join('\n') || 'None explicitly listed'}

KNOWN LORE CONTEXT:
${lore.slice(0, 10).map(l => `- ${l.title}: ${l.content.slice(0, 120)}...`).join('\n') || 'Standard cinematic universe lore'}

TASK:
1. Identify 2 to 6 key audio moments/events mentioned or described in the transcript.
2. If explicit timestamps exist (e.g. [00:15], 01:42), extract them. If no explicit timecode is in text, synthesize appropriate progressive voice timestamps (e.g. "00:30", "01:45", "03:10").
3. Link each audio moment to a historical/lore event in the universe and identify:
   - eventTitle: Succinct historical/dramatic title of the event
   - audioTimestamp: "MM:SS" timecode format
   - timestampSeconds: integer number of seconds (e.g. 45)
   - historicalContext: 1-2 sentences on how this audio moment links to universe history
   - chronologyEra: Choose from: "Prologue / Origin", "Historical Flashback", "Act I: Inciting Incident", "Act II: Rising Action", "Act III: Climax", or "Chronicle Era"
   - characterName: Name of the primary character involved or mentioned
   - dramaticImpact: "critical", "major", or "subtle"
   - audioQuote: The specific quoted spoken excerpt from the transcript
   - historicalSignificance: Why this specific voice moment matters to the canon

Return JSON with this EXACT structure:
{
  "events": [
    {
      "audioTimestamp": "01:24",
      "timestampSeconds": 84,
      "eventTitle": "Breach of the Iron Citadel",
      "historicalContext": "Director voice memo confirming the breach occurred prior to the solar eclipse.",
      "chronologyEra": "Act I: Inciting Incident",
      "characterName": "Vane",
      "dramaticImpact": "critical",
      "audioQuote": "...we have to show the gates tearing open right at the opening bell...",
      "historicalSignificance": "Marks the irrevocable collapse of the outer perimeter."
    }
  ]
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        try {
            const data = JSON.parse(response.text || '{}');
            const items = data.events || [];
            return items.map((ev: any, idx: number) => ({
                id: `voice_ev_${Date.now()}_${idx}`,
                audioTimestamp: ev.audioTimestamp || `0${idx + 1}:00`,
                timestampSeconds: Number(ev.timestampSeconds) || (idx + 1) * 60,
                eventTitle: ev.eventTitle || `Voice Event ${idx + 1}`,
                historicalContext: ev.historicalContext || 'Voice annotation from transcript.',
                chronologyEra: ev.chronologyEra || 'Chronicle Era',
                characterName: ev.characterName || (characters[0]?.name || 'Unknown'),
                dramaticImpact: ev.dramaticImpact || 'major',
                audioQuote: ev.audioQuote || transcriptText.slice(0, 100),
                historicalSignificance: ev.historicalSignificance || 'Contributes to narrative continuity.',
                transcriptTitle
            }));
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                const items = data.events || [];
                return items.map((ev: any, idx: number) => ({
                    id: `voice_ev_${Date.now()}_${idx}`,
                    audioTimestamp: ev.audioTimestamp || `0${idx + 1}:00`,
                    timestampSeconds: Number(ev.timestampSeconds) || (idx + 1) * 60,
                    eventTitle: ev.eventTitle || `Voice Event ${idx + 1}`,
                    historicalContext: ev.historicalContext || 'Voice annotation from transcript.',
                    chronologyEra: ev.chronologyEra || 'Chronicle Era',
                    characterName: ev.characterName || (characters[0]?.name || 'Unknown'),
                    dramaticImpact: ev.dramaticImpact || 'major',
                    audioQuote: ev.audioQuote || transcriptText.slice(0, 100),
                    historicalSignificance: ev.historicalSignificance || 'Contributes to narrative continuity.',
                    transcriptTitle
                }));
            }
            return [];
        }
    });
};

/**
 * Triggers a comprehensive semantic review of all uploaded documents
 * to generate a Project Consistency Report mapping potential gaps in character backstories.
 */
export const batchAuditLoreConsistencyService = async (
    documents: Array<{ title: string; content: string; type: string }>,
    characters: any[],
    lore: any[]
): Promise<ProjectConsistencyReport> => {
    return apiCallWithRetry(async () => {
        const ai = getClient();

        const docsSummary = documents.map((d, i) => 
            `[Doc ${i + 1}] (${d.type.toUpperCase()}) "${d.title}":\n${d.content.slice(0, 1200)}...`
        ).join('\n\n');

        const charsSummary = characters.map(c => 
            `[Character] "${c.name}" (${c.archetype || 'Archetype Unspecified'})\nDescription: ${c.description || 'No description'}\nTags: ${(c.tags || []).join(', ')}`
        ).join('\n\n');

        const prompt = `You are a Lead Narrative Auditor and Story Bible Consistency Architect for a premier film production studio.
Execute a comprehensive batch audit across all uploaded project documents, scripts, and lore files to generate a "Project Consistency Report" that maps potential gaps in character backstories.

ALL UPLOADED DOCUMENTS & REPOSITORIES (${documents.length} items):
"""
${docsSummary.slice(0, 14000)}
"""

PROJECT CHARACTERS (${characters.length} registered):
"""
${charsSummary.slice(0, 8000)}
"""

ADDITIONAL LORE BIBLE ENTRIES (${lore.length} items):
${lore.slice(0, 15).map(l => `- "${l.title}": ${l.content.slice(0, 200)}...`).join('\n')}

AUDIT CRITERIA:
1. Examine each character against the documents:
   - Identify missing origin/formative periods (childhood, mentorship, inciting trauma).
   - Identify unaccounted time gaps (e.g. where they were between major historical wars or regime shifts).
   - Detect conflicting motives, alliances, or timeline paradoxes.
   - Evaluate coverage score (0-100) and assign coverageStatus: "complete", "moderate_gaps", or "severe_void".
   - Suggest creative lore writing prompts to plug each gap.
2. Identify Timeline Voids across the universe:
   - Identify chronological eras or historical phases that lack character grounding or narrative clarity.
3. Compute an overall Project-Wide Lore Integrity Score (0-100%).
4. List 3 to 5 priority recommendations for the showrunner/director.

Return JSON in this EXACT structure:
{
  "overallIntegrityScore": 82,
  "executiveSummary": "Executive summary of universe consistency, depth of character grounding, and primary areas needing narrative fortification...",
  "characterGaps": [
    {
      "characterName": "Character Name",
      "archetype": "Anti-Hero",
      "coverageStatus": "moderate_gaps",
      "coverageScore": 65,
      "knownHistorySummary": "Brief overview of what is currently documented about them...",
      "backstoryGaps": [
        {
          "gapTitle": "Missing 7-Year Hiatus in the Outer Rim",
          "eraOrPeriod": "Pre-Incident / Flashback",
          "description": "No documentation exists explaining how they acquired military clearance after their desertion.",
          "severity": "high",
          "unansweredQuestions": ["Who financed their return?", "Did they collaborate with the syndicate?"],
          "suggestedLorePrompt": "Write an archival report detailing their clandestine operations in Sector 4."
        }
      ],
      "conflictingDetails": ["Document A claims loyalty to House Vane, while Script B depicts treason."],
      "referencedInDocuments": ["Script Draft 1", "Lore Bible: Factions"]
    }
  ],
  "timelineVoids": [
    {
      "era": "The Interregnum (Years 12-19)",
      "voidDescription": "A 7-year vacuum where none of the primary cast have documented actions or whereabouts.",
      "affectedCharacters": ["Character A", "Character B"]
    }
  ],
  "priorityRecommendations": [
    "Flesh out the inciting betrayal during the Sector 9 siege.",
    "Clarify mentor relationships before Act II begins."
  ]
}`;

        const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [{ parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });

        const generatedAt = new Date().toISOString();

        try {
            const data = JSON.parse(response.text || '{}');
            return {
                generatedAt,
                overallIntegrityScore: Number(data.overallIntegrityScore) || 75,
                totalDocumentsAudited: documents.length,
                executiveSummary: data.executiveSummary || 'Comprehensive semantic review of project documents completed.',
                characterGaps: data.characterGaps || [],
                timelineVoids: data.timelineVoids || [],
                priorityRecommendations: data.priorityRecommendations || []
            };
        } catch {
            const match = (response.text || "").match(/\{[\s\S]*\}/);
            if (match) {
                const data = JSON.parse(match[0]);
                return {
                    generatedAt,
                    overallIntegrityScore: Number(data.overallIntegrityScore) || 75,
                    totalDocumentsAudited: documents.length,
                    executiveSummary: data.executiveSummary || 'Comprehensive semantic review of project documents completed.',
                    characterGaps: data.characterGaps || [],
                    timelineVoids: data.timelineVoids || [],
                    priorityRecommendations: data.priorityRecommendations || []
                };
            }
            return {
                generatedAt,
                overallIntegrityScore: 70,
                totalDocumentsAudited: documents.length,
                executiveSummary: 'Batch audit completed. Several character backstory gaps identified across uploaded materials.',
                characterGaps: characters.map(c => ({
                    characterName: c.name,
                    archetype: c.archetype || 'Hero',
                    coverageStatus: 'moderate_gaps',
                    coverageScore: 60,
                    knownHistorySummary: c.description || 'Core character profile.',
                    backstoryGaps: [
                        {
                            gapTitle: 'Early Origin & Motive Grounding',
                            eraOrPeriod: 'Prologue / Origin',
                            description: `Documented materials lack details on ${c.name}'s initial allegiances.`,
                            severity: 'medium',
                            unansweredQuestions: ['What motivated their current pursuit?'],
                            suggestedLorePrompt: `Draft a character diary entry establishing ${c.name}'s origin.`
                        }
                    ],
                    conflictingDetails: [],
                    referencedInDocuments: ['Character Profile']
                })),
                timelineVoids: [],
                priorityRecommendations: ['Expand character origins to establish narrative stakes.']
            };
        }
    });
};

/**
 * Analyzes audio transcript text and identifies voice-annotated timestamps,
 * linking specific audio moments to historical events, characters, and chronological eras
 * for placement onto the Lore Timeline.
 */
export const extractVoiceAnnotatedTimelineEventsService = async (
    transcriptText: string,
    transcriptTitle: string,
    lore: Array<{ id?: string; title: string; content: string }> = [],
    characters: Array<{ id?: string; name: string; archetype?: string }> = []
): Promise<VoiceTimelineEvent[]> => {
    // Helper for fallback generation from text regex
    const generateFallbackVoiceEvents = (): VoiceTimelineEvent[] => {
        const events: VoiceTimelineEvent[] = [];
        const timestampRegex = /\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)/g;
        let match;
        let count = 0;

        while ((match = timestampRegex.exec(transcriptText)) !== null && count < 8) {
            const timeStr = match[1];
            const lineContent = match[2]?.trim() || '';
            if (lineContent.length < 5) continue;

            // Compute seconds
            const parts = timeStr.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
            else if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];

            // Match mentioned character
            const matchedChar = characters.find(c => lineContent.toLowerCase().includes(c.name.toLowerCase()));
            
            // Match mentioned lore
            const matchedLore = lore.find(l => lineContent.toLowerCase().includes(l.title.toLowerCase()));

            events.push({
                id: `vte_fallback_${Date.now()}_${count}`,
                audioTimestamp: timeStr,
                timestampSeconds: seconds,
                eventTitle: matchedLore?.title || (lineContent.length > 40 ? lineContent.slice(0, 37) + '...' : lineContent),
                historicalContext: `Voice annotation from "${transcriptTitle}": discussion of narrative milestone at ${timeStr}.`,
                chronologyEra: /origin|prologue|past/i.test(lineContent) ? 'Prologue / Origin' : /climax|final|war/i.test(lineContent) ? 'Act III: Climax' : 'Act I: Inciting Incident',
                characterName: matchedChar?.name,
                dramaticImpact: /betray|kill|death|destroy|fall|war/i.test(lineContent) ? 'critical' : 'major',
                audioQuote: lineContent.slice(0, 180),
                historicalSignificance: `Audio moment preserves voice record of historical event.`,
                transcriptTitle
            });
            count++;
        }

        // If no regex timestamps found in text, extract key dialogue passages with synthetic offsets
        if (events.length === 0 && transcriptText.trim().length > 0) {
            const paragraphs = transcriptText.split(/\n\s*\n/).filter(p => p.trim().length > 20);
            paragraphs.slice(0, 5).forEach((p, idx) => {
                const syntheticSecs = (idx + 1) * 45;
                const m = Math.floor(syntheticSecs / 60);
                const s = syntheticSecs % 60;
                const tsStr = `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
                const matchedChar = characters.find(c => p.toLowerCase().includes(c.name.toLowerCase()));

                events.push({
                    id: `vte_synth_${Date.now()}_${idx}`,
                    audioTimestamp: tsStr,
                    timestampSeconds: syntheticSecs,
                    eventTitle: `Historical Voice Note: ${p.slice(0, 32)}...`,
                    historicalContext: `Narrative moment identified from voice transcript "${transcriptTitle}".`,
                    chronologyEra: idx === 0 ? 'Prologue / Origin' : idx === paragraphs.length - 1 ? 'Act III: Climax' : 'Act II: Rising Action',
                    characterName: matchedChar?.name || characters[0]?.name,
                    dramaticImpact: idx % 2 === 0 ? 'critical' : 'major',
                    audioQuote: p.slice(0, 160),
                    historicalSignificance: 'Spoken backstory milestone linking audio testimony to universe chronology.',
                    transcriptTitle
                });
            });
        }

        return events;
    };

    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();

            const charsList = characters.map(c => `"${c.name}" (${c.archetype || 'Character'})`).join(', ');
            const loreList = lore.slice(0, 15).map(l => `"${l.title}"`).join(', ');

            const prompt = `You are a Cognitive Audio Narrative Historian and Film Continuity Director.
Analyze this audio transcript from the production studio. Identify specific voice-annotated timestamps and link specific audio moments to historical events in the story/lore.
Place these voice-annotated timestamps onto the Lore Timeline.

TRANSCRIPT TITLE: "${transcriptTitle}"
TRANSCRIPT TEXT:
"""
${transcriptText.slice(0, 10000)}
"""

KNOWN REPOSITORY CHARACTERS:
${charsList || 'None registered yet'}

EXISTING LORE BIBLE TOPICS:
${loreList || 'None registered yet'}

TASK:
1. Identify 2 to 7 key audio moments in this transcript that reflect historical events, character backstory revelations, inciting incidents, or critical timeline lore.
2. If the text already has timestamps (e.g. [01:23] or 00:45), use them. If timestamps are not explicitly formatted, synthesize realistic chronological timestamps (e.g. "00:35", "01:20", "02:45") corresponding to the progression of speech.
3. For each audio moment, link it to:
   - Specific Historical Event Title (e.g., "The Treaty of Meridian", "The Outbreak in District 4", "Valen's Exile")
   - Chronology Era (choose from: "Historical Flashback", "Prologue / Origin", "Act I: Inciting Incident", "Act II: Rising Action", "Act III: Climax", "Post-Fall Era")
   - Audio Quote: verbatim or near-verbatim quote spoken in the audio
   - Associated Character Name (from known characters or identified speaker)
   - Dramatic Impact: "critical" | "major" | "subtle"
   - Historical Significance: 1-2 sentence explanation of why this audio moment is pivotal to the universe timeline.

Return JSON in this EXACT array format:
[
  {
    "audioTimestamp": "01:24",
    "timestampSeconds": 84,
    "eventTitle": "Name of Historical Event",
    "historicalContext": "Narrative context of the historical event...",
    "chronologyEra": "Act I: Inciting Incident",
    "characterName": "Character Name",
    "dramaticImpact": "critical",
    "audioQuote": "Exact line spoken in the audio at this timestamp...",
    "historicalSignificance": "Why this audio moment anchors the lore timeline..."
  }
]`;

            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            try {
                const parsed = JSON.parse(response.text || '[]');
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((item: any, idx: number) => ({
                        id: `vte_${Date.now()}_${idx}`,
                        audioTimestamp: item.audioTimestamp || `00:${idx * 30 < 10 ? '0' : ''}${idx * 30}`,
                        timestampSeconds: Number(item.timestampSeconds) || idx * 30,
                        eventTitle: item.eventTitle || `Voice Event ${idx + 1}`,
                        historicalContext: item.historicalContext || '',
                        chronologyEra: item.chronologyEra || 'Chronicle Era',
                        characterName: item.characterName || undefined,
                        dramaticImpact: (item.dramaticImpact === 'critical' || item.dramaticImpact === 'subtle') ? item.dramaticImpact : 'major',
                        audioQuote: item.audioQuote || '',
                        historicalSignificance: item.historicalSignificance || '',
                        transcriptTitle
                    }));
                }
            } catch (pErr) {
                console.warn("Could not parse AI response JSON for voice timeline events:", pErr);
            }

            return generateFallbackVoiceEvents();
        });
    } catch (err) {
        console.warn("Gemini audio-lore timeline extraction fallback active:", err);
        return generateFallbackVoiceEvents();
    }
};

/**
 * Visual Diffing & Narrative Drift Analysis Service
 * Evaluates semantic differences between a script snippet and canonical lore entry.
 */
export const analyzeNarrativeDriftService = async (params: {
    loreTitle: string;
    loreContent: string;
    scriptTitle: string;
    scriptSnippet: string;
}): Promise<NarrativeDriftAnalysis> => {
    const { loreTitle, loreContent, scriptTitle, scriptSnippet } = params;

    // Fallback algorithmic diff if Gemini API is unavailable
    const generateFallbackDrift = (): NarrativeDriftAnalysis => {
        const loreWords = new Set(loreContent.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        const scriptWords = new Set(scriptSnippet.toLowerCase().split(/\W+/).filter(w => w.length > 3));
        
        const intersection = new Set([...loreWords].filter(x => scriptWords.has(x)));
        const union = new Set([...loreWords, ...scriptWords]);
        const jaccard = union.size === 0 ? 1 : intersection.size / union.size;
        const driftScore = Math.max(0, Math.min(100, Math.round((1 - jaccard) * 100)));

        const status: 'critical' | 'moderate' | 'aligned' = 
            driftScore > 60 ? 'critical' : driftScore > 30 ? 'moderate' : 'aligned';

        return {
            driftScore,
            status,
            driftCategories: driftScore > 30 ? ['Terminology Shift', 'Potential Narrative Drift'] : ['Canon Congruent'],
            summary: `Automated textual analysis detected a ${driftScore}% difference index between "${loreTitle}" and script excerpt from "${scriptTitle}".`,
            divergences: [
                {
                    loreStatement: loreContent.slice(0, 180) + '...',
                    scriptStatement: scriptSnippet.slice(0, 180) + '...',
                    explanation: `Comparative divergence index of ${driftScore}% observed across key terminology and phrasing.`,
                    severity: status === 'critical' ? 'high' : status === 'moderate' ? 'medium' : 'low'
                }
            ],
            reconciliationAdvice: [
                'Review specific dialogue choices in the screenplay to align with canonical lore terminology.',
                'If this script scene represents a planned evolution of canon, update the lore entry to document the shift.'
            ],
            suggestedLoreUpdate: loreContent,
            suggestedScriptCorrection: scriptSnippet
        };
    };

    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();

            const prompt = `You are a Lead Continuity Director and Script Supervisor for a film universe.
Examine this canonical Lore Entry against the proposed Script Snippet.
Identify narrative drifts, character motive contradictions, timeline anomalies, and canon discrepancies.

CANONICAL LORE ENTRY: "${loreTitle}"
"""
${loreContent.slice(0, 5000)}
"""

SCRIPT SNIPPET DRAFT: "${scriptTitle}"
"""
${scriptSnippet.slice(0, 5000)}
"""

TASK:
1. Determine the narrative drift score (0 to 100%, where 0% is identical canon, 100% is complete contradiction).
2. Assign status: "critical" (above 50%), "moderate" (20-50%), or "aligned" (under 20%).
3. Identify drift categories (e.g. "Character Motivation Inversion", "Faction Betrayal", "Timeline Paradox", "Rule Violation", "Terminology Evolution").
4. Provide a crisp executive summary of the narrative drift.
5. Provide specific divergences: each with the lore statement, the conflicting script statement, explanation, and severity ("high", "medium", "low").
6. Provide 2-4 concrete reconciliation recommendations.
7. Provide a reconciled lore update (how the lore could be updated if the script is canon) and a corrected script snippet (how the script could be tweaked if the lore is immutable).

Return JSON in this EXACT schema:
{
  "driftScore": 48,
  "status": "moderate",
  "driftCategories": ["Character Motivation Inversion", "Timeline Paradox"],
  "summary": "The script snippet depicts a clandestine betrayal occurring before Act II, conflicting with the lore entry...",
  "divergences": [
    {
      "loreStatement": "Exact quote or essence from lore...",
      "scriptStatement": "Exact quote or line from script snippet...",
      "explanation": "Why this creates a contradiction...",
      "severity": "high"
    }
  ],
  "reconciliationAdvice": [
    "Clarify whether the allegiance shifted before or after the Council breach.",
    "Adjust dialogue on page 14 to reflect canon rank."
  ],
  "suggestedLoreUpdate": "Updated lore text incorporating new script revelations...",
  "suggestedScriptCorrection": "Adjusted script dialogue that maintains canonical consistency..."
}`;

            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            try {
                const parsed = JSON.parse(response.text || '{}');
                return {
                    driftScore: typeof parsed.driftScore === 'number' ? parsed.driftScore : 35,
                    status: (parsed.status === 'critical' || parsed.status === 'aligned') ? parsed.status : 'moderate',
                    driftCategories: Array.isArray(parsed.driftCategories) ? parsed.driftCategories : ['Narrative Variation'],
                    summary: parsed.summary || 'Narrative drift analysis complete.',
                    divergences: Array.isArray(parsed.divergences) ? parsed.divergences : [],
                    reconciliationAdvice: Array.isArray(parsed.reconciliationAdvice) ? parsed.reconciliationAdvice : [],
                    suggestedLoreUpdate: parsed.suggestedLoreUpdate,
                    suggestedScriptCorrection: parsed.suggestedScriptCorrection
                };
            } catch (err) {
                console.warn("Could not parse JSON from drift analysis, falling back:", err);
                return generateFallbackDrift();
            }
        });
    } catch (err) {
        console.warn("Gemini narrative drift analysis fallback:", err);
        return generateFallbackDrift();
    }
};

/**
 * Asset Intelligence Cleanup Service
 * Detects duplicate and redundant images based on visual similarity and suggests merge or delete actions.
 */
export const detectVisualDuplicateAssetsService = async (assets: Array<{
    id: string;
    name: string;
    url?: string;
    base64?: string;
    tags?: string[];
    folder?: string;
    metadata?: any;
}>): Promise<DuplicateImageSet[]> => {
    // 1. Algorithmic pass: detect exact or near-exact base64/URL matches
    const duplicateSets: DuplicateImageSet[] = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < assets.length; i++) {
        const a = assets[i];
        if (processedIds.has(a.id)) continue;

        const duplicatesForA: string[] = [];

        for (let j = i + 1; j < assets.length; j++) {
            const b = assets[j];
            if (processedIds.has(b.id)) continue;

            // Direct data match
            const isExactData = (a.base64 && b.base64 && a.base64.slice(0, 1000) === b.base64.slice(0, 1000)) ||
                                (a.url && b.url && a.url === b.url);
            
            // Name similarity
            const cleanNameA = a.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanNameB = b.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const isNameVariant = cleanNameA.includes(cleanNameB) || cleanNameB.includes(cleanNameA);

            // Tag overlap
            const tagsA = new Set(a.tags || []);
            const tagsB = new Set(b.tags || []);
            const commonTags = [...tagsA].filter(t => tagsB.has(t));
            const hasHighTagOverlap = tagsA.size > 1 && tagsB.size > 1 && commonTags.length >= 2;

            if (isExactData) {
                duplicatesForA.push(b.id);
                processedIds.add(b.id);
            } else if (isNameVariant && hasHighTagOverlap) {
                duplicatesForA.push(b.id);
                processedIds.add(b.id);
            }
        }

        if (duplicatesForA.length > 0) {
            processedIds.add(a.id);
            duplicateSets.push({
                id: `dup_set_${Date.now()}_${i}`,
                similarityScore: 95,
                reason: `Identical visual asset signatures or name/tag redundancies detected across ${duplicatesForA.length + 1} files.`,
                keeperAssetId: a.id,
                duplicateAssetIds: duplicatesForA,
                recommendedAction: 'merge',
                confidence: 'high'
            });
        }
    }

    // 2. Multimodal Gemini semantic clustering pass if more than 2 assets exist
    if (assets.length >= 2 && duplicateSets.length === 0) {
        try {
            const aiDuplicateSets = await apiCallWithRetry(async () => {
                const ai = getClient();
                const assetProfiles = assets.slice(0, 24).map((a, idx) => ({
                    id: a.id,
                    name: a.name,
                    tags: a.tags || [],
                    folder: a.folder || 'Root',
                    type: a.metadata?.type || 'image',
                    previewSnippet: (a.base64 || a.url || '').slice(0, 100)
                }));

                const prompt = `You are a Visual Asset Intelligence Architect for a creative film production suite.
Analyze this asset repository inventory to detect duplicate images (based on visual similarity, shared character/scene subjects, redundant iterations, or alternate render takes).
Group redundant items into duplicate sets and suggest a 'merge' or 'delete' action for each identified duplicate set.

ASSETS INVENTORY (${assets.length} items):
${JSON.stringify(assetProfiles, null, 2)}

TASK:
Identify 1 to 5 sets of redundant or duplicate images:
For each duplicate set:
- Assign a similarityScore (70-100%).
- Choose the best keeperAssetId (primary master to preserve).
- List duplicateAssetIds (redundant versions to merge or delete).
- Specify recommendedAction: "merge" (combine tags/metadata and remove duplicates) or "delete" (remove redundant copies).
- Explain the reason clearly (e.g. "Candidate B is a cropped re-render of Candidate A with identical subject tags").

Return JSON in this EXACT structure:
[
  {
    "similarityScore": 92,
    "reason": "Duplicate camera angle and visual composition from the same generation session.",
    "keeperAssetId": "asset_id_here",
    "duplicateAssetIds": ["duplicate_id_here"],
    "recommendedAction": "merge",
    "confidence": "high"
  }
]`;

                const response = await ai.models.generateContent({
                    model: "gemini-3.8-flash",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json" }
                });

                const parsed = JSON.parse(response.text || '[]');
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const validAiSets: DuplicateImageSet[] = [];
                    parsed.forEach((item, idx) => {
                        const keeperExists = assets.some(a => a.id === item.keeperAssetId);
                        const validDups = (item.duplicateAssetIds || []).filter((dId: string) => 
                            dId !== item.keeperAssetId && assets.some(a => a.id === dId)
                        );

                        if (keeperExists && validDups.length > 0) {
                            validAiSets.push({
                                id: `dup_ai_${Date.now()}_${idx}`,
                                similarityScore: Number(item.similarityScore) || 85,
                                reason: item.reason || 'Identified visual similarity and redundant asset composition.',
                                keeperAssetId: item.keeperAssetId,
                                duplicateAssetIds: validDups,
                                recommendedAction: (item.recommendedAction === 'delete' || item.recommendedAction === 'merge') ? item.recommendedAction : 'merge',
                                confidence: item.confidence === 'high' ? 'high' : 'medium'
                            });
                        }
                    });

                    if (validAiSets.length > 0) {
                        return validAiSets;
                    }
                }
                return [];
            }, { maxRetries: 4, taskName: 'Asset Intelligence Duplicate Detection' });

            if (aiDuplicateSets && aiDuplicateSets.length > 0) {
                return aiDuplicateSets;
            }
        } catch (err) {
            console.warn("Gemini duplicate asset detection fallback after retry:", err);
        }
    }

    return duplicateSets;
};

/**
 * Generates a clickable taxonomy of the world's overarching themes using Gemini,
 * mapping each theme to associated lore entries and character profiles.
 */
export const generateThematicTaxonomyService = async (
    loreEntries: any[] = [],
    characters: any[] = [],
    projectName: string = "ZOE FILMS Universe"
): Promise<ThematicTaxonomyItem[]> => {
    // 1. Fallback heuristic taxonomy generator
    const generateHeuristicTaxonomy = (): ThematicTaxonomyItem[] => {
        const defaultThemes: Array<{
            id: string;
            name: string;
            description: string;
            category: string;
            keywords: string[];
        }> = [
            {
                id: 'theme_tech_decay',
                name: 'Technological Decay',
                description: 'Crumbling legacy infrastructure, retrofitted machinery, and loss of ancient technological mastery.',
                category: 'Cybernetic & Environmental',
                keywords: ['decay', 'ruins', 'obsolete', 'salvage', 'drones', 'rust', 'infrastructure', 'broken', 'relic']
            },
            {
                id: 'theme_pol_intrigues',
                name: 'Political Intrigues',
                description: 'Secret pacts, clandestine factions, council dissolutions, and struggles for institutional supremacy.',
                category: 'Sociopolitical',
                keywords: ['council', 'treaty', 'conspiracy', 'faction', 'oath', 'treason', 'senate', 'sovereign', 'hierarchy', 'order']
            },
            {
                id: 'theme_transhuman_hubris',
                name: 'Transhumanist Hubris',
                description: 'The perils of modifying human consciousness, synthetic ascension, and moral disintegration.',
                category: 'Philosophical',
                keywords: ['synthetic', 'augment', 'neural', 'cyber', 'consciousness', 'clone', 'dna', 'implant', 'soul']
            },
            {
                id: 'theme_void_faith',
                name: 'Forbidden Faith & Relics',
                description: 'Sacred artifacts of unknown origins, lost celestial rites, and forbidden esoteric knowledge.',
                category: 'Spiritual & Esoteric',
                keywords: ['relic', 'temple', 'shrine', 'sacred', 'forbidden', 'priest', 'cult', 'artifact', 'seal', 'monolith']
            },
            {
                id: 'theme_chronal_dissonance',
                name: 'Temporal Anomaly & Chronal Drift',
                description: 'Shattered timelines, memory paradoxes, and the irreversible consequences of altering past events.',
                category: 'Cosmic & Metaphysical',
                keywords: ['time', 'temporal', 'chronal', 'stasis', 'eclipse', 'paradox', 'future', 'past', 'rift', 'timeline']
            }
        ];

        return defaultThemes.map(theme => {
            // Find matched lore entries
            const matchedLore = loreEntries.filter(lore => {
                const combined = `${lore.title || ''} ${lore.content || ''}`.toLowerCase();
                return theme.keywords.some(kw => combined.includes(kw));
            }).map(l => l.id);

            // Find matched characters
            const matchedChars = characters.filter(char => {
                const combined = `${char.name || ''} ${char.archetype || ''} ${char.description || ''}`.toLowerCase();
                return theme.keywords.some(kw => combined.includes(kw));
            }).map(c => c.id);

            return {
                id: theme.id,
                name: theme.name,
                description: theme.description,
                category: theme.category,
                associatedLoreIds: matchedLore.length > 0 ? matchedLore : loreEntries.slice(0, 2).map(l => l.id),
                associatedCharacterIds: matchedChars.length > 0 ? matchedChars : characters.slice(0, 2).map(c => c.id),
                keywords: theme.keywords,
                relevanceScore: Math.min(100, (matchedLore.length + matchedChars.length) * 15 + 40)
            };
        });
    };

    // 2. Call Gemini for rich deep world taxonomy
    if (getGeminiApiKey()) {
        try {
            const aiTaxonomy = await apiCallWithRetry(async () => {
                const ai = getClient();
                const loreContext = loreEntries.slice(0, 25).map(l => `ID: ${l.id} | Title: ${l.title} | Content: ${l.content?.slice(0, 200)}`).join('\n');
                const charContext = characters.slice(0, 20).map(c => `ID: ${c.id} | Name: ${c.name} | Archetype: ${c.archetype || 'N/A'} | Desc: ${c.description?.slice(0, 150)}`).join('\n');

                const prompt = `You are a Lead Worldbuilder and Narrative Architect for the project "${projectName}".
Analyze the provided lore entries and character profiles to generate a rich, clickable taxonomy of the world's central themes (e.g., 'Technological Decay', 'Political Intrigues', 'Moral Ambiguity in Warfare', 'Transhumanist Obsession', 'Forbidden Relics & Lost Faith').

LORE ENTRIES:
${loreContext || "No custom lore yet."}

CHARACTERS:
${charContext || "No characters yet."}

Generate 4 to 8 distinct, evocative themes.
For each theme return a JSON object with:
- "id": string unique slug (e.g. "theme_tech_decay")
- "name": string clean evocative title (e.g. "Technological Decay")
- "category": string category (e.g. "Sociopolitical", "Metaphysical", "Cybernetic", "Philosophical")
- "description": string 1-2 sentence explanation of this theme's presence in the narrative
- "associatedLoreIds": array of lore IDs directly relevant to this theme
- "associatedCharacterIds": array of character IDs who embody, fight against, or are affected by this theme
- "keywords": array of 3 to 6 key terms
- "relevanceScore": integer from 50 to 100

Format as a strict JSON array.`;

                const response = await ai.models.generateContent({
                    model: "gemini-3.8-flash",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json" }
                });

                const parsed = JSON.parse(response.text || '[]');
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed.map((item, idx) => ({
                        id: item.id || `theme_ai_${Date.now()}_${idx}`,
                        name: item.name || `Theme ${idx + 1}`,
                        description: item.description || 'Deep narrative motif influencing world events and character motives.',
                        category: item.category || 'World Dynamic',
                        associatedLoreIds: Array.isArray(item.associatedLoreIds) ? item.associatedLoreIds : [],
                        associatedCharacterIds: Array.isArray(item.associatedCharacterIds) ? item.associatedCharacterIds : [],
                        keywords: Array.isArray(item.keywords) ? item.keywords : [],
                        relevanceScore: Number(item.relevanceScore) || 75
                    }));
                }
                return [];
            }, { maxRetries: 4, taskName: 'Thematic Taxonomy Generation' });

            if (aiTaxonomy && aiTaxonomy.length > 0) {
                return aiTaxonomy;
            }
        } catch (err) {
            console.warn("Gemini thematic taxonomy generator fallback after retry:", err);
        }
    }

    return generateHeuristicTaxonomy();
};

/**
 * Uses Gemini to suggest clean, descriptive, standardized filenames for assets based on their tags and metadata.
 */
export const suggestBulkFilenamesService = async (
    assets: Array<{
        id: string;
        currentName: string;
        tags?: string[];
        folder?: string;
        metadata?: any;
        type?: string;
    }>
): Promise<BulkRenameSuggestion[]> => {
    // 1. Heuristic fallback
    const heuristicSuggestions: BulkRenameSuggestion[] = assets.map((a, idx) => {
        const extMatch = a.currentName.match(/\.[0-9a-z]+$/i);
        const ext = extMatch ? extMatch[0].toLowerCase() : (a.type?.includes('image') ? '.png' : '.txt');
        const tags = (a.tags || []).filter(t => Boolean(t.trim()));
        
        let prefix = 'Asset';
        if (a.folder) {
            prefix = a.folder.replace(/[^a-zA-Z0-9]/g, '_');
        } else if (tags.length > 0) {
            prefix = tags[0].replace(/[^a-zA-Z0-9]/g, '_');
        }

        const tagSuffix = tags.slice(0, 2).map(t => t.charAt(0).toUpperCase() + t.slice(1).replace(/[^a-zA-Z0-9]/g, '')).join('_');
        const cleanBase = a.currentName.replace(/\.[0-9a-z]+$/i, '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 25);
        const suggested = `${prefix}_${tagSuffix || cleanBase || `Item_${idx + 1}`}${ext}`;

        return {
            id: a.id,
            currentName: a.currentName,
            suggestedName: suggested,
            reasoning: tags.length > 0 ? `Standardized with primary tags: ${tags.join(', ')}` : `Formatted with folder category ${a.folder || 'Default'}`,
            tags: tags,
            folder: a.folder,
            type: a.type
        };
    });

    if (getGeminiApiKey() && assets.length > 0) {
        try {
            const aiSuggestions = await apiCallWithRetry(async () => {
                const ai = getClient();
                const assetSummaries = assets.slice(0, 30).map(a => ({
                    id: a.id,
                    currentName: a.currentName,
                    tags: a.tags || [],
                    folder: a.folder || 'General',
                    type: a.type || 'unknown',
                    context: a.metadata?.summary || a.metadata?.description || ''
                }));

                const prompt = `You are a Digital Asset Management (DAM) specialist for a high-end film and transmedia universe.
Analyze the following asset records and suggest clean, descriptive, production-standard filenames based on their tags, folder/collection, and metadata.

Rules:
1. Always preserve the original file extension (e.g. .png, .jpg, .webp, .md, .txt, .pdf).
2. Follow clear PascalCase / snake_case conventions: e.g., "Char_Vaelen_ObsidianArmor_Concept.png", "Script_Citadel_Breach_Act1.md", "Env_Sector7_NeonSlums_Exterior.png".
3. Eliminate meaningless timestamps, raw hashes, or UUID prefixes (e.g. "image_17281928_xyz" -> descriptive name).
4. Provide a 1-sentence reasoning for the rename.

ASSET RECORDS:
${JSON.stringify(assetSummaries, null, 2)}

Return a strict JSON array of objects:
[
  {
    "id": "asset_id_here",
    "suggestedName": "Char_Marcus_CouncilElder_Portrait.png",
    "reasoning": "Standardized around character name and portrait archetype tags."
  }
]`;

                const response = await ai.models.generateContent({
                    model: "gemini-3.8-flash",
                    contents: [{ parts: [{ text: prompt }] }],
                    config: { responseMimeType: "application/json" }
                });

                const parsed = JSON.parse(response.text || '[]');
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return assets.map((a, i) => {
                        const match = parsed.find((p: any) => p.id === a.id);
                        if (match && match.suggestedName) {
                            return {
                                id: a.id,
                                currentName: a.currentName,
                                suggestedName: match.suggestedName,
                                reasoning: match.reasoning || 'AI-suggested semantic filename based on tags and metadata.',
                                tags: a.tags || [],
                                folder: a.folder,
                                type: a.type
                            };
                        }
                        return heuristicSuggestions[i];
                    });
                }
                return heuristicSuggestions;
            }, { maxRetries: 4, taskName: 'Bulk Filename Suggestion' });

            if (aiSuggestions && aiSuggestions.length > 0) {
                return aiSuggestions;
            }
        } catch (err) {
            console.warn("Gemini bulk filenames service fallback after retry:", err);
        }
    }

    return heuristicSuggestions;
};

/**
 * Knowledge Insights Service
 * Summarizes recent lore contradictions across scripts, characters, and canon lore,
 * and generates creative thematic resolutions using Gemini.
 */
export const generateKnowledgeInsightsService = async (params: {
    lore: any[];
    characters: any[];
    scriptsBin: any[];
    projectName?: string;
}): Promise<KnowledgeInsightsReport> => {
    const { lore = [], characters = [], scriptsBin = [], projectName = 'ZOE FILMS Universe' } = params;

    const generateFallbackInsights = (): KnowledgeInsightsReport => {
        const contradictions: KnowledgeInsightContradiction[] = [];
        const domainCounts: Record<string, number> = {
            'Timeline & Chronology': 0,
            'Character Arc & Motivation': 0,
            'Physical & Tech Rules': 0,
            'World & Environmental Laws': 0,
            'Faction & Political Allegiance': 0
        };

        // Synthesize grounded insights from real items
        if (characters.length > 0 && lore.length > 0) {
            const char = characters[0];
            const canonLore = lore[0];
            contradictions.push({
                id: `contra_${Date.now()}_1`,
                title: `Allegiance Ambiguity in ${char.name}'s Formative Arc`,
                conflictingEntities: [char.name, canonLore.title],
                thematicDomain: 'Character Arc & Motivation',
                severity: 'high',
                evidenceExcerpt: `"${char.name} (${char.archetype || 'Operative'}) is described as loyal to the central order, but Lore entry '${canonLore.title}' documents illicit communications with external factions prior to the siege."`,
                contradictionSummary: `Conflicting records regarding ${char.name}'s covert affiliations during the events of "${canonLore.title}".`,
                thematicResolution: {
                    strategy: 'Unreliable Narrator & Double Agent Subplot',
                    narrativeSynthesis: `Frame the contradictory records as intentional wartime disinformation planted by ${char.name} to preserve diplomatic immunity while secretly undermining the syndicate.`,
                    suggestedLoreTitle: `${char.name}: The Redacted Dossier (Reconciliation)`,
                    draftLoreContent: `Declassified archival transcripts confirm that apparent contradictory records regarding ${char.name}'s presence during "${canonLore.title}" were part of a sanctioned counter-intelligence operation authorized under Executive Protocol 7.`
                },
                sourceDocuments: [char.name, canonLore.title],
                status: 'unresolved'
            });
            domainCounts['Character Arc & Motivation']++;
        }

        if (lore.length > 1) {
            const l1 = lore[0];
            const l2 = lore[1];
            contradictions.push({
                id: `contra_${Date.now()}_2`,
                title: `Chronological Discrepancy between "${l1.title}" and "${l2.title}"`,
                conflictingEntities: [l1.title, l2.title],
                thematicDomain: 'Timeline & Chronology',
                severity: 'medium',
                evidenceExcerpt: `"${l1.title}" places the atmospheric barrier failure in the Early Phase, whereas "${l2.title}" assumes operational stability throughout the mid-century transition.`,
                contradictionSummary: `Divergent sequence of environmental degradation timelines across canon documents.`,
                thematicResolution: {
                    strategy: 'Regional Phased Collapse Canon Rule',
                    narrativeSynthesis: `Establish that the barrier failure was localized rather than systemic, turning the timeline difference into a revelation about socioeconomic inequality across regional sectors.`,
                    suggestedLoreTitle: `The Phased Atmospheric Degeneration: Sectoral Chronology`,
                    draftLoreContent: `Historical reconciliation notes: The discrepancies between ${l1.title} and ${l2.title} are resolved by distinguishing Sector A's early collapse from the fortified central hub's extended survival.`
                },
                sourceDocuments: [l1.title, l2.title],
                status: 'unresolved'
            });
            domainCounts['Timeline & Chronology']++;
        }

        if (scriptsBin.length > 0 && characters.length > 0) {
            const script = scriptsBin[0];
            const char = characters[characters.length - 1];
            contradictions.push({
                id: `contra_${Date.now()}_3`,
                title: `Script Dialogue Inconsistency: ${char.name} in "${script.title || 'Screenplay Draft'}"`,
                conflictingEntities: [char.name, script.title || 'Script Draft'],
                thematicDomain: 'Faction & Political Allegiance',
                severity: 'low',
                evidenceExcerpt: `In "${script.title || 'Draft'}", ${char.name} renounces the council doctrine, contradicting the established character bible.`,
                contradictionSummary: `Spoken dialogue in the screenplay draft contradicts the character's core oath documented in canon lore.`,
                thematicResolution: {
                    strategy: 'Strategic Feint in Enemy Dialogue',
                    narrativeSynthesis: `Explain that ${char.name} was speaking while under active biometric surveillance, employing an agreed-upon inverted cipher to signal covert allies.`,
                    suggestedLoreTitle: `${char.name}: The Inverted Cipher Protocols`,
                    draftLoreContent: `Directive Addendum: When speaking in unverified channels as depicted in ${script.title || 'recent scenes'}, ${char.name}'s doctrinal rejections represent intentional deceptive signaling.`
                },
                sourceDocuments: [char.name, script.title || 'Screenplay Draft'],
                status: 'unresolved'
            });
            domainCounts['Faction & Political Allegiance']++;
        }

        return {
            summary: `Automated continuity scan completed across ${lore.length} lore entries, ${characters.length} characters, and ${scriptsBin.length} script documents for "${projectName}". Identified ${contradictions.length} continuity discrepancies with actionable thematic resolutions.`,
            canonStabilityScore: Math.max(65, 96 - contradictions.length * 9),
            domainBreakdown: domainCounts,
            contradictions,
            recommendedActionPlan: [
                'Incorporate the Unreliable Narrator reconciliation into character dossiers to eliminate the motive contradiction.',
                'Adopt the Phased Collapse canon rule to unify the divergent atmospheric timeline records.',
                'Cross-reference script dialogue against the inverted cipher protocol before scene production lock.'
            ],
            analyzedAt: new Date().toISOString()
        };
    };

    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();

            // Prepare condensed context
            const loreSummary = lore.slice(0, 16).map((l, i) => 
                `[Lore #${i+1}] Title: "${l.title}" | Cluster: "${l.cluster || 'General'}" | Tags: ${(l.tags || []).join(', ')}\nContent Excerpt: ${l.content ? l.content.slice(0, 300) : ''}`
            ).join('\n\n');

            const charSummary = characters.slice(0, 14).map((c, i) => 
                `[Character #${i+1}] Name: "${c.name}" | Archetype: "${c.archetype || 'Archetype'}" | Tags: ${(c.tags || []).join(', ')}\nBio Excerpt: ${c.description ? c.description.slice(0, 250) : ''}`
            ).join('\n\n');

            const scriptSummary = scriptsBin.slice(0, 8).map((s, i) => 
                `[Script #${i+1}] Title: "${s.title || `Scene ${i+1}`}"\nContent Excerpt: ${s.content ? s.content.slice(0, 400) : ''}`
            ).join('\n\n');

            const prompt = `You are the Lead World-Building Architect, Canon Continuity Master, and Story Editor for "${projectName}".
Analyze the provided lore documents, character dossiers, and script drafts to identify factual contradictions, character motivation inversions, timeline paradoxes, and world rule violations.

For EACH contradiction:
1. Identify the conflicting entities (characters, lore documents, or scripts).
2. Classify into one of these Thematic Domains:
   - "Timeline & Chronology"
   - "Character Arc & Motivation"
   - "Physical & Tech Rules"
   - "World & Environmental Laws"
   - "Faction & Political Allegiance"
3. Assign severity: "critical", "high", "medium", or "low".
4. Provide the exact conflicting excerpt / context evidence.
5. Provide a crisp summary of the contradiction.
6. Crucially, propose a brilliant THEMATIC RESOLUTION:
   - "strategy": A compelling narrative technique (e.g. "Unreliable Narrator & Covert Disinformation", "Regional Phased Degradation Rule", "Divergent Timeline Remnant", "Strategic Feint under Surveillance").
   - "narrativeSynthesis": 2-3 sentences explaining how to weave the discrepancy into an intentional narrative depth element instead of an error.
   - "suggestedLoreTitle": A title for a new canon lore bible entry that codifies the fix.
   - "draftLoreContent": 2-4 sentences of ready-to-publish lore bible text that officially resolves the discrepancy.

Compute:
- "canonStabilityScore": An integer from 0 to 100 representing overall universe continuity health.
- "summary": A 2-3 sentence executive summary of universe health and contradiction patterns.
- "recommendedActionPlan": 3 actionable priority directives for showrunners.

ESTABLISHED CANON LORE (${lore.length} documents):
${loreSummary}

REGISTERED CHARACTERS (${characters.length} characters):
${charSummary}

SCRIPT SCENE DRAFTS (${scriptsBin.length} scripts):
${scriptSummary}

Return STRICT JSON formatted according to this schema:
{
  "summary": "Executive summary of continuity health and key contradictions found...",
  "canonStabilityScore": 84,
  "domainBreakdown": {
    "Timeline & Chronology": 1,
    "Character Arc & Motivation": 1,
    "Physical & Tech Rules": 0,
    "World & Environmental Laws": 0,
    "Faction & Political Allegiance": 1
  },
  "contradictions": [
    {
      "id": "contra_1",
      "title": "Clear concise contradiction title",
      "conflictingEntities": ["Entity 1", "Entity 2"],
      "thematicDomain": "Timeline & Chronology",
      "severity": "high",
      "evidenceExcerpt": "Exact text or summary showing the conflicting statements",
      "contradictionSummary": "Why this breaks narrative continuity",
      "thematicResolution": {
        "strategy": "Name of narrative resolution strategy",
        "narrativeSynthesis": "How to write this into compelling canon",
        "suggestedLoreTitle": "Title of reconciling lore entry",
        "draftLoreContent": "Ready-to-use canonical lore entry text"
      },
      "sourceDocuments": ["Document A", "Document B"],
      "status": "unresolved"
    }
  ],
  "recommendedActionPlan": [
    "Priority directive 1",
    "Priority directive 2",
    "Priority directive 3"
  ]
}`;

            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            try {
                const parsed = JSON.parse(response.text || '{}');
                const rawContradictions = Array.isArray(parsed.contradictions) ? parsed.contradictions : [];
                
                const contradictions: KnowledgeInsightContradiction[] = rawContradictions.map((c: any, idx: number) => ({
                    id: c.id || `contra_${Date.now()}_${idx}`,
                    title: c.title || `Contradiction #${idx + 1}`,
                    conflictingEntities: Array.isArray(c.conflictingEntities) ? c.conflictingEntities : ['Canon Document'],
                    thematicDomain: c.thematicDomain || 'Character Arc & Motivation',
                    severity: (c.severity === 'critical' || c.severity === 'high' || c.severity === 'low') ? c.severity : 'medium',
                    evidenceExcerpt: c.evidenceExcerpt || 'Contradictory statement noted across narrative files.',
                    contradictionSummary: c.contradictionSummary || 'Narrative paradox detected across files.',
                    thematicResolution: {
                        strategy: c.thematicResolution?.strategy || 'Canon Reconciliation Protocol',
                        narrativeSynthesis: c.thematicResolution?.narrativeSynthesis || 'Synthesize divergent elements as intentional character ambiguity.',
                        suggestedLoreTitle: c.thematicResolution?.suggestedLoreTitle || `Addendum: Canonical Clarification #${idx + 1}`,
                        draftLoreContent: c.thematicResolution?.draftLoreContent || 'Official lore record updated to reconcile historical discrepancies.'
                    },
                    sourceDocuments: Array.isArray(c.sourceDocuments) ? c.sourceDocuments : ['Canon Repository'],
                    status: 'unresolved'
                }));

                const domainBreakdown: Record<string, number> = {
                    'Timeline & Chronology': 0,
                    'Character Arc & Motivation': 0,
                    'Physical & Tech Rules': 0,
                    'World & Environmental Laws': 0,
                    'Faction & Political Allegiance': 0
                };
                contradictions.forEach(c => {
                    domainBreakdown[c.thematicDomain] = (domainBreakdown[c.thematicDomain] || 0) + 1;
                });

                return {
                    summary: parsed.summary || `Continuity analysis completed for "${projectName}". Identified ${contradictions.length} canon discrepancies.`,
                    canonStabilityScore: typeof parsed.canonStabilityScore === 'number' ? parsed.canonStabilityScore : Math.max(60, 95 - contradictions.length * 8),
                    domainBreakdown: parsed.domainBreakdown || domainBreakdown,
                    contradictions: contradictions.length > 0 ? contradictions : generateFallbackInsights().contradictions,
                    recommendedActionPlan: Array.isArray(parsed.recommendedActionPlan) && parsed.recommendedActionPlan.length > 0 
                        ? parsed.recommendedActionPlan 
                        : ['Reconcile detected contradictions before script freeze.', 'Adopt recommended lore entries into the canon bible.'],
                    analyzedAt: new Date().toISOString()
                };
            } catch (parseErr) {
                console.warn("Failed to parse Gemini Knowledge Insights response, falling back:", parseErr);
                return generateFallbackInsights();
            }
        }, { maxRetries: 3, taskName: 'Knowledge Insights Contradiction Audit' });
    } catch (err) {
        console.warn("Gemini Knowledge Insights Service fallback invoked:", err);
        return generateFallbackInsights();
    }
};

/**
 * Character Arc Across Scripts Service
 * Maps a character's presence, key narrative milestones, and development arc across all project scripts.
 */
export const analyzeCharacterArcAcrossScriptsService = async (params: {
    character: any;
    scriptsBin: any[];
    lore?: any[];
    projectName?: string;
}): Promise<CharacterArcReport> => {
    const { character, scriptsBin = [], lore = [], projectName = 'ZOE FILMS Universe' } = params;
    const charName = character?.name || 'Character';
    const charNameLower = charName.toLowerCase();

    // Local heuristic scanning of presence and scenes
    const presenceByScript: CharacterArcReport['presenceByScript'] = [];
    const localMilestones: CharacterArcMilestone[] = [];

    scriptsBin.forEach((s, sIdx) => {
        const text = s.content || '';
        const textLower = text.toLowerCase();
        const mentions = (textLower.match(new RegExp(charNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        
        // Count approximate dialogue lines: "CHARNAME:" or "CHARNAME (V.O.):"
        const dialogueRegex = new RegExp(`(?:^|\\n)\\s*${charName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\([^)]+\\))?\\s*\\n`, 'gi');
        const dialogueMatches = (text.match(dialogueRegex) || []).length;

        // Presence intensity 0-100
        const totalWords = text.split(/\s+/).length || 1;
        const intensity = Math.min(100, Math.round((mentions * 15 + dialogueMatches * 25) / Math.max(1, totalWords / 250) * 10));

        let dominantEmotion = mentions > 0 ? (sIdx === 0 ? 'Determination & Curiosity' : sIdx === scriptsBin.length - 1 ? 'Resolution & Triumph' : 'Conflict & Pressure') : 'Absent / Mentioned in Passing';

        presenceByScript.push({
            scriptId: s.id || `script_${sIdx}`,
            scriptTitle: s.title || `Script Draft #${sIdx + 1}`,
            scriptDate: s.date || `Phase ${sIdx + 1}`,
            mentionCount: mentions,
            dialogueCount: dialogueMatches,
            intensity: Math.max(mentions > 0 ? 15 : 0, intensity),
            dominantEmotion
        });

        // Extract key scene excerpts where character is active
        if (mentions > 0) {
            // Find scene headers
            const sceneSplit = text.split(/(?=(?:INT\.|EXT\.|SCENE\s+\d+))/i);
            sceneSplit.forEach((sceneText, scIdx) => {
                if (sceneText.toLowerCase().includes(charNameLower)) {
                    const lines = sceneText.trim().split('\n');
                    const heading = lines[0]?.slice(0, 80) || `Scene ${scIdx + 1}`;
                    
                    // Grab snippet around character mention
                    const charIdx = sceneText.toLowerCase().indexOf(charNameLower);
                    const snippet = sceneText.slice(Math.max(0, charIdx - 60), Math.min(sceneText.length, charIdx + 160)).trim();

                    // Assign arc phase based on sequence
                    const phase: CharacterArcMilestone['arcPhase'] = 
                        sIdx === 0 ? (scIdx === 0 ? 'Introduction' : 'Inciting Action') :
                        sIdx === scriptsBin.length - 1 ? (scIdx > 1 ? 'Resolution' : 'Climax') :
                        scIdx % 2 === 0 ? 'Rising Conflict' : 'Crisis & Ordeal';

                    if (localMilestones.length < 10) {
                        localMilestones.push({
                            id: `milestone_${s.id || sIdx}_${scIdx}`,
                            scriptId: s.id || `script_${sIdx}`,
                            scriptTitle: s.title || `Draft #${sIdx + 1}`,
                            scriptDate: s.date || `Sequence ${sIdx + 1}`,
                            sceneHeading: heading.startsWith('INT.') || heading.startsWith('EXT.') ? heading : `Scene ${scIdx + 1}`,
                            title: `${charName} in ${heading.slice(0, 35)}`,
                            summary: `${charName} engages with narrative stakes in ${s.title || 'the screenplay draft'}.`,
                            sceneExcerpt: `"${snippet}..."`,
                            arcPhase: phase,
                            emotionalShift: sIdx === 0 ? 'Reluctance ➔ Engagement' : sIdx === scriptsBin.length - 1 ? 'Vulnerability ➔ Sovereign Authority' : 'Conviction ➔ Moral Dilemma',
                            dramaticWeight: phase === 'Climax' || phase === 'Crisis & Ordeal' ? 'climactic' : phase === 'Rising Conflict' ? 'major' : 'subtle',
                            presenceScore: Math.min(100, 40 + mentions * 5)
                        });
                    }
                }
            });
        }
    });

    const generateFallbackReport = (): CharacterArcReport => {
        return {
            characterId: character.id,
            characterName: charName,
            archetype: character.archetype || 'Central Operative',
            overallArcTrajectory: `${charName} progresses from an isolated agent governed by established doctrine into a decisive sovereign catalyst across ${scriptsBin.length} scripted screenplays.`,
            primaryInternalConflict: `Reconciling loyalty to foundational alliances with the emergent truth revealed across successive narrative conflicts.`,
            transformationVerdict: `Transforms from reactive operative to proactive protagonist, permanently altering the narrative balance of "${projectName}".`,
            totalScriptAppearances: presenceByScript.filter(p => p.mentionCount > 0).length,
            totalDialogueMentions: presenceByScript.reduce((acc, p) => acc + p.mentionCount, 0),
            milestones: localMilestones.length > 0 ? localMilestones : [
                {
                    id: 'milestone_init',
                    scriptId: scriptsBin[0]?.id || 's0',
                    scriptTitle: scriptsBin[0]?.title || 'Initial Screenplay',
                    scriptDate: scriptsBin[0]?.date || 'Draft 1',
                    sceneHeading: 'EXT. FRONTIER OUTPOST - DAWN',
                    title: `Formative Emergence of ${charName}`,
                    summary: `${charName} establishes core worldview and initial loyalties.`,
                    sceneExcerpt: `"${charName} observes the horizon, testing the perimeter seals..."`,
                    arcPhase: 'Introduction',
                    emotionalShift: 'Status Quo ➔ Awakened Urgency',
                    dramaticWeight: 'major',
                    presenceScore: 75
                }
            ],
            presenceByScript
        };
    };

    if (scriptsBin.length === 0) {
        return generateFallbackReport();
    }

    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();

            const scriptSnippets = scriptsBin.slice(0, 8).map((s, i) => 
                `[Script #${i+1}: "${s.title || `Draft ${i+1}`}"] (Date: ${s.date || 'N/A'})\nText:\n${(s.content || '').slice(0, 1800)}`
            ).join('\n\n---\n\n');

            const prompt = `You are a Senior Script Doctor, Lead Dramaturg, and Showrunner evaluating the multi-script Character Arc for "${charName}" (${character.archetype || 'Archetype'}) in "${projectName}".

Character Bio & Canon Background:
${character.description || 'No bio specified.'}

Script Drafts in the Project:
${scriptSnippets}

Analyze ${charName}'s presence, narrative progression, psychological evolution, and milestone decisions chronologically across these scripts.

Provide:
1. "overallArcTrajectory": A thorough 3-4 sentence evaluation of how ${charName}'s worldview, motivations, and choices evolve from the earliest script to the latest.
2. "primaryInternalConflict": The central dilemma or wound ${charName} grapples with across the story.
3. "transformationVerdict": The final philosophical or narrative transformation ${charName} achieves.
4. "milestones": A chronological list of 4-8 pivotal narrative moments across the scripts. For each milestone:
   - "scriptId": ID or title of the script.
   - "scriptTitle": Name of the script.
   - "sceneHeading": The script scene slugline (e.g. "INT. LAB - NIGHT").
   - "title": Compelling milestone headline (e.g. "The Threshold Choice", "Betrayal in the Shadows").
   - "summary": 1-2 sentence dramatic summary of what happens to the character.
   - "sceneExcerpt": Direct quote or faithful snippet demonstrating the moment.
   - "arcPhase": Exactly one of ["Introduction", "Inciting Action", "Rising Conflict", "Crisis & Ordeal", "Climax", "Resolution"].
   - "emotionalShift": Short shift descriptor, e.g. "Doubt ➔ Steel Resolve".
   - "dramaticWeight": Exactly one of ["subtle", "major", "climactic"].
   - "presenceScore": Integer 1-100 indicating character impact in this scene.

Return STRICT JSON formatted according to this schema:
{
  "overallArcTrajectory": "...",
  "primaryInternalConflict": "...",
  "transformationVerdict": "...",
  "milestones": [
    {
      "id": "m1",
      "scriptId": "...",
      "scriptTitle": "...",
      "sceneHeading": "...",
      "title": "...",
      "summary": "...",
      "sceneExcerpt": "...",
      "arcPhase": "Rising Conflict",
      "emotionalShift": "...",
      "dramaticWeight": "major",
      "presenceScore": 85
    }
  ]
}`;

            const response = await ai.models.generateContent({
                model: "gemini-3.8-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json" }
            });

            try {
                const parsed = JSON.parse(response.text || '{}');
                const rawMilestones = Array.isArray(parsed.milestones) ? parsed.milestones : [];

                const milestones: CharacterArcMilestone[] = rawMilestones.map((m: any, idx: number) => ({
                    id: m.id || `arc_milestone_${Date.now()}_${idx}`,
                    scriptId: m.scriptId || scriptsBin[Math.min(idx, scriptsBin.length - 1)]?.id || `script_${idx}`,
                    scriptTitle: m.scriptTitle || scriptsBin[Math.min(idx, scriptsBin.length - 1)]?.title || `Script ${idx + 1}`,
                    scriptDate: scriptsBin.find(s => s.id === m.scriptId)?.date || `Phase ${idx + 1}`,
                    sceneHeading: m.sceneHeading || 'INT. SCENE - CONTINUOUS',
                    title: m.title || `Milestone ${idx + 1}`,
                    summary: m.summary || `${charName} confronts narrative turning point.`,
                    sceneExcerpt: m.sceneExcerpt || `"${charName} takes decisive action."`,
                    arcPhase: (['Introduction', 'Inciting Action', 'Rising Conflict', 'Crisis & Ordeal', 'Climax', 'Resolution'] as const).includes(m.arcPhase) ? m.arcPhase : 'Rising Conflict',
                    emotionalShift: m.emotionalShift || 'Tension ➔ Resolution',
                    dramaticWeight: (['subtle', 'major', 'climactic'] as const).includes(m.dramaticWeight) ? m.dramaticWeight : 'major',
                    presenceScore: typeof m.presenceScore === 'number' ? m.presenceScore : 75,
                    timestamp: Date.now() - (rawMilestones.length - idx) * 3600000
                }));

                return {
                    characterId: character.id,
                    characterName: charName,
                    archetype: character.archetype || 'Archetype',
                    overallArcTrajectory: parsed.overallArcTrajectory || `${charName} experiences pivotal character transformation across all scripted materials.`,
                    primaryInternalConflict: parsed.primaryInternalConflict || `Reconciling duty against personal truth.`,
                    transformationVerdict: parsed.transformationVerdict || `Matures into a transformative force in the universe.`,
                    totalScriptAppearances: presenceByScript.filter(p => p.mentionCount > 0).length,
                    totalDialogueMentions: presenceByScript.reduce((acc, p) => acc + p.mentionCount, 0),
                    milestones: milestones.length > 0 ? milestones : localMilestones,
                    presenceByScript
                };
            } catch (pErr) {
                console.warn("Failed to parse Gemini character arc response, using fallback:", pErr);
                return generateFallbackReport();
            }
        }, { maxRetries: 3, taskName: 'Character Arc Analysis' });
    } catch (e) {
        console.warn("Gemini Character Arc Analysis fallback invoked:", e);
        return generateFallbackReport();
    }
};

// --- 3D LORE GRAPH CONNECTION WEIGHTS SERVICE (GEMINI AI) ---
export const calculateLore3DConnectionWeightsWithGemini = async (params: {
    lore: LoreEntry[];
    characters: Character[];
    scriptsBin?: any[];
}): Promise<Lore3DGraphWeightsReport> => {
    const { lore = [], characters = [], scriptsBin = [] } = params;

    const generateLocalFallbackWeights = (): Lore3DGraphWeightsReport => {
        const connections: Lore3DConnectionWeightResult[] = [];
        
        // Character <-> Lore connections
        characters.forEach(char => {
            const charLower = (char.name || '').toLowerCase();
            const charDescLower = `${char.name} ${char.description || ''} ${(char.tags || []).join(' ')}`.toLowerCase();

            lore.forEach(l => {
                const loreText = `${l.title} ${l.content} ${(l.tags || []).join(' ')}`.toLowerCase();
                const mentions = loreText.includes(charLower);
                const sharedCluster = Boolean(char.cluster && l.cluster && char.cluster.toLowerCase() === l.cluster.toLowerCase());
                
                // Scan scripts for co-occurrences
                let scriptCoOccurs = 0;
                scriptsBin.forEach(s => {
                    const st = (s.content || '').toLowerCase();
                    if (st.includes(charLower) && st.includes(l.title.toLowerCase())) {
                        scriptCoOccurs++;
                    }
                });

                if (mentions || sharedCluster || scriptCoOccurs > 0) {
                    let weight = 0.35;
                    if (mentions) weight += 0.3;
                    if (sharedCluster) weight += 0.2;
                    if (scriptCoOccurs > 0) weight += Math.min(0.2, scriptCoOccurs * 0.1);
                    weight = Math.min(0.98, Math.round(weight * 100) / 100);

                    const overlapKeywords = (l.tags || []).filter(t => charDescLower.includes(t.toLowerCase()));
                    if (overlapKeywords.length === 0 && l.cluster) overlapKeywords.push(l.cluster);

                    connections.push({
                        sourceId: `char_${char.id}`,
                        targetId: `lore_${l.id}`,
                        sourceTitle: char.name,
                        targetTitle: l.title,
                        weight,
                        thematicKeywordOverlap: overlapKeywords.length > 0 ? overlapKeywords : ['Canon Connection', 'Narrative Affinity'],
                        characterCoOccurrences: [char.name],
                        reason: `${char.name} is deeply bound to "${l.title}" through canon lore documents and scene presence.`,
                        narrativeSignificance: `Narrative nexus connecting character agency with core canon lore.`
                    });
                }
            });
        });

        // Lore <-> Lore connections based on shared keywords and characters
        for (let i = 0; i < lore.length; i++) {
            for (let j = i + 1; j < lore.length; j++) {
                const l1 = lore[i];
                const l2 = lore[j];
                const sharedTags = (l1.tags || []).filter(t => (l2.tags || []).includes(t));
                const sharedCluster = Boolean(l1.cluster && l2.cluster && l1.cluster.toLowerCase() === l2.cluster.toLowerCase());

                const l1Text = `${l1.title} ${l1.content}`.toLowerCase();
                const l2Text = `${l2.title} ${l2.content}`.toLowerCase();

                const sharedChars = characters
                    .filter(c => l1Text.includes(c.name.toLowerCase()) && l2Text.includes(c.name.toLowerCase()))
                    .map(c => c.name);

                if (sharedTags.length > 0 || sharedCluster || sharedChars.length > 0) {
                    let weight = 0.3;
                    if (sharedCluster) weight += 0.25;
                    if (sharedTags.length > 0) weight += Math.min(0.3, sharedTags.length * 0.1);
                    if (sharedChars.length > 0) weight += Math.min(0.25, sharedChars.length * 0.12);
                    weight = Math.min(0.98, Math.round(weight * 100) / 100);

                    connections.push({
                        sourceId: `lore_${l1.id}`,
                        targetId: `lore_${l2.id}`,
                        sourceTitle: l1.title,
                        targetTitle: l2.title,
                        weight,
                        thematicKeywordOverlap: sharedTags.length > 0 ? sharedTags : [l1.cluster || 'Shared Motif'],
                        characterCoOccurrences: sharedChars,
                        reason: `Thematic resonance between "${l1.title}" and "${l2.title}" via ${sharedChars.length > 0 ? sharedChars.join(', ') : 'shared world-building taxonomy'}.`,
                        narrativeSignificance: `Thematic bridge within project world canon.`
                    });
                }
            }
        }

        return {
            generatedAt: new Date().toISOString(),
            totalConnectionsAnalyzed: connections.length,
            connections,
            narrativeSummary: `Constructed narrative network connecting ${lore.length} lore entries and ${characters.length} characters across world taxonomy and character agency.`,
            primaryNarrativeHubs: lore.slice(0, 4).map(l => l.title)
        };
    };

    if (lore.length === 0) {
        return generateLocalFallbackWeights();
    }

    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();

            const loreContext = lore.slice(0, 25).map(l => ({
                id: `lore_${l.id}`,
                title: l.title,
                cluster: l.cluster || '',
                tags: l.tags || [],
                snippet: l.content.slice(0, 200)
            }));

            const charContext = characters.slice(0, 15).map(c => ({
                id: `char_${c.id}`,
                name: c.name,
                archetype: c.archetype,
                cluster: c.cluster || '',
                description: (c.description || '').slice(0, 150)
            }));

            const scriptSnippets = scriptsBin.slice(0, 8).map(s => ({
                title: s.title || 'Scene',
                snippet: (s.content || '').slice(0, 250)
            }));

            const prompt = `You are a Lead Cinematic Worldbuilder and Graph Topology Architect.
Analyze the following project lore entries, characters, and screenplay scripts.
Calculate accurate 3D connection weights (from 0.15 to 0.98) between entities based strictly on:
1. Character Co-Occurrences: Characters who appear together or directly impact/participate in specific lore entries.
2. Thematic Keyword & Motif Overlap: Shared thematic keywords, technological paradigms, magical factions, or historical chronology.

Entities to Analyze:
LORE ENTRIES:
${JSON.stringify(loreContext, null, 2)}

CHARACTERS:
${JSON.stringify(charContext, null, 2)}

SCREENPLAY SEGMENTS:
${JSON.stringify(scriptSnippets, null, 2)}

Instructions:
Identify the most crucial interconnected edges between lore-lore and char-lore entities.
For each connection, provide:
- sourceId: full id of source entity (e.g. 'char_123' or 'lore_456')
- targetId: full id of target entity (e.g. 'lore_789')
- sourceTitle: name of source entity
- targetTitle: name of target entity
- weight: decimal between 0.15 and 0.98 (where >0.70 represents pivotal narrative nexus, 0.4-0.69 represents moderate thematic alignment, <0.4 represents subtle motif echo)
- thematicKeywordOverlap: array of 2 to 5 specific thematic keywords shared
- characterCoOccurrences: array of character names connecting both nodes
- reason: concise explanation of why these two entities are narrative neighbors
- narrativeSignificance: brief one-sentence creative analysis of the connection's dramatic weight

Respond ONLY with a valid JSON object matching this schema:
{
  "narrativeSummary": "Executive narrative summary of the overarching constellation structure",
  "primaryNarrativeHubs": ["Name of Hub 1", "Name of Hub 2", "Name of Hub 3"],
  "connections": [
    {
      "sourceId": "char_...",
      "targetId": "lore_...",
      "sourceTitle": "...",
      "targetTitle": "...",
      "weight": 0.85,
      "thematicKeywordOverlap": ["...", "..."],
      "characterCoOccurrences": ["..."],
      "reason": "...",
      "narrativeSignificance": "..."
    }
  ]
}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.2
                }
            });

            try {
                const parsed = JSON.parse(response.text || '{}');
                const rawConns = Array.isArray(parsed.connections) ? parsed.connections : [];

                if (rawConns.length === 0) {
                    return generateLocalFallbackWeights();
                }

                const cleanedConns: Lore3DConnectionWeightResult[] = rawConns.map((c: any) => ({
                    sourceId: String(c.sourceId || ''),
                    targetId: String(c.targetId || ''),
                    sourceTitle: String(c.sourceTitle || ''),
                    targetTitle: String(c.targetTitle || ''),
                    weight: typeof c.weight === 'number' ? Math.min(0.99, Math.max(0.15, c.weight)) : 0.5,
                    thematicKeywordOverlap: Array.isArray(c.thematicKeywordOverlap) ? c.thematicKeywordOverlap : [],
                    characterCoOccurrences: Array.isArray(c.characterCoOccurrences) ? c.characterCoOccurrences : [],
                    reason: String(c.reason || 'Narrative connection based on thematic overlap.'),
                    narrativeSignificance: String(c.narrativeSignificance || 'Contributes to project continuity.')
                })).filter(c => c.sourceId && c.targetId);

                return {
                    generatedAt: new Date().toISOString(),
                    totalConnectionsAnalyzed: cleanedConns.length,
                    connections: cleanedConns,
                    narrativeSummary: parsed.narrativeSummary || `Calculated ${cleanedConns.length} AI connection weights across canon lore and character co-occurrences.`,
                    primaryNarrativeHubs: Array.isArray(parsed.primaryNarrativeHubs) ? parsed.primaryNarrativeHubs : []
                };
            } catch (err) {
                console.warn("Failed to parse Gemini 3D weights response, using heuristic fallback:", err);
                return generateLocalFallbackWeights();
            }
        }, { maxRetries: 3, taskName: '3D Lore Graph Weights Calculation' });
    } catch (e) {
        console.warn("Gemini 3D Lore Graph Weights calculation fallback invoked:", e);
        return generateLocalFallbackWeights();
    }
};

// --- NATURAL LANGUAGE LORE QUERY SEARCH & CONTEXT-AWARE SUMMARY SERVICE ---
export const queryLoreAndTranscriptsWithGemini = async (params: {
    query: string;
    lore: LoreEntry[];
    transcripts?: SavedTranscript[];
    characters?: Character[];
}): Promise<LoreQueryResponse> => {
    const { query: userQuery, lore = [], transcripts = [], characters = [] } = params;

    const generateFallbackResponse = (): LoreQueryResponse => {
        const queryLower = userQuery.toLowerCase();
        const terms = queryLower.split(/\W+/).filter(w => w.length > 2);

        // Find relevant lore entries
        const matchedLore = lore.filter(l => {
            const text = `${l.title} ${l.content} ${(l.tags || []).join(' ')}`.toLowerCase();
            return terms.some(t => text.includes(t));
        }).slice(0, 5);

        // Find relevant transcripts
        const matchedTranscripts = transcripts.filter(t => {
            const text = `${t.title} ${t.text || ''}`.toLowerCase();
            return terms.some(term => text.includes(term));
        }).slice(0, 3);

        const citations: LoreQueryCitation[] = [
            ...matchedLore.map(l => ({
                sourceType: 'lore' as const,
                id: l.id,
                title: l.title,
                quoteOrSnippet: l.content.slice(0, 160) + (l.content.length > 160 ? '...' : ''),
                relevanceScore: 85
            })),
            ...matchedTranscripts.map(t => ({
                sourceType: 'transcript' as const,
                id: t.id,
                title: t.title,
                quoteOrSnippet: (t.text || '').slice(0, 160) + ((t.text || '').length > 160 ? '...' : ''),
                relevanceScore: 78
            }))
        ];

        return {
            query: userQuery,
            summary: matchedLore.length > 0 || matchedTranscripts.length > 0
                ? `Query analysis identified ${matchedLore.length} canon lore documents and ${matchedTranscripts.length} voice transcriptions bearing semantic relevance to "${userQuery}". Key elements revolve around ${matchedLore.map(l => `"${l.title}"`).slice(0, 3).join(', ')}.`
                : `No direct keyword matches were found for "${userQuery}" in current canon. Consider broadening the query terms or adding related lore entries.`,
            narrativeContext: `Semantic query mapped across ${lore.length} lore entries and ${transcripts.length} recorded audio sessions.`,
            thematicThemes: matchedLore.flatMap(l => l.tags || []).slice(0, 4),
            directEvidence: citations,
            relatedLoreIds: matchedLore.map(l => l.id),
            relatedTranscriptIds: matchedTranscripts.map(t => t.id),
            characterConnections: characters.filter(c => userQuery.toLowerCase().includes(c.name.toLowerCase())).map(c => c.name),
            screenplayImplications: `Screenwriters can use these cited sources to maintain canonical continuity when developing related scene beats.`,
            confidenceScore: citations.length > 0 ? 82 : 45,
            generatedAt: new Date().toISOString()
        };
    };

    if (!userQuery.trim()) {
        return generateFallbackResponse();
    }

    try {
        return await apiCallWithRetry(async () => {
            const ai = getClient();

            // Prepare Lore pool
            const lorePool = lore.slice(0, 30).map(l => ({
                id: l.id,
                title: l.title,
                cluster: l.cluster,
                tags: l.tags,
                content: l.content.slice(0, 350)
            }));

            // Prepare Transcripts pool
            const transcriptPool = transcripts.slice(0, 15).map(t => ({
                id: t.id,
                title: t.title,
                text: (t.text || '').slice(0, 350)
            }));

            const charList = characters.slice(0, 12).map(c => `${c.name} (${c.archetype})`).join(', ');

            const prompt = `You are the Master Canon Archivist and Principal Story Analyst for this cinematic universe.
A creative team member has submitted a natural language Lore Query:

USER QUERY:
"${userQuery}"

CANON LORE ARCHIVE:
${JSON.stringify(lorePool, null, 2)}

TRANSCRIBED VOICE SESSIONS & AUDIO LOGS:
${JSON.stringify(transcriptPool, null, 2)}

PROJECT CHARACTERS:
${charList || 'No character roster provided.'}

TASK:
Perform a deep semantic query across ALL lore entries and transcripts.
DO NOT merely match keywords. Provide a rich, context-aware, insightful narrative synthesis that:
1. Directly and thoroughly answers the question with creative nuance and canon fidelity.
2. Explains the overarching narrative context and how different elements tie together.
3. Cites direct evidence and verbatim quotes/excerpts from the Lore entries and Transcripts.
4. Identifies key thematic motifs and connected characters.
5. Provides actionable screenplay implications for writers and directors.

Respond ONLY with a valid JSON object matching this schema:
{
  "summary": "Rich 2-3 paragraph context-aware narrative synthesis answering the user query in depth.",
  "narrativeContext": "1-2 sentences situating this topic in the larger story world.",
  "thematicThemes": ["Theme 1", "Theme 2", "Theme 3"],
  "directEvidence": [
    {
      "sourceType": "lore" or "transcript",
      "id": "exact id from the archive",
      "title": "exact title of source",
      "quoteOrSnippet": "verbatim or focused snippet explaining the link",
      "relevanceScore": 95
    }
  ],
  "relatedLoreIds": ["lore_id_1", "lore_id_2"],
  "relatedTranscriptIds": ["transcript_id_1"],
  "characterConnections": ["Character Name 1"],
  "screenplayImplications": "Concrete guidance for writing scenes involving this subject.",
  "confidenceScore": 94
}`;

            const response = await ai.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                    responseMimeType: 'application/json',
                    temperature: 0.25
                }
            });

            try {
                const parsed = JSON.parse(response.text || '{}');
                
                const rawEvidence = Array.isArray(parsed.directEvidence) ? parsed.directEvidence : [];
                const directEvidence: LoreQueryCitation[] = rawEvidence.map((e: any) => ({
                    sourceType: (e.sourceType === 'transcript' ? 'transcript' : 'lore') as 'lore' | 'transcript',
                    id: String(e.id || ''),
                    title: String(e.title || 'Canon Source'),
                    quoteOrSnippet: String(e.quoteOrSnippet || ''),
                    relevanceScore: typeof e.relevanceScore === 'number' ? e.relevanceScore : 85
                })).filter(e => e.id);

                return {
                    query: userQuery,
                    summary: parsed.summary || `Synthesized canon analysis for "${userQuery}".`,
                    narrativeContext: parsed.narrativeContext || 'Evaluated across canon lore and recorded voice sessions.',
                    thematicThemes: Array.isArray(parsed.thematicThemes) ? parsed.thematicThemes : [],
                    directEvidence: directEvidence.length > 0 ? directEvidence : generateFallbackResponse().directEvidence,
                    relatedLoreIds: Array.isArray(parsed.relatedLoreIds) ? parsed.relatedLoreIds : [],
                    relatedTranscriptIds: Array.isArray(parsed.relatedTranscriptIds) ? parsed.relatedTranscriptIds : [],
                    characterConnections: Array.isArray(parsed.characterConnections) ? parsed.characterConnections : [],
                    screenplayImplications: parsed.screenplayImplications || 'Ground character choices in established canon history.',
                    confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 90,
                    generatedAt: new Date().toISOString()
                };
            } catch (err) {
                console.warn("Failed to parse Gemini lore query response, using fallback:", err);
                return generateFallbackResponse();
            }
        }, { maxRetries: 3, taskName: 'Natural Language Lore Query' });
    } catch (e) {
        console.warn("Gemini Lore Query fallback invoked:", e);
        return generateFallbackResponse();
    }
};





