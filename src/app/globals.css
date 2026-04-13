import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';
import { PLUGIN_TOOLS, dispatchPlugin } from '@/lib/plugins/registry';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

  const now = new Date();
  if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
    user.messagesUsedThisMonth = 0;
    user.messagesResetAt = now;
  }
  if (user.plan === 'free' && user.messagesUsedThisMonth >= 50) {
    return new Response(JSON.stringify({ error: 'Monthly message limit reached. Upgrade to Pro.' }), { status: 429 });
  }

  const { message, conversationId, model, system, enablePlugins = true, enableWebSearch = false } = await req.json();
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-20250514';

  let conversation = conversationId
    ? await Conversation.findOne({ _id: conversationId, userId: user._id })
    : null;

  if (!conversation) {
    conversation = await Conversation.create({
      userId: user._id,
      title: message.slice(0, 60),
      messages: [],
      model: safeModel,
    });
  }

  conversation.messages.push({ role: 'user', content: message, createdAt: new Date() });
  const history = conversation.messages.slice(-40).map((m: any) => ({ role: m.role, content: m.content }));

  const safeSystem = typeof system === 'string' ? system.slice(0, 4000)
    : `You are Aria, a highly capable AI assistant with a built-in live preview panel.

CRITICAL — CODE & WEBSITE RENDERING:
When the user asks you to build, create, or show a website, webpage, landing page, app, component, or any HTML/JSX/CSS:
- Output the COMPLETE code in a single fenced code block with the correct language tag
- Use \`\`\`html for HTML files, \`\`\`jsx for React components
- The interface will automatically render your code in a live preview panel — do NOT tell the user to save or download the file
- Do NOT say "save this as an HTML file" or "open in your browser" — just output the code and it will preview instantly
- Make the code complete, beautiful, and fully functional with inline styles or Tailwind CDN

PLUGINS: You have access to weather, stocks, URL summarisation, calculations, date/time, email, and calendar plugins. Use them when relevant.

Always be helpful, concise, and accurate.`;

  // Build tools list: plugins + web search
  const tools: any[] = [];
  if (enablePlugins) tools.push(...PLUGIN_TOOLS);
  if (enableWebSearch && user.plan === 'pro') {
    tools.push({ type: 'web_search_20250305', name: 'web_search' });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullReply = '';
      const pluginResults: any[] = [];

      try {
        // Agentic loop — Claude can call multiple plugins in sequence
        const messages = [...history];
        let continueLoop = true;

        while (continueLoop) {
          continueLoop = false;

          const response = await anthropic.messages.create({
            model: safeModel,
            max_tokens: 4096,
            system: safeSystem,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            tool_choice: tools.length > 0 ? { type: 'auto' } : undefined,
          } as any);

          // Process response content blocks
          for (const block of response.content) {
            if (block.type === 'text') {
              fullReply += block.text;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: block.text })}\n\n`));
            }

            if (block.type === 'tool_use') {
              const pluginName = block.name;
              const pluginInput = block.input;

              // Notify frontend a plugin is running
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                plugin_call: { name: pluginName, input: pluginInput }
              })}\n\n`));

              // Execute the plugin
              const result = await dispatchPlugin(pluginName, pluginInput);
              pluginResults.push(result);

              // Notify frontend plugin completed
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                plugin_result: result
              })}\n\n`));

              // Add assistant message with tool use + tool result back to history
              messages.push({ role: 'assistant', content: response.content });
              messages.push({
                role: 'user',
                content: [{
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result.success
                    ? JSON.stringify(result.data)
                    : `Plugin error: ${result.error}`,
                }],
              });

              continueLoop = true; // Continue so Claude can respond using the plugin result
              break; // Process one tool at a time
            }
          }

          if (response.stop_reason === 'end_turn' && !continueLoop) break;
        }

        // Save to MongoDB
        conversation.messages.push({ role: 'assistant', content: fullReply, createdAt: new Date() });
        await conversation.save();
        user.messagesUsedThisMonth += 1;
        await user.save();

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true,
          conversationId: conversation._id.toString(),
          pluginResults,
        })}\n\n`));

      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
