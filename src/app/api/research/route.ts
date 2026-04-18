import { getServerSession } from 'next-auth';
import Anthropic from '@anthropic-ai/sdk';
import { authOptions } from '@/lib/auth';
import { scrapeUrl, crawlSite } from '@/lib/web';
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

export const maxDuration = 120;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const RESEARCH_SYSTEM = `You are Aria Research Mode.

You can:
- search the live web
- read and compare URLs
- crawl websites
- inspect live websites in a browser
- click, type, wait, extract text, and take screenshots

Rules:
- Prefer web_search first when the user needs current information
- Use scrape_url for reading a specific page cleanly
- Use crawl_site when the user wants multiple pages from one website
- Use browser_check_website for health/debug checks
- Use browser_open + browser_click + browser_type + browser_get_text for interactive investigation
- Be concise but thorough
- Cite which URLs you used in plain text
- If a site is blocked, say so clearly
- Never pretend to have checked a site if you did not`;

const TOOLS = [
  {
    type: 'web_search_20250305' as const,
    name: 'web_search',
  },
  {
    name: 'scrape_url',
    description: 'Fetch and extract readable content from a public URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The public URL to read' },
        includeHtml: { type: 'boolean' },
        includeLinks: { type: 'boolean' },
        screenshot: { type: 'boolean' },
      },
      required: ['url'],
    },
  },
  {
    name: 'crawl_site',
    description: 'Crawl a website and return readable content for a limited number of pages.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The website URL to crawl' },
        limit: { type: 'number', description: 'Max number of pages to crawl' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_check_website',
    description: 'Open a live website, wait for load, collect console errors, failed requests, and screenshot.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The website URL to inspect' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_open',
    description: 'Open a browser session for a URL and return a session id.',
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
    description: 'Click an element on the page using a CSS selector.',
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
    description: 'Type text into an input using a CSS selector.',
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
    description: 'Press a keyboard key on an element, such as Enter.',
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
    description: 'Wait a short amount of time in the open browser session.',
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
    description: 'Extract visible text from the current page or one selector.',
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
    description: 'Take a screenshot of the current page.',
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
    description: 'Run a simple JS expression on the page and return the result.',
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
    description: 'Close a browser session when finished.',
    input_schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
];

async function runTool(name: string, input: any) {
  switch (name) {
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

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { message, model } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const openedSessions = new Set<string>();

      try {
        let loopMessages: any[] = [
          {
            role: 'user',
            content: message,
          },
        ];

        const safeModel =
          model && [
            'claude-haiku-4-5-20251001',
            'claude-sonnet-4-5-20250929',
            'claude-opus-4-5-20251101',
          ].includes(model)
            ? model
            : 'claude-sonnet-4-5-20250929';

        for (let step = 0; step < 8; step++) {
          const response = await anthropic.messages.create({
            model: safeModel,
            max_tokens: 4096,
            system: RESEARCH_SYSTEM,
            messages: loopMessages,
            tools: TOOLS as any,
          } as any);

          const assistantContent = response.content || [];

          loopMessages.push({
            role: 'assistant',
            content: assistantContent,
          });

          let usedTool = false;

          for (const block of assistantContent) {
            if (block.type === 'text') {
              send({ text: block.text });
            }

            if (block.type === 'tool_use') {
              usedTool = true;

              try {
                const result = await runTool(block.name, block.input || {});

                if (result && typeof result === 'object' && 'sessionId' in result && (result as any).sessionId) {
                  openedSessions.add((result as any).sessionId);
                }

                loopMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: block.id,
                      content: JSON.stringify(result),
                    },
                  ],
                });

                send({
                  tool: block.name,
                  toolResult: result,
                });
              } catch (toolErr: any) {
                loopMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: block.id,
                      content: JSON.stringify({
                        error: toolErr.message || 'Tool failed',
                      }),
                    },
                  ],
                });

                send({
                  tool: block.name,
                  error: toolErr.message || 'Tool failed',
                });
              }
            }
          }

          if (!usedTool) {
            send({ done: true });
            break;
          }
        }

        for (const sessionId of openedSessions) {
          await browserClose(sessionId).catch(() => {});
        }
      } catch (err: any) {
        console.error('Research route error:', err);
        send({ error: err.message || 'Something went wrong' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
