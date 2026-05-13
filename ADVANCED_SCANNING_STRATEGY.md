## 🏗️ Advanced WordPress Data Layer Scanning

**Problem**: We've been scanning page content, but missing the most important data:
- Theme options (Avada, Divi contact info, colors, fonts)
- Custom post types (Team, Portfolio, Testimonials)
- Custom fields (ACF, Meta Box, custom meta)
- Taxonomies (Category descriptions, term meta)
- WooCommerce settings (shop phone, email, etc.)
- Plugin settings (Contact Forms, etc.)

**Impact**: Current routines find ~30% of actual content. Missing 70% of critical business data.

---

## 📊 Data Sources In WordPress

### 1. Theme Options (wp_options)
```sql
-- Avada Theme
wp_options.option_name = 'sfsi_premium_customized_data'
wp_options.option_value = serialized array with contact info, colors, fonts

-- Divi Theme
wp_options.option_name = 'et_divi_customizer_settings'
wp_options.option_value = JSON with ALL theme settings

-- General WordPress
wp_options.option_name = 'blogname', 'blogdescription'
wp_options.option_name = 'siteurl', 'home'
wp_options.option_name = 'admin_email'
```

**Challenge**: Data is serialized PHP or JSON, nested structures
**Solution**: Deserialize → scan recursively → rebuild carefully

### 2. Custom Post Types (wp_posts + wp_postmeta)
```sql
-- Team post type (Avada, Divi, etc.)
post_type = 'team'
wp_postmeta where meta_key = 'team_phone', 'team_email', etc.

-- Portfolio
post_type = 'portfolio'
wp_postmeta with portfolio-specific data

-- Testimonials
post_type = 'testimonial'
wp_postmeta with client info, phone, email
```

**Challenge**: Different post types, different meta keys
**Solution**: Scan all post types → all meta fields → index & search

### 3. Custom Fields (ACF, Meta Box)
```sql
-- Advanced Custom Fields (ACF)
wp_postmeta where meta_key like '%acf%'
-- Stores: text fields, email fields, phone fields, etc.

-- Meta Box Plugin
wp_postmeta where meta_key in ('contact_phone', 'contact_email', etc.)

-- Regular Post Meta
wp_postmeta where meta_key not in (reserved WordPress keys)
```

**Challenge**: Hundreds of different field types and naming conventions
**Solution**: Scan all meta → index by pattern (phone, email, etc.)

### 4. Taxonomies (wp_terms + wp_termmeta)
```sql
-- Category descriptions
wp_terms where name, slug, description contain data

-- Taxonomy meta
wp_termmeta where meta_key contains custom data

-- Tag custom fields
wp_terms where term_id in (custom taxonomy)
```

**Challenge**: Metadata can be anywhere, descriptions contain mixed content
**Solution**: Scan all terms → check descriptions → check term meta

### 5. WooCommerce Settings
```sql
-- Shop settings
wp_options where option_name = 'woocommerce_*'

-- Product metadata
wp_postmeta where post_id in (products)

-- Customer data
wp_usermeta where meta_key like '%address%'
```

**Challenge**: Complex nested options, customer data sensitivity
**Solution**: Scan shop settings only → not customer data

### 6. Plugin Settings
```sql
-- Contact Form 7
wp_posts where post_type = 'wpcf7_contact_form'
wp_postmeta with form config

-- Gravity Forms
wp_posts where post_type = 'gf_form'
wp_postmeta with field data

-- Other plugins
wp_options where option_name starts with plugin prefix
```

**Challenge**: Each plugin has its own structure
**Solution**: Pattern matching → recursive scanning → careful reconstruction

---

## 🎯 Proposed Solution Architecture

### Layer 1: Global Settings Scanner
```typescript
// src/lib/scanners/global-settings-scanner.ts

interface GlobalSettingsMatch {
  id: string
  source: 'wordpress' | 'theme' | 'plugin'
  settingName: string
  settingGroup?: string
  current: string
  proposed: string
  location: string // "Avada Theme > Contact > Phone Number"
  confidence: ContentConfidenceResult
  riskLevel: 'low' | 'medium' | 'high'
}

// Scan all WordPress options
async function scanAllOptions(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<GlobalSettingsMatch[]>

// Scan specific plugin settings
async function scanPluginSettings(
  siteUrl: string,
  apiKey: string,
  plugin: string,
  searchTerm: string
): Promise<GlobalSettingsMatch[]>

// Scan theme customizer settings
async function scanThemeSettings(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<GlobalSettingsMatch[]>
```

