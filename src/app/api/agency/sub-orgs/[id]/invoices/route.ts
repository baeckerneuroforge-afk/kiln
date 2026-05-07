/**
 * GET /api/agency/sub-orgs/[id]/invoices — last 12 months of invoices
 * for this sub-org (paid + open + void). Pulled from the local
 * SubOrgInvoice mirror that's populated by Stripe webhooks — no
 * Stripe round-trip needed.
 *
 * Auth: see @/lib/agency/sub-org-auth.
 */
import { prisma } from "@/lib/prisma";
import { requireSubOrgAccess } from "@/lib/agency/sub-org-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const access = await requireSubOrgAccess(params.id);
  if (!access.ok) return access.response;
  const orgId = access.relationship.childOrgId;

  const since = new Date();
  since.setMonth(since.getMonth() - 12);

  const invoices = await prisma.subOrgInvoice.findMany({
    where: { subOrgId: orgId, invoiceDate: { gte: since } },
    orderBy: { invoiceDate: "desc" },
    take: 100,
    select: {
      id: true,
      stripeInvoiceId: true,
      amount: true,
      currency: true,
      status: true,
      invoiceType: true,
      invoiceDate: true,
      paidAt: true,
      pdfUrl: true,
      hostedInvoiceUrl: true,
    },
  });

  return Response.json({
    items: invoices.map((i) => ({
      id: i.id,
      stripeInvoiceId: i.stripeInvoiceId,
      amount: i.amount,
      currency: i.currency,
      status: i.status,
      type: i.invoiceType,
      invoiceDate: i.invoiceDate.toISOString(),
      paidAt: i.paidAt?.toISOString() ?? null,
      pdfUrl: i.pdfUrl,
      hostedInvoiceUrl: i.hostedInvoiceUrl,
    })),
  });
}
