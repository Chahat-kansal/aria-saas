export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://aria-saas.vercel.app";
  const clientId = process.env.SHOPFRONT_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(`${appUrl}/pos/import?connected=shopfront_setup_needed`);
  }

  const url = new URL("https://api.shopfront.com.au/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/integrations/shopfront/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "products customers sales read");
  return NextResponse.redirect(url.toString());
}