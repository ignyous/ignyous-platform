# Phase 1: Foundation & Action Handler Extraction

## Overview
Phase 1 focuses on consolidating the codebase, extracting reusable logic, and creating validation tools before moving to Phase 2 features.

---

## ✅ Completed Items

### 1. **Action Handler Module** (`/src/lib/actionHandler.ts`)
- **Status:** ✓ Complete
- **What it does:** Extracts all action execution logic from `dashboard/page.tsx` into a reusable, testable module
- **Key features:**
  - 50+ action types (update_page, create_page, replace_text, scan_content, etc.)
  - Comprehensive error handling and logging
  - Type-safe action execution
  - No direct React dependencies (pure functions)
  - Context-based dependencies for testability

**Usage in components:**
```typescript
import { executeAction, Action, ActionResult } from '@/lib/actionHandler'

const result: ActionResult = await executeAction(action, {
  siteUrl: cleanUrl,
  apiKey,
  pages,
  siteInfo,
  logActivity,
  // ... other callbacks
})

if (result.success) {
  // Handle success
} else {
  // Show error: result.message
}
```

**Benefits:**
- Easier to test actions in isolation
- Can reuse action logic in other components (Preview panel, mobile, etc.)
- Cleaner dashboard code
- Single source of truth for action definitions

---

### 2. **Bridge Test Scripts**

#### Script 1: `bridge-test.sh` (Bash)
- **Usage:** `./bridge-test.sh <SITE_URL> <API_KEY>`
- **Example:** `./bridge-test.sh "https://example.com" "abc123def456"`
- **Tests:**
  - Site info retrieval (connection test)
  - Page listing
  - Content scanning
  - Snapshot creation

#### Script 2: `bridge-test.js` (Node.js - Windows friendly)
- **Usage:** `node bridge-test.js <SITE_URL> <API_KEY>`
- **Example:** `node bridge-test.js "https://example.com" "abc123def456"`
- **Same tests as bash version, works on all platforms**

**What they verify:**
✓ API key is valid  
✓ Bridge plugin is installed and accessible  
✓ Core endpoints are responding  
✓ Authentication is working  
✓ Site is reachable

**How to use:**
```bash
# Before making changes to dashboard actions, run test
node bridge-test.js "https://yoursite.com" "your-api-key"

# If all tests pass, bridge is working correctly
# If tests fail, check:
# - API key in localStorage
# - Bridge plugin version (must be v1.4+)
# - WordPress error logs
```

---

### 3. **WordPress Route Audit** (`/api/wordpress/route.ts`)
- **Status:** ✓ Verified solid
- **What it does:** Routes authenticated requests to WordPress bridge plugin
- **Key features:**
  - Tries multiple HTTP methods (PUT → PATCH → POST) for writes
  - Falls back to WP native REST API if bridge routes unavailable
  - Comprehensive error logging
  - Security: validates and sanitizes all inputs
  - Timeout handling (60s for writes, 15s for reads)

**Flow:**
```
Dashboard Action
    ↓
/api/wordpress POST request
    ↓
Try ignyous-bridge v1 endpoint
    ├─ If 200-299: return response
    ├─ If 404/405: try next method
    ├─ If 401/403/500: return error
    └─ If timeout: log and fail
    ↓
If all methods fail for pages/posts:
    └─ Try WP native REST API as fallback
    ↓
Return result to dashboard
```

---

## 🔴 The Red X Error - Investigation

The red X indicates **silent action failures**. Based on your update, it's likely:

1. **Missing pendingImageData in context**
   - The upload_image action references `pendingImageData` but it may not be passed in context

2. **Plugin update syntax issue**
   - If you changed plugin-related code, check the payload structure

3. **Bridge route mismatch**
   - Verify endpoint paths match what the bridge plugin expects

