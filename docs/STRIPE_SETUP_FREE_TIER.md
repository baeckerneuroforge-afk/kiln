# Sprint 20 — Stripe Setup für Free-Tier

> **Status:** Pre-Deploy-Task. Erst Stripe-Setup machen, dann production-deploy.

## Hintergrund

Sprint 20 führt einen Free-Tier ein (1 Sub-Org, 100 Conv/Monat, 3 Agents, 1
OAuth, 1 GB Storage). Free-Plan ist **forever-free** — kein 30-Tage-Trial.

Wir tracken Free-Tier-Nutzer ohne Stripe-Subscription (`tier="free"` ist
default in `resolveTierForOrg` wenn keine `AgencyPlatformSubscription`
existiert). Der Stripe-Free-Product wird **nicht für Billing benötigt**,
sondern nur für:

1. Konsistenz in Stripe-Reporting (alle Orgs haben einen Tier-Eintrag)
2. Future: Wenn wir doch mal 0-EUR-Subscriptions auto-erstellen wollen

**TL;DR:** Setup ist optional aber empfohlen. Code funktioniert ohne.

## Stripe Dashboard Setup

### 1. Free-Product anlegen

1. Login: https://dashboard.stripe.com (Kiln Platform Account)
2. **Products** → **Add product**
3. Name: `KILN Free`
4. Description: `Free-Tier: 1 Sub-Org, 100 Conversations/Month, 3 Agents, 1 GB Storage`
5. Pricing model: **Recurring**
6. Price: `0,00 EUR`
7. Billing period: **Monthly**
8. Tax behavior: **Inclusive** (Net price)
9. Save → Notiere **Price-ID** (`price_xxx`)

### 2. Env-Var setzen

```bash
# In Vercel Production:
STRIPE_PRICE_TIER_FREE=price_xxx

# In .env.local (für lokale Tests):
STRIPE_PRICE_TIER_FREE=price_xxx
```

> Code-Hinweis: `getStripePriceIdForTier()` in
> `src/lib/billing/agency-tier.ts` ist heute nur für die bezahlten Tiers
> (starter/professional/agency_pro/enterprise) gemappt. Free wird
> intentional NICHT als AgencyTier behandelt (siehe Sprint 20 docs in
> `src/lib/billing/tier-limits.ts`). Wenn wir später 0-EUR-Subscriptions
> auto-erstellen wollen, fügen wir den Mapping-Eintrag dann hinzu.

### 3. Upgrade-Flow testen

Nach Setup:

```bash
# 1. Free-User anlegen (kein Stripe-Sub)
curl -X POST http://localhost:3000/api/billing/upgrade \
  -H "Content-Type: application/json" \
  -d '{"targetTier": "starter"}'

# Erwartete Response: { checkoutUrl: "https://checkout.stripe.com/...", ... }

# 2. Checkout in Browser öffnen, mit Stripe-Test-Card bezahlen:
#    4242 4242 4242 4242 | beliebiges Future-Date | beliebige CVC

# 3. Nach Erfolg redirected zu /dashboard/settings/billing?upgraded=true
#    User.plan ist jetzt STARTER, AgencyPlatformSubscription.status = "active"
```

## Was der Code automatisch macht

* **Free-Tier ist default**: `resolveTierForOrg()` in
  `src/lib/billing/limit-enforcement.ts` liefert `"free"` zurück wenn
  keine `AgencyPlatformSubscription` existiert oder die Subscription
  `past_due` / `canceled` / `unpaid` / `incomplete` ist.

* **Limit-Enforcement**: Jede Mutation (Agent-Create, Sub-Org-Create,
  Conversation-Create, OAuth-Connect) ruft `enforceLimit()` und
  blockiert mit `LimitReachedError` wenn Quota überschritten.

* **Usage-Tracking**: `incrementConversations(orgId)` macht atomic
  upsert in `TierUsageCounter` mit `(orgId, periodMonth)` Unique-Key.
  Monatlicher Reset ist implizit (neuer Monat = neue Zeile mit 0).

* **Upgrade-Endpoint**: `POST /api/billing/upgrade` startet
  Stripe-Checkout (Path B) oder ändert Tier in-place (Path A) je
  nachdem ob bereits eine aktive Subscription existiert.

## Webhook-Konfiguration

Der bestehende Stripe-Webhook (`/api/webhooks/stripe`) handhabt bereits
`checkout.session.completed` und `customer.subscription.updated` Events.
Keine Änderung nötig für Sprint 20.

**Wichtig**: Beim Upgrade-Flow geht der Webhook-Handler den Pfad
"Path B → Path A": Er findet `AgencyPlatformSubscription` über
`stripeCustomerId` und füllt `stripeSubscriptionId` +
`tierSubscriptionItemId` + `status=active` ein.

## Rollback

Falls Free-Tier zurückgerollt werden muss:

1. `git revert <sprint-20-merge-commit>` — alle Phase-Commits werden
   atomar zurückgerollt.
2. Bestehende Stripe-Subscriptions bleiben unverändert.
3. `STRIPE_PRICE_TIER_FREE` env-var kann bleiben — wird nirgendwo gelesen.
4. `TierUsageCounter`-Tabelle bleibt mit gespeicherten Counters; kann
   später per `DROP TABLE` entfernt werden falls gewünscht.

## Open Items für Sprint 20.x

* [ ] Storage-Limit-Enforcement: Heute liefert `getCurrentUsage` immer
  `storageUsedBytes: 0`. Wenn Supabase-Storage-Byte-Sum wired ist,
  kann das Limit echt enforced werden.
* [ ] Free-Tier auto-Subscription: Falls Reporting es verlangt, bei
  Org-Creation eine 0-EUR-Stripe-Sub auto-erstellen statt `null`-Row.
* [ ] Hard-Cap bei 100%: Heute zeigen wir nur das Upgrade-Modal —
  echte API-Calls werden blocked, aber die UI rendert immer noch
  "Create Agent"-Button. Sprint 20.1: button-Hide bei `atLimit`.