### Layer 2: Custom Post Type Scanner
```typescript
// src/lib/scanners/custom-post-type-scanner.ts

interface PostTypeMatch {
  id: string
  postType: string
  postId: number
  postTitle: string
  metaKey: string
  metaValue: string
  proposed: string
  location: string // "Team Post 'John Doe' > Phone Number"
  confidence: ContentConfidenceResult
  riskLevel: 'low' | 'medium' | 'high'
}

// Scan all custom post types
async function scanAllCustomPostTypes(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<PostTypeMatch[]>

// Scan specific post type
async function scanPostType(
  siteUrl: string,
  apiKey: string,
  postType: string,
  searchTerm: string
): Promise<PostTypeMatch[]>
```

### Layer 3: Custom Fields Scanner
```typescript
// src/lib/scanners/custom-fields-scanner.ts

interface CustomFieldMatch {
  id: string
  fieldType: 'acf' | 'metabox' | 'standard'
  fieldName: string
  postId: number
  postTitle: string
  current: string
  proposed: string
  location: string // "ACF Field 'Contact Phone' on Post 'Contact Us'"
  confidence: ContentConfidenceResult
  riskLevel: 'low' | 'medium' | 'high'
}

// Scan all ACF fields
async function scanACFFields(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<CustomFieldMatch[]>

// Scan all meta box fields
async function scanMetaBoxFields(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<CustomFieldMatch[]>

// Scan all post meta (standard)
async function scanPostMeta(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<CustomFieldMatch[]>
```

### Layer 4: Unified Business Info Manager
```typescript
// src/lib/managers/business-info-manager.ts

interface BusinessInfoResult {
  type: 'phone' | 'email' | 'address' | 'website'
  instances: Array<{
    source: 'page_content' | 'theme_option' | 'custom_field' | 'post_meta' | 'plugin'
    location: string
    current: string
    confidence: number
    riskLevel: string
  }>
  total: number
  bySource: Record<string, number>
}

// Find business info from ALL sources
async function findBusinessInfo(
  siteUrl: string,
  apiKey: string,
  searchTerm: string
): Promise<BusinessInfoResult>

// Replace business info everywhere
async function updateBusinessInfo(
  siteUrl: string,
  apiKey: string,
  oldValue: string,
  newValue: string,
  sources: string[] // which sources to update
): Promise<{ changed: number; bySource: Record<string, number> }>
```

---

## 🔍 Implementation Plan

### Phase 1: Divi Support (Today)
```
✅ Detect Divi (already done)
✅ Build divi-content-scanner.ts (posts/pages)
✅ Integrate with routine API
✅ Test on Divi sites
```

### Phase 2: Global Settings Scanner (Today/Tomorrow)
```
[ ] Build global-settings-scanner.ts
[ ] Handle WordPress core options
[ ] Parse serialized/JSON data
[ ] Identify theme options (Avada, Divi, etc.)
[ ] Confidence scoring for settings
[ ] Integration with routines
```

### Phase 3: Custom Post Types (Tomorrow)
```
[ ] Build custom-post-type-scanner.ts
[ ] Detect all CPT on site
[ ] Scan all meta fields
[ ] Build confidence for CPT data
[ ] Create CPT-aware routines
```

### Phase 4: Custom Fields (This Week)
```
[ ] Build custom-fields-scanner.ts
[ ] ACF support
[ ] Meta Box support
[ ] Standard meta support
[ ] Confidence for field types
[ ] Integration with routines
```

### Phase 5: Advanced Routines (This Week)
```
[ ] Business Info Manager (finds phone/email everywhere)
[ ] Theme Settings Manager (colors, fonts, global options)
[ ] Custom Field Manager (search/replace across fields)
[ ] WooCommerce Manager (shop settings)
```

---

## 🧠 Confidence Scoring for Global Data

### Theme Options (High Risk)
```
Option: "Avada Theme > Contact > Phone Number"
├─ Field Type: 98% (known theme field)
├─ Context: 95% (labeled "Phone Number")
├─ Format: 98% (standard phone format)
├─ Builder: 90% (Avada supports this)
├─ Location: 95% (theme settings = safe)
├─ Data Integrity: 92% (serialized but valid)
├─ Verification: 85% (can re-fetch settings)
└─ Overall: 93% SAFE

Risk: Breaks theme if wrong, but usually safe
```

### Custom Fields (Medium Risk)
```
Field: "ACF > Contact Phone"
├─ Field Type: 85% (ACF field)
├─ Context: 90% (labeled phone)
├─ Format: 98% (correct format)
├─ Builder: 95% (ACF reliable)
├─ Location: 80% (can be anywhere)
├─ Data Integrity: 85% (meta is safe)
├─ Verification: 80% (need to fetch post)
└─ Overall: 88% SAFE

Risk: Might break conditional logic on fields
```

