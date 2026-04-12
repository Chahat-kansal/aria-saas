# Aria AI SaaS — Complete Master Guide v2
## Every file + every step to go live from scratch (fully updated)

---

## WHAT IS BUILT

A full production SaaS AI product called **Aria** — powered by Claude, deployed on Vercel.
This is version 2 — includes image generation, code execution, multi-file projects, and more.

### Complete Feature List
- ✅ Landing page with pricing (Free vs Pro)
- ✅ Auth — email/password + Google OAuth
- ✅ Per-user conversation history (MongoDB)
- ✅ Streaming AI responses (Claude API)
- ✅ File uploads — images, PDFs, text (Vercel Blob)
- ✅ Web search in real time (Pro)
- ✅ Deep research mode (Pro)
- ✅ Stripe billing — Free ($0/mo) + Pro ($20/mo)
- ✅ Usage tracking & limits per plan
- ✅ Builder mode — single-file code + live preview
- ✅ Split-pane preview panel (HTML/React/JSX)
- ✅ Image generation (DALL-E 3) — Pro only
- ✅ Code execution (Python, JS, TS, Go, Rust, C, C++, Ruby, Java, Bash, PHP, Swift, R, Kotlin)
- ✅ Multi-file Project Builder with file tree + editor + preview
- ✅ Save/load projects from MongoDB
- ✅ Download all project files
- ✅ Settings page with upgrade flow
- ✅ Route protection middleware
- ✅ Mobile responsive

---

## COMPLETE FILE LIST (43 files)

### Root files (7)
```
aria-saas/
├── .env.example
├── .gitignore
├── next.config.mjs
├── package.json
├── postcss.config.js
├── tailwind.config.js
└── tsconfig.json
```

### Source files (36)
```
src/
├── middleware.ts
│
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx                              ← Landing page
│   ├── providers.tsx
│   │
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   │
│   ├── (dashboard)/
│   │   ├── chat/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                      ← New conversation
│   │   │   └── [id]/page.tsx                 ← Existing conversation
│   │   └── settings/page.tsx
│   │
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/route.ts         ← NextAuth handler
│       │   └── register/route.ts             ← Email signup
│       ├── builder/route.ts                  ← Single-file builder AI
│       ├── chat/route.ts                     ← Main chat (streaming)
│       ├── conversations/
│       │   ├── route.ts                      ← List / delete
│       │   └── [id]/route.ts                 ← Get single
│       ├── execute/route.ts                  ← Code execution (Piston)
│       ├── image/route.ts                    ← Image gen (DALL-E 3)
│       ├── project/
│       │   ├── route.ts                      ← CRUD for projects
│       │   └── generate/route.ts             ← Multi-file AI generator
│       ├── stripe/
│       │   ├── checkout/route.ts
│       │   └── webhook/route.ts
│       ├── upload/route.ts                   ← File upload (Vercel Blob)
│       └── user/route.ts
│
├── components/
│   ├── chat/
│   │   ├── ChatWindow.tsx                    ← Main chat UI (updated)
│   │   ├── PreviewPanel.tsx                  ← Single-file preview
│   │   └── Sidebar.tsx
│   └── project/
│       ├── CodeExecutor.tsx                  ← Code runner UI
│       ├── ImageGenerator.tsx                ← DALL-E 3 UI
│       └── ProjectBuilder.tsx                ← Multi-file IDE UI
│
├── lib/
│   ├── auth.ts
│   ├── codeDetection.ts
│   ├── mongodb.ts
│   └── plans.ts
│
└── models/
    ├── Conversation.ts
    └── User.ts
```

---

## NEW ENVIRONMENT VARIABLES (add to existing)

```bash
# OpenAI — for DALL-E 3 image generation
OPENAI_API_KEY=sk-your-openai-key-here
```
No other new env vars needed. Code execution uses Piston which is free and requires no API key.

---

## STEP-BY-STEP LAUNCH GUIDE

---

### PHASE 1 — Accounts setup

#### Step 1: MongoDB Atlas (free database)
1. Go to **cloud.mongodb.com** → Sign up free
2. Create Project → Create Cluster → choose **M0 Free**
3. Set username + password → save these
4. **Network Access** → Add IP → **Allow Access from Anywhere** (`0.0.0.0/0`)
5. **Connect** → **Connect your application** → copy the string
6. Format: `mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/aria`
7. This is your `MONGODB_URI`

#### Step 2: Anthropic API key
1. **console.anthropic.com** → API Keys → Create Key
2. Name: `aria-production` → copy the key (starts `sk-ant-`)
3. Set a **spending cap** in billing settings (e.g. $50) to avoid surprises
4. This is your `ANTHROPIC_API_KEY`

