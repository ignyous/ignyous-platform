# Confidence System - Visual Guide

## How Confidence Works: A Real Example

### Scenario: Update phone number on Elementor site

You enter: **(555) 123-4567** → **(555) 987-6543**

System scans and finds 8 matches...

---

## Match 1: Homepage Hero - Text Widget

```
┌─────────────────────────────────────────────────────────────────┐
│ ☑ Homepage Hero → text-editor → editor                   95% ✅ │
│                                                                 │
│ Location: Call us at (555) 123-4567                             │
│ Current:  (555) 123-4567                                        │
│ Proposed: (555) 987-6543                                        │
│                                                                 │
│ Confidence Factors:                                             │
│ • Field Type:      [████████░░] 95% - Known phone field         │
│ • Context:         [████████░░] 92% - Clear phone context       │
│ • Format:          [█████████░] 99% - Standard format           │
│ • Builder:         [█████████░] 99% - Elementor well-tested     │
│ • Page Location:   [████████░░] 90% - Contact page              │
│ • Data Integrity:  [█████████░] 98% - Safe JSON                 │
│ • Verification:    [████████░░] 92% - Can verify after          │
│                                                                 │
│ Overall: 95% Confident                                          │
│ ✅ Safe to apply                                                │
└─────────────────────────────────────────────────────────────────┘

✅ AUTO-CHECKED
```

---

## Match 2: Contact Form - Form Field

```
┌─────────────────────────────────────────────────────────────────┐
│ ☑ Contact Form → form-field → phone_number              87% ⚠️  │
│                                                                 │
│ Location: Contact Form → phone_number field                     │
│ Current:  (555) 123-4567                                        │
│ Proposed: (555) 987-6543                                        │
│                                                                 │
│ Confidence Factors:                                             │
│ • Field Type:      [████████░░] 85% - Text field for phone      │
│ • Context:         [███████░░░] 78% - Form field context        │
│ • Format:          [█████████░] 98% - Standard format           │
│ • Builder:         [█████████░] 99% - Elementor well-tested     │
│ • Page Location:   [████████░░] 88% - Contact page              │
│ • Data Integrity:  [████████░░] 92% - JSON structure safe       │
│ • Verification:    [████████░░] 89% - Can verify form renders   │
│                                                                 │
│ Overall: 87% Confident                                          │
│ ⚠️  Manual review recommended                                   │
│ Risk: Form validation might fail if field type is strict        │
└─────────────────────────────────────────────────────────────────┘

⚠️  AUTO-CHECKED BUT HIGHLIGHTED
```

---

## Match 3: Footer Custom Widget - Unknown Field

```
┌─────────────────────────────────────────────────────────────────┐
│ ☐ Footer Widget → custom-html → raw_code               62% ❌   │
│                                                                 │
│ Location: Footer Widget → raw HTML code                         │
│ Current:  (555) 123-4567                                        │
│ Proposed: (555) 987-6543                                        │
│                                                                 │
│ Confidence Factors:                                             │
│ • Field Type:      [████░░░░░░] 40% - Unknown field type        │
│ • Context:         [████░░░░░░] 45% - Ambiguous HTML context    │
│ • Format:          [█████████░] 98% - Standard format           │
│ • Builder:         [████████░░] 88% - Elementor support         │
│ • Page Location:   [████░░░░░░] 50% - Unusual location          │
│ • Data Integrity:  [████░░░░░░] 48% - Could break HTML/JS       │
│ • Verification:    [██████░░░░] 65% - Hard to verify            │
│                                                                 │
│ Overall: 62% Confident                                          │
│ ❌ Skip this one                                                │
│ Risks:                                                          │
│  • Could be part of custom JavaScript code                      │
│  • Replacement might break HTML syntax                          │
│  • Manual review strongly recommended                           │
└─────────────────────────────────────────────────────────────────┘

❌ NOT CHECKED (HIGH RISK)
```

---

## Summary for User

```
┌─────────────────────────────────────────────────────────────────┐
│ Found 8 instances                                               │
│                                                                 │
│ Confidence Distribution:                                        │
│ ✅ 5 Safe        (95%+ confident) — Ready to apply              │
│ ⚠️  2 Review      (70-85%)        — Check these carefully        │
│ ❌ 1 Skip        (<70%)           — Too risky to touch           │
│                                                                 │
│ Recommended Action:                                             │
│ [✓ Apply 5 Safe + Review] [Skip Low Confidence]                 │
│                                                                 │
│ What happens:                                                   │
│ • 5 safe items will be applied automatically                    │
│ • 2 review items can be applied but check first                 │
│ • 1 skip item will be left untouched                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Color Coding System

```
🟢 GREEN (95-100%)
   ✅ Safe to apply
   • Auto-checked in preview
   • Very high confidence
   • Unlikely to cause problems
   
   Example: Known field type, clear context, standard format

⚠️  YELLOW (70-84%)
   ⚠️  Manual review recommended
   • Checked but highlighted
   • Pretty confident but worth double-checking
   • Small risk of issues
   
   Example: Form field with clear name but validation unknown

🔴 RED (Below 70%)
   ❌ Skip this one
   • Unchecked by default
   • Too risky to apply automatically
   • Requires manual review
   
   Example: Unknown field, ambiguous context, risky structure