### Post Meta (Lower Risk)
```
Meta: "Custom meta > team_phone"
├─ Field Type: 75% (generic meta key)
├─ Context: 85% (key name suggests phone)
├─ Format: 98% (correct format)
├─ Builder: 80% (standard WordPress)
├─ Location: 70% (could be anything)
├─ Data Integrity: 90% (meta is safe)
├─ Verification: 75% (need to verify usage)
└─ Overall: 82% SAFE

Risk: Might be used somewhere we don't know
```

---

## 📋 Data Source Priority

### Priority 1: Business-Critical (Update Often)
```
1. Theme contact options (phone, email, address)
2. WooCommerce shop settings (email, phone)
3. Contact form settings
4. Social media URLs
5. Business hours
```

### Priority 2: Content-Related (Update Sometimes)
```
1. Custom post types (team, portfolio, testimonials)
2. Custom fields on posts (ACF, Meta Box)
3. Page/post meta (custom data)
4. Taxonomy descriptions
5. Image alt text
```

### Priority 3: Global (Update Rarely)
```
1. Blog title/description
2. Site tagline
3. Global CSS
4. Global fonts
5. Brand colors
```

---

## 🛡️ Safety Considerations

### Don't Touch
```
❌ User data (customer emails, addresses)
❌ License keys or secrets
❌ Password fields or hashes
❌ API keys or credentials
❌ Serialized objects (could break)
❌ Encrypted data
```

### Extra Caution
```
⚠️ Theme options (affects whole site)
⚠️ Plugin settings (breaks plugin if wrong)
⚠️ ACF field settings (might have dependencies)
⚠️ WooCommerce settings (affects shop)
⚠️ Serialized arrays (must deserialize carefully)
```

### Safe to Update
```
✅ Phone numbers
✅ Email addresses
✅ URLs (not API endpoints)
✅ Text content (titles, descriptions)
✅ Simple strings (not JSON/serialized)
```

---

## 💾 Implementation Examples

### Example 1: Scan Avada Theme Options
```typescript
// Find phone number in Avada theme settings
const optionsToCheck = [
  'sfsi_premium_customized_data', // Avada options
  'theme_mods_themename',
  'avada_customizer_data',
];

for (const optionName of optionsToCheck) {
  const option = await getWPOption(siteUrl, apiKey, optionName);
  
  if (typeof option === 'string') {
    const unserialized = unserialize(option); // PHP unserialize
    const matches = searchRecursively(unserialized, '555-123-4567');
    
    for (const match of matches) {
      results.push({
        source: 'theme',
        location: `Avada Theme > ${match.path}`,
        current: match.value,
        confidence: 95, // theme settings are reliable
      });
    }
  }
}
```

### Example 2: Scan All Custom Post Types
```typescript
// Find team members with phone numbers
const allPostTypes = await getPostTypes(siteUrl, apiKey);

for (const postType of allPostTypes) {
  const posts = await getPosts(siteUrl, apiKey, postType);
  
  for (const post of posts) {
    const meta = await getPostMeta(siteUrl, apiKey, post.id);
    
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === 'string' && value.includes('555-123-4567')) {
        results.push({
          source: 'post_meta',
          location: `${postType} > ${post.title} > ${key}`,
          current: value,
          confidence: calculateConfidence(key, value),
        });
      }
    }
  }
}
```

### Example 3: Scan ACF Fields
```typescript
// Find all ACF phone fields
const acfFields = await getACFFields(siteUrl, apiKey);

for (const field of acfFields) {
  if (field.type === 'email' || field.type === 'phone' || 
      field.name.includes('phone') || field.name.includes('email')) {
    
    const values = await getACFFieldValues(siteUrl, apiKey, field.key);
    
    for (const value of values) {
      if (value.includes(searchTerm)) {
        results.push({
          source: 'acf',
          location: `ACF > ${field.label}`,
          current: value,
          confidence: 95, // ACF fields are reliable
        });
      }
    }
  }
}
```

---

## 🎯 New Routines to Build

### 1. Business Info Manager
```
Purpose: Find & replace phone, email, address everywhere
Scope:
- Theme options
- Custom fields
- Post meta
- Plugin settings
- Page content

Benefits:
- One routine to update business info globally
- Finds 100% of instances (not just page content)
- Confidence scoring prevents mistakes
- Preview shows all changes before applying
```

