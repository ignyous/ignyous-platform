# 🚀 **Complete Flow: Phone/Email/Address Changes End-to-End**

**Status**: READY TO TEST ✅  
**Test Case**: Gutenberg site with phone in content, theme options, and custom fields

---

## 📊 **The Complete User Journey**

### **Step 1: User Request**
```
User: "Change my phone from 845-876-6586 to 555-555-5555"

What happens:
- User types in chat
- Message sent to POST /api/ai
```

### **Step 2: AI Route Detects Routine**
```
File: src/app/api/ai/route.ts
Function: detectRoutineIntent(message)

Checks:
✅ Contains "change" or "update"?
✅ Contains phone number pattern?
✅ Is it a complete phone (10+ digits)?

Result:
{
  type: 'business_info',
  operation: 'phone',
  oldValue: '845-876-6586',  // extracted from message
  newValue: '555-555-5555'   // extracted from message
}
```

### **Step 3: Route to Business Info Manager**
```
Instead of:
  → /api/ai returns chat response
  
Now:
  → /api/ai returns routine instruction
  → Frontend calls /api/routine/business-info
  → Routine handles the operation

Response from ai/route.ts:
{
  text: "I'll help you change your phone. Scanning...",
  routineUsed: true,
  routine: {
    type: 'business_info_manager',
    operation: 'phone',
    params: {
      oldValue: '845-876-6586',
      newValue: '555-555-5555'
    }
  }
}
```

### **Step 4: Frontend Calls Routine API**
```
POST /api/routine/business-info
{
  type: 'business_info_manager',
  action: 'scan',  // Start with scan phase
  siteUrl: 'https://example.com',
  apiKey: 'token...',
  operation: 'phone',
  oldValue: '845-876-6586',
  newValue: '555-555-5555'
}
```

### **Step 5: Scan Phase - Find All Instances**
```
File: src/lib/managers/business-info-manager.ts
Function: scanBusinessInfo()

Scans:
1. Posts and pages (post_content)
   ├─ Home page: Found "845-876-6586" in text ✓
   ├─ Contact page: Found "845-876-6586" in text ✓
   └─ About page: Not found
   
2. Theme options
   ├─ Theme phone option: Found "845-876-6586" ✓
   ├─ Theme footer: Found "845-876-6586" ✓
   └─ Site tagline: Not found
   
3. Custom fields (ACF, Meta Box)
   ├─ Team member phone: Found "845-876-6586" ✓
   └─ Custom contact field: Found "845-876-6586" ✓
   
4. Gutenberg blocks (if applicable)
   ├─ Text blocks: Found "845-876-6586" ✓
   └─ Button blocks: Not found

DEDUPLICATION:
Before: 62 different variations found:
  - 845-876-6586
  - 8458766586
  - (845) 876-6586
  - 845.876.6586
  - ... more variations
  
After: Groups by NORMALIZED value:
  - 8458766586 → 22 instances total
  - (shows original formats in locations)

Result:
{
  status: 'success',
  operation: 'phone',
  matches: [
    {
      normalized: '8458766586',
      displayFormat: '845-876-6586',  // how it was found
      totalInstances: 22,
      locations: [
        {
          postTitle: 'Home',
          location: 'Home → Content',
          context: '...Call us at 845-876-6586 for...',
          confidence: 98
        },
        // ... 21 more locations
      ]
    }
  ],
  totalMatches: 1,          // one unique number
  totalInstances: 22,       // 22 places where it appears
  smartPrompts: [
    {
      label: '✅ Change all 22 instances',
      action: 'change_all',
      variant: 'primary'
    },
    {
      label: '👁️ Preview first',
      action: 'preview'
    },
    {
      label: '❌ Cancel',
      action: 'cancel'
    }
  ]
}
```

### **Step 6: Smart Prompts Display**
```
Frontend receives scan results and shows user:

┌─────────────────────────────────────────┐
│  Found 1 unique phone number            │
│  (22 total instances)                   │
│                                         │
│  845-876-6586                           │
│  ├─ Home page (3x)                      │
│  ├─ Contact page (2x)                   │
│  ├─ Theme options (5x)                  │
│  ├─ Team members ACF (8x)               │
│  └─ Widget area (4x)                    │
│                                         │
│  ✅ Change all 22 instances             │
│  👁️ Preview first                       │
│  ❌ Cancel                               │
└─────────────────────────────────────────┘

User clicks: "Change all 22 instances"
```

