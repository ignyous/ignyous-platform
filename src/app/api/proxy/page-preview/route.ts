import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { pageUrl, injectHtml, pageTitle, editMode = false } = await req.json()
    if (!pageUrl) return NextResponse.json({ error: 'pageUrl required' }, { status: 400 })

    // Fetch the live public page
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'ignyous-preview/1.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) throw new Error(`Could not fetch ${pageUrl}: ${res.status}`)
    let html = await res.text()

    // Make all relative URLs absolute so CSS/images load in srcDoc iframe
    const base = new URL(pageUrl)
    const baseUrl = `${base.protocol}//${base.host}`
    html = html
      .replace(/(href|src|action)="\/(?!\/)/g, `$1="${baseUrl}/`)
      .replace(/(href|src|action)='\/(?!\/)/g, `$1='${baseUrl}/`)

    // Inject a <base> tag so relative resources load correctly
    html = html.replace('<head>', `<head>\n<base href="${baseUrl}/" />`)

    // Build the preview injection banner + highlighted content
    const banner = `
<div id="ignyous-preview-banner" style="
  position:fixed;top:0;left:0;right:0;z-index:999999;
  background:#1a1a4e;color:white;padding:10px 20px;
  display:flex;align-items:center;justify-content:space-between;
  font-family:system-ui,sans-serif;font-size:13px;font-weight:600;
  box-shadow:0 2px 12px rgba(0,0,0,0.35);
">
  <span>👁 Draft Preview — <em style="font-style:normal;color:#f3af00">${pageTitle || 'Page update'}</em></span>
  <span style="background:#f3af00;color:#1a1a4e;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700">NOT PUBLISHED</span>
</div>
<div style="height:44px"></div>`

    const injectedSection = injectHtml ? `
<div id="ignyous-preview-injection" style="
  outline:3px solid #f3af00;outline-offset:0;
  position:relative;
">
  <div style="
    position:absolute;top:0;right:0;z-index:9999;
    background:#f3af00;color:#1a1a4e;
    font-family:system-ui,sans-serif;font-size:11px;font-weight:700;
    padding:3px 10px;border-radius:0 0 0 8px;
  ">✦ PROPOSED ADDITION</div>
  ${injectHtml}
</div>` : ''

    // Inject banner just after <body> and proposed content just before </body>
    if (html.includes('<body')) {
      html = html.replace(/(<body[^>]*>)/, `$1\n${banner}`)
    } else {
      html = banner + html
    }

    if (injectedSection) {
      html = html.includes('</body>')
        ? html.replace('</body>', `${injectedSection}\n</body>`)
        : html + injectedSection
    }

    // Inject visual editor script when in edit mode
    if (editMode) {
      const editorScript = buildEditorScript()
      html = html.includes('</body>')
        ? html.replace('</body>', `${editorScript}\n</body>`)
        : html + editorScript
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })

