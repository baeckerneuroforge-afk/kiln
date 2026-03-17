import Anthropic from "@anthropic-ai/sdk";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/encryption";

export const STRIPE_CHANNEL_TYPE = "STRIPE";
const DEFAULT_CURRENCY = "usd";

export interface AgentStripeConfig {
  secretKey: string;
  accountId?: string | null;
  accountLabel?: string | null;
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
  });
}

export function parseStripeConfig(config: string): AgentStripeConfig {
  try {
    return JSON.parse(decrypt(config)) as AgentStripeConfig;
  } catch {
    return JSON.parse(config) as AgentStripeConfig;
  }
}

export function serializeStripeConfig(config: AgentStripeConfig) {
  return encrypt(JSON.stringify(config));
}

function formatCurrencyAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function toAmountInMinorUnits(amount: unknown) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export async function verifyStripeSecretKey(secretKey: string) {
  const stripe = createStripeClient(secretKey);
  const [account, charges] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.charges.list({ limit: 5 }),
  ]);

  return {
    stripe,
    accountId: account.id,
    accountLabel:
      account.business_profile?.name ||
      account.settings?.dashboard?.display_name ||
      account.email ||
      account.id,
    recentChargeCount: charges.data.length,
    lastChargeAt:
      charges.data[0]?.created != null
        ? new Date(charges.data[0].created * 1000).toISOString()
        : null,
  };
}

export async function getStripeIntegrationForAgent(agentId: string) {
  const channel = await prisma.agentChannel.findUnique({
    where: { agentId_type: { agentId, type: STRIPE_CHANNEL_TYPE as never } },
  });

  if (!channel || !channel.isActive) {
    return null;
  }

  const config = parseStripeConfig(channel.config);
  const stripe = createStripeClient(config.secretKey);

  return {
    channel,
    config,
    stripe,
  };
}

export function buildStripeTools(enabled: boolean): Anthropic.Tool[] {
  if (!enabled) {
    return [];
  }

  return [
    {
      name: "stripe_create_payment_link",
      description:
        "Create a Stripe payment link for a product or service. Use when the user wants to pay, complete a purchase, or receive a checkout link.",
      input_schema: {
        type: "object" as const,
        properties: {
          productName: { type: "string", description: "Name of the product or service being sold." },
          amount: { type: "number", description: "Price in major currency units, for example 49.99." },
          currency: { type: "string", description: "Three-letter currency code like usd or eur." },
          quantity: { type: "number", description: "Number of units to charge. Defaults to 1." },
          description: { type: "string", description: "Optional product description shown on checkout." },
          customerEmail: { type: "string", description: "Optional customer email to prefill at checkout." },
          successUrl: { type: "string", description: "Optional URL to send the customer to after checkout." },
        },
        required: ["productName", "amount"],
      },
    },
    {
      name: "stripe_check_payment_status",
      description:
        "Check payment status for a Stripe payment object. Use when the user asks whether a payment, invoice, or charge has been paid.",
      input_schema: {
        type: "object" as const,
        properties: {
          paymentIntentId: { type: "string", description: "Stripe payment intent ID, e.g. pi_..." },
          invoiceId: { type: "string", description: "Stripe invoice ID, e.g. in_..." },
          chargeId: { type: "string", description: "Stripe charge ID, e.g. ch_..." },
          paymentLinkId: { type: "string", description: "Stripe payment link ID, e.g. plink_..." },
        },
        required: [],
      },
    },
    {
      name: "stripe_list_recent_charges",
      description:
        "List recent Stripe charges for the connected account. Use when the user asks about recent payments or transaction history.",
      input_schema: {
        type: "object" as const,
        properties: {
          limit: { type: "number", description: "How many recent charges to return. Defaults to 5." },
        },
        required: [],
      },
    },
    {
      name: "stripe_create_invoice",
      description:
        "Create and send a Stripe invoice for a customer. Use when the user needs to bill a customer manually or send an invoice.",
      input_schema: {
        type: "object" as const,
        properties: {
          customerEmail: { type: "string", description: "Customer email address." },
          customerName: { type: "string", description: "Customer name." },
          amount: { type: "number", description: "Invoice amount in major currency units, for example 120.00." },
          currency: { type: "string", description: "Three-letter currency code like usd or eur." },
          description: { type: "string", description: "Invoice line item description." },
          dueDays: { type: "number", description: "Days until payment is due. Defaults to 7." },
        },
        required: ["customerEmail", "amount", "description"],
      },
    },
  ];
}

