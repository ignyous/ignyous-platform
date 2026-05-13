# Builder Support Implementation Guide

## Current Status

✅ **COMPLETED:**
- Confidence scoring system (7 factors, weighted)
- Builder detection (Elementor, Gutenberg, Divi, Beaver)
- Elementor scanner with confidence scoring
- Elementor replacement with JSON handling
- Visual confidence badges & components
- Updated RoutinePlayer to show confidence
- Updated routine API to support builders
- Comprehensive documentation

⏳ **NEXT STEPS:**
1. Hook up default checked items based on confidence
2. Test with real Elementor sites
3. Gutenberg support
4. Error handling & edge cases

---

## Immediate Next: Wire Up Default Checked Items

The RoutinePlayer needs to auto-check items based on confidence.recommendation at mount time.

### Current Issue
Items in PreviewPhase should be auto-checked if confidence.recommendation is 'safe' or 'review', but this needs to happen when scan completes.

### Solution
Update the main RoutinePlayer component to initialize `previewChecked` based on confidence:

```typescript
// In main RoutinePlayer component, when results come back:

const initializeCheckedItems = (results: RoutineResults) => {
  const checked = new Set<string>()
  
  results.preview?.forEach((item: any) => {
    if (item.confidence?.recommendation === 'safe' || 
        item.confidence?.recommendation === 'review') {
      checked.add(item.id)
    }
  })
  
  setPreviewChecked(checked)
}
```

---

## Testing Checklist

### Before Deployment

- [ ] Install Elementor on test WordPress site
- [ ] Create pages with various Elementor elements
- [ ] Test Phone Manager:
  - [ ] Add phone number to text widget
  - [ ] Add phone to form field
  - [ ] Add phone to button link
  - [ ] Scan and verify confidence scores
  - [ ] Replace and verify page still works
- [ ] Verify confidence UI displays correctly:
  - [ ] Safe items show green badge
  - [ ] Review items show yellow badge
  - [ ] Skip items show red badge
  - [ ] Confidence breakdown shows all 7 factors
  - [ ] Confidence distribution summary shows counts
- [ ] Test Email Manager similarly
- [ ] Test with different number formats
- [ ] Test with different page types (contact, home, about)

### Browser Testing

- [ ] Desktop (Chrome, Firefox, Safari)
- [ ] Mobile (iOS Safari, Chrome Android)
- [ ] Verify responsive layout of confidence UI
- [ ] Verify scroll behavior in long preview lists

---

## Known Limitations

### Current Implementation
- Only Elementor fully implemented
- Phone/Email only (no images, forms yet)
- No rollback capability
- No change history
- No bulk operations

### Planned Improvements
- Gutenberg support (next sprint)
- Divi, Beaver Builder support
- Image Manager with builder support
- Form Manager with builder support
- Rollback (revert to previous version)
- Change history & audit log
- Bulk operations (multiple routines at once)
- AI Agent for unknown builders (Phase 3)

---

## Debugging Tips

### Check Detection
```typescript
// In browser console or via API
const detection = await fetch('/api/wordpress/status', {
  headers: { 'x-api-key': apiKey }
}).then(r => r.json())
```

### Check Scanning
```typescript
// Test the scanner directly
const matches = await scanAllElementorContent(
  'https://yoursite.com',
  apiKey,
  '(555) 123-4567'
)
console.log('Found', matches.length, 'matches')
console.log('Confidences:', matches.map(m => m.confidence.overallScore))
```

### Debug Confidence Calculation
```typescript
// Check why a confidence score is what it is
const confidence = calculateConfidence({
  fieldName: 'editor',
  currentValue: 'Call us at (555) 123-4567',
  searchTerm: '(555) 123-4567',
  builderType: 'elementor'
})

confidence.factors.forEach(f => {
  console.log(`${f.name}: ${f.score}% - ${f.reason}`)
})
```

---

## File Locations Quick Reference

```
src/lib/
├─ confidence.ts ........................ Scoring engine
├─ builders/
│  ├─ detector.ts ...................... Detection
│  ├─ elementor-scanner.ts ............. Elementor scanner
│  ├─ registry.ts ...................... Capabilities
│  └─ elementor.ts ..................... Content generation (existing)

src/components/
├─ ConfidenceBadge.tsx ................. Badge display
└─ RoutinePlayer.tsx ................... Updated preview phase

src/app/api/
└─ routine/route.ts .................... Updated API

Documentation:
└─ BUILDER_SUPPORT.md .................. This documentation
```

---

## Next Developer Tasks

### 1. Wire Up Default Checked Items (30 min)
- Update RoutinePlayer to initialize previewChecked based on confidence
- Verify items auto-check on scan completion

### 2. Test with Real Sites (1-2 hours)
- Create test WordPress site with Elementor
- Test Phone Manager end-to-end
- Test Email Manager end-to-end
- Verify replacements work without breaking pages

### 3. Build Gutenberg Support (2-3 hours)
- Create `gutenberg-scanner.ts`
- Parse HTML comment blocks
- Implement scanning logic
- Add confidence calculation for Gutenberg

### 4. Error Handling (1 hour)
- Handle timeouts gracefully
- Handle invalid JSON in Elementor data
- Handle missing meta fields
- Return user-friendly error messages

### 5. Performance Optimization (1 hour)
- Cache builder detection results
- Batch page requests instead of per-page
- Optimize JSON parsing for large pages

---

## Code Quality Checklist

Before committing:
- [ ] ESLint passes
- [ ] TypeScript types are correct
- [ ] No console.error outside error handlers
- [ ] Comments explain complex logic
- [ ] Function names are clear and descriptive
- [ ] Error messages are user-friendly
- [ ] Performance is acceptable (< 5s scan)
- [ ] Mobile responsive
- [ ] Accessibility (contrast, focus states)

---

## Commit Message Guidelines

```
feat: Add Elementor support with confidence scoring

- Implement 7-factor confidence system
- Add Elementor scanner with JSON parsing
- Update RoutinePlayer to display confidence
- Add confidence-based item pre-selection
- Add comprehensive builder documentation

Fixes: #issue-number
Related: BUILDER_SUPPORT.md
```

---

## Performance Targets

- Page scan: < 5 seconds for 100 pages
- Single page replacement: < 2 seconds
- Confidence calculation: < 10ms per item
- UI responsiveness: < 100ms updates

---

## Security Considerations

- ✅ API calls use Authorization header
- ✅ JSON parsing is sandboxed
- ✅ No eval() or dynamic code execution
- ✅ Input validation on search terms
- ✅ Only authorized users can replace
- TODO: Rate limiting on API calls
- TODO: Audit log of all replacements

---

## Questions?

See BUILDER_SUPPORT.md for detailed documentation.

For quick reference:
- Confidence factors explained: BUILDER_SUPPORT.md#confidence-factors
- Code examples: BUILDER_SUPPORT.md#code-examples
- API changes: BUILDER_SUPPORT.md#api-changes
- Roadmap: BUILDER_SUPPORT.md#development-roadmap