```

---

## How to Use These Recommendations

### If you see ✅ Green (95%+)
```
Just apply it! System is very confident it's safe.
This is based on:
  • Known field type
  • Clear surrounding context
  • Proper format
  • Well-tested builder
  • Page location that makes sense
  • Safe data structure
```

### If you see ⚠️ Yellow (70-85%)
```
Check it, but it's probably safe.
These are usually fine to apply:
  • Form fields (validation might fail)
  • Fields with semi-clear context
  • New page types
  
If something looks wrong, uncheck it and apply the others.
```

### If you see ❌ Red (Below 70%)
```
Skip it. Too risky to touch automatically.
Manually review in WordPress admin.

Reasons system is unsure:
  • Field type unknown
  • Context is ambiguous
  • Could be part of code
  • Unusual location
  • Risky data structure
```

---

## Real-World Examples

### ✅ 95% Safe - Hero Section Phone
```
Widget Type: Text Editor
Field: "editor"
Content: "Call us at (555) 123-4567"
Format: Standard phone format
Location: Contact page
Context: Clear ("Call us at")
Builder: Elementor (99% support)

Result: SAFE ✅
```

### ⚠️  78% Review - Button Link
```
Widget Type: Button
Field: "link_url"
Content: "href='tel:(555)123-4567'"
Format: Matches format
Location: Home page
Context: Phone link (medium confidence)
Builder: Elementor (99% support)

Result: REVIEW ⚠️ (Could affect clickability)
```

### ❌ 45% Skip - Custom Code
```
Widget Type: Custom HTML
Field: "raw_code"
Content: "javascript: dial((555)123-4567)"
Format: Embedded in code
Location: Sidebar (unusual)
Context: Could be logic, not display
Builder: Elementor (but custom code)

Result: SKIP ❌ (Too risky)
```

---

## Understanding the 7 Factors

```
┌─ FIELD TYPE (20% weight) ────────────────────────────────────┐
│ Is this a known location for the content?                    │
│ phone_number field: 95% | text field: 60% | unknown: 40%     │
└──────────────────────────────────────────────────────────────┘

┌─ CONTEXT (15% weight) ───────────────────────────────────────┐
│ Does surrounding text confirm content type?                  │
│ "Call us at...": 90% | Just number: 70% | Code: 40%         │
└──────────────────────────────────────────────────────────────┘

┌─ FORMAT (15% weight) ────────────────────────────────────────┐
│ Does it match expected format?                               │
│ (555) 123-4567: 99% | 555-123-4567: 90% | 5551234567: 80%   │
└──────────────────────────────────────────────────────────────┘

┌─ BUILDER (20% weight) ───────────────────────────────────────┐
│ How well do we support this builder?                         │
│ Elementor: 99% | Gutenberg: 95% | Divi: 85% | Unknown: 50%  │
└──────────────────────────────────────────────────────────────┘

┌─ PAGE LOCATION (10% weight) ─────────────────────────────────┐
│ Is this page type expected to have this content?             │
│ Contact page: 92% | About page: 90% | Archive: 45%           │
└──────────────────────────────────────────────────────────────┘

┌─ DATA INTEGRITY (10% weight) ────────────────────────────────┐
│ Will replacement break the data structure?                   │
│ Simple text: 99% | Valid JSON: 95% | Code: 30%              │
└──────────────────────────────────────────────────────────────┘

┌─ VERIFICATION (10% weight) ──────────────────────────────────┐
│ Can we verify the change worked?                             │
│ Frontend render: 95% | JSON check: 85% | DB only: 65%        │
└──────────────────────────────────────────────────────────────┘
```

---

## Decision Tree

```
Should I apply this match?

    Found match
         ↓
    What's the confidence?
         ↓
    ┌────────────────────────────┐
    │   ✅ 95%+ (Green)          │
    │   APPLY IT                 │
    │   Very safe                │
    └────────────────────────────┘
         ↓
    ┌────────────────────────────┐
    │  ⚠️  70-85% (Yellow)       │
    │  REVIEW IT                 │
    │  Probably safe             │
    │  But check carefully       │
    └────────────────────────────┘
         ↓
    ┌────────────────────────────┐
    │  ❌ <70% (Red)            │
    │  SKIP IT                   │
    │  Too risky                 │
    │  Manual review needed      │
    └────────────────────────────┘
```

---

## Tips for Success

### ✅ DO:
- Apply all green ✅ (95%+) matches
- Review yellow ⚠️ matches carefully
- Skip red ❌ matches and review manually
- Look at the factor breakdown to understand why
- Test on a staging site first if unsure

### ❌ DON'T:
- Force apply red ❌ matches without review
- Ignore the confidence recommendations
- Assume all matches are equally safe
- Skip checking form fields (validation matters)
- Apply to production without testing

---

## Questions?

**What does X% confidence mean?**
→ It means system is X% sure this is the right content to replace

**Why would confidence be different for same number?**
→ Location, field type, and context matter

**Can I override red ❌ matches?**
→ Yes, but you're taking a risk. Test first.

**What if system is wrong?**
→ Low confidence scores protect you. That's the whole point!

**Can confidence improve over time?**
→ Yes! Future versions will learn from actual replacements

---

Last updated: 2026-05-13
Part of ignyous.ai builder support system
See BUILDER_SUPPORT.md for detailed docs
