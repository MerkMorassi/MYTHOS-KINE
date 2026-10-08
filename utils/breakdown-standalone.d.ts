// Type definitions for MythosBreakdown standalone chip parser
export interface BreakdownScene {
    n: number;
    header: string;
    intExt: string;
    set: string;
    location: string;
    time: string;
    cast: string[];
    onSet: string[];
    dialogueLines: number;
    actionLines: number;
    words: number;
    estPages: number;
    props: string[];
    wardrobe: string[];
    makeup: string[];
    vfx: string[];
    sfx: string[];
    vehicles: string[];
    animals: string[];
    stunts: string[];
    sound: string[];
    music: string[];
    extras: string[];
    locations: string[];
    transitions: string[];
}

export interface BreakdownResult {
    spec: string;
    scenes: BreakdownScene[];
    sets: string[];
    cast: string[];
    totals: {
        scenes: number;
        sets: number;
        cast: number;
        words: number;
        estPages: number;
        props: number;
        wardrobe: number;
        makeup: number;
        vfx: number;
        sfx: number;
        vehicles: number;
        animals: number;
        stunts: number;
        sound: number;
        music: number;
        extras: number;
    };
}

export interface StripboardResult {
    groups: string[];
    sceneOrder: number[];
}

export interface ShotItem {
    shot_id: string;
    scene_n: number;
    set: string;
    int_ext: string;
    time: string;
    size: string;
    subject: string;
    detail: string;
    status: string;
}

export interface ScriptParagraph {
    type: string;
    text: string;
}

export interface MythosBreakdownEngine {
    SPEC: string;
    BREAK_COLS: string[];
    SHOT_COLS: string[];
    parseSceneHeader: (text: string) => { raw: string; intExt: string; set: string; location: string; time: string };
    extractTags: (text: string) => Array<{ kind: string; value: string }>;
    mentionedNames: (text: string) => string[];
    breakdown: (paras: ScriptParagraph[]) => BreakdownResult;
    stripboard: (bd: BreakdownResult) => StripboardResult;
    toCSV: (bd: BreakdownResult) => string;
    toShots: (bd: BreakdownResult) => ShotItem[];
    toShotlistCSV: (bd: BreakdownResult) => string;
    parasFromFountain: (text: string) => ScriptParagraph[];
    parasFromHtml: (html: string) => ScriptParagraph[];
    readCanvas: (canvasId?: string) => ScriptParagraph[];
}

declare const MythosBreakdown: MythosBreakdownEngine;
export default MythosBreakdown;
