# Prompt 101 — Ask Aria: unlimited output (generate anything in plain English)

## What the owner actually wants
Ask Aria should work exactly like talking to Claude in chat:
- "Show me a heatmap of my busiest hours" → renders a heatmap
- "Give me a green bar chart of top products" → green bar chart
- "I want a spreadsheet of all sales last month" → downloads a CSV
- "Show me a traffic light dashboard — red if revenue is down, green if up" → renders it
- "Compare my two best cashiers side by side" → renders a comparison card
- "Help me understand my GST obligations" → gives a plain English explanation
- "Write me an email to send to my top customers" → writes the email
- "What would happen if I raised prices by 10%?" → runs the analysis

No predefined block types. No "this output type is not supported." No gaps.
Aria generates whatever output the owner asks for.

## The architecture

### How Claude in chat does it
When someone asks me to make a chart, I generate SVG or HTML code and it
renders inline. The key: I generate the *code* for the visual, not a data
structure that a pre-built component renders.

### How to do the same in Ask Aria

Add a new block type: `"live_render"` — a block containing raw HTML/SVG that
gets rendered in a sandboxed iframe inside the Ask Aria panel.

When the owner asks for any custom visual output, Aria generates the complete
HTML (with inline CSS and JS if needed) and returns it in a live_render block.
The iframe renders it. The owner sees it immediately.

This gives unlimited output capability because:
- Any chart type: generate HTML with Chart.js or inline SVG
- Any layout: generate a table, card, comparison, heatmap, whatever
- Any colour: set it in the HTML
- Any data: Aria fetches the data first, then generates HTML with the data
  embedded in it — the iframe gets static HTML with data already inside
- Download: generate an <a download> tag inside the HTML

## TASK 1 — live_render block in BlockRenderer

### New block type
```typescript
interface LiveRenderBlock {
  type: "live_render"
  html: string           // complete HTML document or fragment
  height?: number        // iframe height in px, default 400
  title?: string         // shown above the iframe as a label
  downloadable?: boolean // if true, show a "Download" button below
  download_filename?: string
}
```

### Rendering in BlockRenderer.tsx

```typescript
case "live_render": {
  const { html, height = 400, title, downloadable, download_filename } = block
  
  // Sanitize: strip <script src=> (allow inline scripts, block external)
  // Allow: inline <script>, <style>, SVG, Canvas, all HTML
  // Block: external script src, fetch() to external domains
  const sanitized = html
    .replace(/<script[^>]+src=["'][^"']*["'][^>]*>/gi, '')
    .replace(/fetch\s*\(\s*["']https?:\/\/(?!ariaos\.site)/gi, 'void(')
  
  const srcDoc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Inter, -apple-system, sans-serif; background: transparent; }
</style>
</head>
<body>${sanitized}</body>
</html>`

  return (
    <div key={i} style={{ margin: '12px 0' }}>
      {title && (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#888',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          {title}
        </div>
      )}
      <iframe
        srcDoc={srcDoc}
        style={{
          width: '100%',
          height: height,
          border: '1.5px solid #0a0a0a',
          borderRadius: 14,
          background: '#fafafa',
        }}
        sandbox="allow-scripts allow-same-origin"
        title={title ?? 'Aria output'}
      />
      {downloadable && (
        <button
          onClick={() => {
            const blob = new Blob([html], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = download_filename ?? 'aria-output.html'
            a.click()
            URL.revokeObjectURL(url)
          }}
          style={{
            marginTop: 8, padding: '6px 14px', borderRadius: 10,
            border: '1.5px solid #0a0a0a', background: '#d9f54e',
            fontWeight: 700, fontSize: 12, cursor: 'pointer'
          }}
        >
          Download
        </button>
      )}
    </div>
  )
}
```

### Security notes
- `sandbox="allow-scripts allow-same-origin"` lets inline JS run (for charts)
  but blocks popups, form submissions, top-level navigation
- The sanitize step strips external script tags and external fetch() calls
- The iframe cannot access the parent page's DOM or cookies
- Data is embedded statically in the HTML — no live DB calls from the iframe

## TASK 2 — Update Ask Aria system prompt to generate live_render blocks

In `/api/aria/ask/route.ts`, update the system prompt section that describes
available block types. Replace the existing block type list with:

```
## OUTPUT CAPABILITIES

You can produce ANY type of output the owner asks for. Use live_render blocks
to generate custom HTML/SVG visuals. Use standard blocks for simple structured
output.

### When to use live_render (unlimited custom output)
Use live_render whenever the owner asks for:
- A specific visual that doesn't fit standard block types
- A custom colour, layout, or style ("make it green", "use our brand colours")
- A heatmap, radar chart, timeline, Gantt chart, traffic light, gauge, etc.
- A complex comparison layout
- A formatted document they can save or print
- Anything where you'd naturally say "here's a custom visual for that"

For live_render, generate complete self-contained HTML with:
- Inline CSS in <style> tags
- Inline data as JavaScript variables (const data = [...])
- Chart.js via CDN for charts: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
- Or pure SVG for simple charts and diagrams
- The visual MUST work without any external data calls — embed all data inline
- Design style: clean, minimal, professional. Font: Inter. 
  Background: #fafafa. Borders: 1px solid #e5e5e5. Accents: #d9f54e (lime).

### live_render block format
{
  "type": "live_render",
  "title": "Optional label above the visual",
  "height": 350,
  "html": "<complete HTML fragment here>",
  "downloadable": true/false
}

