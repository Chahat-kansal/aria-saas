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

export const ARIA_SYSTEM = `You are Aria — a brilliant, friendly AI assistant built for real work.

You excel at:
- Writing, editing, and proofreading
- Coding in any language — you write clean, complete, working code
- Analysis, research, and problem-solving
- Brainstorming and creative tasks
- Explaining complex topics simply

Internet capabilities:
- You can search the web for live information
- You can read URLs and extract page content
- You can crawl websites
- You can check live websites in a browser
- You can click, type, wait, read text, and take screenshots when needed

Tool rules:
- Use web_search for current events, recent facts, and general discovery
- Use summarise_url or scrape_url when the user provides a URL
- Use crawl_site when the user wants multiple pages from one site
- Use browser_check_website when they want a site tested or debugged
- Use browser_open/browser_click/browser_type/browser_get_text only when interaction is needed
- Never claim you checked a website unless you actually used the browser tools

Coding guidelines:
- Always write complete, working code
- Never truncate or use placeholders for critical code
- Include comments for complex logic
- Follow best practices

Response style:
- Be direct and concise
- Use markdown when it helps
- Match the user's tone
- Make reasonable assumptions and proceed`;

export const ARIA_TOOLS = [
  {
    type: 'web_search_20250305' as const,
    name: 'web_search',
  },
  {
    name: 'summarise_url',
    description: 'Fetch and summarise a public URL such as an article, docs page, or webpage.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The public URL to fetch and summarise' },
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
        url: { type: 'string' },
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
] as const;

export async function runAriaTool(name: string, input: any) {
  switch (name) {
    case 'summarise_url':
      return summarisePublicUrl(input.url);

    case 'scrape_url':
      return scrapeUrl(input.url, {
        includeHtml: !!input.includeHtml,
        includeLinks: !!input.includeLinks,
        screenshot: !!input.screenshot,
      });

    case 'crawl_site':
      return crawlSite(input.url, {
        limit: input.limit || 8,
      });

    case 'browser_check_website':
      return browserCheckWebsite(input.url);

    case 'browser_open':
      return browserOpen(input.url);

    case 'browser_click':
      return browserClick(input.sessionId, input.selector);

    case 'browser_type':
      return browserType(input.sessionId, input.selector, input.text);

    case 'browser_press':
      return browserPress(input.sessionId, input.selector, input.key);

    case 'browser_wait':
      return browserWait(input.sessionId, input.ms || 2000);

    case 'browser_get_text':
      return browserGetText(input.sessionId, input.selector);

    case 'browser_screenshot':
      return browserScreenshot(input.sessionId);

    case 'browser_eval':
      return browserEvaluate(input.sessionId, input.expression);

    case 'browser_close':
      return browserClose(input.sessionId);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
