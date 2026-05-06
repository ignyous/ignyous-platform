# ignyous.ai — Full Deployment Guide
## WP Engine · Vercel · Railway

---

## WHAT YOU'RE DEPLOYING

```
┌─────────────────────────────────────────────────────┐
│  ignyous.ai platform (Vercel — FREE to start)        │
│  ├─ Next.js frontend (React UI, all the screens)     │
│  ├─ API routes (auth, WPE provisioning, Twilio SMS)  │
│  └─ Env vars: WPE API key, Twilio, Stripe etc.       │
└──────────────────┬──────────────────────────────────┘
                   │ REST API calls
┌──────────────────▼──────────────────────────────────┐
│  Your temp WP site (WP Engine)                       │
│  ├─ WordPress (installed via WPE dashboard)          │
│  ├─ Elementor Pro (installed from plugin zip)        │
│  └─ ignyous-bridge plugin (our PHP code)             │
└─────────────────────────────────────────────────────┘
                   │ POST /scan
┌──────────────────▼──────────────────────────────────┐
│  Scanner service (Railway — FREE tier)               │
│  └─ Node.js/Express (scanner.js we built)            │
└─────────────────────────────────────────────────────┘
```

**Time to complete: ~90 minutes**

---

## STEP 1 — WORDPRESS ON WP ENGINE (20 min)

### 1a. Install WordPress

1. Log into **my.wpengine.com**
2. Click **Add Site** (top right)
3. Fill in:
   - Site name: `ignyous-temp` (internal label)
   - Environment: **Production**
   - Region: US Central (or closest to you)
4. Click **Create site** — WP Engine auto-installs WordPress
5. Once provisioned (~3 min), click **WordPress Admin** to open `/wp-admin`

### 1b. Connect your domain

1. In WPE dashboard → your site → **Domains**
2. Click **Add Domain** → enter your domain (e.g. `ignyous.ai`)
3. WPE gives you two DNS values — go to your domain registrar:
   ```
   Type: CNAME
   Host: @  (or www)
   Value: [your-site].wpengine.com
   ```
