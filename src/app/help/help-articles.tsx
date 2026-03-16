"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Bot, Code, BookOpen, Coins, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  readTime: string;
  icon: "bot" | "code" | "book" | "coins" | "bell";
  content: string;
}

const iconMap = {
  bot: Bot,
  code: Code,
  book: BookOpen,
  coins: Coins,
  bell: Bell,
};

// Simple markdown-to-HTML for help articles
function renderMarkdown(md: string): string {
  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
      `<pre class="rounded-lg bg-white/[0.04] border border-white/[0.06] p-4 overflow-x-auto text-xs font-mono text-neutral-300"><code>${code.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim()}</code></pre>`
    )
    // Tables
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (_m, header: string, body: string) => {
      const ths = header.split("|").map((h: string) => h.trim()).filter(Boolean)
        .map((h: string) => `<th class="px-3 py-2 text-left text-xs font-medium text-neutral-300 border-b border-white/[0.06]">${h}</th>`).join("");
      const rows = body.trim().split("\n").map((row: string) => {
        const tds = row.split("|").map((c: string) => c.trim()).filter(Boolean)
          .map((c: string) => `<td class="px-3 py-2 text-xs text-neutral-400 border-b border-white/[0.04]">${c}</td>`).join("");
        return `<tr>${tds}</tr>`;
      }).join("");
      return `<table class="w-full border-collapse my-4"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-white mt-6 mb-2 font-serif">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-white mt-8 mb-3 first:mt-0 font-serif">$1</h2>')
    // Blockquotes
    .replace(/^> (.+)$/gm, '<blockquote class="border-l-2 border-kiln-orange/30 pl-4 my-3 text-neutral-400 italic">$1</blockquote>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-medium">$1</strong>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="text-kiln-orange bg-white/[0.06] rounded px-1.5 py-0.5 text-xs font-mono">$1</code>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="text-neutral-300">$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li class="text-neutral-300">$1</li>')
    // Paragraphs — wrap loose lines
    .replace(/^(?!<[hluotpb]|<li|<pre|<code|<table|<strong)(.+)$/gm, '<p class="text-neutral-300 leading-relaxed">$1</p>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, '<ul class="ml-5 list-disc space-y-1.5 my-3">$1</ul>');

  return html;
}

export function HelpArticles({ articles }: { articles: Article[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Auto-open article from URL hash
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      setOpenIds(new Set([hash]));
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, []);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => {
        const isOpen = openIds.has(article.id);
        const Icon = iconMap[article.icon];

        return (
          <div
            key={article.id}
            id={article.id}
            className="scroll-mt-24 rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden transition-colors hover:border-white/[0.1]"
          >
            <button
              onClick={() => toggle(article.id)}
              className="flex w-full items-center gap-4 px-6 py-5 text-left"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kiln-orange/10">
                <Icon className="h-5 w-5 text-kiln-orange" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-serif text-lg text-white">{article.title}</h2>
                <p className="text-xs text-neutral-500">{article.readTime}</p>
              </div>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-neutral-500 transition-transform duration-200",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            <div
              className={cn(
                "grid transition-all duration-200",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <div
                  className="border-t border-white/[0.06] px-6 py-6 text-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
