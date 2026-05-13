## 🖼️ Image Manager - Complete Implementation Guide

**Problem**: Image URLs are scattered across the site:
- Page content (img tags, featured images)
- Builder data (Elementor, Gutenberg, Divi image blocks)
- Theme options (logo, header image, background)
- Custom fields (ACF image fields, Meta Box)
- Post meta (thumbnail IDs, image attachments)
- Media library (attachment posts)

**Solution**: One Image Manager routine that finds and updates them all.

---

## 📊 Image Data Sources

### 1. Featured Images (Post Thumbnails)
```sql
-- Stored as post meta
wp_postmeta where meta_key = '_thumbnail_id'
-- Value is the attachment post ID

-- Also accessible via REST API
GET /wp-json/wp/v2/posts/{id}?_fields=featured_media

-- To update:
POST /wp-json/wp/v2/posts/{id}
Body: { featured_media: new_id }
```

### 2. Image URLs in Page Content
```html
<!-- In post_content, can be:
Regular WordPress:
<img src="/wp-content/uploads/image.jpg" alt="...">

Elementor img blocks:
{img: "/wp-content/uploads/image.jpg"}

Gutenberg image blocks:
<!-- wp:image {url: "/uploads/image.jpg"} -->

Divi content:
Similar to standard HTML
-->
```

### 3. Builder-Specific Image Data
```
Elementor:
- Stored in _elementor_data JSON
- Image widget contains "img": { "url": "..." }
- Background images in settings

Gutenberg:
- Image blocks with src attribute
- Background images in block attributes

Divi:
- post_content with img tags
- Meta fields with image URLs
```

### 4. ACF Image Fields
```sql
-- ACF stores image data as:
wp_postmeta where meta_key = 'acf_image_field'
-- Value can be: image ID, image object, or URL

-- ACF fields metadata:
wp_postmeta where meta_key like '%_acf_%'
```

### 5. Theme Options
```sql
-- Theme logos, headers, backgrounds
wp_options where option_name like '%image%'
or option_name like '%logo%'
or option_name like '%background%'

Example (Avada):
wp_options.option_value contains:
{logo: "/uploads/logo.png"}
```

### 6. Media Library
```sql
-- Attachment posts
wp_posts where post_type = 'attachment'

-- Attachment metadata
wp_postmeta where post_id in (attachment_ids)
and meta_key = '_wp_attachment_metadata'
```

---

## 🎯 Image Manager Routine

### Use Cases

#### Case 1: Replace Image URL Site-Wide
```
Old URL: /old-site/uploads/logo.png
New URL: /uploads/logo.png

Find & Replace:
- Featured images (check if URL, convert ID if needed)
- In post content
- In Elementor blocks
- In theme options
- In ACF fields
- In post meta
```

#### Case 2: Update Domain Migration
```
Old: https://old-domain.com/uploads/image.jpg
New: https://new-domain.com/uploads/image.jpg

Process:
- Search entire site for old domain images
- Update all references
- Fix broken images
```

#### Case 3: Replace Specific Image with New Image
```
Old image ID: 123
Old image file: /uploads/product-old.jpg
New image ID: 456
New image file: /uploads/product-new.jpg

Options:
- Replace by ID (simpler, safer)
- Replace by URL (for imports/migrations)
- Both methods available
```

#### Case 4: Update Image URLs After Upload
```
Scenario: Moved images from /gallery/ to /portfolio/
Old: /uploads/gallery/image.jpg
New: /uploads/portfolio/image.jpg

Tool finds all references and updates them
```

---

## 🏗️ Implementation Architecture

### Layer 1: Image Identifier Scanner
```typescript
interface ImageReference {
  id: string
  type: 'featured_image' | 'inline_url' | 'builder_block' | 'acf_field' | 'theme_option' | 'post_meta'
  source: 'page_content' | 'elementor' | 'gutenberg' | 'divi' | 'acf' | 'theme' | 'meta' | 'media'
  postId?: number
  postTitle?: string
  currentImageId?: number // If it's an ID
  currentImageUrl?: string // If it's a URL
  location: string // "Home page > Featured image" or "Elementor > Hero block"
  confidence?: number
}

async function findAllImages(
  siteUrl: string,
  apiKey: string,
  searchTerm: string // old image ID, old URL, old filename
): Promise<ImageReference[]>
```

