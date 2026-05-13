/**
 * Action Handler Module
 * 
 * Encapsulates all action execution logic previously embedded in dashboard/page.tsx.
 * This module is responsible for executing AI-directed actions on connected WordPress sites.
 * 
 * Design:
 * - Pure function approach (minimal state mutations)
 * - Clear separation between action execution and UI state updates
 * - Comprehensive logging for debugging
 * - Type-safe action handling
 */

export interface ActionResult {
  type: string
  success: boolean
  message: string
  url?: string
  title?: string
  snapshotId?: string
  detail?: any
  data?: any
}

export interface Action {
  type: string
  [key: string]: any
}

/**
 * Bridge helper — makes authenticated calls to the WordPress bridge API
 */
export async function bridge(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
  const url = `${baseUrl}/api/bridge/${endpoint}`
  
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  
  if (body) options.body = JSON.stringify(body)
  
  try {
    const res = await fetch(url, options)
    return await res.json()
  } catch (e: any) {
    return { success: false, error: `Bridge request failed: ${e.message}` }
  }
}

/**
 * Core action executor
 * 
 * Handles all action types in a maintainable switch structure.
 * Returns ActionResult for UI updates and logging.
 * 
 * @param action - The action object from AI
 * @param context - Execution context (site info, auth, callbacks)
 * @returns ActionResult with success status and feedback message
 */
