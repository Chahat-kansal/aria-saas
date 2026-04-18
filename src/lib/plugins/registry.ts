// ── PLUGIN REGISTRY ──────────────────────────────────────────────────────────
// Each plugin is a Claude tool definition + a server-side handler.
// Claude decides which plugin(s) to call based on the user's message.

import { scrapeUrl, crawlSite, summarisePublicUrl } from '@/lib/web';
import {
  browserOpen,
  browserClick,
  browserType,
  browserPress,
  browserWait,
  browserGetText,
  browserScreenshot,
  browserEvaluate,
  browserClose,
  browserCheckWebsite,
} from '@/lib/browser';

export interface PluginResult {
  plugin: string;
  success: boolean;
  data?: any;
  error?: string;
}

// ── TOOL DEFINITIONS (sent to Claude so it knows what's available) ────────────
export const PLUGIN_TOOLS = [
  {
    name: 'get_weather',
    description: 'Get current weather and forecast for any city or location. Use when user asks about weather, temperature, rain, forecast.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name, e.g. "London" or "New York, US"' },
        units: {
          type: 'string',
          enum: ['metric', 'imperial'],
          description: 'Temperature units. metric=Celsius, imperial=Fahrenheit. Default: metric',
        },
      },
      required: ['location'],
    },
  },
  {
    name: 'get_stock_price',
    description: 'Get current stock price and basic info for a company. Use when user asks about stock price, market cap, or ticker symbol.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol, e.g. "AAPL", "TSLA", "GOOGL"' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'summarise_url',
    description: 'Fetch and summarise the content of any public URL — webpage, article, blog post, documentation. Use when user shares a URL and wants to know what it contains.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to fetch and summarise' },
      },
      required: ['url'],
    },
  },
  {
    name: 'scrape_url',
    description: 'Read and extract the main content from a public webpage URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Public URL to scrape' },
        includeHtml: { type: 'boolean' },
        includeLinks: { type: 'boolean' },
        screenshot: { type: 'boolean' },
      },
      required: ['url'],
    },
  },
  {
    name: 'crawl_site',
    description: 'Crawl a website and extract content from multiple pages.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Website URL to crawl' },
        limit: { type: 'number', description: 'Max pages to crawl' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_check_website',
    description: 'Check a live website for console errors, failed requests, and load issues.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Live website URL' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_open',
    description: 'Open a real browser session on a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to open in a browser' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element in the open browser session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
      },
      required: ['sessionId', 'selector'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input in the open browser session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['sessionId', 'selector', 'text'],
    },
  },
  {
    name: 'browser_press',
    description: 'Press a keyboard key in the open browser session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
        key: { type: 'string' },
      },
      required: ['sessionId', 'selector', 'key'],
    },
  },
  {
    name: 'browser_wait',
    description: 'Wait in the browser session for a short time.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        ms: { type: 'number' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'browser_get_text',
    description: 'Extract text from the current page or one element in the browser session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the current browser page.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'browser_eval',
    description: 'Run a simple JavaScript expression in the browser page.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        expression: { type: 'string' },
      },
      required: ['sessionId', 'expression'],
    },
  },
  {
    name: 'browser_close',
    description: 'Close the open browser session.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression or convert units. Use for complex calculations, unit conversions, percentages, currency conversions.',
    input_schema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Math expression to evaluate, e.g. "sqrt(144) * 3.14159" or "15% of 2500"',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'get_datetime',
    description: 'Get current date, time, day of week, or timezone conversion. Use when user asks what time/date it is or needs timezone conversions.',
    input_schema: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone, e.g. "America/New_York", "Europe/London", "Asia/Tokyo". Default: UTC',
        },
        format: { type: 'string', description: 'Optional format hint like "full", "date only", "time only"' },
      },
      required: [],
    },
  },
  {
    name: 'send_email',
    description: 'Send an email via Gmail. Use when user explicitly asks to send an email. Always confirm with the user before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a Google Calendar event. Use when user asks to schedule, book, or add something to their calendar.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
        time: { type: 'string', description: 'Start time in HH:MM 24h format' },
        duration_minutes: { type: 'number', description: 'Duration in minutes. Default 60.' },
        description: { type: 'string', description: 'Optional event description or notes' },
      },
      required: ['title', 'date'],
    },
  },
] as const;

