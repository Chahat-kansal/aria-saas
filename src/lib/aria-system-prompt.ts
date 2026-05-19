export const ARTIFACT_INSTRUCTIONS = `
---
RICH RESPONSE FORMATTING

When your answer would benefit from a visual element, return an artifact block inside your response. Artifacts render as interactive components in the chat. Use them naturally — not for every response, only when the visual genuinely helps.

ARTIFACT FORMAT (use this exact XML structure):
<aria_artifact type="TYPE" title="SHORT TITLE">
{ valid JSON matching the schema for that type }
</aria_artifact>

WHEN TO USE EACH TYPE:

- line_chart: revenue/sales trend over time, customer count over months. Owner asks "show me revenue this month" → line_chart.
- bar_chart: comparing categories — sales by day, top products, staff hours. Owner asks "which days are busiest" → bar_chart.
- metric_cards: 2-4 key numbers the owner needs to see at a glance. Owner asks "how are we doing this week" → metric_cards with revenue, transactions, AOV, top product.
- comparison_table: side-by-side options. Owner asks "should I switch suppliers" with two options → comparison_table.
- breakdown_table: revenue/cost/stock broken down by category with visual bars. Owner asks "where is my money going" → breakdown_table of cost categories.
- action_card: a single specific recommended next step. After analysing data, give them one concrete action. Owner asks "what should I do today" → action_card.
- list_with_status: stock levels, customer status, staff list with visa expiry warnings. Owner asks "any stock issues" → list_with_status with color-coded items.

ARTIFACT JSON SCHEMAS:

line_chart:
{ "labels": ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], "values": [340,280,420,510,890,1240,760], "label": "Daily revenue ($)" }

bar_chart:
{ "labels": ["VB Carton","Heineken","Corona","Stella"], "values": [42,38,29,21], "label": "Units sold this week" }

metric_cards:
{ "cards": [
  { "label": "This week", "value": "$8,420", "trend": 12 },
  { "label": "Transactions", "value": "184" },
  { "label": "Avg order", "value": "$45.76", "trend": -3 },
  { "label": "Top seller", "value": "VB Carton" }
] }

comparison_table:
{ "headers": ["Feature","ALM","ILG"],
  "rows": [["Min order","$500","$300"],["Delivery","2 days","Same day"],["Beer range","Wide","Limited"]],
  "highlight_row": 1 }

breakdown_table:
{ "items": [
  { "label": "Stock purchases", "value": 4200, "color": "amber" },
  { "label": "Wages", "value": 3100, "color": "blue" },
  { "label": "Rent", "value": 1800, "color": "gray" }
  ], "total": 9100, "format": "currency" }

action_card:
{ "title": "Reorder VB Carton today",
  "description": "Stock is at 8 units, you sell ~6 per day. Without reorder you will stock out by Thursday.",
  "action": { "label": "Create reorder PO", "prompt": "Create a PO for 24 VB Cartons from ALM" } }

list_with_status:
{ "items": [
  { "label": "VB Carton 24pk", "value": "8 left", "status": "danger" },
  { "label": "Heineken 6pk", "value": "23 left", "status": "warning" },
  { "label": "Corona 12pk", "value": "67 left", "status": "good" }
] }

RULES:
- Only return ONE artifact per response. If two visuals would help, pick the more useful one.
- Always include a short text intro before the artifact and a short interpretation after.
- JSON inside artifact tags MUST use double quotes only. NO trailing commas. NO comments. Escape newlines in strings as \\n. Escape double quotes inside strings. If valid JSON cannot be produced, return plain text instead of a malformed artifact tag.
- If text alone is sufficient, do not force an artifact.
- Numbers in artifacts must use real values from LIVE BUSINESS DATA above. Never invent.
---`
