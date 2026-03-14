/**
 * Stripe Pricing Setup Script (v2)
 *
 * Creates plan products with monthly + yearly prices in Stripe.
 * Enterprise is contact-sales only (no Stripe product).
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
  envKey: string;
  monthlyPrice: number; // in cents
  yearlyPrice: number;  // in cents
  features: string[];
}

const plans: PlanConfig[] = [
  {
    name: "Starter",
    envKey: "STARTER",
    monthlyPrice: 3900,  // €39
    yearlyPrice: 32700,  // €327/year (€27/mo, 30% off)
    features: ["3 Agents", "500 Chats/month", "3 Knowledge Bases", "Basic Analytics", "Email Support"],
  },
  {
    name: "Pro",
    envKey: "PRO",
    monthlyPrice: 9900,  // €99
    yearlyPrice: 83200,  // €832/year (€69/mo, 30% off)
    features: ["10 Agents", "Unlimited Chats", "10 Knowledge Bases", "Full Analytics", "White-Label", "Priority Support"],
  },
  {
    name: "Business",
    envKey: "AGENCY", // DB enum stays AGENCY
    monthlyPrice: 24900,  // €249
    yearlyPrice: 209100,  // €2,091/year (€174/mo, 30% off)
    features: ["Unlimited Agents", "Unlimited Chats", "API Access", "MCP Server", "Custom Domain", "Dedicated Support"],
  },
];

async function main() {
  console.log("Creating Stripe products and prices (v2 pricing)...\n");
  console.log("Note: Enterprise is contact-sales only — no Stripe product created.\n");

  const envLines: string[] = [];

  for (const plan of plans) {
    // Create product
    const product = await stripe.products.create({
      name: `KILN ${plan.name}`,
      description: plan.features.join(", "),
      metadata: { plan: plan.envKey },
    });
    console.log(`✓ Product: ${product.name} (${product.id})`);

    // Monthly price
    const monthlyPriceObj = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyPrice,
      currency: "eur",
      recurring: { interval: "month" },
      metadata: { plan: plan.envKey, billing: "monthly" },
    });
    console.log(`  Monthly: €${plan.monthlyPrice / 100}/mo (${monthlyPriceObj.id})`);

    // Yearly price
    const yearlyPriceObj = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.yearlyPrice,
      currency: "eur",
      recurring: { interval: "year" },
      metadata: { plan: plan.envKey, billing: "yearly" },
    });
    console.log(`  Yearly:  €${plan.yearlyPrice / 100}/yr (${yearlyPriceObj.id})\n`);

    envLines.push(`NEXT_PUBLIC_STRIPE_${plan.envKey}_PRICE_ID=${monthlyPriceObj.id}`);
    envLines.push(`NEXT_PUBLIC_STRIPE_${plan.envKey}_YEARLY_PRICE_ID=${yearlyPriceObj.id}`);
  }

  console.log("═══════════════════════════════════════");
  console.log("Add these to your .env.local:\n");
  console.log(envLines.join("\n"));
  console.log("\n(Enterprise has no price IDs — contact sales only)");
  console.log("\n═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
