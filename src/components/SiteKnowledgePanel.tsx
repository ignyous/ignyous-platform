import { useState, useEffect } from 'react'

/**
 * SiteKnowledgePanel — Debug panel that shows everything the AI knows.
 *
 * Tabs:
 *   Overview  — site info, capabilities, scan status
 *   Pages     — content graph with sections/widgets/element IDs
 *   Theme     — current colors, fonts, theme options
 *   Builder   — Elementor global settings, widget registry
 *   Forms     — form fields, notifications
 *   Actions   — recent action log with payloads/responses
 *   Raw       — full JSON the AI sees
 */

interface Props {
  contentGraph: any
  enrichedScan: any
  siteContext: any     // the full context object sent to the AI
  actionLog: Array<{ ts: Date; type: string; payload: any; result: any }>
  siteUrl: string
  apiKey: string
  onClose: () => void
}

const TABS = ['Overview', 'Pages', 'Theme', 'Builder', 'Forms', 'Actions', 'Raw'] as const
type Tab = typeof TABS[number]

const S = {
  bg: '#0f1117',
  surface: '#1a1d27',
  surfaceHover: '#242836',
  border: '#2a2e3a',
  text: '#e4e4e7',
  textMuted: '#71717a',
  accent: '#3b82f6',
  accentDim: '#1e3a5f',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#eab308',
  orange: '#f97316',
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
}

export default function SiteKnowledgePanel({ contentGraph, enrichedScan, siteContext, actionLog, siteUrl, apiKey, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [elementorSchema, setElementorSchema] = useState<any>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)

  // Fetch Elementor schema on Builder tab
  useEffect(() => {
    if (tab === 'Builder' && !elementorSchema && !schemaLoading && siteUrl) {
      setSchemaLoading(true)
      const base = siteUrl.replace(/\/$/, '').replace(/^(?!https?:\/\/)/, 'https://')
      fetch(`${base}/wp-json/ignyous/v1/elementor/schema?compact=true&api_key=${encodeURIComponent(apiKey)}`, {
        headers: { 'X-Ignyous-Key': apiKey },
        signal: AbortSignal.timeout(15000),
      })
        .then(r => r.json())
        .then(d => { if (d.success) setElementorSchema(d) })
        .catch(() => {})
        .finally(() => setSchemaLoading(false))
    }
  }, [tab])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div style={{
        width: '680px', maxWidth: '100vw', height: '100vh',
        background: S.bg, borderLeft: `1px solid ${S.border}`,
        display: 'flex', flexDirection: 'column',
        fontFamily: S.sans, color: S.text, fontSize: 13,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: `1px solid ${S.border}`,
          background: S.surface,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Site Knowledge</span>
            <span style={{ fontSize: 11, color: S.textMuted }}>
              {contentGraph ? `${contentGraph.pages?.length || 0} pages scanned` : 'Not scanned'}
            </span>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: S.textMuted, cursor: 'pointer',
            fontSize: 18, padding: '4px 8px', borderRadius: 4,
          }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, padding: '0 16px',
          borderBottom: `1px solid ${S.border}`, background: S.surface,
          overflowX: 'auto',
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 14px', fontSize: 12, fontWeight: tab === t ? 700 : 500,
              color: tab === t ? S.accent : S.textMuted,
              borderBottom: tab === t ? `2px solid ${S.accent}` : '2px solid transparent',
              background: 'none', border: 'none', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {tab === 'Overview' && <OverviewTab contentGraph={contentGraph} enrichedScan={enrichedScan} />}
          {tab === 'Pages' && <PagesTab contentGraph={contentGraph} enrichedScan={enrichedScan} />}
          {tab === 'Theme' && <ThemeTab enrichedScan={enrichedScan} />}
          {tab === 'Builder' && <BuilderTab enrichedScan={enrichedScan} schema={elementorSchema} loading={schemaLoading} />}
          {tab === 'Forms' && <FormsTab enrichedScan={enrichedScan} />}
          {tab === 'Actions' && <ActionsTab log={actionLog} />}
          {tab === 'Raw' && <RawTab siteContext={siteContext} contentGraph={contentGraph} enrichedScan={enrichedScan} />}
        </div>
      </div>
    </div>
  )
}

// ─── Tab Components ────────────────────────────────────────────────