4. For root domain (@), use the A record WPE provides
5. Back in WPE → Domains → click **Request Free SSL** (auto Let's Encrypt)
6. DNS propagation: 5–30 min. Check with: `dig +short yourdomain.com`

### 1c. WordPress baseline settings

In WP Admin:
- **Settings → General**: set Site Title to "ignyous.ai", URL to your domain
- **Settings → Permalinks**: choose "Post name" → Save (this enables clean REST API URLs)
- **Users → Add New**: create a second admin account as backup

---

## STEP 2 — INSTALL ELEMENTOR + IGNYOUS BRIDGE (15 min)

### 2a. Install Elementor Free (from WP.org)

1. WP Admin → **Plugins → Add New**
2. Search "Elementor"
3. Install + Activate **Elementor Website Builder** (by Elementor)

> **Elementor Pro** (paid): Get a license at elementor.com/pricing.
> Upload zip: Plugins → Add New → Upload Plugin → `elementor-pro.zip`

### 2b. Install ignyous Bridge Plugin

**Option A — via WP Admin upload (easiest):**

1. Zip up the bridge plugin folder:
   ```bash
   # On your local machine, in the project folder:
   zip -r ignyous-bridge.zip ignyous-bridge/
   ```
2. WP Admin → **Plugins → Add New → Upload Plugin**
3. Choose `ignyous-bridge.zip` → **Install Now → Activate**
4. Go to **Settings → ignyous Bridge**
5. Copy the **Connect Secret** shown — you'll use this when setting up the platform

**Option B — via WP Engine SFTP:**

WP Engine SFTP credentials:
1. WPE Dashboard → your site → **SFTP Users**
2. Click **Add SFTP User** → generate credentials
3. Connect with FileZilla or your FTP client:
   ```
   Host:     yoursite.sftp.wpengine.com
   User:     yoursite-username
   Password: [generated]
   Port:     2222
   ```
4. Navigate to: `/wp-content/plugins/`
5. Upload the entire `ignyous-bridge/` folder
6. In WP Admin → Plugins → find "ignyous Bridge" → **Activate**

**Option C — via WP-CLI (fastest if you use SSH):**

WP Engine SSH:
1. WPE Dashboard → your site → **SSH Gateway** → enable it
2. Get your SSH credentials from WPE
3. Connect:
   ```bash
   ssh yoursite@ssh.wpengine.com
   ```
4. Install the plugin:
   ```bash
   # From the WP root (/wp-content/plugins/)
   cd wp-content/plugins
   # Upload the zip via SFTP first, then:
   unzip ignyous-bridge.zip
   wp plugin activate ignyous-bridge
   ```

### 2c. Verify the Bridge is working

Test the REST API from your terminal:
```bash
curl https://yourdomain.com/wp-json/ignyous/v1/verify \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected response:
```json
{
  "success": true,
  "message": "Connection verified",
  "data": {
    "site_url": "https://yourdomain.com",
    "wp_version": "6.7",
    "plugin_version": "1.0.0"
  }
}
```

---

## STEP 3 — SCANNER SERVICE ON RAILWAY (10 min)

Railway gives you $5/month free — enough for the scanner.

### 3a. Deploy to Railway

1. Go to **railway.app** → Sign up with GitHub
2. Click **New Project → Deploy from GitHub repo**
   - OR use the CLI:
   ```bash
   npm install -g @railway/cli
   railway login
   cd ignyous-scanner/
   railway init
   railway up
   ```
3. Railway auto-detects Node.js, reads `package.json`
4. Set environment variable in Railway dashboard:
   ```
   PORT = 3400
   ```
5. Go to **Settings → Networking → Generate Domain**
   - You'll get something like: `ignyous-scanner.up.railway.app`

### 3b. Test the scanner

```bash
curl -X POST https://ignyous-scanner.up.railway.app/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourdomain.com"}'
```

You should get back the full site analysis JSON.

---

## STEP 4 — IGNYOUS PLATFORM ON VERCEL (30 min)

This is the Next.js app — the actual ignyous.ai website your users interact with.

### 4a. Create the Next.js project

```bash
npx create-next-app@latest ignyous-platform \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir

cd ignyous-platform
```

### 4b. Install dependencies

```bash
npm install \
  @anthropic-ai/sdk \
  axios \
  stripe \
  twilio \
  wpengine-js \
  jose \
  @vercel/kv \
  prisma \
  @prisma/client
```

### 4c. Project structure

```
ignyous-platform/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx              ← Landing/entry gate (our HTML converted)
│  │  ├─ builder/
│  │  │  └─ page.tsx           ← Template builder (step wizard)
│  │  ├─ bridge/
│  │  │  ├─ new/page.tsx       ← New site flow
│  │  │  └─ connect/page.tsx   ← Connect existing site flow
│  │  ├─ dashboard/
│  │  │  └─ [siteId]/page.tsx  ← Per-site chat + management
│  │  └─ api/
│  │     ├─ scan/route.ts      ← Calls Railway scanner
│  │     ├─ wordpress/route.ts ← Proxies to ignyous-bridge
│  │     ├─ provision/route.ts ← WP Engine provisioning API
│  │     ├─ sms/route.ts       ← Twilio SMS webhooks
│  │     └─ ai/route.ts        ← Claude API calls
│  └─ components/
│     ├─ Builder/              ← The template wizard components
│     ├─ Chat/                 ← AI chat interface
│     └─ Bridge/               ← New site + connect flows
├─ prisma/
│  └─ schema.prisma            ← DB: users, sites, sessions
└─ .env.local                  ← All your secrets
```

### 4d. Environment variables

Create `.env.local`:
```bash
# Anthropic (Claude API)
ANTHROPIC_API_KEY=sk-ant-...

# WP Engine Partner API (for provisioning new sites)
WPE_API_USERNAME=your-wpe-username
WPE_API_PASSWORD=your-wpe-password
WPE_ACCOUNT_ID=your-account-id

# Twilio (SMS alerts)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+15005550006

# Stripe (billing)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ignyous Scanner (Railway URL)
SCANNER_URL=https://ignyous-scanner.up.railway.app

# Database (Vercel Postgres or PlanetScale)
DATABASE_URL=postgresql://...

# Auth secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=xxx
NEXTAUTH_URL=https://yourdomain.com

# ignyous Bridge shared secret salt
BRIDGE_SECRET_SALT=xxx
```

### 4e. Core API route — WordPress proxy

Create `src/app/api/wordpress/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

// Proxies ignyous platform → ignyous-bridge plugin on client's WP site
// Keeps the client's WP API key server-side, never exposed to browser

export async function POST(req: NextRequest) {
  const { siteUrl, apiKey, endpoint, method = 'GET', body } = await req.json()

  if (!siteUrl || !apiKey || !endpoint) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 })
  }

  try {
    const response = await axios({
      method,
      url: `${siteUrl}/wp-json/ignyous/v1/${endpoint}`,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      data: body,
      timeout: 15000,
    })
    return NextResponse.json(response.data)
  } catch (err: any) {
    return NextResponse.json(
      { error: err.response?.data?.message || err.message },
      { status: err.response?.status || 500 }
    )
  }
}
```

### 4f. Core API route — Claude AI

Create `src/app/api/ai/route.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { messages, siteContext, systemPrompt } = await req.json()

  const system = systemPrompt || `You are ignyous.ai, an AI assistant that helps 
small business owners build and manage their WordPress websites. You speak plainly 
— no jargon. When asked to make changes, respond with a JSON action block that 
describes exactly what to change on the site. Always confirm what you did in 
plain English after taking action.

Current site context: ${JSON.stringify(siteContext || {})}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    messages,
  })

  return NextResponse.json({ content: response.content[0] })
}
```