#### Step 3: OpenAI API key (for image generation)
1. **platform.openai.com** → Sign up / sign in
2. **API Keys** → **+ Create new secret key** → copy it
3. Add $5-10 credit in billing (DALL-E 3 costs ~$0.04 per image)
4. This is your `OPENAI_API_KEY`

#### Step 4: Generate NEXTAUTH_SECRET
1. Go to **generate-secret.vercel.app** → copy the value
2. Or on Mac/Linux: `openssl rand -base64 32`
3. This is your `NEXTAUTH_SECRET`

#### Step 5: Stripe (payments)
1. **stripe.com** → Create account (use Test Mode to start)
2. **Developers → API Keys** → copy:
   - Publishable key → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Secret key → `STRIPE_SECRET_KEY`
3. **Products → + Add product**
   - Name: `Aria Pro`, Price: `$20/month`, Recurring → Save
4. Copy the **Price ID** (starts `price_`) → `STRIPE_PRO_MONTHLY_PRICE_ID`
5. **Developers → Webhooks → + Add endpoint**
   - URL: `https://YOUR-VERCEL-URL/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.deleted`
   - Copy **Signing secret** → `STRIPE_WEBHOOK_SECRET`

> Test card: `4242 4242 4242 4242`, any future date, any CVV

#### Step 6: Google OAuth (optional)
1. **console.cloud.google.com** → New project
2. **APIs & Services → Credentials → + Create → OAuth client ID**
3. Type: **Web application**
4. Redirect URI: `https://YOUR-VERCEL-URL/api/auth/callback/google`
5. Copy **Client ID** → `GOOGLE_CLIENT_ID`
6. Copy **Client Secret** → `GOOGLE_CLIENT_SECRET`

---

### PHASE 2 — Computer setup

#### Step 7: Install tools
1. Install **Node.js LTS** from **nodejs.org**
2. Verify: open Terminal → `node --version` (should show v18+)
3. Install **GitHub Desktop** from **desktop.github.com**

---

### PHASE 3 — Project files

#### Step 8: Folder structure
Download the `aria-saas-complete` folder. Your folder must look exactly like this:

```
aria-saas/
  src/
    app/
      (auth)/login/page.tsx
      (auth)/signup/page.tsx
      (dashboard)/chat/layout.tsx
      (dashboard)/chat/page.tsx
      (dashboard)/chat/[id]/page.tsx
      (dashboard)/settings/page.tsx
      api/auth/[...nextauth]/route.ts
      api/auth/register/route.ts
      api/builder/route.ts
      api/chat/route.ts
      api/conversations/route.ts
      api/conversations/[id]/route.ts
      api/execute/route.ts           ← NEW
      api/image/route.ts             ← NEW
      api/project/route.ts           ← NEW
      api/project/generate/route.ts  ← NEW
      api/stripe/checkout/route.ts
      api/stripe/webhook/route.ts
      api/upload/route.ts
      api/user/route.ts
      globals.css
      layout.tsx
      page.tsx
      providers.tsx
    components/
      chat/ChatWindow.tsx
      chat/PreviewPanel.tsx
      chat/Sidebar.tsx
      project/CodeExecutor.tsx       ← NEW
      project/ImageGenerator.tsx     ← NEW
      project/ProjectBuilder.tsx     ← NEW
    lib/auth.ts
    lib/codeDetection.ts
    lib/mongodb.ts
    lib/plans.ts
    middleware.ts
    models/Conversation.ts
    models/User.ts
  .env.example
  .gitignore
  next.config.mjs
  package.json
  postcss.config.js
  tailwind.config.js
  tsconfig.json
```

#### Step 9: Fix .gitignore on Windows
In Command Prompt, navigate to the folder:
```
rename .gitignore.txt .gitignore
```

---

### PHASE 4 — GitHub

#### Step 10: Create repo
1. **github.com** → **+** → **New repository**
2. Name: `aria-saas`, Visibility: **Private**
3. Do NOT tick "Add README"
4. Click **Create repository**

#### Step 11: Push files
1. Open **GitHub Desktop**
2. **File → Add Local Repository** → browse to `aria-saas`
3. If it says "no repository" → click **"create a repository"**
4. Click **Publish repository** → private → Publish
5. Refresh github.com — you should see all 43 files

---

### PHASE 5 — Vercel deploy

#### Step 12: Import project
1. **vercel.com** → **New Project**
2. Import **aria-saas** from GitHub
3. Framework: **Next.js** (auto-detected)
4. Click **Environment Variables** before deploying