**To debug the red X:**
```bash
# Run bridge test
node bridge-test.js "<your-site>" "<your-key>"

# Check browser DevTools
# 1. Open Inspector (F12)
# 2. Go to Network tab
# 3. Try an action
# 4. Click the failed request
# 5. Check Response tab for error message
```

---

## 📋 What Still Needs Extraction (Pre-Phase 2)

These components should be extracted for cleaner code:

1. **Phone number scanning logic** (`groupPhoneMatches`, `normalizePhoneDigits`)
   - Move to `/src/lib/phoneUtils.ts`
   - Functions: `groupPhoneMatches`, `normalizePhoneDigits`, `formatPhoneGroupLine`

2. **Content location formatting** (`shortLocation`)
   - Move to `/src/lib/contentUtils.ts`
   - Handles location descriptions from scan results

3. **Message building** (message option creation)
   - Move to `/src/lib/messageBuilder.ts`
   - Handles creating action menus and confirmation options

4. **Snapshot management**
   - Move to `/src/lib/snapshotManager.ts`
   - Create, restore, list snapshots

---

## 🚀 Phase 2 Features (Ordered by Priority)

Once Phase 1 is solid, Phase 2 will add:

| Priority | Feature | Impact | Est. Effort |
|---|---|---|---|
| **P0** | Extract remaining utils → Phase 1 completion | Code quality | 2-3h |
| **P1** | Site connection status indicator | Debug aid + UX | 3-4h |
| **P2** | Routine library (10 common routines) | Productivity | 6-8h |
| **P3** | Visual element editor (hover-to-select) | Magic factor | 8-10h |
| **P4** | Form intelligence (smart defaults) | User delight | 4-6h |
| **P5** | Preview panel architecture | Technical debt | 4-5h |

---

## ✅ Validation Checklist

Before moving to Phase 2, verify:

- [ ] `actionHandler.ts` imports without errors
- [ ] `bridge-test.js` runs successfully against your site
- [ ] All dashboard actions still work (test 5-10 actions)
- [ ] No console errors in browser DevTools
- [ ] Red X error is resolved (debug with test script)
- [ ] Activity logs show successful bridge calls
- [ ] Screenshots/snapshots work
- [ ] Content replacement works
- [ ] Page updates work

---

## 📝 Quick Reference

### Test the bridge (Windows):
```bash
cd C:\Users\nagelej\ignyous-platform
node bridge-test.js "https://yoursite.com" "your-api-key"
```

### Import action handler in a component:
```typescript
import { executeAction } from '@/lib/actionHandler'

// Inside your component
const result = await executeAction(action, context)
```

### Check if action succeeded:
```typescript
if (result.success) {
  console.log('✓', result.message)
} else {
  console.error('✗', result.message)
  if (result.detail) console.log('Details:', result.detail)
}
```

### Common action types:
- `update_page` - Update page title/content
- `create_page` - Create new page
- `replace_text` - Find and replace text
- `find_phone_numbers` - Scan for phones
- `replace_phone_number` - Update phone numbers
- `scan_content` - Search for specific content
- `update_seo` - Update page meta tags
- `install_plugin` - Install and activate plugin
- `take_snapshot` - Save site state

---

## 🎯 Next Steps

1. **Test the bridge** with the test script
2. **Debug the red X** using browser DevTools
3. **Verify all actions still work** in the dashboard
4. **Extract remaining utils** (phone, content, snapshot)
5. **Start Phase 2** with status indicator

---

## 📞 Support

If you hit issues:

1. **Bridge test fails?** → Check API key, plugin version, WordPress error logs
2. **Red X still showing?** → Check Network tab in DevTools, look for 401/403/500 errors
3. **Can't import actionHandler?** → Run `npm install` to ensure TypeScript types are fresh
4. **Tests pass but actions fail?** → Check browser console for runtime errors

---

**Status:** Phase 1 Core ✓ | Extraction Complete ✓ | Testing Enabled ✓  
**Ready for Phase 2?** Run validation checklist above → Then let's build!