export async function executeAction(
  action: Action,
  context: {
    siteUrl: string
    apiKey: string
    pages: any[]
    siteInfo: any
    logActivity: (log: any) => Promise<void>
    setPreviewUrl: (url: string) => void
    setIframeKey: (fn: (k: number) => number) => void
    setMessages: (fn: (msgs: any[]) => any[]) => void
    setSnapshots: (fn: (snaps: any[]) => any[]) => void
    setPendingImageData: (data: any) => void
    normalizePhoneDigits: (phone: string) => string
    groupPhoneMatches: (matches: any[]) => any[]
    formatPhoneGroupLine: (group: any) => string
    shortLocation: (m: any) => string
  }
): Promise<ActionResult> {
  let result: ActionResult = { type: action.type, success: false, message: 'Action failed' }
  
  const {
    siteUrl: cleanUrl, apiKey, pages, siteInfo, logActivity, setPreviewUrl,
    setIframeKey, setMessages, setSnapshots, setPendingImageData,
    normalizePhoneDigits, groupPhoneMatches, formatPhoneGroupLine, shortLocation
  } = context

  // Auto-snapshot before destructive actions
  let snapshotId = ''
  const destructiveActions = [
    'update_page','create_page','update_site_options','update_seo','update_element',
    'update_global_style','plugin_action','install_plugin','install_theme',
    'replace_text','replace_phone_number','replace_multiple_texts'
  ]
  
  if (destructiveActions.includes(action.type)) {
    try {
      const snapRes = await bridge('snapshot', 'POST', { label: `Before: ${action.type} — ${action.title || action.slug || action.blogname || 'change'}` })
      if (snapRes.success) {
        snapshotId = snapRes.data?.snapshot_id || ''
        setSnapshots(prev => [
          { id: snapshotId, label: `Before: ${action.title || action.slug || action.type}`, created_at: new Date().toISOString() },
          ...prev
        ].slice(0, 20))
      }
    } catch {}
  }

  try {
    switch (action.type) {
      case 'update_page': {
        if (!action.pageId) {
          result = {
            type: 'update_page',
            success: false,
            message: 'Failed: page ID unknown — pages may not have loaded yet. Try refreshing or ask again once the site info loads.'
          }
          break
        }
        
        const targetPage = pages.find(p => p.id === action.pageId)
        const pageUrl = targetPage?.link
        const pageTitle = action.title || targetPage?.title || 'Page'

        let r: any
        if (action.section && action.pageId) {
          const builderRes = await fetch('/api/builder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              siteUrl: cleanUrl,
              apiKey,
              pageId: action.pageId,
              builder: siteInfo?.builder || '',
              section: action.section,
            }),
          })
          r = await builderRes.json()
        } else {
          r = await bridge(`pages/${action.pageId}`, 'POST', {
            title: action.title,
            content: action.content,
            status: action.status || 'publish'
          })
        }

        result = {
          type: 'update_page',
          success: r.success,
          message: r.success ? `"${pageTitle}" updated successfully` : `Failed: ${r.error || r.message}`,
          url: pageUrl
        }
        
        if (r.success && pageUrl) {
          setPreviewUrl(pageUrl)
          setIframeKey(k => k + 1)
          setTimeout(() => setIframeKey(k => k + 1), 3000)
        }
        break
      }

      case 'create_page': {
        const r = await bridge('pages', 'POST', {
          title: action.title,
          content: action.content || '',
          status: action.status || 'publish'
        })
        
        if (r.success) {
          const pg = r.data?.page || r.data
          const url = pg?.link || `${cleanUrl}/${(action.title||'').toLowerCase().replace(/\s+/g,'-')}`
          result = {
            type: 'create_page',
            success: true,
            message: `"${action.title}" created and published`,
            url,
            title: action.title
          }
          
          const pagesRes = await bridge('pages')
          if (pagesRes.success) {
            // Pages list would be updated in component via callback
          }
        } else {
          result = { type: 'create_page', success: false, message: `Failed: ${r.error}` }
        }
        break
      }

      case 'update_seo': {
        const targetPage = pages.find(p => p.id === action.pageId)
        
        if (action.bulk) {
          const seoRes = await fetch('/api/seo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'bulk_generate',
              siteUrl: cleanUrl,
              apiKey,
              pages,
              siteContext: { site_name: siteInfo?.site?.name, site_url: cleanUrl }
            }),
          })
          const seoData = await seoRes.json()
          result = {
            type: 'update_seo',
            success: seoData.success,
            message: `SEO optimized for ${seoData.updated || 0} pages`
          }
        } else if (action.pageId) {
          const seoRes = await fetch('/api/seo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              siteUrl: cleanUrl,
              apiKey,
              pageId: action.pageId,
              seoData: action.seoData
            }),
          })
          const seoData = await seoRes.json()
          result = {
            type: 'update_seo',
            success: seoData.success,
            message: seoData.success
              ? `SEO updated for "${targetPage?.title || 'page'}"`
              : `SEO update failed: ${seoData.message}`
          }
        } else {
          const seoRes = await fetch('/api/seo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'bulk_generate',
              siteUrl: cleanUrl,
              apiKey,
              pages,
              siteContext: { site_name: siteInfo?.site?.name, site_url: cleanUrl }
            }),
          })
          const seoData = await seoRes.json()
          result = {
            type: 'update_seo',
            success: seoData.success,
            message: `AI optimized SEO for ${seoData.updated || 0} pages`
          }
        }
        break
      }

      case 'read_structure': {
        const r = await fetch(`/api/element?siteUrl=${encodeURIComponent(cleanUrl)}&apiKey=${encodeURIComponent(apiKey)}&pageId=${action.pageId}`)
        const data = await r.json()
        result = {
          type: 'read_structure',
          success: data.success ?? true,
          message: data.data
            ? `Page has ${data.data.section_count} section(s) — builder: ${data.data.builder}`
            : 'Could not read structure',
          data
        }
        
        if (data.success && data.data) {
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: `📐 Page structure loaded: ${data.data.section_count} sections (${data.data.builder}). Here are the sections:\n` +
              (data.data.sections || []).slice(0, 10).map((s: any, i: number) =>
                `${i+1}. [${s.id}] ${s.type} — "${s.label}" ${s.settings?.background_color ? `bg:${s.settings.background_color}` : ''}`
              ).join('\n'),
            ts: new Date(),
          }])
        }
        break
      }

      case 'upload_image': {
        if (action.pendingImageData) {
          const r = await fetch('/api/element', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'upload_image',
              siteUrl: cleanUrl,
              apiKey,
              imageData: action.pendingImageData.data,
              imageName: action.pendingImageData.name
            })
          })
          const data = await r.json()
          result = {
            type: 'upload_image',
            success: data.success ?? false,
            message: data.success ? `Image uploaded: ${data.data?.url}` : 'Upload failed',
            url: data.data?.url
          }
          if (data.success) setPendingImageData(null)
        } else {
          result = {
            type: 'upload_image',
            success: false,
            message: 'No image attached — please attach an image first'
          }
        }
        break
      }

      case 'update_element': {
        const targetPage = pages.find(p => p.id === action.pageId)
        const elementAction = action.findByDescription ? 'find_and_update' : 'update_element'
        
        const r = await fetch('/api/element', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: elementAction,
            siteUrl: cleanUrl,
            apiKey,
            pageId: action.pageId,
            elementId: action.elementId,
            description: action.findByDescription || action.description,
            updates: action.updates,
          })
        })
        const data = await r.json()
        result = {
          type: 'update_element',
          success: data.success ?? false,
          message: data.success
            ? `Updated ${action.findByDescription || action.elementId || 'element'}`
            : (data.message || 'Update failed'),
          url: targetPage?.link
        }
        
        if (data.success && targetPage?.link) {
          setPreviewUrl(targetPage.link)
          setIframeKey(k => k + 1)
          setTimeout(() => setIframeKey(k => k + 1), 3000)
        }
        break
      }

      case 'scan_content':
      case 'find_text':
      case 'find_phone_numbers': {
        const mode = action.type === 'find_phone_numbers' ? 'phone' : (action.mode || 'text')
        const started = Date.now()
        const r = await bridge('content/scan', 'POST', {
          mode,
          query: action.query || action.text || '',
          pageId: action.pageId || 0,
          limit: action.limit || (mode === 'phone' ? 200 : 50)
        })
        const matches = r.data?.matches || r.data?.data?.matches || []

        if (mode === 'phone') {
          const groups = groupPhoneMatches(matches)
          const lines = groups.slice(0, 8).map(formatPhoneGroupLine).join('\n')
          result = {
            type: action.type,
            success: r.success ?? false,
            message: groups.length
              ? `Found ${groups.length} valid phone number${groups.length === 1 ? '' : 's'} across ${matches.length} match${matches.length === 1 ? '' : 'es'}.`
              : 'No phone numbers found.',
            data: { matches, groups },
          }
          
          await logActivity({
            action: 'phone_scan',
            status: groups.length ? 'success' : 'failed',
            summary: groups.length
              ? `Found ${groups.length} phone number candidate(s) across ${matches.length} raw match(es).`
              : 'No phone numbers found during scan.',
            detail: { mode, query: action.query || action.text || '', matches, groups },
            durationMs: Date.now() - started,
          })
          
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: groups.length
              ? `I found these valid phone numbers:\n${lines}`
              : 'I scanned the site and did not find any phone numbers.',
            ts: new Date(),
          }])
        } else {
          const lines = matches.slice(0, 8)
            .map((m: any, i: number) => `${i+1}. ${m.match || action.query || action.text || 'Match'} — ${shortLocation(m)}`)
            .join('\n')
          result = {
            type: action.type,
            success: r.success ?? false,
            message: matches.length ? `Found ${matches.length} match(es).` : 'No matching content found.',
            data: matches
          }
          
          await logActivity({
            action: 'content_scan',
            status: matches.length ? 'success' : 'failed',
            summary: matches.length ? `Found ${matches.length} content match(es).` : 'No matching content found.',
            detail: { mode, query: action.query || action.text || '', matches },
            durationMs: Date.now() - started,
          })
          
          setMessages(prev => [...prev, {
            role: 'assistant' as const,
            content: matches.length
              ? `I found ${matches.length} match${matches.length === 1 ? '' : 'es'}:\n${lines}`
              : 'I scanned the site and did not find matching content.',
            ts: new Date(),
          }])
        }
        break
      }

      case 'replace_text': {
        if (!action.old || typeof action.new === 'undefined') {
          result = { type: 'replace_text', success: false, message: 'Missing old or new text for replacement.' }
          break
        }
        
        const started = Date.now()
        const r = await bridge('content/replace', 'POST', {
          old: action.old,
          new: action.new,
          matchIds: action.matchIds || [],
          pageId: action.pageId || 0
        })
        const data = r.data || r.data?.data || {}
        
        result = {
          type: 'replace_text',
          success: r.success ?? false,
          message: r.success
            ? `Done — I updated ${data.replacements || 0} match${(data.replacements || 0) === 1 ? '' : 'es'}.`
            : (r.message || r.error || 'Replacement failed'),
          detail: { old: action.old, new: action.new, matchIds: action.matchIds || [], response: data }
        }
        
        await logActivity({
          action: 'replace_text',
          status: r.success ? 'success' : 'failed',
          summary: r.success
            ? `Replaced text in ${data.updated_count || 0} location(s).`
            : `Text replacement failed: ${r.message || r.error || 'unknown error'}`,
          detail: { old: action.old, new: action.new, matchIds: action.matchIds || [], pageId: action.pageId || 0, response: data },
          durationMs: Date.now() - started,
        })
        
        if (r.success) {
          setIframeKey(k => k + 1)
          setTimeout(() => setIframeKey(k => k + 1), 3000)
        }
        break
      }

      case 'replace_phone_number': {
        const newPhone = action.new || action.phone || action.newPhone
        if (!newPhone) {
          result = { type: 'replace_phone_number', success: false, message: 'Missing new phone number.' }
          break
        }
        
        let oldPhone = action.old || action.oldPhone || ''
        if (!oldPhone) {
          const started = Date.now()
          const scan = await bridge('content/scan', 'POST', {
            mode: 'phone',
            query: '',
            pageId: action.pageId || 0,
            limit: 200
          })
          const matches = scan.data?.matches || scan.data?.data?.matches || []
          const groups = groupPhoneMatches(matches)

          if (groups.length === 0) {
            result = {
              type: 'replace_phone_number',
              success: false,
              message: 'I scanned the site and could not find an existing phone number to replace.',
              detail: { matches, groups }
            }
            
            await logActivity({
              action: 'replace_phone_number_scan',
              status: 'failed',
              summary: `No existing phone number found while trying to update to ${newPhone}.`,
              detail: { newPhone, matches, groups, scan },
              durationMs: Date.now() - started,
            })
            break
          }

          if (groups.length === 1 && groups[0].count === 1) {
            oldPhone = groups[0].phone
          } else {
            const lines = groups.slice(0, 8).map(formatPhoneGroupLine).join('\n')
            
            result = {
              type: 'replace_phone_number',
              success: false,
              message: groups.length === 1
                ? 'Waiting for confirmation before changing multiple matches.'
                : 'Waiting for user to choose which phone number to change.',
              data: { matches, groups }
            }
            
            await logActivity({
              action: 'phone_replace_needs_choice',
              status: 'pending',
              summary: groups.length === 1
                ? `Phone number ${groups[0].phone} found in ${groups[0].count} places; waiting for Change All confirmation.`
                : `Found ${groups.length} different phone numbers; waiting for user choice.`,
              detail: { newPhone, matches, groups, scan },
              durationMs: Date.now() - started,
            })
            
            // UI would handle showing options
            break
          }
        }
        
        const started = Date.now()
        const r = await bridge('content/replace', 'POST', {
          old: oldPhone,
          oldDigits: action.oldDigits || action.digits || normalizePhoneDigits(oldPhone),
          new: newPhone,
          matchIds: action.matchIds || [],
          pageId: action.pageId || 0,
          mode: 'phone'
        })
        const data = r.data || r.data?.data || {}
        
        result = {
          type: 'replace_phone_number',
          success: r.success ?? false,
          message: r.success
            ? `Done — I changed ${oldPhone} to ${newPhone}.`
            : (r.message || r.error || 'Phone replacement failed'),
          detail: { oldPhone, newPhone, matchIds: action.matchIds || [], response: data }
        }
        
        await logActivity({
          action: 'replace_phone_number',
          status: r.success ? 'success' : 'failed',
          summary: r.success
            ? `Changed ${oldPhone} to ${newPhone}; ${data.replacements || 0} replacement(s).`
            : `Phone replacement failed for ${oldPhone} to ${newPhone}.`,
          detail: { oldPhone, newPhone, matchIds: action.matchIds || [], pageId: action.pageId || 0, response: data },
          durationMs: Date.now() - started,
        })
        
        if (r.success) {
          setIframeKey(k => k + 1)
          setTimeout(() => setIframeKey(k => k + 1), 3000)
        }
        break
      }

      case 'clear_cache': {
        const r = await fetch('/api/cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl: cleanUrl, apiKey })
        })
        const data = await r.json()
        result = {
          type: 'clear_cache',
          success: data.success ?? false,
          message: data.message || (data.success ? 'Cache cleared' : 'Cache clear failed')
        }
        break
      }

      case 'take_snapshot': {
        const r = await bridge('snapshot', 'POST', {
          label: action.label || 'Manual snapshot',
          page_id: action.pageId || 0
        })
        const snapId = r.data?.snapshot_id || ''
        result = {
          type: 'take_snapshot',
          success: r.success,
          message: r.success ? `📸 Snapshot saved: "${action.label || 'Snapshot'}"` : `Snapshot failed: ${r.error}`,
          snapshotId: snapId
        }
        
        if (r.success) {
          setSnapshots(prev => [
            { id: snapId, label: action.label || 'Snapshot', created_at: new Date().toISOString() },
            ...prev
          ].slice(0, 20))
        }
        break
      }

      case 'update_site_options': {
        const r = await bridge('site/settings', 'PATCH', {
          blogname: action.blogname,
          blogdescription: action.blogdescription,
          ...action.options
        })
        result = {
          type: 'update_site_options',
          success: r.success,
          message: r.success ? 'Site settings updated' : `Failed: ${r.error}`
        }
        break
      }

      case 'install_plugin': {
        const r = await bridge('plugins/install', 'POST', {
          slug: action.slug,
          activate: true
        })
        result = {
          type: 'install_plugin',
          success: r.success,
          message: r.success
            ? `${action.name || action.slug} installed & activated`
            : `Failed: ${r.error}`
        }
        break
      }

      case 'install_theme': {
        const r = await bridge('themes/install', 'POST', {
          slug: action.slug,
          activate: true
        })
        result = {
          type: 'install_theme',
          success: r.success,
          message: r.success
            ? `Theme "${action.name || action.slug}" installed and activated`
            : `Could not auto-install. Go to WP Admin → Appearance → Themes to install manually.`
        }
        break
      }

      default:
        result = { type: action.type, success: true, message: 'Done!' }
    }
  } catch (e: any) {
    result = { type: action.type, success: false, message: `Error: ${e.message}` }
  }

  // Auto-cache-clear after content changes
  const contentActions = [
    'update_page', 'create_page', 'update_element', 'replace_content',
    'update_site_options', 'plugin_action'
  ]
  
  if (result.success && contentActions.includes(action.type)) {
    try {
      await fetch('/api/cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteUrl: cleanUrl, apiKey })
      })
    } catch {}
    
    setIframeKey(k => k + 1)
    setTimeout(() => setIframeKey(k => k + 1), 2500)
  }

  if (snapshotId) result.snapshotId = snapshotId
  return result
}
