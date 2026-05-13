# Phase 2: Intelligence & User Experience

**Current Status:** ✅ Phase 1 Complete  
**Starting:** After Phase 1 validation  
**Goal:** Add the features that make ignyous feel magical and handle complex workflows

---

## 📊 Phase 2 Priority Matrix

```
┌─────────────────────────────────────────────────────────┐
│ IMPACT                                                  │
│  HIGH  ├─ P0: Status Indicator      P1: Routines      │
│        ├─ P2: Visual Editor         P3: Forms         │
│  LOW   ├─ P4: Advanced Analytics    P5: Mobile UX     │
│        └────────────────────────────────────────────── │
│          EFFORT: Easy → Hard                            │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 P0: Site Connection Status Indicator

**Why First?** Debugging and user confidence. When actions fail, users need to know *why*.

### What It Does
Real-time status indicator showing:
- ✅ Bridge is reachable
- ✅ API key is valid
- ✅ Site is responding
- ✅ Latest action status
- ✅ Cache status (full/cleared)

### Placement
Top of dashboard, next to site name. Compact indicator with hover details.

### States
```
🟢 CONNECTED    - All systems good
🟡 SLOW         - Response time > 3s
🔴 UNREACHABLE  - Can't reach WordPress
⚠️  INVALID_KEY - Auth failed
🔄 CHECKING     - Testing connection
```

### Implementation Plan
```typescript
// 1. Create hook
/src/hooks/useSiteStatus.ts
- Polls /api/wordpress/status every 30s
- Tracks response time
- Detects auth failures
- Manages status state

// 2. Create component
/src/components/SiteStatusIndicator.tsx
- Shows current status
- Tooltip on hover with details
- Click to test manually
- Recent actions log snippet

// 3. Add status endpoint
/src/app/api/wordpress/status/route.ts
- Tests bridge connectivity
- Validates API key
- Checks response time
- Returns current cache status

// 4. Integrate into dashboard
/src/app/dashboard/page.tsx
- Import SiteStatusIndicator
- Place in header
- Pass siteUrl, apiKey
```

**Estimated Effort:** 3-4 hours  
**Dependencies:** None (uses existing routes)  
**Value for debugging:** ⭐⭐⭐⭐⭐

---

## 🎯 P1: Routine Library (10 Common Routines)

**Why?** Non-technical users don't think in "actions" — they think in workflows like "update phone numbers" or "add contact form".

### What It Does
Pre-built, AI-assisted workflows for common tasks:

```
Phone Number Manager
├─ Scan for all phone numbers
├─ Group by format/location
├─ Preview changes
└─ Replace all with one click

Email Manager
├─ Find all email addresses
├─ Identify exposed contact forms
├─ Export contact list
└─ Update all emails

Content Replacer (Bulk)
├─ Find all instances of text
├─ Show with surrounding context
├─ Bulk replace
└─ Preview before/after

Hero/Banner Section
├─ List all hero images
├─ Replace images in bulk
├─ Update text overlays
└─ Adjust colors

Form Manager
├─ List all forms
├─ Update form handlers
├─ Add reCAPTCHA
└─ Enable notifications

SEO Manager
├─ Scan all pages
├─ Generate meta titles/descriptions
├─ Bulk apply
└─ Show preview

Image Optimizer
├─ Find all images
├─ Resize/compress
├─ Replace with optimized versions
└─ Clear CDN cache

Social Links
├─ Find social profile links
├─ Update all references
├─ Add new platforms
└─ Verify links work

Team/Staff Directory
├─ Find staff info sections
├─ Update team bios
├─ Replace photos
└─ Update contact info

Navigation Menu
├─ List all menu items
├─ Reorganize structure
├─ Update labels
└─ Add/remove items
```

### Implementation Plan

**Phase 2A: Foundation (2-3h)**
```typescript
// 1. Define routine structure
/src/lib/routines/types.ts
export interface Routine {
  id: string
  name: string
  description: string
  icon: string
  category: 'content' | 'contact' | 'forms' | 'images' | 'seo' | 'navigation'
  steps: Step[]
  estimatedTime: number
}

export interface Step {
  id: string
  action: Action
  title: string
  description: string
}

// 2. Create routine loader
/src/lib/routines/index.ts
export const ROUTINES: Routine[] = [
  phoneNumberManager(),
  emailManager(),
  // ... etc
]

// 3. Create routine player UI
/src/components/RoutinePlayer.tsx
- Shows current step
- Highlights what will change
- Allows preview
- "Next" / "Execute" buttons
```

**Phase 2B: Core Routines (4-5h)**
```typescript
// Add routine definitions
/src/lib/routines/
├─ phone.ts        // Phone number manager
├─ email.ts        // Email manager
├─ content.ts      // Bulk replacer
├─ forms.ts        // Form manager
├─ seo.ts          // SEO optimization
├─ images.ts       // Image manager
└─ navigation.ts   // Menu manager
```

**Phase 2C: Integration (1-2h)**
```typescript
// Add to dashboard
/src/app/dashboard/page.tsx
- Import ROUTINES
- Show in sidebar or modal
- Launch RoutinePlayer on select
```

**Estimated Effort:** 6-8 hours  
**Dependencies:** P0 (status indicator helps debugging)  
**User delight:** ⭐⭐⭐⭐⭐

---

## 🎯 P2: Visual Element Editor (Hover-to-Select)

**Why?** Users want to "point and click" at elements they want to change, not hunt through code.

### What It Does
Hover over any element on live preview → It highlights → Click to edit

```
User hovers over banner image
    ↓