function OverviewTab({ contentGraph, enrichedScan }: { contentGraph: any; enrichedScan: any }) {
  const site = contentGraph?.site || enrichedScan?.theme || {}
  const caps = contentGraph?.capabilities || {}
  const pages = contentGraph?.pages || []
  const phones = contentGraph?.global_content?.phones || []
  const emails = contentGraph?.global_content?.emails || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Site Info">
        <KV label="Name" value={site.site_name || site.name || '—'} />
        <KV label="URL" value={site.site_url || '—'} />
        <KV label="Theme" value={`${site.name || site.theme || '—'}${site.parent ? ` (child of ${site.parent})` : ''}`} />
        <KV label="Builder" value={site.builder || enrichedScan?.builder?.name || '—'} />
        <KV label="Framework" value={site.framework || enrichedScan?.theme?.framework || '—'} />
        <KV label="WP Version" value={site.wp_version || '—'} />
      </Section>

      <Section title="Capabilities">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(caps).filter(([k]) => k.startsWith('can_')).map(([k, v]) => (
            <Badge key={k} label={k.replace('can_', '')} ok={!!v} />
          ))}
        </div>
      </Section>

      <Section title="Scan Summary">
        <KV label="Pages scanned" value={pages.length} />
        <KV label="Total sections" value={pages.reduce((s: number, p: any) => s + (p.sections?.length || 0), 0)} />
        <KV label="Phone numbers found" value={phones.length} />
        <KV label="Email addresses found" value={emails.length} />
        <KV label="Forms detected" value={contentGraph?.global_content?.forms?.length || enrichedScan?.forms?.length || 0} />
        <KV label="WooCommerce" value={enrichedScan?.woocommerce?.active ? `${enrichedScan.woocommerce.total_products} products` : 'Not detected'} />
      </Section>

      {phones.length > 0 && (
        <Section title="Phone Numbers">
          {phones.map((p: any, i: number) => (
            <KV key={i} label={p.value} value={`Found in ${p.count} location(s): ${(p.found_in || []).map((l: any) => l.page_title || l.location || '?').join(', ')}`} />
          ))}
        </Section>
      )}
    </div>
  )
}

