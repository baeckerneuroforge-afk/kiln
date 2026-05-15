"use client";

/**
 * Sprint 19.10 — FAQ accordion + contact CTA.
 *
 * One open item at a time per category (matches the dns-setup
 * accordion pattern from Sprint 19.8.1 for consistency). Items are
 * keyed by their ID — the page resolves the q/a strings server-side
 * and threads them in.
 */
import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqCategory {
  title: string;
  items: Array<{ id: string; q: string; a: string }>;
}

export function FaqClient({
  heroTitle,
  heroSubtitle,
  categories,
  contactCtaTitle,
  contactCtaBody,
  contactCtaButton,
}: {
  heroTitle: string;
  heroSubtitle: string;
  categories: FaqCategory[];
  contactCtaTitle: string;
  contactCtaBody: string;
  contactCtaButton: string;
}) {
  return (
    <div data-testid="faq-page">
      <section className="mx-auto max-w-4xl px-6 pb-12 pt-16 text-center">
        <h1 className="font-serif text-4xl tracking-tight text-foreground sm:text-5xl">
          {heroTitle}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">
          {heroSubtitle}
        </p>
      </section>

      <section
        className="mx-auto max-w-3xl space-y-10 px-6 pb-16"
        data-testid="faq-categories"
      >
        {categories.map((cat) => (
          <Category key={cat.title} category={cat} />
        ))}
      </section>

      <section
        className="mx-auto my-16 max-w-3xl rounded-2xl border border-border bg-card px-8 py-10 text-center"
        data-testid="faq-contact-cta"
      >
        <h2 className="font-serif text-2xl text-foreground sm:text-3xl">
          {contactCtaTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          {contactCtaBody}
        </p>
        <Link
          href="mailto:sales@kilnbase.com?subject=KILN%20FAQ%20question"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-kiln-orange px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-kiln-orange/30 transition-all hover:bg-kiln-orange/95"
          data-testid="faq-contact-cta-button"
        >
          <Mail className="h-4 w-4" />
          {contactCtaButton}
        </Link>
      </section>
    </div>
  );
}

function Category({ category }: { category: FaqCategory }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div data-testid={`faq-category-${slugify(category.title)}`}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-kiln-orange">
        {category.title}
      </h2>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {category.items.map((item, idx) => {
          const isOpen = openId === item.id;
          return (
            <div
              key={item.id}
              className={cn(
                "border-border",
                idx > 0 && "border-t",
              )}
              data-testid={`faq-item-${item.id}`}
            >
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : item.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                data-testid={`faq-item-${item.id}-toggle`}
              >
                <span className="text-sm font-medium text-foreground">
                  {item.q}
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div
                  className="px-5 pb-4 text-sm leading-relaxed text-muted-foreground"
                  data-testid={`faq-item-${item.id}-answer`}
                >
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
