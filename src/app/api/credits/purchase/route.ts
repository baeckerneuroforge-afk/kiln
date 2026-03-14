import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { CREDIT_PACKAGES } from "@/lib/credits";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { packageId } = await request.json();
    const pkg = CREDIT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return Response.json({ error: "Invalid package" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return Response.json({ error: "User not found" }, { status: 404 });

    const stripe = getStripe();

    // Create a one-time Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: user.stripeCustomerId || undefined,
      customer_email: !user.stripeCustomerId ? user.email : undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: pkg.price * 100,
            product_data: {
              name: `KILN AI Credits — ${pkg.label}`,
              description: `${pkg.credits} AI credits for your KILN agents`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "credit_purchase",
        userId,
        packageId: pkg.id,
        credits: String(pkg.credits),
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing&credits=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