function PagesTab({ contentGraph, enrichedScan }: { contentGraph: any; enrichedScan: any }) {
  const pages = contentGraph?.pages || []
  const enrichedPages = enrichedScan?.pages || []
  const [expandedPage, setExpandedPage] = useState<number | null>(null)
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pages.length === 0 && <Muted>No pages scanned. Content graph not loaded.</Muted>}
      {pages.map((page: any) => {
        const isExpanded = expandedPage === page.id
        const enrichedPage = enrichedPages.find((ep: any) => ep.id === page.id)
        const widgets = enrichedPage?.widgets || []

        return (
          <div key={page.id} style={{ border: `1px solid ${S.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div
              onClick={() => setExpandedPage(isExpanded ? null : page.id)}
              style={{
                padding: '10px 14px', cursor: 'pointer', background: S.surface,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <span style={{ fontWeight: 700 }}>{page.title}</span>
                {page.is_front_page && <span style={{ color: S.accent, fontSize: 11, marginLeft: 6 }}>FRONT PAGE</span>}
                <span style={{ color: S.textMuted, fontSize: 11, marginLeft: 8 }}>ID: {page.id} · {page.builder}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: S.textMuted }}>{page.sections?.length || 0} sections</span>
                <span style={{ fontSize: 14 }}>{isExpanded ? '▼' : '▶'}</span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ padding: '8px 14px', background: S.bg }}>
                {(page.sections || []).map((sec: any, si: number) => (
                  <div key={si} style={{ padding: '6px 0', borderBottom: `1px solid ${S.border}` }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <SectionTypeBadge type={sec.type} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{sec.label}</span>
                      {sec.item_count > 0 && <span style={{ fontSize: 11, color: S.textMuted }}>({sec.item_count} items)</span>}
                      <span style={{ fontSize: 10, color: S.textMuted, fontFamily: S.mono }}>[{sec.element_id}]</span>
                    </div>

                    {sec.items?.length > 0 && (
                      <div style={{ paddingLeft: 24, marginTop: 4 }}>
                        {sec.items.map((item: any, ii: number) => (
                          <div key={ii} style={{
                            fontSize: 11, padding: '3px 0', color: S.text,
                            display: 'flex', gap: 6, alignItems: 'center',
                          }}>
                            <span style={{ color: S.textMuted }}>├</span>
                            <span style={{ fontWeight: 600 }}>{item.title || item.name || '(untitled)'}</span>
                            {item.element_id && <span style={{ fontSize: 10, color: S.accent, fontFamily: S.mono }}>[{item.element_id}]</span>}
                            {item.description && <span style={{ color: S.textMuted, fontSize: 10 }}>{item.description.slice(0, 40)}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {sec.preview && !sec.items?.length && (
                      <div style={{ paddingLeft: 24, fontSize: 11, color: S.textMuted, marginTop: 2 }}>
                        {sec.preview}
                      </div>
                    )}
                  </div>
                ))}

                {/* Enriched widgets */}
                {widgets.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${S.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: S.textMuted, marginBottom: 6 }}>ALL WIDGETS ({widgets.filter((w: any) => w.type === 'widget').length})</div>
                    {widgets.filter((w: any) => w.type === 'widget').map((w: any, wi: number) => {
                      const isWExpanded = expandedWidget === w.element_id
                      return (
                        <div key={wi} style={{ marginBottom: 2 }}>
                          <div
                            onClick={() => setExpandedWidget(isWExpanded ? null : w.element_id)}
                            style={{ cursor: 'pointer', fontSize: 11, padding: '3px 0', display: 'flex', gap: 6, alignItems: 'center' }}
                          >
                            <span style={{ color: S.textMuted, width: 14 }}>{isWExpanded ? '▼' : '▶'}</span>
                            <span style={{ color: S.orange, fontFamily: S.mono, fontSize: 10, minWidth: 80 }}>{w.widget_type}</span>
                            <span>{w.content?.title || w.content?.name || w.content?.text?.slice(0, 30) || ''}</span>
                            <span style={{ color: S.textMuted, fontFamily: S.mono, fontSize: 10 }}>[{w.element_id}]</span>
                          </div>
                          {isWExpanded && (
                            <div style={{ paddingLeft: 24, marginBottom: 6 }}>
                              {w.content && Object.keys(w.content).length > 0 && (
                                <JsonBlock label="Content" data={w.content} />
                              )}
                              {w.visual && Object.keys(w.visual).length > 0 && (
                                <JsonBlock label="Visual" data={w.visual} />
                              )}
                              {w.background && (
                                <JsonBlock label="Background" data={w.background} />
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ThemeTab({ enrichedScan }: { enrichedScan: any }) {
  const theme = enrichedScan?.theme || {}
  const customizer = theme.customizer || {}
  const themeOpts = theme.theme_options || {}

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Theme Info">
        <KV label="Name" value={theme.name || '—'} />
        <KV label="Parent" value={theme.parent || 'None (not a child theme)'} />
        <KV label="Version" value={theme.version || '—'} />
        <KV label="Framework" value={themeOpts.framework || theme.framework || '—'} />
        {themeOpts.raw_option_name && <KV label="Options stored in" value={themeOpts.raw_option_name} />}
      </Section>

      <Section title="Customizer Values">
        {Object.entries(customizer).map(([k, v]) => (
          <KV key={k} label={k} value={renderColorOrValue(k, v)} />
        ))}
      </Section>

      {Object.keys(themeOpts).filter(k => !['framework', 'raw_option_name', 'all_keys'].includes(k)).length > 0 && (
        <Section title="Theme Options">
          {Object.entries(themeOpts)
            .filter(([k]) => !['framework', 'raw_option_name', 'all_keys'].includes(k))
            .map(([k, v]) => (
              <KV key={k} label={k} value={renderColorOrValue(k, v)} />
            ))}
        </Section>
      )}

      {themeOpts.all_keys && (
        <Section title={`All Option Keys (${themeOpts.all_keys.length})`}>
          <div style={{ fontSize: 10, fontFamily: S.mono, color: S.textMuted, lineHeight: 1.6, wordBreak: 'break-all' }}>
            {themeOpts.all_keys.join(', ')}
          </div>
        </Section>
      )}
    </div>
  )
}

function BuilderTab({ enrichedScan, schema, loading }: { enrichedScan: any; schema: any; loading: boolean }) {
  const builder = enrichedScan?.builder || {}
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Section title="Builder Info">
        <KV label="Builder" value={builder.name || '—'} />
        <KV label="Version" value={builder.version || '—'} />
        <KV label="Container width" value={builder.container_width || '—'} />
        <KV label="Widget spacing" value={builder.space_between_widgets || '—'} />
      </Section>

      {builder.global_colors?.length > 0 && (
        <Section title="Global Colors">
          {builder.global_colors.map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: c.color, border: `1px solid ${S.border}` }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{c.title}</span>
              <span style={{ fontSize: 11, fontFamily: S.mono, color: S.textMuted }}>{c.color}</span>
            </div>
          ))}
        </Section>
      )}

      {builder.global_fonts?.length > 0 && (
        <Section title="Global Fonts">
          {builder.global_fonts.map((f: any, i: number) => (
            <KV key={i} label={f.title} value={`${f.family || '—'} ${f.weight || ''} ${f.size ? f.size + 'px' : ''}`} />
          ))}
        </Section>
      )}

      <Section title={`Widget Registry ${loading ? '(loading...)' : schema ? `(${Object.keys(schema.widgets || {}).length} types)` : '(not loaded)'}`}>
        {!schema && !loading && <Muted>Switch to this tab to load the widget schema from Elementor.</Muted>}
        {schema?.widgets && Object.entries(schema.widgets as Record<string, any>).slice(0, 40).map(([name, w]) => (
          <div key={name} style={{ borderBottom: `1px solid ${S.border}`, padding: '4px 0' }}>
            <div
              onClick={() => setExpandedWidget(expandedWidget === name ? null : name)}
              style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}
            >
              <span style={{ width: 14, color: S.textMuted }}>{expandedWidget === name ? '▼' : '▶'}</span>
              <span style={{ fontWeight: 600, fontFamily: S.mono, color: S.orange, minWidth: 120 }}>{name}</span>
              <span style={{ color: S.textMuted }}>{(w as any).title}</span>
              <span style={{ fontSize: 10, color: S.textMuted }}>{(w as any).total_controls} controls</span>
            </div>
            {expandedWidget === name && (
              <div style={{ paddingLeft: 24, marginTop: 4 }}>
                {Object.keys((w as any).content_fields || {}).length > 0 && (
                  <JsonBlock label="Content Fields" data={(w as any).content_fields} />
                )}
                {Object.keys((w as any).style_fields || {}).length > 0 && (
                  <JsonBlock label="Style Fields" data={(w as any).style_fields} />
                )}
              </div>
            )}
          </div>
        ))}
      </Section>
    </div>
  )
}

function FormsTab({ enrichedScan }: { enrichedScan: any }) {
  const forms = enrichedScan?.forms || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {forms.length === 0 && <Muted>No forms detected.</Muted>}
      {forms.map((form: any, i: number) => (
        <Section key={i} title={`${form.title || 'Untitled Form'} (${form.plugin})`}>
          <KV label="Plugin" value={form.plugin} />
          <KV label="Form ID" value={form.form_id} />
          <KV label="Fields" value={form.field_count || form.fields?.length || 0} />
          {form.fields?.map((f: any, fi: number) => (
            <div key={fi} style={{ display: 'flex', gap: 8, padding: '2px 0 2px 12px', fontSize: 11 }}>
              <span style={{ color: S.textMuted }}>•</span>
              <span style={{ fontWeight: 600 }}>{f.label || f.type}</span>
              <span style={{ color: S.textMuted, fontFamily: S.mono }}>{f.type}</span>
              {f.required && <span style={{ color: S.red, fontSize: 10 }}>required</span>}
            </div>
          ))}
          {form.notifications?.map((n: any, ni: number) => (
            <KV key={`n${ni}`} label={`Notification: ${n.name}`} value={n.to || '—'} />
          ))}
        </Section>
      ))}
    </div>
  )
}

function ActionsTab({ log }: { log: Array<{ ts: Date; type: string; payload: any; result: any }> }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {log.length === 0 && <Muted>No actions executed yet. Actions will appear here as you use the chat.</Muted>}
      {[...log].reverse().map((entry, i) => (
        <div key={i} style={{ border: `1px solid ${S.border}`, borderRadius: 6, overflow: 'hidden' }}>
          <div
            onClick={() => setExpanded(expanded === i ? null : i)}
            style={{
              padding: '8px 12px', cursor: 'pointer', background: S.surface,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: entry.result?.includes('✓') || entry.result?.startsWith('Updated') || entry.result?.startsWith('Removed') || entry.result?.startsWith('Reordered') || entry.result?.startsWith('Styled') || entry.result?.startsWith('Added')
                  ? '#052e1633' : '#3b120e33',
                color: entry.result?.includes('✓') || entry.result?.startsWith('Updated') || entry.result?.startsWith('Removed') || entry.result?.startsWith('Reordered') || entry.result?.startsWith('Styled') || entry.result?.startsWith('Added')
                  ? S.green : S.red,
              }}>
                {entry.type}
              </span>
              <span style={{ fontSize: 12 }}>{entry.result?.slice(0, 60) || '...'}</span>
            </div>
            <span style={{ fontSize: 10, color: S.textMuted }}>{entry.ts.toLocaleTimeString()}</span>
          </div>
          {expanded === i && (
            <div style={{ padding: '8px 12px', background: S.bg }}>
              <JsonBlock label="Payload" data={entry.payload} />
              <div style={{ marginTop: 8, fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: S.textMuted }}>Result: </span>
                <span>{entry.result}</span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function RawTab({ siteContext, contentGraph, enrichedScan }: { siteContext: any; contentGraph: any; enrichedScan: any }) {
  const [view, setView] = useState<'context' | 'graph' | 'enriched'>('context')

  const data = view === 'context' ? siteContext : view === 'graph' ? contentGraph : enrichedScan

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['context', 'graph', 'enriched'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '4px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
            background: view === v ? S.accentDim : S.surface,
            color: view === v ? S.accent : S.textMuted,
            border: `1px solid ${view === v ? S.accent : S.border}`,
          }}>
            {v === 'context' ? 'AI Context' : v === 'graph' ? 'Content Graph' : 'Enriched Scan'}
          </button>
        ))}
      </div>
      <pre style={{
        background: S.surface, padding: 12, borderRadius: 6, overflow: 'auto',
        fontSize: 10, fontFamily: S.mono, color: S.text, lineHeight: 1.5,
        maxHeight: 'calc(100vh - 200px)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        border: `1px solid ${S.border}`,
      }}>
        {data ? JSON.stringify(data, null, 2) : 'No data available'}
      </pre>
    </div>
  )
}

// ─── Shared Components ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11, fontWeight: 700, color: S.accent, textTransform: 'uppercase',
        letterSpacing: '0.05em', marginBottom: 8, paddingBottom: 4,
        borderBottom: `1px solid ${S.border}`,
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {children}
      </div>
    </div>
  )
}

function KV({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '2px 0', fontSize: 12, alignItems: 'flex-start' }}>
      <span style={{ color: S.textMuted, minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ wordBreak: 'break-word' }}>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</span>
    </div>
  )
}

function Badge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: ok ? '#052e1633' : '#3b120e33',
      color: ok ? S.green : S.red,
      border: `1px solid ${ok ? '#16532833' : '#7f1d1d33'}`,
    }}>
      {ok ? '✓' : '✗'} {label}
    </span>
  )
}

function SectionTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    hero: '#8b5cf6', services: '#3b82f6', testimonials: '#eab308', pricing: '#22c55e',
    contact: '#f97316', faq: '#06b6d4', team: '#ec4899', cta: '#ef4444',
    stats: '#14b8a6', footer: '#6b7280', heading: '#a78bfa', content: '#71717a',
  }
  const color = colors[type] || S.textMuted

  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
      background: `${color}22`, color, textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {type}
    </span>
  )
}

function JsonBlock({ label, data }: { label: string; data: any }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: S.textMuted, marginBottom: 2 }}>{label}</div>
      <pre style={{
        background: '#0d0f14', padding: 8, borderRadius: 4, fontSize: 10,
        fontFamily: S.mono, color: '#a1a1aa', lineHeight: 1.4, overflow: 'auto',
        maxHeight: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        border: `1px solid ${S.border}`,
      }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ color: S.textMuted, fontSize: 12, padding: '20px 0', textAlign: 'center' }}>{children}</div>
}

function renderColorOrValue(key: string, value: any): any {
  if (typeof value !== 'string') return typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')
  // If it looks like a hex color, show a swatch
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 14, height: 14, borderRadius: 3, background: value, border: `1px solid ${S.border}`, display: 'inline-block' }} />
        <span style={{ fontFamily: S.mono, fontSize: 11 }}>{value}</span>
      </span>
    )
  }
  return value
}