export function isStripeToolName(toolName: string) {
  return (
    toolName === "stripe_create_payment_link" ||
    toolName === "stripe_check_payment_status" ||
    toolName === "stripe_list_recent_charges" ||
    toolName === "stripe_create_invoice"
  );
}

export async function executeStripeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  agentId: string
) {
  const integration = await getStripeIntegrationForAgent(agentId);
  if (!integration) {
    return {
      success: false,
      message: "Stripe is not configured for this agent.",
    };
  }

  const { stripe, config } = integration;

  switch (toolName) {
    case "stripe_create_payment_link": {
      const amount = toAmountInMinorUnits(toolInput.amount);
      if (!amount) {
        return { success: false, message: "A valid positive amount is required." };
      }

      const productName =
        typeof toolInput.productName === "string" && toolInput.productName.trim()
          ? toolInput.productName.trim()
          : null;
      if (!productName) {
        return { success: false, message: "A product name is required." };
      }

      const currency =
        typeof toolInput.currency === "string" && toolInput.currency.trim()
          ? toolInput.currency.trim().toLowerCase()
          : DEFAULT_CURRENCY;
      const quantity = Math.max(1, Math.round(Number(toolInput.quantity) || 1));
      const description =
        typeof toolInput.description === "string" && toolInput.description.trim()
          ? toolInput.description.trim()
          : undefined;

      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price_data: {
              currency,
              unit_amount: amount,
              product_data: {
                name: productName,
                description,
              },
            },
            quantity,
          },
        ],
        ...(typeof toolInput.customerEmail === "string" && toolInput.customerEmail
          ? { customer_creation: "always" as const }
          : {}),
        ...(typeof toolInput.successUrl === "string" && toolInput.successUrl
          ? {
              after_completion: {
                type: "redirect" as const,
                redirect: { url: toolInput.successUrl },
              },
            }
          : {}),
      });

      return {
        success: true,
        paymentLinkId: paymentLink.id,
        url: paymentLink.url,
        amount: formatCurrencyAmount(amount, currency),
        accountLabel: config.accountLabel || config.accountId || null,
        message: `Payment link created for ${productName}: ${paymentLink.url}`,
      };
    }

    case "stripe_check_payment_status": {
      if (typeof toolInput.paymentIntentId === "string" && toolInput.paymentIntentId) {
        const paymentIntent = await stripe.paymentIntents.retrieve(toolInput.paymentIntentId);
        return {
          success: true,
          type: "payment_intent",
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          customer: paymentIntent.customer || null,
        };
      }

      if (typeof toolInput.invoiceId === "string" && toolInput.invoiceId) {
        const invoice = await stripe.invoices.retrieve(toolInput.invoiceId);
        return {
          success: true,
          type: "invoice",
          id: invoice.id,
          status: invoice.status,
          paid: invoice.status === "paid",
          hostedInvoiceUrl: invoice.hosted_invoice_url || null,
          invoicePdf: invoice.invoice_pdf || null,
        };
      }

      if (typeof toolInput.chargeId === "string" && toolInput.chargeId) {
        const charge = await stripe.charges.retrieve(toolInput.chargeId);
        return {
          success: true,
          type: "charge",
          id: charge.id,
          status: charge.status,
          paid: charge.paid,
          refunded: charge.refunded,
          receiptUrl: charge.receipt_url || null,
        };
      }

      if (typeof toolInput.paymentLinkId === "string" && toolInput.paymentLinkId) {
        const sessions = await stripe.checkout.sessions.list({
          payment_link: toolInput.paymentLinkId,
          limit: 5,
        });
        const completedSessions = sessions.data.filter((session) => session.payment_status === "paid");
        return {
          success: true,
          type: "payment_link",
          paymentLinkId: toolInput.paymentLinkId,
          totalSessions: sessions.data.length,
          completedSessions: completedSessions.length,
          latestSession: sessions.data[0]
            ? {
                id: sessions.data[0].id,
                status: sessions.data[0].status,
                paymentStatus: sessions.data[0].payment_status,
                customerEmail: sessions.data[0].customer_details?.email || null,
              }
            : null,
        };
      }

      return {
        success: false,
        message: "Provide a paymentIntentId, invoiceId, chargeId, or paymentLinkId.",
      };
    }

    case "stripe_list_recent_charges": {
      const limit = Math.min(20, Math.max(1, Math.round(Number(toolInput.limit) || 5)));
      const charges = await stripe.charges.list({ limit });

      return {
        success: true,
        count: charges.data.length,
        charges: charges.data.map((charge) => ({
          id: charge.id,
          amount: formatCurrencyAmount(charge.amount, charge.currency),
          status: charge.status,
          paid: charge.paid,
          refunded: charge.refunded,
          createdAt: new Date(charge.created * 1000).toISOString(),
          customerEmail: charge.billing_details?.email || null,
          description: charge.description || null,
          receiptUrl: charge.receipt_url || null,
        })),
      };
    }

    case "stripe_create_invoice": {
      const customerEmail =
        typeof toolInput.customerEmail === "string" && toolInput.customerEmail.trim()
          ? toolInput.customerEmail.trim()
          : null;
      if (!customerEmail) {
        return { success: false, message: "A customer email is required." };
      }

      const amount = toAmountInMinorUnits(toolInput.amount);
      if (!amount) {
        return { success: false, message: "A valid positive amount is required." };
      }

      const description =
        typeof toolInput.description === "string" && toolInput.description.trim()
          ? toolInput.description.trim()
          : null;
      if (!description) {
        return { success: false, message: "An invoice description is required." };
      }

      const currency =
        typeof toolInput.currency === "string" && toolInput.currency.trim()
          ? toolInput.currency.trim().toLowerCase()
          : DEFAULT_CURRENCY;
      const dueDays = Math.min(90, Math.max(1, Math.round(Number(toolInput.dueDays) || 7)));
      const customerName =
        typeof toolInput.customerName === "string" && toolInput.customerName.trim()
          ? toolInput.customerName.trim()
          : undefined;

      const existingCustomers = await stripe.customers.list({
        email: customerEmail,
        limit: 1,
      });

      const customer =
        existingCustomers.data[0] ||
        (await stripe.customers.create({
          email: customerEmail,
          name: customerName,
        }));

      await stripe.invoiceItems.create({
        customer: customer.id,
        amount,
        currency,
        description,
      });

      const draftInvoice = await stripe.invoices.create({
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: dueDays,
        auto_advance: false,
      });

      const finalizedInvoice = await stripe.invoices.finalizeInvoice(draftInvoice.id);
      const sentInvoice = await stripe.invoices.sendInvoice(finalizedInvoice.id);

      return {
        success: true,
        invoiceId: sentInvoice.id,
        status: sentInvoice.status,
        hostedInvoiceUrl: sentInvoice.hosted_invoice_url || null,
        invoicePdf: sentInvoice.invoice_pdf || null,
        customerId: customer.id,
        customerEmail,
        amount: formatCurrencyAmount(amount, currency),
        message: `Invoice ${sentInvoice.id} created and sent to ${customerEmail}.`,
      };
    }

    default:
      return {
        success: false,
        message: "Unknown Stripe tool.",
      };
  }
}
