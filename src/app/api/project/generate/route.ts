import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MULTIFILE_SYSTEM = `You are Aria Project Builder — an expert full-stack developer who generates complete multi-file projects.

When asked to build a project, respond with a structured JSON object containing all project files.

ALWAYS respond with this exact format and nothing else:
{
  "name": "Project Name",
  "description": "Brief description",
  "framework": "react|html|nextjs|vue|node",
  "files": [
    {
      "name": "filename.ext",
      "path": "/filename.ext",
      "language": "html|css|javascript|typescript|jsx|tsx|json|python|markdown",
      "content": "complete file content here"
    }
  ],
  "instructions": "How to run this project in 2-3 sentences"
}

Rules:
- Write COMPLETE, fully working code — no placeholders, no TODOs
- Include ALL files needed (HTML, CSS, JS, package.json, README etc.)
- Make UIs beautiful — proper styling, colors, hover states, responsive
- For React projects: include package.json, src/App.jsx, src/index.css, index.html
- For Node projects: include package.json, index.js/server.js, README.md
- For HTML projects: include index.html (with inline or separate CSS/JS)
- Maximum 20 files per project
- Each file content must be a complete, valid file
- Use Tailwind CDN for HTML projects when styling is needed
- Use modern ES6+ JavaScript

Common project structures:
- React App: index.html, package.json, src/App.jsx, src/main.jsx, src/index.css
- Landing Page: index.html, style.css, script.js
- Node API: package.json, server.js, routes/api.js, .env.example, README.md
- Dashboard: index.html, css/style.css, js/main.js, js/charts.js`;

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
    return new Response(JSON.stringify({ error: 'Monthly limit reached. Upgrade to Pro.' }), { status: 429 });
  }

  const { prompt, model, existingProject } = await req.json();
  if (!prompt?.trim()) return new Response(JSON.stringify({ error: 'Prompt required' }), { status: 400 });

  const safeModel = ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'].includes(model)
    ? model : 'claude-sonnet-4-20250514'; // Project builder always uses Sonnet minimum

  const messages: any[] = [];

  // If iterating on existing project, include context
  if (existingProject) {
    const fileList = existingProject.files.map((f: any) => `${f.path}: ${f.content.slice(0, 200)}...`).join('\n');
    messages.push({
      role: 'user',
      content: `I have an existing project called "${existingProject.name}" with these files:\n${fileList}\n\nPlease ${prompt}. Return the complete updated project JSON.`,
    });
  } else {
    messages.push({ role: 'user', content: prompt });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullReply = '';
      try {
        const claudeStream = await anthropic.messages.stream({
          model: safeModel,
          max_tokens: 8192,
          system: MULTIFILE_SYSTEM,
          messages,
        });

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullReply += chunk.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
          }
        }

        // Parse the JSON project from the response
        let project = null;
        try {
          const jsonMatch = fullReply.match(/\{[\s\S]*\}/);
          if (jsonMatch) project = JSON.parse(jsonMatch[0]);
        } catch {
          project = null;
        }

        user.messagesUsedThisMonth += 1;
        await user.save();

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, project })}\n\n`));
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
