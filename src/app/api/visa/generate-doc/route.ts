import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const DOC_PROMPTS: Record<string, (client: any) => string> = {
  cover_letter: (c) => `Write a professional cover letter for a ${c.visa_type || 'visa'} application for ${c.full_name}, a ${c.nationality || 'foreign'} national. The letter should address the Department of Home Affairs, briefly introduce the applicant, state the visa being applied for, and confirm all documents are enclosed. Use formal Australian English. Keep it to one page.`,

  statutory_declaration: (c) => `Draft a statutory declaration template for ${c.full_name} for use in an Australian immigration matter. Include the standard declaration wording under the Statutory Declarations Act 1959, a section for the declarant's personal details, a body section with placeholder text, and the signature block with witness fields.`,

  skills_checklist: (c) => `Create a detailed skills assessment checklist for ${c.full_name} applying for a ${c.visa_type || 'skills-tested'} visa. List all documents typically required by the relevant assessing authority, organised by category (identity, qualifications, employment, English). Format as a checklist with checkboxes.`,

  sponsorship_checklist: (c) => `Create an employer sponsorship checklist for a ${c.visa_type || '482 TSS'} visa application. Cover Standard Business Sponsorship (SBS) application documents, nomination documents, and visa application documents. Format as a numbered checklist with categories.`,

  character_reference: (c) => `Draft a character reference template for ${c.full_name} for use in an Australian visa application. The reference should be written from the perspective of a professional contact, address the person's character, integrity, and community standing, and be suitable for submission to the Department of Home Affairs.`,
};

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { document_type, client_id } = await req.json();
  if (!document_type) return NextResponse.json({ error: 'document_type is required' }, { status: 400 });

  let client: any = { full_name: 'the applicant', visa_type: '', nationality: '' };
  if (client_id) {
    const { data } = await supabase.from('visa_clients').select('*').eq('id', client_id).single();
    if (data) client = data;
  }

  const promptFn = DOC_PROMPTS[document_type];
  if (!promptFn) return NextResponse.json({ error: 'Unknown document type' }, { status: 400 });

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: promptFn(client) }],
  });

  const content = (msg.content[0] as any).text;
  return NextResponse.json({ content, document_type, client_name: client.full_name });
}