### **Step 7: Execute Phase - Apply Changes**
```
POST /api/routine/business-info
{
  type: 'business_info_manager',
  action: 'execute',
  siteUrl: 'https://example.com',
  apiKey: 'token...',
  operation: 'phone',
  oldValue: '845-876-6586',
  newValue: '555-555-5555'
}

Function: updateBusinessInfo()

Process:
1. Create snapshot (in case rollback needed)
2. For each page/post:
   - Get content
   - Find all variations of old number
     • 845-876-6586
     • 8458766586
     • (845) 876-6586
     • 845.876.6586
   - Replace with new value: 555-555-5555
   - Update post in WordPress
   
3. For theme options:
   - Get all options
   - Replace variations of old number
   - Update via WordPress settings API
   
4. Clear cache
   - Call cache-clear API if plugin active
   - Tell page to reload
   
5. Verify changes
   - Fetch one page and check if change visible
   - Return success status

Result:
{
  status: 'success',
  updated: 22,
  byLocation: {
    'Home': 3,
    'Contact': 2,
    'Theme: phone_option': 5,
    'Team member ACF': 8,
    'Widget area': 4
  },
  message: '✅ Successfully updated 22 instances'
}
```

### **Step 8: User Sees Results**
```
Frontend displays:

┌─────────────────────────────────────────┐
│  ✅ COMPLETE                            │
│                                         │
│  Successfully changed 22 instances      │
│                                         │
│  Changes by location:                   │
│  • Home page (3)                        │
│  • Contact page (2)                     │
│  • Theme options (5)                    │
│  • Team member fields (8)               │
│  • Other areas (4)                      │
│                                         │
│  Snapshot saved for rollback            │
│  Cache cleared                          │
│                                         │
│  [✓ Undo] [View Activity Log]           │
└─────────────────────────────────────────┘

Old: 845-876-6586 (in 22 places)
New: 555-555-5555 (in 22 places)
```

---

## 🎯 **What Makes This Work**

### **1. Improved Pattern Matching**
```
BEFORE:
- Phone: /(\d{1,3}[-.\s]?){3,4}\d{1,4}/g
  Problem: Too loose, matches "555" in timestamps
  Result: "Found 62 different phone numbers"
  
AFTER:
- Pattern 1: /\(\d{3}\)\s?[-.]?\s?\d{3}[-.\s]?\d{4}/g  ← (555) 123-4567
- Pattern 2: /\d{3}[-.\s]\d{3}[-.\s]\d{4}/g           ← 555-123-4567
- Pattern 3: /(?<!\d)\d{10}(?!\d)/g                    ← 5551234567 (word boundaries)

Benefits:
✅ Only matches COMPLETE 10-digit numbers
✅ Doesn't match partial numbers in timestamps
✅ Groups same number regardless of format
✅ User sees: "1 unique (22 instances)" not "62 variations"
```

### **2. Deduplication by Normalized Value**
```
Found in content:
- "845-876-6586" (5 times)
- "8458766586" (3 times)
- "(845) 876-6586" (2 times)

Normalized (digits only):
- 8458766586

Result shown to user:
ONE entry: 8458766586
Instances: 10
Original formats: 845-876-6586, 8458766586, (845) 876-6586

When replacing:
- Find ALL formats (because all normalize to same value)
- Replace each with new value in its original format
- User doesn't see 3 separate entries
```

### **3. AI Routing**
```
User message → Parse → Detect type → Route to routine

detectRoutineIntent() checks:
- Is it a business info request? (change/update + phone/email/address)
- Extract old and new values
- Return routine instructions

If routine:
  → api/routine/business-info
If chat:
  → Claude for response
```

### **4. Scan Before Action**
```
Never assume - always scan first:

1. User says "change phone"
2. Routine scans entire site
3. Shows exactly what found + where
4. User can preview
5. User approves
6. Then execute

This prevents:
❌ "I updated 3 places but there were actually 5"
❌ "I didn't know the phone was also in theme settings"
❌ "Why did it change unrelated content?"
```

