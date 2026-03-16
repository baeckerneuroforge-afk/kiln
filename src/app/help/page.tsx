import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";
import { HelpArticles } from "./help-articles";
import {
  Bot,
  Code,
  BookOpen,
  Coins,
  Bell,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Help Center — KILN",
  description: "Learn how to create AI agents, embed them on your website, and get the most out of KILN.",
};

const articles = [
  {
    id: "create-first-agent",
    title: "Create Your First Agent",
    readTime: "2 min read",
    icon: "bot" as const,
    content: `## Step by Step

1. **Go to your Dashboard** and click **AI Agent Studio** in the sidebar, then click **New Agent**.

2. **Choose the agent type.** Pick **Chat** for a conversational agent (customer support, FAQ bot, lead capture) or **Task** for background automation (data processing, content generation).

3. **Name your agent** and write a clear **system prompt**. The system prompt tells the agent how to behave. For example:
   > "You are a friendly customer support agent for an online store. Answer questions about shipping, returns, and product availability. If you don't know the answer, offer to connect the customer with a human agent."

4. **Pick a model.** Claude Sonnet is the default and works great for most use cases. Claude Haiku is faster and cheaper for simpler tasks. You can always change this later.

5. **Set a welcome message.** This is the first thing visitors see when the chat opens. Something like: "Hi! How can I help you today?" works well.

6. **Test in the preview panel.** The live preview on the right side lets you chat with your agent before deploying. Send a few messages to make sure it behaves how you want.

7. **Deploy!** Once you're happy, switch the status to **Live**. Your agent is now ready to embed on your website.

## Tips for Beginners

- **System prompt** is the most important setting — spend time getting it right.
- **Suggested questions** help guide visitors. Add 2-3 common questions.
- You start with **free credits** on signup, enough to test and go live.
- You can always edit your agent later — nothing is permanent.`,
  },
  {
    id: "embed-on-website",
    title: "Add Your Agent to Your Website",
    readTime: "2 min read",
    icon: "code" as const,
    content: `## The Quick Way: Chat Bubble Widget

The easiest way to add your agent is with a single script tag. It creates a floating chat bubble in the corner of your website.

1. Go to your agent's page in the dashboard and click the **Embed** tab.
2. Copy the **Widget** code. It looks like this:

\`\`\`html
<script
  src="https://your-domain.com/api/embed/widget.js"
  data-agent-id="your-agent-id"
></script>
\`\`\`

3. Paste it into your website's HTML, just before the closing \`</body>\` tag.
4. That's it — the chat bubble will appear on your site.

## Optional Attributes

- \`data-position="left"\` — Move the bubble to the bottom-left corner (default is bottom-right).
- \`data-greeting="Need help? Chat with us!"\` — Show a greeting tooltip next to the bubble.

## Advanced: iFrame Embed

If you want to embed the chat as an inline element (not a floating bubble), use the **iFrame** code from the Embed tab instead. This places the full chat widget directly in your page layout.

\`\`\`html
<iframe
  src="https://your-domain.com/embed/your-agent-slug"
  width="400"
  height="600"
  style="border: none;"
></iframe>
\`\`\`

## Troubleshooting

- **Chat not appearing?** Make sure the agent status is set to **Live**.
- **Styling conflicts?** The widget loads in an iframe, so your site's CSS won't affect it.
- **Custom domain?** You can set up a custom domain in the agent's White-Label settings (Pro plan).`,
  },
  {
    id: "knowledge-base",
    title: "Train Your Agent with Knowledge Base",
    readTime: "2 min read",
    icon: "book" as const,
    content: `## What is the Knowledge Base?

The Knowledge Base is how you give your agent information about your business. When a visitor asks a question, the agent searches the knowledge base and uses that information to craft accurate, relevant answers.

## How to Add Knowledge

Go to your agent's page and click the **Knowledge** tab. You have three options:

### 1. Upload PDFs
Click **Upload** and select a PDF file. KILN will extract the text, split it into chunks, and make it searchable for your agent. Great for:
- Product manuals
- Policy documents
- Pricing sheets

### 2. Add URLs
Enter a webpage URL and KILN will scrape the content. Perfect for:
- Your FAQ page
- Product pages
- Blog posts with relevant info

### 3. Add FAQ Pairs
Manually enter question-answer pairs. This gives you the most control. Ideal for:
- Frequently asked questions
- Specific responses you want word-for-word
- Edge cases the agent should handle a certain way

## Tips

- **Start with your FAQ page** or existing documentation — it usually covers the most common questions.
- **Quality over quantity.** A few well-written FAQ pairs often beat a massive PDF.
- **Test after adding.** Use the preview chat to ask questions and verify the agent finds the right information.
- Each knowledge entry uses **embedding credits** once when added. Querying it later is free.`,
  },
  {
    id: "credits",
    title: "Understanding Credits",
    readTime: "1 min read",
    icon: "coins" as const,
    content: `## How Credits Work

KILN uses a credit system for AI operations. Every message your agent sends, every task it runs, and every knowledge base entry it processes costs credits.

| Action | Approximate Cost |
|--------|-----------------|
| Chat message (Sonnet) | ~1-3 credits |
| Chat message (Haiku) | ~0.5-1 credits |
| Task execution | ~2-5 credits |
| Knowledge embedding | ~1 credit per chunk |

## Free Credits

Every new account starts with free credits — enough to create your first agent, add some knowledge, and run real conversations with visitors.

## Checking Your Balance

Your remaining credits are shown in the **top banner** of the dashboard. You can also see detailed usage in **Settings**.

## When to Upgrade

If you're running out of credits regularly, it's time to upgrade:
- **Pro (€49/month)** — More credits, white-label options, custom domains
- **Agency (€149/month)** — High-volume credits, multiple agents, priority support

You can upgrade anytime from **Settings → Billing**.`,
  },
  {
    id: "email-notifications",
    title: "Set Up Email Notifications",
    readTime: "1 min read",
    icon: "bell" as const,
    content: `## Get Notified About New Leads

KILN can send you an email whenever a new conversation starts with one of your agents. This way you never miss a potential lead.

## How to Enable

1. Go to **Settings** in the dashboard sidebar.
2. Find the **Preferences** section.
3. Toggle **Email Notifications** on.

That's it! You'll receive an email each time a visitor starts a new conversation with any of your live agents.

## What Triggers an Email

- **New conversation started** — When a visitor sends their first message to your agent.

## How to Turn Off

Go to **Settings → Preferences** and toggle **Email Notifications** off. You'll stop receiving emails immediately.

## Note

Emails are sent to the address associated with your KILN account. Make sure your account email is correct in your profile settings.`,
  },
];

