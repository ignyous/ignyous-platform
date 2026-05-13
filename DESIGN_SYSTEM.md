# 🎨 Unified Design System

Applied across the entire ignyous platform. Based on the clean, modern aesthetic of EasyModeDashboard.

---

## 📋 Overview

All colors, typography, spacing, and components now use a centralized design system defined in `/src/lib/designSystem.ts`.

**Benefits:**
- Consistent look and feel across all pages
- Easy to update colors globally
- Type-safe color values
- Professional, clean appearance
- Accessibility-friendly color combinations

---

## 🎯 Colors

### Primary Palette

```
Background:     hsl(220 20% 97%)    - Light, neutral background
Card:           hsl(0 0% 100%)      - Pure white for cards/containers
Text:           hsl(224 20% 12%)    - Dark text (main)
Text Secondary: hsl(220 10% 40%)    - Secondary text
Muted:          hsl(220 10% 55%)    - Muted/placeholder text
Border:         hsl(220 14% 89%)    - Subtle borders
```

### Brand Color

```
Primary:        hsl(248 79% 60%)    - Main action color (blue-purple)
Primary Dark:   hsl(248 79% 50%)    - Hover/active state
Primary Light:  hsl(248 79% 70%)    - Lighter variant
Primary VL:     hsl(248 79% 96%)    - Very light background tint
```

### Semantic Colors

```
Success:        hsl(142 71% 45%)    - Green for success states
Error:          hsl(0 84% 62%)      - Red for errors
Warning:        hsl(37 92% 50%)     - Orange for warnings
Info:           hsl(209 96% 51%)    - Blue for informational
```

### Tone Colors (for Quick Actions, Tags, etc.)

```
Purple:  bg: hsl(276 95% 92%)  color: hsl(270 95% 58%)
Blue:    bg: hsl(210 100% 88%) color: hsl(209 96% 51%)
Teal:    bg: hsl(171 82% 83%)  color: hsl(174 84% 36%)
Yellow:  bg: hsl(50 100% 84%)  color: hsl(37 92% 50%)
Red:     bg: hsl(0 100% 89%)   color: hsl(0 84% 62%)
Cyan:    bg: hsl(185 92% 85%)  color: hsl(188 86% 43%)
```

---

## 📝 Typography

### Font Family
```
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

### Text Sizes

```
H1: 28px, 800 weight, 1.2 line height, -0.03em letter spacing
H2: 24px, 700 weight, 1.2 line height, -0.02em letter spacing
H3: 20px, 700 weight, 1.3 line height
H4: 18px, 600 weight, 1.3 line height
H5: 16px, 600 weight, 1.4 line height
H6: 14px, 600 weight, 1.4 line height

Body Large: 16px, 400 weight, 1.6 line height
Body:       14px, 400 weight, 1.6 line height
Body Small: 13px, 400 weight, 1.5 line height

Label:   12px, 600 weight, 0.08em spacing
Caption: 11px, 500 weight
Tiny:    10px, 600 weight, 0.08em spacing
```

---

## 📏 Spacing Scale

```
xs:   4px
sm:   8px
md:   12px
lg:   16px
xl:   20px
xxl:  24px
xxxl: 32px
```

Use these consistently for padding, margins, and gaps:
```typescript
import { designSystem } from '@/lib/designSystem'

<div style={{ padding: designSystem.spacing.lg, gap: designSystem.spacing.md }}>
```

---

## 🔲 Border Radius

```
none:  0
sm:    6px
md:    12px
lg:    16px
full:  9999px (circle)
```

### Usage Guidelines
- **Buttons, inputs**: `md` (12px)
- **Cards, containers**: `md` or `lg`
- **Small elements (badges, avatars)**: `sm` or `full`
- **Compact UI (chips, tags)**: `sm`

---

## 🎁 Shadows

```
none:          0
sm:            0 1px 2px rgba(15, 23, 42, 0.04)
md:            0 4px 6px rgba(15, 23, 42, 0.1)
lg:            0 10px 15px rgba(15, 23, 42, 0.15)
xl:            0 20px 25px rgba(15, 23, 42, 0.2)