### **5. Smart Prompts**
```
BEFORE (chat-based):
AI: "I found some phone numbers. Do you want to change them?"
User: "yes"
AI: "Ok, which ones?"
User: "all of them"
...
Result: Users get confused, make mistakes

AFTER (smart prompts):
Scan Results:
"Found 1 unique phone (22 instances)"

Smart Prompts:
→ Change all 22
→ Preview first  
→ Only update homepage
→ Cancel

Result: Clear options, no typing, no confusion
```

---

## ✅ **Testing Checklist**

### **Basic Test (Today)**
```
[ ] Create test Gutenberg site
[ ] Add phone "845-876-6586" to:
    [ ] Home page content
    [ ] Contact page content
    [ ] Theme options (phone field)
    [ ] Footer widget
[ ] Open ignyous UI
[ ] Chat: "Change my phone from 845-876-6586 to 555-555-5555"
[ ] Verify:
    [ ] Finds phone numbers
    [ ] Shows "1 unique (4 instances)"
    [ ] Smart prompts display
    [ ] Shows locations clearly
[ ] Click "Change all"
[ ] Verify:
    [ ] All 4 instances changed
    [ ] No partial matches changed
    [ ] Shows "Updated 4 instances"
[ ] Visit pages and confirm changes visible
```

### **Advanced Test (This Week)**
```
[ ] Test with Elementor site
[ ] Test with Divi site
[ ] Test with multiple themes (Avada, GeneratePress, etc.)
[ ] Test with forms (Gravity Forms, WPForms)
[ ] Test with custom fields (ACF)
[ ] Test email changes
[ ] Test address changes
[ ] Test domain migration (change URL)
```

---

## 🔧 **For Developers: API Reference**

### **Detect Routine Request**
```typescript
// In ai/route.ts
const intent = detectRoutineIntent(userMessage)

Result:
{
  type: 'business_info' | 'form' | 'image' | 'theme_settings'
  operation: 'phone' | 'email' | 'address' | 'add_field' | ...
  oldValue?: string
  newValue?: string
}
```

### **Call Business Info Routine**
```typescript
POST /api/routine/business-info

// Scan phase
{
  type: 'business_info_manager',
  action: 'scan',
  operation: 'phone',
  oldValue: '845-876-6586',
  siteUrl: 'https://example.com',
  apiKey: 'token...'
}

// Preview phase
{
  type: 'business_info_manager',
  action: 'preview',
  operation: 'phone',
  oldValue: '845-876-6586',
  newValue: '555-555-5555'
}

// Execute phase
{
  type: 'business_info_manager',
  action: 'execute',
  operation: 'phone',
  oldValue: '845-876-6586',
  newValue: '555-555-5555'
}
```

---

## 📈 **Coverage Achievement**

### **Before This Session**
```
Routine routing: ❌ Not wired
Pattern matching: ❌ Too loose (found 62 instead of grouping)
Business info: ❌ Separate phone/email managers
User experience: ❌ Chat-based, confusing

Result: Routines built but not used
```

### **After This Session**
```
Routine routing: ✅ Detects requests and routes
Pattern matching: ✅ Complete matches only, grouped by value
Business info: ✅ One unified manager
User experience: ✅ Smart prompts, clear choices

Result: Ready to test on real sites
```

---

## 🎯 **Next: TESTING**

The code is ready. Now we need to:

1. **Test on Gutenberg site**
   - Does phone change work?
   - Are all instances found?
   - Are results clear?

2. **Test on Elementor site**
   - Does it work with builder blocks?

3. **Test on Divi site**
   - Does it work with Divi content?

4. **Test on site with theme options**
   - Does it find phone in theme settings?

5. **Test with forms**
   - Does it find phone in form notifications?

6. **Test email and address**
   - Do other operations work?

---

## ✨ **Summary**

You now have:

✅ **Routine Detection** in AI route  
✅ **Proper Pattern Matching** (complete only)  
✅ **Deduplication by Value** (not by format)  
✅ **Unified Business Info Manager** (phone/email/address)  
✅ **Smart Prompts** for user guidance  
✅ **Full Scan → Preview → Execute Flow**  
✅ **Clear Results with Breakdown**  

**This is the critical infrastructure piece that makes "change phone on 90% of sites" actually work.**

Ready to test? 🚀