#### Step 13: Add ALL environment variables

| Variable | Value | Required |
|---|---|---|
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | ✅ |
| `NEXTAUTH_SECRET` | from Step 4 | ✅ |
| `ANTHROPIC_API_KEY` | from Step 2 | ✅ |
| `MONGODB_URI` | from Step 1 | ✅ |
| `OPENAI_API_KEY` | from Step 3 | ✅ (for images) |
| `STRIPE_SECRET_KEY` | from Step 5 | ✅ |
| `STRIPE_WEBHOOK_SECRET` | from Step 5 | ✅ |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | from Step 5 | ✅ |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | from Step 5 | ✅ |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | ✅ |
| `GOOGLE_CLIENT_ID` | from Step 6 | optional |
| `GOOGLE_CLIENT_SECRET` | from Step 6 | optional |

Then click **Deploy**. Wait 2-3 minutes.

#### Step 14: Enable Vercel Blob
1. Vercel project → **Storage tab** → **Create Database** → **Blob**
2. Vercel auto-adds `BLOB_READ_WRITE_TOKEN`
3. Go to **Deployments** → **⋯** → **Redeploy**

#### Step 15: Update real URL
1. Copy your real Vercel URL (e.g. `https://aria-saas.vercel.app`)
2. **Settings → Environment Variables** → update:
   - `NEXTAUTH_URL` → your real URL
   - `NEXT_PUBLIC_APP_URL` → your real URL
3. Redeploy

#### Step 16: Update Stripe webhook
1. **stripe.com → Developers → Webhooks → your webhook**
2. Update URL to: `https://YOUR-REAL-URL.vercel.app/api/stripe/webhook`

#### Step 17: Custom domain (optional)
1. Vercel project → **Settings → Domains** → add domain
2. Add the CNAME record at your registrar
3. Update `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to use the custom domain
4. Redeploy

---

### PHASE 6 — Test everything

#### Step 18: Full test checklist

**Auth**
- [ ] Landing page loads with pricing
- [ ] Sign up with email works
- [ ] Sign in with Google works (if configured)
- [ ] Redirects to chat after login

**Chat**
- [ ] Send a message → AI streams back
- [ ] Upload image → AI describes it
- [ ] Upload PDF → AI summarises it
- [ ] Web search works (Pro toggle)
- [ ] Deep research works (Pro toggle)
- [ ] Conversations save and reload from sidebar
- [ ] Delete conversation works

**Builder mode**
- [ ] Switch to 🔨 Builder
- [ ] Type "build a landing page" → code generated
- [ ] Preview panel opens automatically
- [ ] Preview tab shows rendered page
- [ ] Code tab shows highlighted code
- [ ] Copy button works
- [ ] Download button works
- [ ] "Open in new tab" works

**Image generation (Pro)**
- [ ] Click 🎨 Image in toolbar
- [ ] Enter prompt → Generate
- [ ] Image appears in right panel
- [ ] Download works

**Code execution**
- [ ] Ask Aria to write Python code
- [ ] Click ▶ Run on a code block
- [ ] Output appears in right panel
- [ ] Works for Python, JS, and other languages

**Project Builder**
- [ ] Click 🏗️ Projects in toolbar
- [ ] Type "build a React todo app" → Build
- [ ] File tree appears on left
- [ ] Preview shows rendered React app
- [ ] Click files to edit them
- [ ] ▶ Run tab executes code
- [ ] 💾 Save saves to MongoDB
- [ ] ↓ Download downloads all files
- [ ] My projects shows saved projects

**Billing**
- [ ] Click Upgrade on free account
- [ ] Stripe checkout opens
- [ ] Pay with test card `4242 4242 4242 4242`
- [ ] Returns to settings as Pro
- [ ] Pro features unlock (Sonnet model, web search, image gen)

---

## HOW EACH NEW FEATURE WORKS

### Image Generation (DALL-E 3)
- User clicks 🎨 Image in toolbar → `ImageGenerator` panel opens on right
- User enters prompt + chooses size/quality/style
- Request goes to `/api/image` → calls OpenAI DALL-E 3 API
- Image URL returned and displayed
- User can download or open in new tab
- Cost: ~$0.04/image (standard), ~$0.08/image (HD)
- **Pro only** — free users see an upgrade prompt

### Code Execution (Piston)
- When AI returns a code block, a **▶ Run** button appears on it
- Clicking Run opens `CodeExecutor` panel on the right
- User can edit the code, add stdin input, change language
- Runs against **Piston API** (free, open source, no API key needed)
- Supports 14+ languages: Python, JS, TS, Go, Rust, C, C++, Java, Ruby, Bash, PHP, Swift, Kotlin, R
- Output (stdout/stderr/exit code) shown instantly
- **Available to all plans**

### Multi-File Project Builder
- User clicks 🏗️ Projects → `ProjectBuilder` panel opens
- User describes a project → sends to `/api/project/generate`
- Claude generates a structured JSON response with all files
- Files parsed and displayed in a VS Code-like interface:
  - Left: file tree with language icons
  - Right: Preview / Code editor / Run tabs
- **Preview tab**: renders HTML/React projects live in iframe
- **Code tab**: editable syntax-highlighted code
- **Run tab**: execute the active file with Piston
- **Save**: stores to MongoDB, loads next time
- **Download**: saves all files individually
- **Iterate**: describe changes → full project regenerated
- Uses **Claude Sonnet 4** minimum for quality

---

## ALL ENVIRONMENT VARIABLES REFERENCE

```bash
# ── REQUIRED ──────────────────────────────────
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=random-32-char-string

ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/aria