// ── PLUGIN HANDLERS ────────────────────────────────────────────────────────────

export async function handleWeather(input: { location: string; units?: string }): Promise<PluginResult> {
  const units = input.units || 'metric';
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return {
      plugin: 'get_weather',
      success: false,
      error: 'OPENWEATHER_API_KEY not configured. Add it to your environment variables to enable real weather data.',
    };
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(input.location)}&units=${units}&appid=${apiKey}`
    );
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
    const data = await res.json();

    return {
      plugin: 'get_weather',
      success: true,
      data: {
        location: `${data.name}, ${data.sys.country}`,
        temperature: `${Math.round(data.main.temp)}°${units === 'metric' ? 'C' : 'F'}`,
        feels_like: `${Math.round(data.main.feels_like)}°${units === 'metric' ? 'C' : 'F'}`,
        condition: data.weather?.[0]?.description || 'Unknown',
        humidity: `${data.main.humidity}%`,
        wind: `${data.wind.speed} ${units === 'metric' ? 'm/s' : 'mph'}`,
        visibility: data.visibility ? `${(data.visibility / 1000).toFixed(1)} km` : 'N/A',
      },
    };
  } catch (err: any) {
    return { plugin: 'get_weather', success: false, error: err.message };
  }
}

export async function handleStockPrice(input: { symbol: string }): Promise<PluginResult> {
  const symbol = input.symbol.toUpperCase();
  const apiKey = process.env.ALPHAVANTAGE_API_KEY;

  if (!apiKey) {
    return {
      plugin: 'get_stock_price',
      success: false,
      error: 'ALPHAVANTAGE_API_KEY not configured. Get a free key at alphavantage.co and add it to your environment variables.',
    };
  }

  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
    );
    const data = await res.json();
    const quote = data['Global Quote'];

    if (!quote || !quote['05. price']) {
      return { plugin: 'get_stock_price', success: false, error: `Could not find stock data for ${symbol}` };
    }

    return {
      plugin: 'get_stock_price',
      success: true,
      data: {
        symbol,
        price: `$${parseFloat(quote['05. price']).toFixed(2)}`,
        change: quote['09. change'],
        change_percent: quote['10. change percent'],
        volume: parseInt(quote['06. volume']).toLocaleString(),
        previous_close: `$${parseFloat(quote['08. previous close']).toFixed(2)}`,
        high: `$${parseFloat(quote['03. high']).toFixed(2)}`,
        low: `$${parseFloat(quote['04. low']).toFixed(2)}`,
      },
    };
  } catch (err: any) {
    return { plugin: 'get_stock_price', success: false, error: err.message };
  }
}

export async function handleSummariseUrl(input: { url: string }): Promise<PluginResult> {
  try {
    const data = await summarisePublicUrl(input.url);
    return {
      plugin: 'summarise_url',
      success: true,
      data,
    };
  } catch (err: any) {
    return { plugin: 'summarise_url', success: false, error: `Could not fetch URL: ${err.message}` };
  }
}

export async function handleScrapeUrl(input: {
  url: string;
  includeHtml?: boolean;
  includeLinks?: boolean;
  screenshot?: boolean;
}): Promise<PluginResult> {
  try {
    const data = await scrapeUrl(input.url, {
      includeHtml: !!input.includeHtml,
      includeLinks: !!input.includeLinks,
      screenshot: !!input.screenshot,
    });

    return { plugin: 'scrape_url', success: true, data };
  } catch (err: any) {
    return { plugin: 'scrape_url', success: false, error: err.message };
  }
}

export async function handleCrawlSite(input: {
  url: string;
  limit?: number;
}): Promise<PluginResult> {
  try {
    const data = await crawlSite(input.url, {
      limit: input.limit || 8,
    });

    return { plugin: 'crawl_site', success: true, data };
  } catch (err: any) {
    return { plugin: 'crawl_site', success: false, error: err.message };
  }
}

export async function handleBrowserCheckWebsite(input: { url: string }): Promise<PluginResult> {
  try {
    const data = await browserCheckWebsite(input.url);
    return { plugin: 'browser_check_website', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_check_website', success: false, error: err.message };
  }
}

export async function handleBrowserOpen(input: { url: string }): Promise<PluginResult> {
  try {
    const data = await browserOpen(input.url);
    return { plugin: 'browser_open', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_open', success: false, error: err.message };
  }
}

export async function handleBrowserClick(input: { sessionId: string; selector: string }): Promise<PluginResult> {
  try {
    const data = await browserClick(input.sessionId, input.selector);
    return { plugin: 'browser_click', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_click', success: false, error: err.message };
  }
}

export async function handleBrowserType(input: {
  sessionId: string;
  selector: string;
  text: string;
}): Promise<PluginResult> {
  try {
    const data = await browserType(input.sessionId, input.selector, input.text);
    return { plugin: 'browser_type', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_type', success: false, error: err.message };
  }
}

export async function handleBrowserPress(input: {
  sessionId: string;
  selector: string;
  key: string;
}): Promise<PluginResult> {
  try {
    const data = await browserPress(input.sessionId, input.selector, input.key);
    return { plugin: 'browser_press', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_press', success: false, error: err.message };
  }
}

export async function handleBrowserWait(input: { sessionId: string; ms?: number }): Promise<PluginResult> {
  try {
    const data = await browserWait(input.sessionId, input.ms || 2000);
    return { plugin: 'browser_wait', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_wait', success: false, error: err.message };
  }
}

export async function handleBrowserGetText(input: {
  sessionId: string;
  selector?: string;
}): Promise<PluginResult> {
  try {
    const data = await browserGetText(input.sessionId, input.selector);
    return { plugin: 'browser_get_text', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_get_text', success: false, error: err.message };
  }
}

export async function handleBrowserScreenshot(input: { sessionId: string }): Promise<PluginResult> {
  try {
    const data = await browserScreenshot(input.sessionId);
    return { plugin: 'browser_screenshot', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_screenshot', success: false, error: err.message };
  }
}

export async function handleBrowserEval(input: {
  sessionId: string;
  expression: string;
}): Promise<PluginResult> {
  try {
    const data = await browserEvaluate(input.sessionId, input.expression);
    return { plugin: 'browser_eval', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_eval', success: false, error: err.message };
  }
}

export async function handleBrowserClose(input: { sessionId: string }): Promise<PluginResult> {
  try {
    const data = await browserClose(input.sessionId);
    return { plugin: 'browser_close', success: true, data };
  } catch (err: any) {
    return { plugin: 'browser_close', success: false, error: err.message };
  }
}

export async function handleCalculate(input: { expression: string }): Promise<PluginResult> {
  try {
    const expr = input.expression
      .replace(/[^0-9+\-*/().%, sqrt sin cos tan log abs pi e\s]/gi, '')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/sin/g, 'Math.sin')
      .replace(/cos/g, 'Math.cos')
      .replace(/tan/g, 'Math.tan')
      .replace(/log/g, 'Math.log10')
      .replace(/abs/g, 'Math.abs')
      .replace(/pi/g, 'Math.PI')
      .replace(/\be\b/g, 'Math.E')
      .replace(/(\d+)%\s*of\s*(\d+)/gi, '($1/100)*$2')
      .replace(/(\d+)%/g, '($1/100)');

    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${expr})`)();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid result');

    return {
      plugin: 'calculate',
      success: true,
      data: {
        expression: input.expression,
        result: Number.isInteger(result) ? result : parseFloat(result.toFixed(10)),
      },
    };
  } catch {
    return { plugin: 'calculate', success: false, error: `Could not evaluate: ${input.expression}` };
  }
}

