/**
 * Stripe Pricing Setup Script
 *
 * Creates all 5 plan products with monthly + yearly prices in Stripe.
 * Run once: npx tsx scripts/setup-stripe-pricing.ts
 *
 * Requires STRIPE_SECRET_KEY in .env.local
 */

import Stripe from "stripe";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover" as Stripe.LatestApiVersion,
});

interface PlanConfig {
  name: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number;  // in cents
  features: string[];
}

const plans: PlanConfig[] = [
  {
    name: "Starter",
    monthlyPrice: 2900,  // €29
    yearlyPrice: 24300,  // €243/year (€20.25/mo)
    features: ["3 Agents", "500 Chats/month", "3 Knowledge Bases", "Basic Analytics", "Email Support"],
  },
  {
    name: "Pro",
    monthlyPrice: 7900,  // €79
    yearlyPrice: 66300,  // €663/year (€55.25/mo)
    features: ["10 Agents", "Unlimited Chats", "10 Knowledge Bases", "Full Analytics", "White-Label", "Priority Support"],
  },
  {
    name: "Agency",
    monthlyPrice: 19900,  // €199
    yearlyPrice: 167000,  // €1,670/year (€139/mo)
    features: ["Unlimited Agents", "Unlimited Chats", "API Access", "MCP Server", "Custom Domain", "Dedicated Support"],
  },
  {
    name: "Enterprise",
    monthlyPrice: 49900,  // €499
    yearlyPrice: 419000,  // €4,190/year (€349/mo)
    features: ["Everything in Agency", "SLA", "Custom Onboarding", "50K Conversations", "Scheduled Agents", "Priority Queue"],
  },
];

async function main() {
  console.log("Creating Stripe products and prices...\n");

  const envLines: string[] = [];

  for (const plan of plans) {
    // Create product
    const product = await stripe.products.create({
      name: `KILN ${plan.name}`,
      description: plan.features.join(", "),
      metadata: { plan: plan.name.toUpperCase() },
    });
    console.log(`✓ Product: ${product.name} (${product.id})`);

    // Monthly price
    const monthlyPriceObj = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyPrice,
      currency: "eur",
      recurring: { interval: "month" },
      metadata: { plan: plan.name.toUpperCase(), billing: "monthly" },
    });
    console.log(`  Monthly: €${plan.monthlyPrice / 100}/mo (${monthlyPriceObj.id})`);

    // Yearly price
    const yearlyPriceObj = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.yearlyPrice,
      currency: "eur",
      recurring: { interval: "year" },
      metadata: { plan: plan.name.toUpperCase(), billing: "yearly" },
    });
    console.log(`  Yearly:  €${plan.yearlyPrice / 100}/yr (${yearlyPriceObj.id})\n`);

    const key = plan.name.toUpperCase();
    envLines.push(`NEXT_PUBLIC_STRIPE_${key}_PRICE_ID=${monthlyPriceObj.id}`);
    envLines.push(`NEXT_PUBLIC_STRIPE_${key}_YEARLY_PRICE_ID=${yearlyPriceObj.id}`);
  }

  console.log("═══════════════════════════════════════");
  console.log("Add these to your .env.local:\n");
  console.log(envLines.join("\n"));
  console.log("\n═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
