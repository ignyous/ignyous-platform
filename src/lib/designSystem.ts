/**
 * Global Design System
 * 
 * Unified color palette and styling constants based on EasyModeDashboard
 * Applied across all pages and components for consistency
 */

export const designSystem = {
  // Primary colors
  colors: {
    // Neutrals - clean white/light foundation
    bg: 'hsl(220 20% 97%)',           // Light background
    bgSecondary: 'hsl(220 20% 93%)',  // Slightly darker background for sections
    card: 'hsl(0 0% 100%)',           // Pure white cards
    cardAlt: 'hsl(220 14% 96%)',      // Alternative card color

    // Text colors
    foreground: 'hsl(224 20% 12%)',   // Main text
    text: 'hsl(224 20% 12%)',
    textSecondary: 'hsl(220 10% 40%)',
    muted: 'hsl(220 10% 55%)',
    mutedLight: 'hsl(220 10% 68%)',

    // Borders
    border: 'hsl(220 14% 89%)',
    borderLight: 'hsl(220 14% 93%)',

    // Primary brand color (blue/purple)
    primary: 'hsl(248 79% 60%)',
    primaryDark: 'hsl(248 79% 50%)',
    primaryLight: 'hsl(248 79% 70%)',
    primaryVeryLight: 'hsl(248 79% 96%)',
    sidebarAccent: 'hsl(248 60% 96%)',

    // Semantic colors
    success: 'hsl(142 71% 45%)',
    successBg: 'hsl(142 71% 95%)',
    error: 'hsl(0 84% 62%)',
    errorBg: 'hsl(0 100% 89%)',
    warning: 'hsl(37 92% 50%)',
    warningBg: 'hsl(50 100% 84%)',
    info: 'hsl(209 96% 51%)',
    infoBg: 'hsl(210 100% 88%)',

    // Quick action tone colors (matching EasyMode)
    tones: {
      purple: { bg: 'hsl(276 95% 92%)', color: 'hsl(270 95% 58%)' },
      blue: { bg: 'hsl(210 100% 88%)', color: 'hsl(209 96% 51%)' },
      teal: { bg: 'hsl(171 82% 83%)', color: 'hsl(174 84% 36%)' },
      yellow: { bg: 'hsl(50 100% 84%)', color: 'hsl(37 92% 50%)' },
      red: { bg: 'hsl(0 100% 89%)', color: 'hsl(0 84% 62%)' },
      cyan: { bg: 'hsl(185 92% 85%)', color: 'hsl(188 86% 43%)' },
    },
  },

  // Typography
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    
    // Heading sizes
    h1: { fontSize: 28, fontWeight: 800, lineHeight: 1.2, letterSpacing: '-0.03em' },
    h2: { fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
    h3: { fontSize: 20, fontWeight: 700, lineHeight: 1.3 },
    h4: { fontSize: 18, fontWeight: 600, lineHeight: 1.3 },
    h5: { fontSize: 16, fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: 14, fontWeight: 600, lineHeight: 1.4 },

    // Body text
    bodyLarge: { fontSize: 16, fontWeight: 400, lineHeight: 1.6 },
    body: { fontSize: 14, fontWeight: 400, lineHeight: 1.6 },
    bodySmall: { fontSize: 13, fontWeight: 400, lineHeight: 1.5 },
    
    // Labels & captions
    label: { fontSize: 12, fontWeight: 600, lineHeight: 1.4, letterSpacing: '0.08em' },
    caption: { fontSize: 11, fontWeight: 500, lineHeight: 1.4 },
    tiny: { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.3 },
  },

  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  // Border radius
  borderRadius: {
    none: 0,
    sm: 6,
    md: 12,
    lg: 16,
    full: 9999,
  },

  // Shadows
  shadows: {
    none: 'none',
    sm: '0 1px 2px rgba(15, 23, 42, 0.04)',
    md: '0 4px 6px rgba(15, 23, 42, 0.1)',
    lg: '0 10px 15px rgba(15, 23, 42, 0.15)',
    xl: '0 20px 25px rgba(15, 23, 42, 0.2)',
    // Branded shadows
    primarySm: '0 4px 12px hsla(248, 79%, 60%, 0.15)',
    primary: '0 10px 24px hsla(248, 79%, 60%, 0.2)',
  },

  // Layout
  layout: {
    sidebarWidth: 220,
    headerHeight: 58,
    contentMaxWidth: 1400,
  },

  // Z-index scale
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 100,
    sticky: 200,
    fixed: 300,
    modalBackdrop: 400,
    modal: 500,
    popover: 600,
    tooltip: 700,
    notification: 800,
    cover: 9999,
  },

  // Animation/transition
  transitions: {
    fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const

// Helper function to get responsive spacing
export function getSpacing(size: keyof typeof designSystem.spacing): number {
  return designSystem.spacing[size]
}

// Helper function to create CSS variable declarations
export function generateCSSVariables(): string {
  const vars = [`--ds-bg: ${designSystem.colors.bg}`]
  return vars.join(';')
}

export type DesignSystem = typeof designSystem
