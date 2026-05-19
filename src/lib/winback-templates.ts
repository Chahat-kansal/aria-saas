export const WINBACK_TEMPLATES: Record<string, { sms: string; email_subject: string; email_body: string }> = {
  at_risk: {
    sms: "Hi {first_name}, it's been {days_since_visit} days since we've seen you at {business_name}. Here's $10 off your next visit — show this text. Valid for 14 days.",
    email_subject: "We miss you at {business_name}",
    email_body: "Hi {first_name},\n\nIt's been {days_since_visit} days since you last popped in. We'd love to see you again.\n\nShow this email at the counter for $10 off your next order. Valid 14 days.\n\n— {business_name}",
  },
  hibernating: {
    sms: "{first_name}, we miss you at {business_name}! Come back this week for a free coffee on us. Reply YES to claim.",
    email_subject: "{first_name}, come back to {business_name}",
    email_body: "Hi {first_name},\n\nWe've missed you. Come in this week and we'll shout you a free coffee, on us.\n\nReply or just stop by — we'll take care of the rest.\n\n— {business_name}",
  },
  never_returned: {
    sms: "Hi {first_name}, hope you enjoyed your first visit to {business_name}. Bring a friend this week and you both get 20% off.",
    email_subject: "Bring a mate, get 20% off",
    email_body: "Hi {first_name},\n\nHope you enjoyed your first visit. This week, bring a mate and you both get 20% off your order.\n\nWe'd love to make you a regular.\n\n— {business_name}",
  },
  needs_attention: {
    sms: "Hi {first_name}, it's {business_name} here. We've got something new you'll love — pop in this week for a surprise treat on us.",
    email_subject: "Something new for you at {business_name}",
    email_body: "Hi {first_name},\n\nJust wanted to check in. We've been making some changes and we think you'll love what's new.\n\nCome in this week — we've got a little something for you.\n\n— {business_name}",
  },
}

export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}