function buildEditorScript(): string {
  return `
<style>
  .ignyous-overlay { position:absolute!important; pointer-events:none; z-index:99998; border:2px solid transparent; border-radius:3px; transition:border-color .15s,background .15s; box-sizing:border-box!important; }
  .ignyous-overlay.hovered { border-color:#f3af00!important; background:rgba(243,175,0,0.04)!important; pointer-events:auto; }
  .ignyous-overlay.selected { border-color:#1a1a4e!important; background:rgba(26,26,78,0.06)!important; pointer-events:auto; }
  .ignyous-label { position:absolute; top:-24px; left:0; background:#1a1a4e; color:white; font-size:11px; font-family:system-ui,sans-serif; font-weight:600; padding:2px 8px; border-radius:4px 4px 0 0; white-space:nowrap; pointer-events:none; z-index:99999; display:none; }
  .ignyous-overlay.hovered .ignyous-label, .ignyous-overlay.selected .ignyous-label { display:block; }
  .ignyous-actions { position:absolute; top:-24px; right:0; display:none; gap:4px; z-index:99999; }
  .ignyous-overlay.hovered .ignyous-actions, .ignyous-overlay.selected .ignyous-actions { display:flex; }
  .ignyous-btn { background:#f3af00; color:#1a1a4e; border:none; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:700; cursor:pointer; font-family:system-ui,sans-serif; pointer-events:auto; white-space:nowrap; }
  .ignyous-btn.ai { background:#1a1a4e; color:white; }
  .ignyous-btn.move { background:#6366f1; color:white; cursor:grab; }
  .ignyous-btn:hover { filter:brightness(0.88); }
  .ignyous-drag-over { border-color:#22c55e!important; background:rgba(34,197,94,0.08)!important; }
  .ignyous-dragging { opacity:0.4; border-color:#f3af00!important; }
  [data-ignyous-selected] { outline:2px solid #1a1a4e!important; outline-offset:2px; }
</style>
<script>
(function() {
  const SECTION_SELECTORS = [
    // Elementor
    '[data-element_type="section"]',
    '[data-element_type="container"]',
    // Gutenberg
    '.wp-block-group',
    '.wp-block-cover',
    '.wp-block-columns',
    // Divi
    '.et_pb_section',
    // WPBakery
    '.vc_row',
    // Avada
    '.fusion-builder-row-container',
    '.fusion-fullwidth',
    // Generic
    'section[class]',
  ];

  const WIDGET_SELECTORS = [
    '[data-element_type="widget"]',
    '.wp-block-paragraph',
    '.wp-block-heading',
    '.wp-block-image',
    '.wp-block-button',
    '.elementor-widget-heading',
    '.elementor-widget-text-editor',
    '.elementor-widget-image',
    '.elementor-widget-button',
    '.et_pb_text',
    '.et_pb_image',
  ];

  let selectedEl = null;
  let dragSrcIndex = null;
  let overlays = [];
  let sections = [];

  function getElementId(el) {
    return el.dataset.id
      || el.dataset.elementId
      || el.getAttribute('data-id')
      || null;
  }

  function getElementLabel(el) {
    const wtype = el.dataset.widget_type;
    const etype = el.dataset.element_type;
    if (wtype) return wtype.replace(/-/g,' ');
    if (etype) return etype;
    const cls = el.className || '';
    if (cls.includes('et_pb_section')) return 'Divi Section';
    if (cls.includes('vc_row'))        return 'WPBakery Row';
    if (cls.includes('fusion-fullwidth')) return 'Avada Section';
    if (cls.includes('wp-block-group')) return 'Block Group';
    if (cls.includes('wp-block-cover')) return 'Cover Block';
    if (cls.includes('wp-block-columns')) return 'Columns Block';
    return 'Section';
  }

  function makeOverlay(el, index, isSectionLevel) {
    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;

    const overlay = document.createElement('div');
    overlay.className = 'ignyous-overlay';
    overlay.style.top    = (rect.top + scrollTop) + 'px';
    overlay.style.left   = rect.left + 'px';
    overlay.style.width  = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const label = document.createElement('div');
    label.className = 'ignyous-label';
    label.textContent = getElementLabel(el);
    overlay.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'ignyous-actions';

    // AI Edit button
    const aiBtn = document.createElement('button');
    aiBtn.className = 'ignyous-btn ai';
    aiBtn.textContent = '✦ AI Edit';
    aiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = getElementId(el);
      window.parent.postMessage({
        type: 'ignyous:select',
        elementId: id,
        elementLabel: getElementLabel(el),
        elementType: el.dataset.element_type || el.dataset.widget_type || 'section',
        index,
        isSectionLevel,
        bgColor: window.getComputedStyle(el).backgroundColor,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      }, '*');
      overlay.classList.add('selected');
    });
    actions.appendChild(aiBtn);

    if (isSectionLevel) {
      // Style button
      const styleBtn = document.createElement('button');
      styleBtn.className = 'ignyous-btn';
      styleBtn.textContent = '🎨 Style';
      styleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = getElementId(el);
        const style = window.getComputedStyle(el);
        window.parent.postMessage({
          type: 'ignyous:style',
          elementId: id,
          index,
          currentBg: style.backgroundColor,
          currentBgImage: style.backgroundImage,
        }, '*');
      });
      actions.appendChild(styleBtn);

      // Move handle
      const moveBtn = document.createElement('button');
      moveBtn.className = 'ignyous-btn move';
      moveBtn.textContent = '⣿ Move';
      moveBtn.draggable = true;
      moveBtn.addEventListener('dragstart', (e) => {
        dragSrcIndex = index;
        overlay.classList.add('ignyous-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      moveBtn.addEventListener('dragend', () => {
        overlay.classList.remove('ignyous-dragging');
        document.querySelectorAll('.ignyous-drag-over').forEach(o => o.classList.remove('ignyous-drag-over'));
      });
      actions.appendChild(moveBtn);
    }

    overlay.appendChild(actions);

    overlay.addEventListener('dragover', (e) => {
      if (dragSrcIndex === null || dragSrcIndex === index) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      overlay.classList.add('ignyous-drag-over');
    });
    overlay.addEventListener('dragleave', () => overlay.classList.remove('ignyous-drag-over'));
    overlay.addEventListener('drop', (e) => {
      e.preventDefault();
      overlay.classList.remove('ignyous-drag-over');
      if (dragSrcIndex !== null && dragSrcIndex !== index) {
        window.parent.postMessage({ type: 'ignyous:move', fromIndex: dragSrcIndex, toIndex: index }, '*');
        dragSrcIndex = null;
      }
    });

    overlay.addEventListener('mouseenter', () => { overlay.classList.add('hovered'); });
    overlay.addEventListener('mouseleave', () => { overlay.classList.remove('hovered'); });

    document.body.appendChild(overlay);
    overlays.push({ overlay, el });
    return overlay;
  }

  function buildOverlays() {
    overlays.forEach(({overlay}) => overlay.remove());
    overlays = [];
    sections = [];

    // Top-level sections first
    SECTION_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!sections.includes(el) && !el.closest(SECTION_SELECTORS.filter(s => s !== sel).join(','))) {
          sections.push(el);
        }
      });
    });

    // Sort by DOM order
    sections.sort((a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1);
    sections.forEach((el, i) => makeOverlay(el, i, true));

    // Widgets inside sections (only in advanced mode if enabled)
    if (window._ignyousShowWidgets) {
      document.querySelectorAll(WIDGET_SELECTORS.join(',')).forEach((el, i) => {
        makeOverlay(el, i, false);
      });
    }
  }

  // Rebuild overlays on scroll/resize
  let rebuildTimer;
  window.addEventListener('scroll', () => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(buildOverlays, 100); });
  window.addEventListener('resize', buildOverlays);

  // Handle parent messages (e.g. "highlight this element")
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'ignyous:highlight') {
      overlays.forEach(({overlay}) => overlay.classList.remove('selected'));
      const target = overlays.find(({el}) => getElementId(el) === e.data.elementId);
      if (target) { target.overlay.classList.add('selected'); target.el.scrollIntoView({ behavior:'smooth', block:'center' }); }
    }
    if (e.data?.type === 'ignyous:enable_widgets') window._ignyousShowWidgets = true;
  });

  // Notify parent we're ready
  window.parent.postMessage({ type: 'ignyous:ready', url: window.location.href }, '*');

  // Build after DOM settles
  if (document.readyState === 'complete') buildOverlays();
  else window.addEventListener('load', buildOverlays);
  setTimeout(buildOverlays, 800); // catch lazy-loaded content
})();
</script>`
}


  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}