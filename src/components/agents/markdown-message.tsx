"use client";

interface MarkdownMessageProps {
  content: string;
}

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return <div className="space-y-2">{parseBlocks(content)}</div>;
}

function parseBlocks(text: string) {
  const blocks = text.split(/\n\n+/);
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    // Unordered list
    if (/^[-*] /m.test(trimmed)) {
      const items = trimmed.split(/\n/).filter((l) => /^[-*] /.test(l));
      return (
        <ul key={i} className="ml-4 list-disc space-y-1">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item.replace(/^[-*] /, ""))}</li>
          ))}
        </ul>
      );
    }

    // Ordered list
    if (/^\d+\. /m.test(trimmed)) {
      const items = trimmed.split(/\n/).filter((l) => /^\d+\. /.test(l));
      return (
        <ol key={i} className="ml-4 list-decimal space-y-1">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item.replace(/^\d+\. /, ""))}</li>
          ))}
        </ol>
      );
    }

    // Headings
    if (trimmed.startsWith("### "))
      return (
        <h3 key={i} className="text-sm font-semibold">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
    if (trimmed.startsWith("## "))
      return (
        <h2 key={i} className="text-sm font-bold">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
    if (trimmed.startsWith("# "))
      return (
        <h1 key={i} className="text-base font-bold">
          {renderInline(trimmed.slice(2))}
        </h1>
      );

    // Code block
    if (trimmed.startsWith("```")) {
      const code = trimmed.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return (
        <code
          key={i}
          className="block rounded-lg bg-black/20 p-3 font-mono text-xs whitespace-pre-wrap overflow-x-auto"
        >
          {code}
        </code>
      );
    }

    // Paragraph (with line breaks)
    const lines = trimmed.split(/\n/);
    return (
      <p key={i}>
        {lines.map((line, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(line)}
          </span>
        ))}
      </p>
    );
  });
}

function renderInline(text: string): React.ReactNode {
  // Split by inline patterns: **bold**, *italic*, `code`, [link](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Italic
    const italicMatch = remaining.match(/(?<!\*)\*([^*]+?)\*(?!\*)/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+?)`/);
    // Link
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    // Find earliest match
    const matches = [
      boldMatch && { type: "bold", match: boldMatch },
      italicMatch && { type: "italic", match: italicMatch },
      codeMatch && { type: "code", match: codeMatch },
      linkMatch && { type: "link", match: linkMatch },
    ]
      .filter(Boolean)
      .sort((a, b) => a!.match.index! - b!.match.index!);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    const idx = first.match.index!;

    if (idx > 0) {
      parts.push(remaining.slice(0, idx));
    }

    switch (first.type) {
      case "bold":
        parts.push(
          <strong key={key++} className="font-semibold">
            {first.match[1]}
          </strong>
        );
        break;
      case "italic":
        parts.push(<em key={key++}>{first.match[1]}</em>);
        break;
      case "code":
        parts.push(
          <code
            key={key++}
            className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-xs"
          >
            {first.match[1]}
          </code>
        );
        break;
      case "link":
        parts.push(
          <a
            key={key++}
            href={first.match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {first.match[1]}
          </a>
        );
        break;
    }

    remaining = remaining.slice(idx + first.match[0].length);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}