primarySm:     0 4px 12px hsla(248, 79%, 60%, 0.15)
primary:       0 10px 24px hsla(248, 79%, 60%, 0.2)
```

### Usage Guidelines
- **Hover states**: `sm` or `md`
- **Floating UI (modals, popovers)**: `lg` or `xl`
- **Card emphasis**: `md`
- **Brand elements**: `primarySm` or `primary`

---

## ⏱️ Animations

```
fast:   150ms cubic-bezier(0.4, 0, 0.2, 1)
normal: 250ms cubic-bezier(0.4, 0, 0.2, 1)
slow:   350ms cubic-bezier(0.4, 0, 0.2, 1)
```

Example:
```typescript
style={{ 
  transition: `background ${designSystem.transitions.normal}, color ${designSystem.transitions.normal}`
}}
```

---

## 🏗️ Layout Constants

```
sidebarWidth:   220px
headerHeight:   58px
contentMaxWidth: 1400px
```

---

## 🔢 Z-Index Scale

```
hide:           -1
base:           0
dropdown:       100
sticky:         200
fixed:          300
modalBackdrop:  400
modal:          500
popover:        600
tooltip:        700
notification:   800
cover:          9999
```

---

## 💡 Usage Examples

### Basic Component with Design System

```typescript
import { designSystem } from '@/lib/designSystem'

export function MyButton() {
  return (
    <button style={{
      padding: `${designSystem.spacing.md}px ${designSystem.spacing.lg}px`,
      borderRadius: designSystem.borderRadius.md,
      background: designSystem.colors.primary,
      color: designSystem.colors.card,
      border: 'none',
      fontFamily: designSystem.typography.fontFamily,
      ...designSystem.typography.label,
      cursor: 'pointer',
      transition: `all ${designSystem.transitions.normal}`,
      boxShadow: designSystem.shadows.md,
    }}>
      Click me
    </button>
  )
}
```

### Card with Semantic Colors

```typescript
function ErrorCard({ message }: { message: string }) {
  return (
    <div style={{
      background: designSystem.colors.errorBg,
      border: `1px solid ${designSystem.colors.error}`,
      borderRadius: designSystem.borderRadius.md,
      padding: designSystem.spacing.lg,
      color: designSystem.colors.error,
    }}>
      {message}
    </div>
  )
}
```

### Responsive Text with Typography

```typescript
function PageTitle({ title }: { title: string }) {
  return (
    <h1 style={{
      ...designSystem.typography.h1,
      color: designSystem.colors.foreground,
      marginBottom: designSystem.spacing.xl,
    }}>
      {title}
    </h1>
  )
}
```

---

## 🎨 Color Combinations (Accessibility)

### Text on Background
- **Dark text on light background**: ✅ High contrast (4.5:1+)
- **Light text on primary color**: ✅ High contrast (4.5:1+)
- **Muted text on light background**: ✅ Sufficient contrast (3:1+)

### Interactive Elements
- **Primary button**: Primary color background + white text
- **Secondary button**: Border + primary text color
- **Danger button**: Error color background + white text
- **Disabled button**: Muted background + muted text

---

## 🔄 Updating the Design System

To change colors globally:

1. Edit `/src/lib/designSystem.ts`
2. Update the `colors` object
3. All components automatically use the new colors ✨

Example:
```typescript
const C = designSystem.colors

// Instead of:
background: '#248fff'

// Use:
background: C.primary
```

---

## 📱 Responsive Design Notes

The design system doesn't include media breakpoints. Use these standard breakpoints for responsive design:

```typescript
// Mobile first approach
const breakpoints = {
  sm: 640,  // Tablets
  md: 768,  // Small desktop
  lg: 1024, // Desktop
  xl: 1280, // Large desktop
}

// Usage
@media (min-width: ${breakpoints.md}px) {
  // tablet and up
}
```

---

## ✅ Checklist for New Components

When creating new components, ensure:

- [ ] Use `designSystem.colors.*` for all colors
- [ ] Use `designSystem.spacing.*` for padding/margin/gap
- [ ] Use `designSystem.typography.*` for font styles
- [ ] Use `designSystem.borderRadius.*` for rounded corners
- [ ] Use `designSystem.shadows.*` for elevation
- [ ] Use `designSystem.transitions.*` for animations
- [ ] Check color contrast (WCAG AA minimum: 4.5:1 for text)
- [ ] Test on light background (all components should be readable)

---

## 🚀 Migration Status

**Complete:**
- ✅ EasyModeDashboard (uses clean design)
- ✅ Dashboard page (updated to use design system)
- ✅ AppLayout (light theme, clean design)
- ✅ Design system module created

**In Progress:**
- 🔄 Other pages and components
- 🔄 Modals and dialogs
- 🔄 Forms and inputs

**Planned:**
- 📋 Color tokens in CSS variables
- 📋 Storybook for component library
- 📋 Design tokens documentation website

---

## 📞 Questions?

For questions about the design system:
1. Check `/src/lib/designSystem.ts` for available values
2. Look at `EasyModeDashboard.tsx` for real-world examples
3. Check `AppLayout.tsx` for common patterns

---

**Version:** 1.0  
**Last Updated:** May 2026  
**Maintained by:** ignyous team
