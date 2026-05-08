'use client'
import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const C = {
  primary: '#1a1a4e', primaryHover: '#252566', primaryBorder: 'rgba(255,255,255,0.1)',
  gold: '#f3af00',
  text: '#1A1A2E', text2: '#6B6B8A', text3: '#A0A0C0',
  border: '#E2E2F0', surface: '#F7F7FD', white: '#FFFFFF',
  green: '#1E7B4B',
}
interface Site { id: string; url: string; name: string | null; connectedAt: string }
function siteSlug(u: string) { return u.replace(/^https?:\/\//, '').replace(/\/$/, '') }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router   = useRouter()
  const path     = usePathname()
  const [sites, setSites]         = useState<Site[]>([])
  const [showMenu, setShowMenu]   = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
    if (status === 'authenticated') loadSites()
  }, [status])

  async function loadSites() {
    try {
      const res = await fetch('/api/sites')
      const data = await res.json()
      if (data.sites?.length > 0) { setSites(data.sites); return }
    } catch {}
    try {
      const stored = JSON.parse(localStorage.getItem('ignyous_sites') || '[]')
      setSites(stored.map((url: string) => {
        const k = `ignyous_conn_${url.replace(/[^a-z0-9]/gi, '_')}`
        const d = JSON.parse(localStorage.getItem(k) || '{}')
        return { id: url, url, name: null, connectedAt: new Date(d.savedAt || Date.now()).toISOString() }
      }).filter((s: any) => s.url))
    } catch {}
  }

  const currentSite = sites.find(s => path.includes(encodeURIComponent(s.url)) || path.includes(s.url.replace(/^https?:\/\//,'')))

  if (status === 'loading') return (
    <div style={{ minHeight:'100vh', background:C.surface, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:40, height:40, border:`3px solid ${C.border}`, borderTopColor:C.primary, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
  if (status === 'unauthenticated') return null

  const W = collapsed ? 64 : 230

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:'Poppins, sans-serif' }}>
      <style>{`
        *{font-family:Poppins,sans-serif!important;font-weight:500;}
        h1,h2,h3,h4,h5,h6{font-weight:700!important;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(26,26,78,.15);border-radius:4px}
        button{transition:all 0.15s ease!important;}
        button:not(:disabled):hover{filter:brightness(0.88);transform:translateY(-1px);}
        button:not(:disabled):active{transform:scale(0.96)!important;filter:brightness(0.8)!important;}
        a[href]{transition:opacity 0.15s ease;}
        a[href]:hover{opacity:0.8;}
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width:W, flexShrink:0, background:C.primary, display:'flex', flexDirection:'column' as const, position:'sticky', top:0, height:'100vh', overflowY:'auto', overflowX:'hidden', transition:'width .2s ease' }}>
        <div style={{ padding:'16px 12px', borderBottom:`1px solid ${C.primaryBorder}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, minHeight:60 }}>
          {!collapsed && (
            <div style={{ display:'flex', alignItems:'center', gap:9, overflow:'hidden' }}>
              <div style={{ width:32, height:32, background:C.gold, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="#1a1a4e"><path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/></svg>
              </div>
              <span style={{ fontSize:18, fontWeight:700, color:'white', whiteSpace:'nowrap' as const }}>ignyous<span style={{ color:C.gold }}>.ai</span></span>
            </div>
          )}
          {collapsed && (
            <div style={{ width:32, height:32, background:C.gold, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="#1a1a4e"><path d="M8 1L2 5v6l6 4 6-4V5L8 1zm0 2l4 2.7V11L8 13.4 4 11V5.7L8 3z"/></svg>
            </div>
          )}
          <button onClick={() => setCollapsed(c=>!c)} title={collapsed?'Expand':'Collapse'} style={{ background:'rgba(255,255,255,0.08)', border:'none', borderRadius:7, width:26, height:26, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.5)', flexShrink:0, fontSize:12 }}>
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {!collapsed && <div style={{ padding:'16px 14px 5px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase' as const, letterSpacing:'0.1em' }}>My Sites</div>}

        <div style={{ flex:1, overflowY:'auto' }}>
          {sites.length===0 && !collapsed && <div style={{ padding:'8px 14px', fontSize:13, color:'rgba(255,255,255,0.3)' }}>No sites connected yet</div>}
          {sites.map(site => {
            const slug   = siteSlug(site.url)
            const active = path.includes(encodeURIComponent(site.url)) || path.includes(slug)
            return (
              <Link key={site.id} href={`/dashboard?site=${encodeURIComponent(site.url)}&key=`} title={collapsed?(site.name||slug):''} style={{
                display:'flex', alignItems:'center', gap:collapsed?0:10, padding:collapsed?'10px 0':'9px 14px',
                justifyContent:collapsed?'center':'flex-start', textDecoration:'none', transition:'background 0.15s',
                background:active?'rgba(243,175,0,0.13)':'transparent', borderLeft:`3px solid ${active?C.gold:'transparent'}`,
              }}
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=C.primaryHover }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}
              >
                <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, background:active?C.gold:'rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🌐</div>
                {!collapsed && <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:active?'white':'rgba(255,255,255,0.8)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{site.name||slug}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{slug}</div>
                </div>}
                {!collapsed && <div style={{ width:7, height:7, borderRadius:'50%', background:C.green, flexShrink:0 }}/>}
              </Link>
            )
          })}
          <Link href="/bridge/connect" title={collapsed?'Connect a site':''} style={{
            display:'flex', alignItems:'center', gap:collapsed?0:10, padding:collapsed?'10px 0':'9px 14px',
            justifyContent:collapsed?'center':'flex-start', textDecoration:'none', color:'rgba(255,255,255,0.4)', fontSize:13, transition:'color 0.15s',
          }}
            onMouseEnter={e=>(e.currentTarget.style.color='white')}
            onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.4)')}
          >
            <div style={{ width:30, height:30, borderRadius:8, border:'1.5px dashed rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>+</div>
            {!collapsed && <span>Connect a site</span>}
          </Link>
        </div>

        <div style={{ borderTop:`1px solid ${C.primaryBorder}`, padding:'8px 0' }}>
          {[{icon:'📋',label:'Activity Log',href:'/activity'},{icon:'⚙',label:'Settings',href:'/settings'},{icon:'❓',label:'Help',href:'/help'}].map(item=>(
            <Link key={item.href} href={item.href} title={collapsed?item.label:''} style={{
              display:'flex', alignItems:'center', gap:collapsed?0:10, padding:collapsed?'10px 0':'9px 14px',
              justifyContent:collapsed?'center':'flex-start', textDecoration:'none', color:'rgba(255,255,255,0.4)', fontSize:13, transition:'color 0.15s',
            }}
              onMouseEnter={e=>(e.currentTarget.style.color='white')}
              onMouseLeave={e=>(e.currentTarget.style.color='rgba(255,255,255,0.4)')}
            >
              <span style={{ fontSize:18, flexShrink:0 }}>{item.icon}</span>{!collapsed&&item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:'flex', flexDirection:'column' as const, minWidth:0 }}>
        {/* Topbar — no Content Scheduler here, it lives in the site strip */}
        <div style={{ height:60, background:C.primary, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', position:'sticky', top:0, zIndex:50, boxShadow:'0 2px 16px rgba(26,26,78,0.25)' }}>
          <div style={{ fontSize:15, fontWeight:500, color:'rgba(255,255,255,0.65)', display:'flex', alignItems:'center', gap:8 }}>
            {currentSite ? <>
              <span style={{ color:'rgba(255,255,255,0.35)' }}>Sites</span>
              <span style={{ color:'rgba(255,255,255,0.2)' }}>/</span>
              <span style={{ fontWeight:700, color:'white' }}>{currentSite.name || siteSlug(currentSite.url)}</span>
            </> : <span style={{ fontWeight:700, color:'white' }}>Dashboard</span>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button style={{ width:38, height:38, borderRadius:9, border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.08)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, position:'relative' }}>
              🔔<div style={{ position:'absolute', top:7, right:7, width:7, height:7, borderRadius:'50%', background:C.gold, border:'1.5px solid #1a1a4e' }}/>
            </button>
            <div style={{ position:'relative' }}>
              <button onClick={()=>setShowMenu(!showMenu)} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px 5px 5px', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, background:'rgba(255,255,255,0.08)', cursor:'pointer' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:C.gold, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700, color:'#1a1a4e' }}>
                  {(session?.user?.name||session?.user?.email||'U')[0].toUpperCase()}
                </div>
                <span style={{ fontSize:14, fontWeight:600, color:'white', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                  {session?.user?.name||session?.user?.email?.split('@')[0]}
                </span>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="rgba(255,255,255,0.5)"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>
              </button>
              {showMenu && (
                <div style={{ position:'absolute', top:'100%', right:0, marginTop:8, background:C.white, border:`1px solid ${C.border}`, borderRadius:14, boxShadow:'0 8px 32px rgba(26,26,78,0.15)', minWidth:200, zIndex:100, overflow:'hidden' }}>
                  <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:15, fontWeight:700, color:C.text }}>{session?.user?.name||'Account'}</div>
                    <div style={{ fontSize:12, color:C.text3, marginTop:2 }}>{session?.user?.email}</div>
                  </div>
                  {[{label:'Account Settings',icon:'⚙',href:'/settings'},{label:'Billing',icon:'💳',href:'/billing'},{label:'Help & Support',icon:'❓',href:'/help'}].map(item=>(
                    <Link key={item.href} href={item.href} onClick={()=>setShowMenu(false)} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 18px', textDecoration:'none', color:C.text, fontSize:14, transition:'background 0.1s' }}
                      onMouseEnter={e=>(e.currentTarget.style.background=C.surface)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    ><span style={{ fontSize:16 }}>{item.icon}</span>{item.label}</Link>
                  ))}
                  <div style={{ borderTop:`1px solid ${C.border}` }}>
                    <button onClick={()=>signOut({callbackUrl:'/login'})} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 18px', background:'none', border:'none', cursor:'pointer', color:'#B91C1C', fontSize:14, fontWeight:600, textAlign:'left' as const }}>
                      <span style={{ fontSize:16 }}>🚪</span> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={{ flex:1, background:C.white }}>{children}</div>
      </div>
    </div>
  )
}
