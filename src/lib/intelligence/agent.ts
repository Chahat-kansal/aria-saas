import Anthropic from '@anthropic-ai/sdk';
import { ARIA_SYSTEM, ARIA_TOOLS, runAriaTool } from '@/lib/claudeTools';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_SYSTEM = `${ARIA_SYSTEM}

When given a goal, you:
1. Analyse what's needed
2. Break into clear numbered steps
3. Execute each step using available tools, showing your work
4. Deliver a final complete result

Format your response as:
**Goal Analysis:** [brief analysis]

**Plan:**
1. [step]
2. [step]
...

**Execution:**

[Step 1: name]
[your work for step 1]

[Step 2: name]
[your work for step 2]
...

**Final Result:**
[the complete deliverable]

Be thorough. Actually do the work at each step, don't just describe it.`;

export async function runAgentStream(
  goal: string,
  context: string | undefined,
  model: string,
  onChunk: (text: string) => void
): Promise<void> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: context ? `Goal: ${goal}\n\nContext: ${context}` : `Goal: ${goal}`,
    },
  ];

  // Agentic loop — runs until no more tool calls
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model,
      max_tokens: 16000,
      system: AGENT_SYSTEM,
      tools: ARIA_TOOLS as any,
      messages,
    });

    // Stream text chunks
    for (const block of response.content) {
      if (block.type === 'text') {
        onChunk(block.text);
      }
    }

    // If no tool calls, we're done
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    // Execute all tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      if (toolUse.type !== 'tool_use') continue;
      try {
        const result = await runAriaTool(toolUse.name, toolUse.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      } catch (err: any) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: ${err.message}`,
          is_error: true,
        });
      }
    }

    // Add assistant turn + tool results to message history
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
  }
}