const iconMap = {
  bot: Bot,
  code: Code,
  book: BookOpen,
  coins: Coins,
  bell: Bell,
};

export default function HelpPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#0C0A09] text-neutral-200">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="flex h-7 w-7 items-center justify-center rounded font-serif text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #F97316, #DC2626)" }}
            >
              K
            </div>
            <span className="font-serif text-base">KILN</span>
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            Dashboard
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="border-b border-white/[0.06] bg-gradient-to-b from-kiln-orange/[0.04] to-transparent">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h1 className="font-serif text-4xl text-white md:text-5xl">Help Center</h1>
          <p className="mt-4 max-w-lg text-lg text-neutral-400">
            Everything you need to create, deploy, and manage your AI agents.
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="mx-auto w-full max-w-4xl px-6 py-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => {
            const Icon = iconMap[article.icon];
            return (
              <a
                key={article.id}
                href={`#${article.id}`}
                className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all hover:border-kiln-orange/30 hover:bg-white/[0.04]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kiln-orange/10">
                  <Icon className="h-4.5 w-4.5 text-kiln-orange" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white group-hover:text-kiln-orange transition-colors">
                    {article.title}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">{article.readTime}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* Articles */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20">
        <HelpArticles articles={articles} />
      </main>

      <LegalFooter />
    </div>
  );
}