### Standard blocks (use these for simple structured output)
- "chart": simple bar/line/pie via Recharts
- "stat_grid": 2-4 metric cards with big numbers
- "table": simple data table
- "list": bulleted list
- "callout": info/warning/success message
- "action_card": card with buttons that send follow-up messages
- "menu_list": menu items with prices (kiosk only)
- "spreadsheet": CSV download

### Plain text
For explanations, advice, writing tasks, emails, analysis in words — just
reply in the text field. No block needed unless a visual adds value.

### Examples of what you can now do

Owner: "Show me a heatmap of my sales by hour and day"
→ live_render with a colour-coded HTML table using the sales data you fetched

Owner: "Give me a traffic light dashboard — red if revenue is down vs last week, green if up"
→ live_render with 3 coloured circles + labels for key metrics

Owner: "I want a gauge chart showing my labour cost ratio"
→ live_render with an SVG gauge at the current ratio

Owner: "Make me a weekly schedule I can print"
→ live_render with a printable HTML table of the roster, height: 600, downloadable: true

Owner: "Write me a follow-up email to send to lapsed customers"
→ plain text response with the email draft

Owner: "What would happen if I raised prices by 10%?"
→ plain text analysis + live_render with a before/after comparison table

Owner: "Explain my GST obligations in plain English"
→ plain text only — no visual needed

Owner: "Show me my top 10 products in a colourful bar chart"
→ live_render with Chart.js bar chart, colours using the product categories

CRITICAL: When you generate live_render HTML, the data MUST already be embedded
in the HTML as static values. You fetch the data using your tools FIRST, then
embed it into the HTML string. The iframe cannot make database calls.
```

## TASK 3 — Give Aria access to business data for live_render generation

The key constraint: Aria must fetch the data FIRST (using existing tools/functions),
THEN generate the HTML with data embedded inline.

In the Ask Aria route, ensure the business data tools already available to Aria
include enough granularity for custom visuals:

Add a `get_hourly_sales` tool (if not already present):
```typescript
{
  name: "get_hourly_sales",
  description: "Get total sales grouped by hour of day and day of week — for heatmaps and time analysis",
  parameters: {
    date_range: { type: "string", enum: ["last_7_days", "last_30_days", "this_month", "last_month"] }
  }
}
```

Add a `get_product_sales_detail` tool:
```typescript
{
  name: "get_product_sales_detail",
  description: "Get sales quantity and revenue for every product — for charts and comparisons",
  parameters: {
    limit: { type: "number" },
    date_range: { type: "string" }
  }
}
```

Add a `get_cashier_performance` tool:
```typescript
{
  name: "get_cashier_performance",
  description: "Get sales and metrics per cashier — for leaderboards and comparisons",
  parameters: {
    date_range: { type: "string" }
  }
}
```

These tools run against the real DB and return data that Aria embeds into
the HTML it generates for live_render blocks.

## TASK 4 — Quick-reply suggestions after a live_render

After any live_render block, automatically append a small set of follow-up
suggestion chips below the block. These help the owner iterate:

- "Change the colour"
- "Download this"
- "Show me a different time period"
- "Explain what this means"
- "Show me as a table instead"

Each chip sends that text as a new message when tapped. Wire them as
action_card buttons appended after every live_render block.

## TASK 5 — Handle writing and non-visual tasks explicitly

Update the system prompt to make clear Aria handles ALL plain-English tasks:

```
## NON-VISUAL TASKS

You also handle anything that doesn't need a visual:

WRITING TASKS:
- "Write me an email to send to..." → write the email in the text response
- "Draft an SMS for my loyalty customers" → write the SMS
- "Help me respond to this negative review: [review]" → write the response
- "Write terms and conditions for my layby policy" → write them

ANALYSIS TASKS:
- "What would happen if I raised prices by 10%?" → run the numbers, explain
- "Should I hire another staff member?" → analyse labour cost ratio, revenue per staff
- "Which products should I stop stocking?" → analyse velocity and margin

ADVICE TASKS:
- "How should I handle a customer who is unhappy?" → give practical advice
- "What are my GST obligations?" → explain in plain English
- "Is my labour cost too high?" → benchmark against industry standards (AU retail: 25-35%)

TECHNICAL HELP:
- "How do I connect my Square account?" → walk them through the steps
- "The kiosk isn't working" → ask diagnostic questions, troubleshoot
- "How do I set up loyalty rewards?" → step-by-step instructions

For ALL of these: just answer in the text field. No block needed.
The owner is talking to an AI business co-owner who knows everything about
running an Australian small business and can help with anything.
```

## Commit
- "feat(ask-aria): live_render block — Aria generates arbitrary HTML/SVG for unlimited visual output"
- "feat(ask-aria): system prompt — unlimited output capability (any chart, any format, any task)"
- "feat(ask-aria): business data tools for hourly/product/cashier analysis"
- "feat(ask-aria): follow-up suggestion chips after live_render blocks"
- Then: git push origin main

## If limit runs low
1. Task 1 (live_render block in BlockRenderer) — the core rendering capability
2. Task 2 (system prompt update) — tells Aria to use it
3. Task 3 (data tools) — enables richer visuals with real data
4. Task 4 + 5 (suggestions + writing tasks) — polish

## After this ships

Test these exact prompts in Ask Aria:
1. "Show me a heatmap of my busiest hours this month"
2. "Give me a green bar chart of my top 10 products"
3. "Traffic light dashboard — red/amber/green for revenue, labour cost, stock levels"
4. "Write me an email to send to customers who haven't visited in 3 months"
5. "What would happen to my profit if I raised coffee prices by 50 cents?"
6. "Show me a comparison of this week vs last week, side by side"

Every single one of those should now work.
