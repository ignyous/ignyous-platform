'use client'

interface Props {
  onSelect: (mode: 'easy' | 'advanced') => void
}

export default function ModePicker({ onSelect }: Props) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #0f0f2e 0%, #1a1a4e 50%, #0d1b3e 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Poppins, sans-serif', padding: 24,
    }}>
      {/* Stars background effect */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: Math.random() * 2 + 1,
            height: Math.random() * 2 + 1,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.4)',
            top: `${Math.random() * 100}%`,
            left: `${Math.random() * 100}%`,
            animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
            animationDelay: `${Math.random() * 3}s`,
          }} />
        ))}
      </div>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 48, position: 'relative' }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>
          ignyous<span style={{ color: '#f3af00' }}>.ai</span>
        </div>
        <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', marginTop: 8, fontWeight: 400 }}>
          How would you like to work?
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 740, width: '100%', position: 'relative' }}>

        {/* Easy Mode */}
        <button onClick={() => onSelect('easy')} style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          borderRadius: 20, padding: '36px 32px',
          cursor: 'pointer', textAlign: 'left',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(12px)',
          position: 'relative', overflow: 'hidden',
        }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(243,175,0,0.1)'
            e.currentTarget.style.borderColor = '#f3af00'
            e.currentTarget.style.transform = 'translateY(-4px)'
            e.currentTarget.style.boxShadow = '0 20px 48px rgba(243,175,0,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 16 }}>✨</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white', marginBottom: 10 }}>Easy Mode</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, fontWeight: 400 }}>
            Just chat with your AI assistant. Tell it what you want in plain English — it handles everything. Perfect for business owners who want results without the technical details.
          </div>
          <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Plain English', 'Guided steps', 'No setup'].map(tag => (
              <span key={tag} style={{ background: 'rgba(243,175,0,0.15)', color: '#f3af00', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(243,175,0,0.3)' }}>{tag}</span>
            ))}
          </div>
          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 8, color: '#f3af00', fontSize: 14, fontWeight: 600 }}>
            Get started <span style={{ fontSize: 18 }}>→</span>
          </div>
        </button>

        {/* Advanced Mode */}
        <button onClick={() => onSelect('advanced')} style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          borderRadius: 20, padding: '36px 32px',
          cursor: 'pointer', textAlign: 'left',
          transition: 'all 0.2s ease',
          backdropFilter: 'blur(12px)',
          position: 'relative', overflow: 'hidden',
        }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.12)'
            e.currentTarget.style.borderColor = '#818cf8'
            e.currentTarget.style.transform = 'translateY(-4px)'
            e.currentTarget.style.boxShadow = '0 20px 48px rgba(99,102,241,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 16 }}>⚡</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'white', marginBottom: 10 }}>Advanced Editing</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, fontWeight: 400 }}>
            Full control with a live site preview, activity log, plugin management, and real-time editing. For power users who want visibility into every change.
          </div>
          <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {['Live preview', 'Full control', 'All tools'].map(tag => (
              <span key={tag} style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.3)' }}>{tag}</span>
            ))}
          </div>
          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 8, color: '#818cf8', fontSize: 14, fontWeight: 600 }}>
            Open dashboard <span style={{ fontSize: 18 }}>→</span>
          </div>
        </button>
      </div>

      <div style={{ marginTop: 28, color: 'rgba(255,255,255,0.3)', fontSize: 13, position: 'relative' }}>
        You can switch anytime in Settings
      </div>

      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.4); }
        }
      `}</style>
    </div>
  )
}
