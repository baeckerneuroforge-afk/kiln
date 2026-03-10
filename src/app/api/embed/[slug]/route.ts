import { NextRequest } from "next/server";

// Embed-Script ausliefern — wird auf externen Websites per <script> eingebunden
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  const origin = request.nextUrl.origin;
  const slug = params.slug.replace(/\.js$/, "");

  const script = `
(function() {
  if (document.getElementById('kiln-chat-widget')) return;

  // Container erstellen
  var container = document.createElement('div');
  container.id = 'kiln-chat-widget';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;';

  // Toggle-Button
  var btn = document.createElement('button');
  btn.style.cssText = 'width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#F97316,#DC2626);color:white;font-size:24px;box-shadow:0 4px 20px rgba(249,115,22,0.4);display:flex;align-items:center;justify-content:center;transition:transform 0.2s;';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg>';
  btn.onmouseenter = function() { btn.style.transform = 'scale(1.1)'; };
  btn.onmouseleave = function() { btn.style.transform = 'scale(1)'; };

  // Chat-Frame
  var frame = document.createElement('iframe');
  frame.src = '${origin}/embed/${slug}';
  frame.style.cssText = 'width:400px;height:600px;border:none;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.3);display:none;margin-bottom:12px;';
  frame.allow = 'clipboard-write';

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
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