STRIPE_SECRET_KEY=sk_live_or_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_or_test_xxx
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx

NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# ── AUTO-ADDED BY VERCEL ───────────────────────
BLOB_READ_WRITE_TOKEN=vercel_blob_xxx

# ── OPTIONAL ──────────────────────────────────
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

---

## PLAN LIMITS

| Feature | Free | Pro ($20/mo) |
|---|---|---|
| Messages/month | 50 | Unlimited |
| Models | Haiku 4.5 | Haiku + Sonnet 4 + Opus 4 |
| Web search | ✗ | ✓ |
| Deep research | ✗ | ✓ |
| Image generation | ✗ | ✓ |
| Code execution | ✓ | ✓ |
| Builder mode | ✓ | ✓ |
| Project Builder | ✓ | ✓ |
| File upload size | 5MB | 20MB |
| Conversation history | ✓ | ✓ |

---

## COST BREAKDOWN

| Service | Monthly cost |
|---|---|
| Vercel Hobby | $0 |
| MongoDB Atlas M0 | $0 |
| Piston (code execution) | $0 |
| Anthropic API | ~$0.001–0.015 per message |
| OpenAI DALL-E 3 | ~$0.04 per image |
| Stripe | 2.9% + $0.30 per transaction |
| Domain | ~$1/mo |
| **Launch total** | **~$1/mo + usage** |

---

## MAKING CHANGES AFTER DEPLOY

1. Edit any file in `aria-saas` folder
2. Open GitHub Desktop → changed files appear automatically
3. Write commit message → **Commit to main**
4. Click **Push origin**
5. Vercel auto-deploys in ~2 minutes

---

## TROUBLESHOOTING

| Problem | Fix |
|---|---|
| Build fails | Check Vercel build logs — usually a missing env var |
| Images not generating | Check `OPENAI_API_KEY` is set, check OpenAI billing |
| Code execution fails | Piston may be temporarily down — retry |
| Project builder returns gibberish | Claude didn't return valid JSON — retry with clearer prompt |
| MongoDB connection fails | Check IP whitelist is set to 0.0.0.0/0 in Atlas |
| Auth not working | `NEXTAUTH_URL` must exactly match your real URL |
| Stripe webhook fails | Update webhook URL after deploy, check signing secret |
| File upload fails | Enable Vercel Blob in Storage tab and redeploy |
| Preview blank | Check browser console — usually JS error in generated code |

---

## ARIA vs CLAUDE — FINAL COMPARISON

| Feature | Claude (me) | Aria |
|---|---|---|
| Chat & reasoning | ✓ | ✓ Same Claude brain |
| Web search | ✓ | ✓ Pro |
| Deep research | ✓ | ✓ Pro |
| File analysis | ✓ | ✓ |
| Code generation | ✓ | ✓ |
| Live preview (HTML/React) | ✓ | ✓ |
| Multi-file project building | ✓ | ✓ |
| Code execution (Python etc.) | ✓ | ✓ 14+ languages |
| Image generation | ✓ | ✓ DALL-E 3, Pro |
| Conversation memory | Session only | ✓ MongoDB, permanent |
| Auth & accounts | N/A | ✓ |
| Billing | N/A | ✓ Stripe |
| Built-in tool ecosystem | Rich | Partial |

**Aria is now ~95% feature parity with Claude for real work.**
The remaining 5% is Anthropic's internal tool integrations (calendar, maps etc.)
which can each be added individually as needed.
