/**
 * Routines — Predefined workflows for common WordPress tasks.
 *
 * Each routine tells the AI:
 *   - When to trigger (intent detection keywords)
 *   - What context to check (from content graph)
 *   - When to ask vs act (confidence rules)
 *   - What action to emit
 *   - What smart defaults to use
 *
 * The AI picks the matching routine and follows its steps instead of improvising.
 */

export interface Routine {
  id:          string
  name:        string
  triggers:    string[]       // keywords/phrases that activate this routine
  description: string
  steps:       string         // step-by-step instructions for the AI
}

export const ROUTINES: Routine[] = [
  // ─── Content Changes ────────────────────────────────────────────
  {
    id: 'change_phone',
    name: 'Change Phone Number',
    triggers: ['change phone', 'update phone', 'new phone number', 'phone number'],
    description: 'Replace a phone number everywhere it appears on the site',
    steps: `1. Check the content graph → global_content.phones for all phone numbers on the site.
2. If user provided both old and new number → HIGH CONFIDENCE. Emit site_wide_replace with find=old, replace=new immediately.
3. If user only provided a new number:
   a. If content graph shows exactly 1 phone number → ask "I found [number] across [N] locations. Replace it with [new]?"
   b. If multiple phone numbers → show options: "Which number should I replace?" with each phone as a button.
4. If user said "change my phone number" with no numbers at all:
   a. If 1 phone found → ask for the new number: "Your current number is [X]. What's the new one?"
   b. If multiple → "I found these phone numbers on your site: [list]. Which one are you changing, and what's the new number?"
5. Execute site_wide_replace (searches posts, Elementor data, options, widgets, menus, theme settings).
6. Report: "Updated [N] locations: [list of where it changed]".`
  },
  {
    id: 'change_email',
    name: 'Change Email Address',
    triggers: ['change email', 'update email', 'new email', 'email address'],
    description: 'Replace an email address everywhere it appears on the site',
    steps: `Same flow as change_phone but for email addresses.
1. Check content graph → global_content.emails.
2. Follow the same confidence logic as phone numbers.
3. Execute site_wide_replace.
4. ALSO check: form notification recipients (if forms plugin detected). Mention this to the user.`
  },
  {
    id: 'change_address',
    name: 'Change Business Address',
    triggers: ['change address', 'update address', 'new address', 'moved', 'new location'],
    description: 'Replace a business address across the site',
    steps: `1. Ask user for the old address (or part of it) and the new address.
2. Search site-wide for the old address text.
3. Show all locations found and confirm.
4. Execute site_wide_replace.
5. Remind user: "You may also want to update your Google Business Profile and any map embeds."`
  },
  {
    id: 'swap_logo',
    name: 'Swap Logo',
    triggers: ['change logo', 'swap logo', 'update logo', 'new logo', 'replace logo'],
    description: 'Replace the site logo with a new image',
    steps: `1. If user uploaded an image → use it as the new logo.
2. If no image uploaded → ask user to upload the new logo image.
3. Emit upload_media action to upload the image to WordPress media library.
4. Emit update_logo action with the new attachment_id.
5. Also check: if Elementor header has a separate logo widget, update that too.
6. Clear cache and verify.`
  },

  // ─── SEO ────────────────────────────────────────────────────────
  {
    id: 'update_seo',
    name: 'Update SEO Title & Description',
    triggers: ['seo title', 'meta description', 'search engine', 'seo for', 'google description'],
    description: 'Update SEO metadata for a page',
    steps: `1. Check capabilities → can_edit_seo. If no SEO plugin → tell user.
2. If user specified a page → use it. If not, check content graph for the page.
3. If user wants AI-generated SEO:
   a. Read the page content from content graph preview.
   b. Generate 3 title options and 2 description options.
   c. Show as option buttons.
4. Execute update_seo action with chosen title/description.`
  },

  // ─── Structural Editing ─────────────────────────────────────────
  {
    id: 'remove_element',
    name: 'Remove Page Element',
    triggers: ['remove', 'delete', 'get rid of', 'take off', 'hide'],
    description: 'Remove a section, widget, or element from a page',
    steps: `1. Identify what to remove from user's request + content graph.
2. Look up the content graph → find the section/widget by name or position.
   Example: "remove the 4th service box on the home page"
   → Content graph shows: Services Section (4 items): "Service 1", "Service 2", "Service 3", "Service 4"
   → The 4th item is "Service 4" → use search_text="Service 4"
3. If ambiguous → show the items and ask which one.
4. Emit remove_element with post_id and search_text.
5. After success, re-scan that page's content graph to update the AI's memory.`
  },

  // ─── Ecommerce ──────────────────────────────────────────────────
  {
    id: 'update_pricing',
    name: 'Update Product Pricing / Run Sale',
    triggers: ['50% off', 'sale', 'discount', 'change price', 'update price', 'coupon'],
    description: 'Update WooCommerce product prices or create sales',
    steps: `1. Check capabilities → can_edit_ecommerce. If no WooCommerce → tell user.
2. "50% off everything this weekend":
   a. Scan all published products.
   b. Calculate sale prices (50% of regular price).
   c. Set sale_price on each product.
   d. Optionally set sale start/end dates.
   e. Show summary: "Applied 50% off to [N] products. Sale ends [date]."
3. "Change price of [product] to [amount]":
   a. Find the product by name.
   b. Update regular_price.
   c. Clear any active sale_price.
4. "Create a coupon for 20% off":
   a. Generate a coupon code.
   b. Create WC coupon with the discount.
   c. Show the code to the user.`
  },

  // ─── Forms ──────────────────────────────────────────────────────
  {
    id: 'form_notifications',
    name: 'Update Form Notifications',
    triggers: ['form notification', 'form email', 'notify admin', 'confirmation email', 'form sends to'],
    description: 'Update who receives form submissions and auto-replies',
    steps: `1. Check capabilities → can_edit_forms and which forms_plugin.
2. Identify which form (from content graph → forms list).
3. If only 1 form → use it directly.
4. If multiple forms → ask which one.
5. For "notify the user and admin":
   a. Set admin notification email.
   b. Enable user confirmation/auto-reply.
6. Plugin-specific: use the appropriate API for each forms plugin.`
  },

  // ─── Content Updates ───────────────────────────────────────────
  {
    id: 'rewrite_section',
    name: 'Rewrite Page Section',
    triggers: ['rewrite', 'improve', 'make it shorter', 'make it professional', 'update the text'],
    description: 'AI-rewrite a section of page content',
    steps: `1. Identify the section from user request + content graph.
2. Get current text from content graph preview or scan.
3. Generate 2-3 rewrite options based on user intent:
   - "make it shorter" → concise version
   - "make it professional" → formal tone
   - "improve it" → better copy
4. Show options with the find block (original text).
5. On selection → execute replace_content.`
  },

  // ─── Cache ──────────────────────────────────────────────────────
  {
    id: 'clear_cache',
    name: 'Clear All Caches',
    triggers: ['clear cache', 'flush cache', 'purge cache', 'site not updating'],
    description: 'Clear all server and plugin caches',
    steps: `1. Emit clear_cache action.
2. This clears: WordPress object cache, Elementor CSS, and any detected cache plugin.
3. Report what was cleared.`
  },
]

/**
 * Generate the routine instructions block for the system prompt.
 * This gives the AI a decision tree for common requests.
 */
export function buildRoutinePrompt(capabilities?: Record<string, boolean>): string {
  const sections: string[] = []

  sections.push(`== SMART ROUTINES ==
When you detect a request matching a routine below, FOLLOW ITS STEPS instead of improvising.
Use the content graph to answer questions you'd otherwise need to ask the user.`)

  for (const routine of ROUTINES) {
    const triggers = routine.triggers.map(t => `"${t}"`).join(', ')
    sections.push(`▸ ${routine.name} (triggers: ${triggers})
${routine.steps}`)
  }

  sections.push(`CONFIDENCE RULES:
• High confidence (>90%): 1 match found, user intent clear → act immediately, no questions.
• Medium confidence (60-90%): reasonable guess but could be wrong → confirm with the user, show what you found.
• Low confidence (<60%): multiple options or unclear intent → ask a focused question with option buttons.
• NEVER ask for information you already have in the content graph.`)

  return sections.join('\n\n')
}