Preview shows selection box + controls
    ↓
User clicks "Change Image" button
    ↓
Opens image picker
    ↓
User selects new image
    ↓
Preview updates in real-time
    ↓
User clicks "Apply"
    ↓
Bridge updates site with new image
```

### Implementation Plan

**Phase 2A: Selection Framework (3-4h)**
```typescript
// 1. Embed selection handler in iframe
/src/components/PreviewIframe.tsx
- Inject selection script into iframe
- Listen for element hovers
- Send selected element to parent

// 2. Create selection state manager
/src/hooks/useElementSelection.ts
- Track selected element ID
- Store element metadata
- Provide update methods

// 3. Create element inspector
/src/components/ElementInspector.tsx
- Shows selected element type
- Lists available actions
- Shows parent/child hierarchy
- Allows direct CSS editing
```

**Phase 2B: Edit Modes (4-5h)**
```typescript
// Add per-element editors
/src/components/editors/
├─ ImageEditor.tsx      // Change images, crop, filters
├─ TextEditor.tsx       // Edit text, change font
├─ ColorEditor.tsx      // Background, text color
├─ SectionEditor.tsx    // Move, duplicate, delete sections
└─ FormEditor.tsx       // Add fields, change submit action
```

**Phase 2C: Real-time Sync (2-3h)**
```typescript
// When element is edited:
// 1. Apply changes to preview iframe immediately
// 2. Queue update action
// 3. On "Save", execute action
// 4. Refresh preview with live site
```

**Estimated Effort:** 8-10 hours  
**Dependencies:** P0 (for error feedback)  
**Wow factor:** ⭐⭐⭐⭐⭐

---

## 🎯 P3: Form Intelligence

**Why?** Forms are critical for conversions. Smart defaults + validation = better results.

### What It Does
When AI creates/updates a form:
- Auto-detect required fields based on type
- Set sensible defaults (name, email, message required)
- Add validation rules
- Configure submission (email, webhook, Zapier)
- Add reCAPTCHA if no validation
- Preview form on device sizes

### Implementation Plan

**Phase 2A: Form Parser (2-3h)**
```typescript
// 1. Parse form structure
/src/lib/forms/parser.ts
- Extract field types, labels, validation
- Identify form purpose (contact, signup, etc)

// 2. Generate recommendations
/src/lib/forms/recommendations.ts
- Suggest required fields
- Flag security issues
- Recommend validation
- Suggest confirmation email template
```

**Phase 2B: Form Builder Integration (3-4h)**
```typescript
// 1. Create form editor UI
/src/components/FormBuilder.tsx
- List form fields
- Edit field properties
- Reorder/delete fields
- Configure submission

// 2. Add to dashboard
- "Edit Forms" routine
- "Create Form" action
```

**Phase 2C: Submission Handling (1-2h)**
```typescript
// 1. Configure email notifications
// 2. Add Zapier/Make.com webhook
// 3. Test submission flow
```

**Estimated Effort:** 4-6 hours  
**Dependencies:** P0, P1 (Routine library)  
**Conversion impact:** ⭐⭐⭐⭐

---

## 📋 Implementation Order

### Week 1: P0 + P1A
```
Day 1-2: P0 Status Indicator
        └─ Endpoint + Hook + Component + Integration
Day 3-4: P1A Foundation
        └─ Routine types + player UI + dashboard integration
```

### Week 2: P1B + P1C
```
Day 1-3: P1B Core Routines
        └─ Phone, Email, Content, Forms, SEO, Images, Nav
Day 4-5: P1C Integration + Testing
        └─ Add to dashboard, test workflows
```

### Week 3: P2 Visual Editor
```
Day 1-2: P2A Selection Framework
        └─ Iframe injection, selection state, inspector
Day 3-4: P2B Edit Modes
        └─ Image, Text, Color, Section editors
Day 5: P2C Real-time Sync
        └─ Preview updates, save flow
```

### Week 4: P3 + Polish
```
Day 1-2: P3 Form Intelligence
        └─ Parser, recommendations, builder
Day 3-5: Integration + Testing + Bug Fixes
        └─ Full end-to-end workflows
```

---

## 🔧 Tech Stack (No New Dependencies)

Phase 2 uses only existing libraries:
- React hooks (useState, useEffect, useCallback)
- TypeScript for type safety
- Existing API routes (no new backend needed)
- Existing actionHandler module
- Browser APIs (MutationObserver, IntersectionObserver)

---

## 📈 Success Metrics

After Phase 2, measure:
- **Status Indicator:** Reduced support requests about "why did this fail?"
- **Routines:** Average time to complete a task drops from 15 min → 3 min
- **Visual Editor:** Non-technical users can edit pages without AI help
- **Forms:** Form conversion rates increase (fewer errors)

---

## 🚀 Quick Links

- [Phase 1 Checklist](./PHASE1.md)
- [Action Handler Docs](./src/lib/actionHandler.ts)
- [Bridge Test Script](./bridge-test.js)

---

## ⚡ Next Steps

1. **Validate Phase 1** ← You are here
2. **Run bridge-test.js** to ensure everything works
3. **Create status endpoint** (P0, Day 1)
4. **Build SiteStatusIndicator** (P0, Day 2)
5. **Define Routine types** (P1, Day 3)

---

**Estimated Total:** 25-30 hours of focused dev time  
**Timeline:** 3-4 weeks with focus on Phase 2  
**Result:** ignyous feels like magic to non-technical users ✨
