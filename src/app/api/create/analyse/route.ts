import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { description, features } = await req.json()

  const resp = await anthropic.messages.create({
    model: 'claude-sonnet-4-6', max_tokens: 400,
    messages: [{ role: 'user', content:
      `Analyse this site description and write a 2-sentence summary of what we'll build.\n` +
      `Description: "${description}"\n` +
      `Selected features: ${features.join(', ') || 'basic site'}\n\n` +
      `Return ONLY a JSON object (no markdown):\n` +
      `{"summary":"2 sentences describing what we'll build and for whom","niche":"e.g. fitness studio","audience":"e.g. women 25-45","tone":"e.g. modern and empowering","suggestedName":"e.g. FlowFit Studio","colorScheme":"e.g. teal and warm white","keyPages":["Home","About","Classes","Pricing","Contact"]}`
    }],
  })

  const raw  = resp.content[0].type === 'text' ? resp.content[0].text : '{}'
  let data: any = {}
  try { data = JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch {}

  return NextResponse.json(data)
}
