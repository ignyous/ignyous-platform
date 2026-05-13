# 🧪 **Quick Start Testing Guide**

**Goal**: Verify that user can change phone on Gutenberg site by saying "change phone from X to Y"

---

## 📋 **Setup (10 minutes)**

### Step 1: Create Test Gutenberg Site
```
- Use WordPress.com sandbox or local WordPress
- Install Gutenberg block editor
- Make sure your ignyous.ai is configured
```

### Step 2: Add Test Phone Number
```
Add "845-876-6586" to:

1. Home page (edit → add text block → "Call us at 845-876-6586")
2. Footer widget (add widget → add text → "Phone: 845-876-6586")
3. Theme options (Customizer → if available, add to phone field)

Total: 3 instances of 845-876-6586
```

### Step 3: Verify Setup
```
Visit home page - should see phone number displayed
Check if it appears in multiple places
```

---

## 🧪 **Test (5 minutes)**

### Test Case 1: Basic Phone Change

**User Input:**
```
"Change my phone from 845-876-6586 to 555-555-5555"
```

**Expected Flow:**
```
1. AI detects phone change request
   ✅ Should parse: oldValue='845-876-6586', newValue='555-555-5555'

2. Routes to Business Info Manager
   ✅ Should call /api/routine/business-info
   ✅ Action should be 'scan'

3. Scan Phase Results
   ✅ Should find all 3 instances
   ✅ Should show: "Found 1 unique phone (3 instances)"
   ✅ Should NOT show "62 variations"
   ✅ Should show locations:
      - Home page
      - Footer widget
      - Theme options (if available)

4. Smart Prompts Display
   ✅ Should show buttons, NOT chat
   ✅ Should show: "✅ Change all 3 instances"
   ✅ Should show: "👁️ Preview first"
   ✅ Should show: "❌ Cancel"

5. User clicks "Change all 3 instances"
   ✅ Should execute changes
   ✅ Should show: "✅ Updated 3 instances"
   ✅ Should show breakdown:
      - Home page: 1
      - Footer: 1
      - Theme: 1

6. Verify Changes
   ✅ Visit home page → should show 555-555-5555
   ✅ Check footer → should show 555-555-5555
   ✅ Check theme options → should show 555-555-5555
```

**Success Criteria:**
```
✅ All 3 instances changed
✅ No partial matches changed (like timestamps)
✅ Smart prompts worked
✅ Breakdown shown correctly
✅ No errors
```

---

## 🎯 **Advanced Test Cases**

### Test Case 2: Verify Deduplication

**What to test:**
```
Add same phone in different formats:
- "845-876-6586" (home page)
- "8458766586" (about page)
- "(845) 876-6586" (contact page)

User: "Change 845-876-6586 to 555-555-5555"

Expected:
✅ Should find "1 unique phone (3 instances)"
✅ NOT "3 different phones"
✅ Should replace all 3 formats with new number
```

### Test Case 3: Email Change

**What to test:**
```
Add email "contact@example.com" in multiple places

User: "Change email from contact@example.com to hello@example.com"

Expected:
✅ Should find email
✅ Should replace everywhere
✅ Should show results
```

### Test Case 4: Preview Before Changing

**What to test:**
```
User: "Change 845-876-6586 to 555-555-5555"

When smart prompts show, click: "👁️ Preview first"

Expected:
✅ Should show what WILL change
✅ Should show location breakdown
✅ Should give option to "Apply changes" or "Cancel"
```

### Test Case 5: Rollback

**What to test:**
```
1. Make a change
2. Look for Activity Log or "Undo" button
3. Click undo/rollback

Expected:
✅ Should show change was undone
✅ Phone number should revert to original
✅ Activity log should show the change and undo
```

---

## 📊 **Expected Results Summary**

| Test | Expected | Status |
|------|----------|--------|
| User says "change phone from X to Y" | AI detects and routes | ✅ |
| Finds all instances (3) | Shows "1 unique (3 instances)" | ✅ |
| NOT "62 variations" | Groups by value | ✅ |
| Smart prompts display | User sees buttons not chat | ✅ |
| User clicks "change all" | Changes applied | ✅ |
| All 3 instances changed | Verified on site | ✅ |
| Breakdown shown | "Home: 1, Footer: 1, Theme: 1" | ✅ |
| Email changes work | Same flow for email | ✅ |
| Preview works | Shows changes before applying | ✅ |
| Rollback works | Can undo changes | ✅ |

---

## 🐛 **Troubleshooting**

### If "62 different phone numbers" found (Old behavior)
```
Issue: Pattern matching too loose
Fix: Check that extractPhoneNumbers() is being used
     Make sure patterns match complete only
```

### If phone not found at all
```
Issue: Pattern not matching format
Check:
- What format is phone in?
- Is it (555) 123-4567 or 555-123-4567 or 5551234567?
- Add phone in test format to verify
```

### If change doesn't apply
```
Check:
1. Error messages in console
2. Check WordPress database directly
3. Verify API route is being called
4. Check cache isn't hiding change
```

### If smart prompts don't show
```
Check:
1. SmartPrompts component loaded
2. Scan phase returned results
3. Frontend is parsing results correctly
4. Browser console for errors
```

---

## ✅ **Sign-Off Checklist**

Once all tests pass:

```
[ ] Basic phone change works
[ ] Finds all instances
[ ] Groups by value (deduplication)
[ ] Smart prompts display
[ ] Changes apply correctly
[ ] Results show breakdown
[ ] Email changes work
[ ] Preview works
[ ] Rollback works
[ ] No errors in console
[ ] No crashes
[ ] Documentation accurate
[ ] Ready for production
```

---

## 📝 **Notes**

Record any issues:
```
Issue: [description]
Steps to reproduce: [steps]
Expected behavior: [what should happen]
Actual behavior: [what happens]
Screenshot: [if applicable]
```

---

## 🎯 **Success Definition**

✅ **PASS**: User can chat "change phone from 845-876-6586 to 555-555-5555" and the system finds all instances, shows smart prompts, and changes all instances correctly.

❌ **FAIL**: If any step doesn't work as expected.

---

**Estimated Testing Time**: 30 minutes (setup + test)

**Ready to start?** Let's go! 🚀