### Layer 2: Image Validator
```typescript
// Verify images actually exist and are valid
async function validateImage(
  siteUrl: string,
  imageId?: number,
  imageUrl?: string
): Promise<{
  exists: boolean
  dimensions?: { width: number; height: number }
  type?: string
  size?: number
}>
```

### Layer 3: Image Replacer
```typescript
async function replaceImage(
  siteUrl: string,
  apiKey: string,
  oldImageId?: number,
  oldImageUrl?: string,
  newImageId?: number,
  newImageUrl?: string
): Promise<{
  replaced: number
  bySource: Record<string, number>
  errors?: string[]
}>
```

### Layer 4: Image Manager Routine
```typescript
// Unified routine for all image operations
interface ImageManagerOptions {
  action: 'replace_url' | 'replace_id' | 'update_broken'
  oldImageId?: number
  oldImageUrl?: string
  newImageId?: number
  newImageUrl?: string
}

async function runImageManager(
  siteUrl: string,
  apiKey: string,
  options: ImageManagerOptions
): Promise<ImageManagerResults>
```

---

## 🔍 Scanning for Different Image Types

### Scan Featured Images
```typescript
// In each post/page
wp_postmeta where meta_key = '_thumbnail_id'

// Get all featured images
async function scanFeaturedImages(siteUrl, apiKey, searchTerm) {
  // Get all posts with featured images
  const posts = await getPosts()
  for (const post of posts) {
    if (post.featured_media) {
      // Check if ID matches or URL matches
      if (String(post.featured_media) === searchTerm) {
        // Found match
      }
    }
  }
}
```

### Scan Inline Image URLs
```typescript
// In post_content
<img src="/uploads/old-image.jpg">

// In content
const regex = /<img[^>]+src="([^">]+)"/g
for (const match of content.matchAll(regex)) {
  const imageUrl = match[1]
  if (imageUrl.includes(searchTerm)) {
    // Found match
  }
}
```

### Scan Builder Images
```typescript
// Elementor
// In _elementor_data JSON
{
  "type": "image",
  "settings": {
    "image": {
      "id": 123,
      "url": "/uploads/image.jpg"
    }
  }
}

// Gutenberg
<!-- wp:image {id: 123, url: "/uploads/image.jpg"} -->

// Divi
Similar to standard HTML + meta fields
```

### Scan ACF Images
```typescript
// ACF image field stores:
// - Just ID (simple): 123
// - Image object: { ID: 123, url: "/uploads/image.jpg", ... }
// - URL: "/uploads/image.jpg"

// Scan all ACF image fields
async function scanACFImages(siteUrl, apiKey, searchTerm) {
  const acfFields = await getACFFields()
  for (const field of acfFields) {
    if (field.type === 'image') {
      const values = await getACFFieldValues(field.key)
      // Check if any value matches searchTerm
    }
  }
}
```

---

## 💾 Replacement Strategy

### Option 1: Replace by Image ID
```
Old ID: 123 (uuid)
New ID: 456

Replace in:
- Featured images: _thumbnail_id = 456
- Post meta: meta_value = 456
- Elementor: "id": 456
- Gutenberg: id: 456
- ACF: image_field = 456
- Theme options: logo_id: 456

Advantage: Cleaner, handles all image variations
Risk: Must be a valid image ID
```

### Option 2: Replace by URL
```
Old URL: /uploads/old-image.jpg
New URL: /uploads/new-image.jpg

Replace in:
- post_content: <img src="...">
- Elementor: "url": "..."
- Gutenberg: url: "..."
- ACF: if stored as URL
- Theme options: logo: "..."

Advantage: Works for imports, doesn't need ID
Risk: String replacement, could affect other URLs
```

### Option 3: Migrate Domain
```
Old: https://old-site.com/uploads/image.jpg
New: https://new-site.com/uploads/image.jpg

Replace everywhere:
- All image URLs with old domain
- All srcset attributes
- All picture sources
- All background-image URLs

Strategy:
1. Find all instances of old domain + /uploads/
2. Replace with new domain
3. Verify images exist at new location
```

---

## 🎨 Image Manager UI/UX

### Step 1: Choose Operation
```
Image Manager

What do you want to do?
[ ] Replace one image with another
[ ] Update image URLs (domain migration)
[ ] Find broken images
[ ] Update image alt text
```

### Step 2: Image Selection
```
Replace Image
───────────────

Find: [Select image from media library] ✓ image-old.jpg
With: [Select image from media library] ✓ image-new.jpg

Or replace by URL:
Find: /uploads/old-image.jpg
With: /uploads/new-image.jpg

[ ] Preview changes before applying
```

