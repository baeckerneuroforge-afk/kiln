import { NextRequest } from "next/server";

// Universal widget script — single <script> tag embed for any agent
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  const script = `
(function() {
  "use strict";
  if (window.__kilnWidgetLoaded) return;
  window.__kilnWidgetLoaded = true;

  // Find our script tag and read config
  var scriptTag = document.currentScript || (function() {
    var scripts = document.querySelectorAll('script[data-agent-id]');
    return scripts[scripts.length - 1];
  })();

  if (!scriptTag) { console.error('[KILN] Missing script tag'); return; }

  var agentId = scriptTag.getAttribute('data-agent-id');
  if (!agentId) { console.error('[KILN] Missing data-agent-id attribute'); return; }

  var position = scriptTag.getAttribute('data-position') || 'bottom-right';
  var greeting = scriptTag.getAttribute('data-greeting') || '';

  // Fetch agent config (slug, color, name)
  fetch('${origin}/api/embed/config/' + agentId)
    .then(function(res) {
      if (!res.ok) throw new Error('Agent not found or not live');
      return res.json();
    })
    .then(function(config) { buildWidget(config); })
    .catch(function(err) { console.error('[KILN]', err.message); });

  function buildWidget(config) {
    var color = config.color || '#F97316';
    var slug = config.slug;
    var embedUrl = '${origin}/embed/' + slug;

    // Parse color to RGB for shadows
    var r = parseInt(color.slice(1, 3), 16) || 249;
    var g = parseInt(color.slice(3, 5), 16) || 115;
    var b = parseInt(color.slice(5, 7), 16) || 22;

    // Inject styles
    var style = document.createElement('style');
    style.textContent = [
      '@keyframes kiln-fade-in { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }',
      '@keyframes kiln-fade-out { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.9) translateY(10px); } }',
      '@keyframes kiln-bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.08); } }',
      '@keyframes kiln-pulse { 0% { box-shadow: 0 0 0 0 rgba(' + r + ',' + g + ',' + b + ',0.5); } 70% { box-shadow: 0 0 0 12px rgba(' + r + ',' + g + ',' + b + ',0); } 100% { box-shadow: 0 0 0 0 rgba(' + r + ',' + g + ',' + b + ',0); } }',
      '#kiln-widget-bubble { animation: kiln-bounce 0.4s ease-out, kiln-pulse 2s ease-out 1s; }',
      '#kiln-widget-frame-wrap.kiln-opening { animation: kiln-fade-in 0.25s ease-out forwards; }',
      '#kiln-widget-frame-wrap.kiln-closing { animation: kiln-fade-out 0.2s ease-in forwards; }',
      '@media (max-width: 480px) {',
      '  #kiln-widget-frame-wrap { width: 100vw !important; height: 100vh !important; bottom: 0 !important; right: 0 !important; left: 0 !important; top: 0 !important; border-radius: 0 !important; position: fixed !important; }',
      '  #kiln-widget-frame-wrap iframe { border-radius: 0 !important; }',
      '  #kiln-widget-bubble.kiln-open { bottom: auto !important; top: 12px !important; right: 12px !important; z-index: 100001 !important; }',
      '}',
    ].join('\\n');
    document.head.appendChild(style);

    // Determine positioning
    var isRight = position !== 'bottom-left';
    var posX = isRight ? 'right:20px;left:auto;' : 'left:20px;right:auto;';
    var posXMobile = isRight ? 'right:0;left:auto;' : 'left:0;right:auto;';

    // Container
    var container = document.createElement('div');
    container.id = 'kiln-widget-container';
    container.style.cssText = 'position:fixed;bottom:0;' + posX + 'z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';

    // Chat bubble button
    var bubble = document.createElement('button');
    bubble.id = 'kiln-widget-bubble';
    bubble.setAttribute('aria-label', 'Open chat');
    bubble.style.cssText = [
      'width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;',
      'background:' + color + ';color:#fff;',
      'display:flex;align-items:center;justify-content:center;',
      'box-shadow:0 4px 24px rgba(' + r + ',' + g + ',' + b + ',0.4);',
      'transition:transform 0.2s ease,box-shadow 0.2s ease;',
      'position:fixed;bottom:20px;' + posX,
      'z-index:100000;outline:none;',
    ].join('');

    var chatIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var closeIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    bubble.innerHTML = chatIcon;

    bubble.onmouseenter = function() { bubble.style.transform = 'scale(1.1)'; bubble.style.boxShadow = '0 6px 32px rgba(' + r + ',' + g + ',' + b + ',0.55)'; };
    bubble.onmouseleave = function() { if (!isOpen) { bubble.style.transform = 'scale(1)'; bubble.style.boxShadow = '0 4px 24px rgba(' + r + ',' + g + ',' + b + ',0.4)'; } };

    // Frame wrapper (hidden initially)
    var frameWrap = document.createElement('div');
    frameWrap.id = 'kiln-widget-frame-wrap';
    frameWrap.style.cssText = [
      'display:none;position:fixed;bottom:90px;' + posX,
      'width:400px;height:600px;',
      'border-radius:16px;overflow:hidden;',
      'box-shadow:0 12px 48px rgba(0,0,0,0.25),0 0 0 1px rgba(255,255,255,0.05);',
      'z-index:99999;',
    ].join('');

    // iframe (lazy-loaded on first open)
    var frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:none;border-radius:16px;background:#0C0A09;';
    frame.allow = 'clipboard-write';
    frame.title = config.name || 'Chat';
    frameWrap.appendChild(frame);

    // Greeting tooltip
    if (greeting) {
      var tip = document.createElement('div');
      tip.style.cssText = [
        'position:fixed;bottom:90px;' + (isRight ? 'right:20px;' : 'left:20px;'),
        'background:#fff;color:#1a1a1a;padding:10px 16px;border-radius:12px;',
        'box-shadow:0 4px 20px rgba(0,0,0,0.12);font-size:14px;max-width:260px;',
        'z-index:99998;opacity:0;transition:opacity 0.3s ease;pointer-events:none;',
        'line-height:1.4;',
      ].join('');
      tip.textContent = greeting;
      document.body.appendChild(tip);
      setTimeout(function() { if (!isOpen) tip.style.opacity = '1'; }, 3000);
      setTimeout(function() { tip.style.opacity = '0'; }, 10000);
    }

    var isOpen = false;
    var iframeLoaded = false;

    bubble.onclick = function() {
      isOpen = !isOpen;

      if (isOpen) {
        // Load iframe on first open (lazy)
        if (!iframeLoaded) {
          frame.src = embedUrl;
          iframeLoaded = true;
        }

        frameWrap.style.display = 'block';
        frameWrap.className = 'kiln-opening';
        bubble.innerHTML = closeIcon;
        bubble.classList.add('kiln-open');
        bubble.style.transform = 'scale(1)';
        bubble.setAttribute('aria-label', 'Close chat');

        // Hide greeting
        if (greeting) {
          var t = document.querySelector('#kiln-widget-container ~ div');
          if (t) t.style.opacity = '0';
        }
      } else {
        frameWrap.className = 'kiln-closing';
        bubble.innerHTML = chatIcon;
        bubble.classList.remove('kiln-open');
        bubble.setAttribute('aria-label', 'Open chat');
        setTimeout(function() {
          if (!isOpen) { frameWrap.style.display = 'none'; frameWrap.className = ''; }
        }, 200);
      }
    };

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) { bubble.onclick(); }
    });

    container.appendChild(frameWrap);
    document.body.appendChild(container);
    document.body.appendChild(bubble);
  }
})();
`;

  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
