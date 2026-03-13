import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeCustomerId) {
      return Response.json([]);
    }

    const stripe = getStripe();
    const invoices = await stripe.invoices.list({
      customer: user.stripeCustomerId,
      limit: 5,
    });

    return Response.json(
      invoices.data.map((inv) => ({
        id: inv.id,
        date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
        amount: inv.amount_paid != null ? inv.amount_paid / 100 : 0,
        currency: inv.currency?.toUpperCase() || "EUR",
        status: inv.status,
        pdfUrl: inv.invoice_pdf,
      }))
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
