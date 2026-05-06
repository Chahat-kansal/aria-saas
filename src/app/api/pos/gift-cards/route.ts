export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from("user_active_business").select("business_id").eq("user_id", userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from("businesses").select("id").eq("user_id", userId).eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ gift_cards: [] });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.toUpperCase().trim();

  if (code) {
    const { data: card, error } = await supabase.from("pos_gift_cards").select("id,code,current_balance,initial_balance,recipient_name,expires_at,is_active,last_used_at,customer_id").eq("business_id", bid).eq("code", code).maybeSingle();
    if (error?.code === "42P01") return NextResponse.json({ valid: false, error: "Gift cards not set up" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!card) return NextResponse.json({ valid: false, error: "Gift card not found" });
    if (!card.is_active) return NextResponse.json({ valid: false, error: "Gift card is cancelled" });
    if (card.expires_at && new Date(card.expires_at) < new Date()) return NextResponse.json({ valid: false, error: "Gift card has expired" });
    if ((card.current_balance ?? 0) <= 0) return NextResponse.json({ valid: false, error: "Gift card has no balance" });
    return NextResponse.json({ valid: true, gift_card: card });
  }

  const { data, error } = await supabase.from("pos_gift_cards").select("*").eq("business_id", bid).order("created_at", { ascending: false });
  if (error?.code === "42P01") return NextResponse.json({ gift_cards: [] });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift_cards: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const code = (body.code ? String(body.code).toUpperCase().trim() : generateCode());
  const balance = parseFloat(body.balance ?? body.initial_balance ?? 0);

  const payload: Record<string, unknown> = {
    business_id: bid, code, current_balance: balance, initial_balance: balance, is_active: true,
  };
  if (body.recipient_name) payload.recipient_name = body.recipient_name;
  if (body.expires_at) payload.expires_at = body.expires_at;
  if (body.customer_id) payload.customer_id = body.customer_id;

  const { data, error } = await supabase.from("pos_gift_cards").insert(payload).select().single();
  if (error?.code === "42P01") return NextResponse.json({ error: "Run migration first" }, { status: 500 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift_card: data }, { status: 201 });
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const allowed: Record<string, unknown> = {};

  if (body.deduct !== undefined) {
    const charge = parseFloat(String(body.deduct));
    const { data: card } = await supabase.from("pos_gift_cards").select("current_balance").eq("id", id).eq("business_id", bid).single();
    const newBalance = Math.max(0, (card?.current_balance ?? 0) - charge);
    allowed.current_balance = newBalance;
    allowed.last_used_at = new Date().toISOString();
    allowed.is_active = newBalance > 0;
  }
  if (body.balance !== undefined) allowed.current_balance = parseFloat(body.balance);
  if (body.is_active !== undefined) allowed.is_active = body.is_active;
  if (body.recipient_name !== undefined) allowed.recipient_name = body.recipient_name;
  if (body.expires_at !== undefined) allowed.expires_at = body.expires_at;

  const { data, error } = await supabase.from("pos_gift_cards").update(allowed).eq("id", id).eq("business_id", bid).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ gift_card: data });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: "No business" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("pos_gift_cards").delete().eq("id", id).eq("business_id", bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}