export async function handleGetDatetime(input: { timezone?: string; format?: string }): Promise<PluginResult> {
  try {
    const tz = input.timezone || 'UTC';
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      timeZone: tz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    };
    const formatted = new Intl.DateTimeFormat('en-US', options).format(now);

    return {
      plugin: 'get_datetime',
      success: true,
      data: { timezone: tz, datetime: formatted, utc: now.toISOString() },
    };
  } catch {
    return { plugin: 'get_datetime', success: false, error: `Invalid timezone: ${input.timezone}` };
  }
}

export async function handleSendEmail(input: { to: string; subject: string; body: string }): Promise<PluginResult> {
  const gmailToken = process.env.GMAIL_ACCESS_TOKEN;

  if (!gmailToken) {
    return {
      plugin: 'send_email',
      success: false,
      error: 'Gmail is not connected. To enable email sending, add GMAIL_ACCESS_TOKEN to your environment variables (requires Google OAuth setup with Gmail API scope).',
    };
  }

  try {
    const emailContent = [
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      input.body,
    ].join('\n');

    const encoded = Buffer.from(emailContent).toString('base64url');

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${gmailToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Gmail API error');
    }

    return {
      plugin: 'send_email',
      success: true,
      data: { to: input.to, subject: input.subject, status: 'Email sent successfully' },
    };
  } catch (err: any) {
    return { plugin: 'send_email', success: false, error: err.message };
  }
}

