import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Embed-Script ausliefern — wird auf externen Websites per <script> eingebunden
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const origin = request.nextUrl.origin;
  const slug = params.slug.replace(/\.js$/, "");

  // Agent-Farben laden
  const agent = await prisma.agent.findUnique({
    where: { slug },
    select: { whiteLabel: true, status: true },
  });

  if (!agent || agent.status !== "LIVE") {
    return new Response("// Agent not found or not live", {
      status: 404,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const wl = (agent.whiteLabel || {}) as Record<string, string>;
  const rawColor = wl.primaryColor || "#F97316";
  const color = /^#[0-9A-Fa-f]{3,8}$/.test(rawColor) ? rawColor : "#F97316";

  // Hex → RGB für box-shadow
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const script = `
(function() {
  if (document.getElementById('kiln-chat-widget')) return;

  var color = '${color}';

  // Container
  var container = document.createElement('div');
  container.id = 'kiln-chat-widget';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;';

  // Toggle-Button mit White-Label-Farbe
  var btn = document.createElement('button');
  btn.style.cssText = 'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:' + color + ';color:white;font-size:24px;box-shadow:0 4px 20px rgba(${r},${g},${b},0.4);display:flex;align-items:center;justify-content:center;transition:transform 0.2s;';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg>';
  btn.onmouseenter = function() { btn.style.transform = 'scale(1.1)'; };
  btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; };

  // Chat-Frame
  var frame = document.createElement('iframe');
  frame.src = '${origin}/embed/${slug}';
  frame.style.cssText = 'width:400px;height:600px;border:none;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.3);display:none;margin-bottom:12px;';
  frame.allow = 'clipboard-write';

  // Mobile responsive
  if (window.innerWidth <= 480) {
    frame.style.width = 'calc(100vw - 32px)';
    frame.style.height = 'calc(100vh - 100px)';
    container.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;';
  }

  var isOpen = false;
  btn.onclick = function() {
    isOpen = !isOpen;
    frame.style.display = isOpen ? 'block' : 'none';
    btn.innerHTML = isOpen
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg>';
  };

  container.appendChild(frame);
  container.appendChild(btn);
  document.body.appendChild(container);
})();
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
