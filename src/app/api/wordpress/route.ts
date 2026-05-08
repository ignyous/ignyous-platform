import { NextRequest, NextResponse } from 'next/server'
import axios, { AxiosError } from 'axios'

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, apiKey, endpoint, method = 'GET', body } = await req.json()

    if (!siteUrl || !apiKey || !endpoint) {
      return NextResponse.json(
        { error: 'siteUrl, apiKey, and endpoint are required' },
        { status: 400 }
      )
    }

    const cleanEndpoint = endpoint.replace(/^\/+/, '').replace(/\.\./g, '')
    
    // Categories use WP native REST API (public, no auth needed)
    const isCategories = cleanEndpoint === 'categories'
    const url = isCategories
      ? `${siteUrl.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100&orderby=count&order=desc`
      : `${siteUrl.replace(/\/$/, '')}/wp-json/ignyous/v1/${cleanEndpoint}`

    const response = await axios({
      method: method.toUpperCase(),
      url,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: body || undefined,
      timeout: 60000,
    })

    // Normalize categories response
    if (isCategories && Array.isArray(response.data)) {
      return NextResponse.json({
        categories: response.data.map((c: any) => ({ id: c.id, name: c.name, count: c.count, slug: c.slug }))
      })
    }
    return NextResponse.json(response.data)

  } catch (err) {
    const axiosErr = err as AxiosError<{ message?: string }>
    const status = axiosErr.response?.status || 500
    const message = axiosErr.response?.data?.message || axiosErr.message || 'Unknown error'
    return NextResponse.json({ error: message }, { status })
  }
}