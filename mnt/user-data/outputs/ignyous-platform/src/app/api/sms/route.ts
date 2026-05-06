// src/app/api/sms/route.ts
// Receives webhook POSTs from ignyous-bridge plugin (FormWebhook.php)
// Validates the call, then fires an SMS via Twilio to the business owner.

import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()

    // Validate the incoming call is from a known ignyous site
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = authHeader.replace('Bearer ', '')

    // Look up the site by API key
    const { PrismaClient } = await import('@prisma/client')
    const prisma = new PrismaClient()

    const site = await prisma.site.findFirst({
      where: { wpApiKey: apiKey }
    })

    if (!site) {
      await prisma.$disconnect()
      return NextResponse.json({ error: 'Unknown site' }, { status: 404 })
    }

    const toNumber = payload.sms_to || site.smsNumber
    if (!toNumber) {
      await prisma.$disconnect()
      return NextResponse.json({ error: 'No SMS number configured' }, { status: 400 })
    }

    // Build the SMS message
    const name    = payload.name    || 'Someone'
    const phone   = payload.phone   || 'no phone'
    const email   = payload.email   || 'no email'
    const message = payload.message ? payload.message.substring(0, 100) : ''

    const smsBody = [
      `🔔 New lead — ${site.name}`,
      `Name: ${name}`,
      `Phone: ${phone}`,
      `Email: ${email}`,
      message ? `Message: ${message}` : null,
      `Form: ${payload.form_title || payload.source}`,
    ].filter(Boolean).join('\n')

    // Send SMS
    const smsResult = await twilioClient.messages.create({
      body: smsBody,
      from: process.env.TWILIO_FROM_NUMBER!,
      to:   toNumber,
    })

    // Save lead to DB
    await prisma.lead.create({
      data: {
        siteId:      site.id,
        source:      payload.source,
        formId:      payload.form_id?.toString(),
        formTitle:   payload.form_title,
        name:        payload.name,
        email:       payload.email,
        phone:       payload.phone,
        message:     payload.message,
        fields:      payload.fields || {},
        smsSent:     true,
        smsTo:       toNumber,
        smsSentAt:   new Date(),
      }
    })

    await prisma.$disconnect()

    return NextResponse.json({
      success: true,
      sms_sid: smsResult.sid,
      message: `SMS sent to ${toNumber}`,
    })

  } catch (err: any) {
    console.error('SMS webhook error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