export async function handleCreateCalendarEvent(input: {
  title: string;
  date: string;
  time?: string;
  duration_minutes?: number;
  description?: string;
}): Promise<PluginResult> {
  const calendarToken = process.env.GOOGLE_CALENDAR_TOKEN;

  if (!calendarToken) {
    return {
      plugin: 'create_calendar_event',
      success: false,
      error: 'Google Calendar is not connected. Add GOOGLE_CALENDAR_TOKEN to your environment variables to enable calendar events.',
    };
  }

  try {
    const startTime = input.time ? `${input.date}T${input.time}:00` : `${input.date}T09:00:00`;
    const duration = input.duration_minutes || 60;

    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000);

    const event = {
      summary: input.title,
      description: input.description || '',
      start: { dateTime: start.toISOString(), timeZone: 'UTC' },
      end: { dateTime: end.toISOString(), timeZone: 'UTC' },
    };

    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${calendarToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Calendar API error');
    }

    const created = await res.json();

    return {
      plugin: 'create_calendar_event',
      success: true,
      data: {
        title: input.title,
        date: input.date,
        time: input.time || '09:00',
        duration: `${duration} minutes`,
        link: created.htmlLink,
      },
    };
  } catch (err: any) {
    return { plugin: 'create_calendar_event', success: false, error: err.message };
  }
}

// ── DISPATCH ───────────────────────────────────────────────────────────────────
export async function dispatchPlugin(name: string, input: any): Promise<PluginResult> {
  switch (name) {
    case 'get_weather':
      return handleWeather(input);
    case 'get_stock_price':
      return handleStockPrice(input);
    case 'summarise_url':
      return handleSummariseUrl(input);
    case 'scrape_url':
      return handleScrapeUrl(input);
    case 'crawl_site':
      return handleCrawlSite(input);
    case 'browser_check_website':
      return handleBrowserCheckWebsite(input);
    case 'browser_open':
      return handleBrowserOpen(input);
    case 'browser_click':
      return handleBrowserClick(input);
    case 'browser_type':
      return handleBrowserType(input);
    case 'browser_press':
      return handleBrowserPress(input);
    case 'browser_wait':
      return handleBrowserWait(input);
    case 'browser_get_text':
      return handleBrowserGetText(input);
    case 'browser_screenshot':
      return handleBrowserScreenshot(input);
    case 'browser_eval':
      return handleBrowserEval(input);
    case 'browser_close':
      return handleBrowserClose(input);
    case 'calculate':
      return handleCalculate(input);
    case 'get_datetime':
      return handleGetDatetime(input);
    case 'send_email':
      return handleSendEmail(input);
    case 'create_calendar_event':
      return handleCreateCalendarEvent(input);
    default:
      return { plugin: name, success: false, error: `Unknown plugin: ${name}` };
  }
}