### Step 3: Preview
```
Scan Results: Found 12 instances

Location                          | Type           | Current           | Replace
──────────────────────────────────────────────────────────────────────────────
Home page > Featured Image        | featured_media | image-old.jpg (43) | image-new.jpg (45) ✅
About page > Elementor Hero       | elementor      | image-old.jpg     | image-new.jpg    ✅
Team page > ACF Member Image      | acf            | image-old.jpg (43) | image-new.jpg (45) ⚠️
Header > Theme Logo               | theme_option   | image-old.jpg     | image-new.jpg    ✅

⚠️ Warning: Team page using image ID but new image different dimensions
   ✓ Confidence: 91%

[← Back]  [Apply 12 replacements]
```

### Step 4: Results
```
✅ Complete!

Replacements made:
- Featured images: 2
- Elementor blocks: 4
- Theme options: 2
- ACF fields: 3
- Post meta: 1
Total: 12

Images updated successfully!

Created snapshot for rollback.
```

---

## 🛡️ Safety Features

### Validation Before Replace
```typescript
// Verify new image exists
const newImage = await axios.head(newImageUrl)
if (newImage.status !== 200) {
  throw new Error('New image does not exist')
}

// Check dimensions (optional warning)
const oldDimensions = await getImageDimensions(oldImageUrl)
const newDimensions = await getImageDimensions(newImageUrl)
if (Math.abs(oldWidth - newWidth) > 100) {
  warn('New image very different dimensions')
}

// Check file type
if (!newImageUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
  warn('Unusual file type')
}
```

### Dry Run Mode
```typescript
// First, find all matches without changing anything
const matches = await findAllImages(siteUrl, apiKey, oldImage)

// Show user what will change
console.log(`Would replace ${matches.length} instances`)

// Only apply if user confirms
if (userConfirmed) {
  await replaceImage(...)
}
```

### Rollback Capability
```
Every replace operation:
1. Creates automatic snapshot before
2. Stores old values in activity log
3. Can rollback from snapshot if needed
4. User can undo from Activity > Snapshots
```

---

## 📊 Confidence Scoring for Images

```
Featured Image in Home Page Hero
├─ Field Type: 98% (featured_media is known field)
├─ Context: 95% (hero section, important)
├─ Format: 99% (valid image ID)
├─ Source: 99% (page content is safe)
├─ Data Integrity: 98% (meta field is safe)
└─ Verification: 95% (can verify visually)

Overall: 97% ✅ SAFE TO APPLY

Risk: NONE - featured images are safe to replace
```

---

## 🔄 Implementation Checklist

### Phase 1: Basic Image Management
```
[ ] Scan featured images (post thumbnails)
[ ] Scan image URLs in post_content
[ ] Replace by ID (safest method)
[ ] Basic confidence scoring
[ ] Preview mode
```

### Phase 2: Builder Images
```
[ ] Scan Elementor image blocks
[ ] Scan Gutenberg image blocks
[ ] Scan Divi image content
[ ] Handle image settings/attributes
[ ] Builder-specific validation
```

### Phase 3: Advanced Sources
```
[ ] Scan ACF image fields
[ ] Scan Meta Box fields
[ ] Scan theme options
[ ] Scan plugin settings
[ ] Handle image arrays/galleries
```

### Phase 4: Migrations
```
[ ] Domain migration (URL replacement)
[ ] Batch image updates
[ ] Verify images after replace
[ ] Report broken images
[ ] Alt text migration
```

---

## 💡 Integration with Other Routines

### Business Info Manager
```
"Find all images of..."
- Business logo (everywhere)
- Team member photos
- Product images
- Feature images
```

### Theme Settings Manager
```
"Update theme images..."
- Header background
- Logo image
- Favicon
- Default featured image
```

### Backup Manager
```
"Before replacing images..."
- Create full site snapshot
- Save attachment backup
- Store old image references
- Enable full rollback
```

---

## 🚀 Quick Start

### Today: Basic Image Manager
1. Scan featured images ✓
2. Replace featured images ✓
3. Test with real site ✓
4. Document and commit ✓

### Tomorrow: Add Builder Images
1. Elementor images
2. Gutenberg images
3. Divi images
4. Integrated preview

### This Week: Advanced Features
1. ACF image fields
2. Theme options images
3. Domain migration
4. Batch operations

---

**This puts image management on the same solid foundation as content management.**

The user thinks globally about their images, and ignyous.ai finds them everywhere.
