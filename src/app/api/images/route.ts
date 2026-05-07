import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q') || ''
  const page  = searchParams.get('page') || '1'

  if (!query) return NextResponse.json({ images: [] })

  // Try Unsplash first
  if (process.env.UNSPLASH_ACCESS_KEY) {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=20&page=${page}&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
    )
    const data = await res.json()
    return NextResponse.json({
      images: (data.results || []).map((img: any) => ({
        id:       img.id,
        url:      img.urls.regular,
        thumb:    img.urls.small,
        full:     img.urls.full,
        alt:      img.alt_description || query,
        credit:   img.user.name,
        creditUrl: img.user.links.html,
        source:   'unsplash',
      })),
      total: data.total || 0,
    })
  }

  // Fallback: Pexels (no key needed for curated)
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&page=${page}`,
    { headers: { Authorization: process.env.PEXELS_API_KEY || '' } }
  )
  const data = await res.json()
  return NextResponse.json({
    images: (data.photos || []).map((img: any) => ({
      id:       img.id,
      url:      img.src.large,
      thumb:    img.src.medium,
      full:     img.src.original,
      alt:      img.alt || query,
      credit:   img.photographer,
      creditUrl: img.photographer_url,
      source:   'pexels',
    })),
    total: data.total_results || 0,
  })
}
