/**
 * Centralized Theme Configuration for MythOS Studio Pro
 * Consolidates colors, spacing, borders, radius, typography, and component styling tokens.
 */

export const themeConfig = {
    // Surface & Layout Backgrounds
    colors: {
        primary: '#0a0a0a',     // Deepest canvas background
        secondary: '#171717',   // Surface secondary (panels, sidebars, toolbars)
        surface: '#262626',     // Cards, modals, elevated surfaces
        accent: '#404040',      // Dividers, borders
        brand: '#2563eb',       // Primary blue action
        brandHover: '#1d4ed8',  // Blue hover state
        brandLight: '#3b82f6',  // Accent brand blue

        // Semantic status
        success: '#10b981',     // emerald-500
        warning: '#f59e0b',     // amber-500
        danger: '#ef4444',      // red-500
        info: '#06b6d4',        // cyan-500
        purple: '#a855f7',      // purple-500
    },

    // Spacing Standards
    spacing: {
        pagePadding: "p-6 max-w-7xl mx-auto w-full space-y-8 h-full overflow-y-auto",
        sectionGap: "space-y-6",
        cardPadding: "p-6",
        compactCardPadding: "p-4",
    },

    // Border Radius Standards
    radius: {
        sm: "rounded",
        md: "rounded-lg",
        lg: "rounded-xl",
        xl: "rounded-2xl",
        full: "rounded-full",
    },

    // Tailwind Class Tokens for Layout
    layout: {
        appContainer: "flex h-screen bg-primary text-text-primary overflow-hidden font-sans",
        mainContent: "flex-grow flex flex-col min-w-0 bg-secondary/20 h-screen overflow-hidden",
        scrollableArea: "flex-1 overflow-y-auto min-h-0 custom-scrollbar",
        studioContainer: "p-6 max-w-7xl mx-auto w-full space-y-8 h-full overflow-y-auto",
        loginScreen: "flex h-screen w-screen bg-neutral-950 text-white relative overflow-hidden items-center justify-center font-sans",
        loginCard: "max-w-md w-full bg-neutral-900 border border-neutral-800 p-8 rounded-2xl shadow-2xl relative z-10 flex flex-col items-center",
        loadingScreen: "flex h-screen w-screen bg-neutral-950 items-center justify-center",
    },

    // Studio Shell & Header
    header: {
        container: "h-14 bg-secondary/90 border-b border-accent px-6 flex items-center justify-between flex-shrink-0 z-20 backdrop-blur-md",
        breadcrumbItem: "text-xs font-bold uppercase tracking-wider text-neutral-400 hover:text-white transition-colors cursor-pointer",
        breadcrumbCurrent: "text-xs font-black uppercase tracking-wider text-white",
        avatarBadge: "flex items-center gap-2 bg-neutral-800/50 border border-neutral-700 rounded-full pl-1 pr-4 py-1",
        searchBar: "block w-full pl-10 pr-10 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-medium",
    },

    // Sidebar Tokens
    sidebar: {
        container: "bg-secondary border-r border-accent flex flex-col h-full flex-shrink-0 transition-all duration-300 ease-in-out",
        header: "p-6 border-b border-accent transition-all duration-300",
        navItemActive: "bg-brand text-white shadow-lg shadow-blue-900/20",
        navItemInactive: "text-neutral-400 hover:bg-surface hover:text-white",
        sectionTitle: "text-[10px] font-black text-neutral-600 uppercase tracking-widest",
    },

    // Studio Cards & Panels
    cards: {
        base: "bg-surface/40 border border-accent rounded-xl p-5 hover:border-neutral-500/50 transition-all duration-300",
        elevated: "bg-surface border border-accent rounded-xl p-6 shadow-2xl",
        interactive: "bg-surface/40 border border-accent hover:bg-surface/80 hover:border-brand/50 rounded-xl p-5 transition-all duration-300 cursor-pointer shadow-inner",
        hero: "bg-gradient-to-br from-secondary via-surface/60 to-secondary border border-accent rounded-2xl p-8 shadow-2xl",
        panel: "bg-neutral-900/50 border border-neutral-800 rounded-2xl p-8 shadow-2xl relative",
    },

    // Typography Standards & Centralized System
    typography: {
        // Atomic Design Tokens
        fontWeights: {
            normal: "font-normal",
            medium: "font-medium",
            semibold: "font-semibold",
            bold: "font-bold",
            black: "font-black",
        },
        lineHeights: {
            none: "leading-none",
            tight: "leading-tight",
            snug: "leading-snug",
            normal: "leading-normal",
            relaxed: "leading-relaxed",
            loose: "leading-loose",
        },
        letterSpacing: {
            tighter: "tracking-tighter",
            tight: "tracking-tight",
            normal: "tracking-normal",
            wide: "tracking-wide",
            wider: "tracking-wider",
            widest: "tracking-widest",
            ultraWide: "tracking-[0.25em]",
        },

        // Studio Headers
        headers: {
            h1: "text-3xl font-bold tracking-tight text-neutral-200 leading-tight mb-2",
            h2: "text-2xl font-bold tracking-tight text-white leading-snug",
            h3: "text-xl font-black text-white uppercase tracking-tight leading-none",
            section: "text-sm font-black text-white uppercase tracking-[0.25em] leading-normal",
            card: "text-base font-bold text-neutral-200 leading-snug",
        },

        // Studio Body Text
        body: {
            regular: "text-sm text-neutral-300 leading-relaxed font-normal",
            muted: "text-xs text-neutral-400 leading-relaxed font-normal",
            small: "text-[11px] text-neutral-400 leading-normal font-normal",
            code: "font-mono text-xs leading-relaxed font-normal",
        },

        // UI Labels & Microcopy
        labels: {
            field: "text-[10px] font-black text-neutral-500 uppercase tracking-widest leading-none block",
            badge: "text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border leading-none",
            tag: "text-[9px] font-bold uppercase tracking-wider leading-none",
            meta: "text-[10px] text-neutral-500 font-medium leading-normal",
        },

        // Convenience Pre-composed Class Strings (Fully backwards compatible with existing Studio components)
        pageTitle: "text-3xl font-bold text-neutral-200 mb-2 leading-tight tracking-tight",
        pageSubtitle: "text-neutral-400 text-sm leading-relaxed font-normal",
        studioTitle: "text-xl font-black text-white uppercase tracking-tight leading-none",
        sectionHeader: "text-sm font-black text-white uppercase tracking-[0.25em] leading-normal",
        label: "text-[10px] font-black text-neutral-500 uppercase tracking-widest leading-none block",
        code: "font-mono text-xs leading-relaxed font-normal",
        bodyMuted: "text-xs text-neutral-400 leading-relaxed font-normal",
        badge: "text-[10px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border leading-none",
    },

    // Button Tokens
    buttons: {
        primary: "px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50",
        secondary: "px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-lg transition-colors border border-neutral-700 cursor-pointer flex items-center gap-2",
        ghost: "px-3 py-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800/60 rounded-lg text-xs font-bold transition-colors cursor-pointer",
        danger: "px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg cursor-pointer",
        success: "px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors shadow cursor-pointer",
        iconRound: "p-2.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors border border-neutral-700 cursor-pointer flex items-center justify-center",
        google: "w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-900 font-bold text-xs py-3.5 px-4 rounded-xl transition-all shadow-lg hover:shadow-xl shrink-0 cursor-pointer uppercase tracking-wider",
    },

    // Form Inputs & Modals
    forms: {
        input: "w-full bg-secondary border border-accent rounded-lg px-4 py-2.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors font-mono",
        select: "w-full bg-secondary border border-accent rounded-lg px-4 py-2.5 text-xs text-neutral-100 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors cursor-pointer appearance-none",
        textarea: "w-full bg-secondary border border-accent rounded-lg p-4 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-colors resize-y font-mono leading-relaxed",
        modalOverlay: "fixed inset-0 bg-black/80 z-50 p-4 flex items-center justify-center backdrop-blur-sm animate-fade-in",
        modalDialog: "bg-neutral-900 border border-neutral-700 rounded-xl max-w-2xl w-full flex flex-col overflow-hidden shadow-2xl relative",
    },

    // Tab Navigation
    tabs: {
        bar: "flex items-center px-6 pt-2 bg-neutral-900 border-b border-neutral-800 gap-1 z-10",
        tabActive: "flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 border-emerald-500 text-white transition-colors",
        tabInactive: "flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 border-transparent text-neutral-500 hover:text-neutral-300 transition-colors",
    },

    // Floating Overlay Widgets (Voice Assistant & Collision Toasts)
    overlays: {
        voiceFloatingButtonActive: "p-4 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-110 pointer-events-auto border flex items-center justify-center bg-purple-600 hover:bg-purple-500 text-white border-purple-400/40 ring-4 ring-purple-500/20",
        voiceFloatingButtonInactive: "p-4 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-110 pointer-events-auto border flex items-center justify-center bg-neutral-900 hover:bg-neutral-800 text-neutral-400 border-neutral-700/60",
        voiceBanner: "p-3 bg-neutral-900/95 border border-purple-500/30 text-neutral-200 text-xs font-black uppercase rounded-xl tracking-wider shadow-2xl flex items-center gap-2 animate-bounce pointer-events-auto backdrop-blur-md",
        voiceRecordingBanner: "fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-rose-950/90 border border-rose-500 text-rose-200 text-xs font-black uppercase p-3 px-5 rounded-full shadow-2xl flex items-center gap-2.5 animate-pulse backdrop-blur-md",
        flashBanner: "fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-black uppercase p-3.5 px-6 rounded-xl shadow-2xl border border-purple-400/30 tracking-widest flex items-center gap-2 animate-pulse",
        collisionToast: "fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-full max-w-md bg-gradient-to-r from-red-950 via-black to-red-950 border border-red-500 rounded-2xl p-4 shadow-[0_0_25px_rgba(239,68,68,0.4)] flex flex-col gap-2.5 backdrop-blur-md animate-slide-in-down",
    }
} as const;

export default themeConfig;
