import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check required env vars upfront with clear error messages
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not set in environment variables.' }, { status: 500 });
  }
  if (!process.env.STRIPE_PRO_MONTHLY_PRICE_ID) {
    return NextResponse.json({ error: 'STRIPE_PRO_MONTHLY_PRICE_ID is not set in environment variables. Add it in Vercel → Settings → Environment Variables.' }, { status: 500 });
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not set in environment variables.' }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const { priceId } = await req.json();
  const finalPriceId = priceId || process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

  if (!finalPriceId || finalPriceId.trim() === '') {
    return NextResponse.json({ error: 'Invalid price ID. Check STRIPE_PRO_MONTHLY_PRICE_ID in Vercel env vars.' }, { status: 400 });
  }

  try {
    await connectDB();
    const user = await User.findById((session.user as any).id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, name: user.name });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: finalPriceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      metadata: { userId: user._id.toString() },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