### 4g. Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (from ignyous-platform/ directory)
vercel

# Follow prompts:
# - Link to existing project? No → create new
# - Project name: ignyous-platform
# - Framework: Next.js (auto-detected)
# - Root directory: ./

# Add env vars to Vercel:
vercel env add ANTHROPIC_API_KEY
vercel env add WPE_API_USERNAME
vercel env add WPE_API_PASSWORD
# ... add each one

# Deploy to production:
vercel --prod
```

**Or connect via GitHub (recommended — auto-deploys on push):**
1. Push your code to a GitHub repo
2. Go to vercel.com → Import Project → select your repo
3. Add environment variables in the Vercel dashboard
4. Every `git push main` auto-deploys

### 4h. Connect your domain to Vercel

1. Vercel dashboard → your project → **Settings → Domains**
2. Add your domain (e.g. `ignyous.ai` or `app.ignyous.ai`)
3. Vercel gives you DNS records — add them at your registrar:
   ```
   Type: CNAME
   Name: www (or app)
   Value: cname.vercel-dns.com
   ```

---

## STEP 5 — FIRST END-TO-END TEST

Once everything is deployed, test the full chain:

```bash
# 1. Scan your WP site via the platform API
curl -X POST https://yourplatform.vercel.app/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://yourwpsite.com"}'

# 2. Call the bridge directly
curl https://yourwpsite.com/wp-json/ignyous/v1/site \
  -H "Authorization: Bearer YOUR_KEY"

# 3. List all pages via the platform proxy
curl -X POST https://yourplatform.vercel.app/api/wordpress \
  -H "Content-Type: application/json" \
  -d '{
    "siteUrl": "https://yourwpsite.com",
    "apiKey": "YOUR_KEY",
    "endpoint": "pages",
    "method": "GET"
  }'
```

---

## STEP 6 — CONVERTING THE HTML UIs TO NEXT.JS COMPONENTS

Each HTML file we built maps to a Next.js page/component:

| HTML File                  | Next.js Location                        |
|----------------------------|-----------------------------------------|
| `ignyous-ai-interface.html`| `src/app/dashboard/[siteId]/page.tsx`  |
| `ignyous-builder.html`     | `src/app/builder/page.tsx`             |
| `ignyous-wp-bridge.html`   | `src/app/bridge/page.tsx`              |
| `hosting-ui.html`          | `src/components/Bridge/HostingStep.tsx`|

The CSS variables stay the same. JavaScript becomes React hooks/state.
API calls become `fetch('/api/wordpress', {...})` instead of hardcoded.

---

## QUICK REFERENCE

| Service     | URL                                    | Purpose                    |
|-------------|----------------------------------------|----------------------------|
| WP Site     | `https://yourwpdomain.com`            | Test WordPress site        |
| WP Admin    | `https://yourwpdomain.com/wp-admin`   | WordPress dashboard        |
| Bridge API  | `yourwpdomain.com/wp-json/ignyous/v1` | Plugin REST endpoints      |
| Scanner     | `ignyous-scanner.up.railway.app`      | Site analysis service      |
| Platform    | `yourapp.vercel.app`                  | ignyous.ai Next.js app     |
| WPE Dashboard| `my.wpengine.com`                    | Hosting management         |

---

## CURRENT COSTS (while building)

| Service        | Cost          | Notes                           |
|----------------|---------------|---------------------------------|
| WP Engine      | ~$30/mo       | Startup plan                    |
| Vercel         | Free          | Hobby tier covers dev easily    |
| Railway        | Free (~$5 cr) | Scanner service                 |
| Anthropic API  | Pay per use   | ~$0.003/1k tokens (Sonnet)      |
| Twilio         | $1/mo + usage | SMS ~$0.0075/text               |
| Stripe         | 2.9% + $0.30  | Only when you charge clients    |
| **Total**      | **~$30–35/mo**| **Until you get first clients** |