### 2. Theme Settings Manager
```
Purpose: Safely update theme colors, fonts, global options
Scope:
- Theme customizer settings
- Theme option panels
- Global CSS
- Font family defaults
- Color scheme

Benefits:
- Change brand colors site-wide
- Update fonts everywhere
- Modify theme options without theme editor
- Preview changes on different pages
```

### 3. Custom Field Manager
```
Purpose: Search & replace in custom fields (ACF, Meta Box, etc.)
Scope:
- ACF fields (all types)
- Meta Box fields
- Standard post meta
- Taxonomy meta
- User meta (non-sensitive)

Benefits:
- Update team member info
- Update portfolio descriptions
- Update testimonial data
- All custom data in one place
```

### 4. WooCommerce Manager
```
Purpose: Manage shop settings and product data
Scope:
- Shop settings (phone, email, etc.)
- Product descriptions
- Product meta
- Product attributes
- Variation data

Benefits:
- Update shop contact info
- Bulk update product data
- Manage variations
- Shop-specific routines
```

---

## 📊 Coverage Comparison

### Current Coverage (Page Content Only)
```
Blog post: ✅ Found
Page: ✅ Found
Elementor builder: ✅ Found
Gutenberg blocks: ✅ Found
Theme header: ❌ Missed
Contact form: ❌ Missed
Team member CPT: ❌ Missed
Custom field: ❌ Missed
Theme option: ❌ Missed
WooCommerce shop: ❌ Missed

Coverage: ~30%
```

### New Coverage (Global + Content)
```
Blog post: ✅ Found
Page: ✅ Found
Elementor builder: ✅ Found
Gutenberg blocks: ✅ Found
Theme header: ✅ Found
Contact form: ✅ Found
Team member CPT: ✅ Found
Custom field: ✅ Found
Theme option: ✅ Found
WooCommerce shop: ✅ Found

Coverage: ~100%
```

---

## 🔄 API Changes Needed

### New REST API Endpoints

```typescript
// Get all WordPress options
GET /wp-json/wp/v2/settings

// Get specific option (might need bridge)
GET /api/bridge/wp-option/{name}

// Search in all options
POST /api/bridge/search-options
Body: { search_term, limit }

// Get all custom post types
GET /api/bridge/post-types

// Get posts of type
GET /api/bridge/posts/{post_type}

// Get post meta
GET /api/bridge/post-meta/{post_id}

// Get all ACF fields
GET /api/bridge/acf-fields

// Get ACF field values
GET /api/bridge/acf-values/{field_name}

// Update option
POST /api/bridge/update-option
Body: { name, value }

// Update post meta
POST /api/bridge/update-post-meta
Body: { post_id, meta_key, meta_value }

// Update ACF field
POST /api/bridge/update-acf-field
Body: { field_key, post_id, value }
```

---

## 🏆 Value Proposition

### For Users
- **Find Everything**: Not just page content, ALL business data
- **Safe Updates**: Confidence scoring prevents mistakes
- **One Tool**: Don't need multiple plugins/tools
- **Peace of Mind**: Know you've found all instances

### For ignyous.ai
- **Huge Competitive Advantage**: Nobody else does this
- **10x More Value**: Cover 100% of site vs 30%
- **Higher LTV**: More routines = more sticky
- **Premium Feature**: Can charge more for advanced routines

---

## 📈 Roadmap

```
Week 1:
✅ Divi support (today)
[ ] Global settings scanner
[ ] Custom post type scanner

Week 2:
[ ] Custom fields scanner (ACF, Meta Box)
[ ] Business Info Manager routine
[ ] Theme Settings Manager routine

Week 3:
[ ] Custom Field Manager routine
[ ] WooCommerce Manager routine
[ ] Testing & bug fixes

Week 4:
[ ] Advanced search operators
[ ] Bulk operations
[ ] Rollback improvements
```

---

## 🎓 Key Insights

### WordPress Data Layers
1. **Content Layer** (what we're doing now)
   - Pages, posts, blocks, builder data
   
2. **Settings Layer** (what we need next)
   - Theme options, plugin settings, WordPress core options
   
3. **Metadata Layer** (most powerful)
   - Post meta, term meta, user meta, custom fields
   
4. **Custom Types Layer** (most flexible)
   - Custom post types, custom taxonomies, custom fields

**All 4 are important. All 4 have data users want to change.**

### Why This Matters
- Most WordPress sites use theme options (Avada, Divi have extensive options)
- Custom fields are everywhere (ACF is on 1M+ sites)
- Custom post types store important data (team, portfolio, etc.)
- Users want to update all of it in one tool

**ignyous.ai should be the one tool that handles everything.**

---

**This is the roadmap for 10x-ing our coverage and value.**

Let's build it! 🚀
