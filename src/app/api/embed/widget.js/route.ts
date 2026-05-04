import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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

  var configuredPosition = scriptTag.getAttribute('data-position') || '';
  var greetingOverride = scriptTag.getAttribute('data-greeting') || '';
  var autoThemeAttr = scriptTag.getAttribute('data-auto-theme');
  var soundAttr = scriptTag.getAttribute('data-sound');
  var proactiveDelayAttr = scriptTag.getAttribute('data-proactive-delay');
  var proactiveRulesAttr = scriptTag.getAttribute('data-proactive-rules');

  function normalizeRules(input) {
    if (!Array.isArray(input)) return [];
    return input
      .map(function(rule) {
        if (!rule || typeof rule !== 'object') return null;
        var match = '';
        if (Array.isArray(rule.match)) {
          match = rule.match
            .filter(function(entry) { return typeof entry === 'string' && entry.trim(); })
            .map(function(entry) { return entry.trim(); })
            .join('|');
        } else if (typeof rule.match === 'string') {
          match = rule.match.trim();
        }
        var message = typeof rule.message === 'string' ? rule.message.trim() : '';
        if (!match || !message) return null;
        return { match: match, message: message };
      })
      .filter(Boolean);
  }

  function parseRules(raw) {
    if (!raw) return [];
    try {
      return normalizeRules(JSON.parse(raw));
    } catch (err) {
      console.warn('[KILN] Invalid data-proactive-rules JSON', err);
      return [];
    }
  }

  var customRules = parseRules(proactiveRulesAttr);

  function isTruthy(value, fallbackValue) {
    if (value === null || value === undefined || value === '') return fallbackValue;
    return String(value).toLowerCase() !== 'false';
  }

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
    var position = configuredPosition || config.position || 'bottom-right';
    var avatarUrl = config.avatarUrl || '';
    var schedule = config.schedule || null;
    var widgetTheme = config.theme || 'modern';
    var autoThemeEnabled = isTruthy(autoThemeAttr, config.autoTheme !== false);
    var soundEnabled = isTruthy(soundAttr, config.soundEnabled === true);
    var proactiveConfig = config.proactive || {};

    // Theme definitions (bubble size, radius, animation, trigger type)
    var themes = {
      modern: { bubbleSize: 60, bubbleRadius: '50%', bubbleAnim: 'kiln-fade-in 0.3s ease-out', triggerType: 'icon', windowRadius: '16px', openAnim: 'kiln-slide-up 0.3s cubic-bezier(0.16,1,0.3,1)' },
      classic: { bubbleSize: 56, bubbleRadius: '8px', bubbleAnim: 'kiln-fade-in 0.2s ease', triggerType: 'icon', windowRadius: '8px', openAnim: 'kiln-fade-in 0.2s ease' },
      minimal: { bubbleSize: 0, bubbleRadius: '0', bubbleAnim: 'kiln-fade-in 0.3s ease', triggerType: 'text', triggerText: 'Chat with us \\u2192', windowRadius: '12px', openAnim: 'kiln-fade-in 0.25s ease' },
      playful: { bubbleSize: 70, bubbleRadius: '50%', bubbleAnim: 'kiln-bounce 0.5s cubic-bezier(0.34,1.56,0.64,1), kiln-pulse 2s ease-out 1s', triggerType: 'icon', windowRadius: '24px', openAnim: 'kiln-bounce 0.4s cubic-bezier(0.34,1.56,0.64,1)' }
    };
    var t = themes[widgetTheme] || themes.modern;
    var proactiveEnabled = proactiveConfig.enabled !== false;
    var proactiveDelay = proactiveDelayAttr !== null
      ? Math.max(0, parseInt(proactiveDelayAttr, 10) || 0)
      : (typeof proactiveConfig.delay === 'number' ? Math.max(0, Math.round(proactiveConfig.delay)) : 15);
    var proactiveRules = customRules.length > 0 ? customRules : normalizeRules(proactiveConfig.rules || []);
    var defaultGreeting = greetingOverride || config.greeting || '';
    var sessionKey = 'kiln:proactive:' + agentId;
    var autoDismissTimer = null;
    var timeTrigger = null;
    var hasInteracted = false;
    var proactiveVisible = false;

    if (schedule && schedule.enabled && schedule.isOnline === false && schedule.offlineAction === 'hide_widget') {
      return;
    }

    function parseColorValue(value) {
      if (!value || typeof value !== 'string') return null;
      var trimmed = value.trim();
      if (!trimmed || trimmed === 'transparent') return null;
      if (trimmed.charAt(0) === '#') {
        if (trimmed.length === 4) {
          return {
            r: parseInt(trimmed.charAt(1) + trimmed.charAt(1), 16),
            g: parseInt(trimmed.charAt(2) + trimmed.charAt(2), 16),
            b: parseInt(trimmed.charAt(3) + trimmed.charAt(3), 16),
          };
        }
        if (trimmed.length === 7) {
          return {
            r: parseInt(trimmed.slice(1, 3), 16),
            g: parseInt(trimmed.slice(3, 5), 16),
            b: parseInt(trimmed.slice(5, 7), 16),
          };
        }
      }
      var match = trimmed.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) return null;
      var parts = match[1].split(',').map(function(part) { return parseFloat(part.trim()); });
      if (parts.length < 3) return null;
      if (parts.length > 3 && parts[3] === 0) return null;
      return {
        r: Math.max(0, Math.min(255, Math.round(parts[0]))),
        g: Math.max(0, Math.min(255, Math.round(parts[1]))),
        b: Math.max(0, Math.min(255, Math.round(parts[2]))),
      };
    }

    function rgbToHex(rgb) {
      return '#' + [rgb.r, rgb.g, rgb.b]
        .map(function(channel) { return channel.toString(16).padStart(2, '0'); })
        .join('');
    }

    function scoreColor(rgb, weight) {
      var max = Math.max(rgb.r, rgb.g, rgb.b);
      var min = Math.min(rgb.r, rgb.g, rgb.b);
      var saturation = max - min;
      var brightness = (rgb.r + rgb.g + rgb.b) / 3;
      if (brightness > 245 || brightness < 20) return -1;
      if (saturation < 18) return -1;
      return saturation * 2 + Math.abs(128 - brightness) + weight;
    }

    function pickColorFromElements(selector, property, weight, limit) {
      var best = null;
      var nodes = document.querySelectorAll(selector);
      for (var i = 0; i < nodes.length && i < limit; i++) {
        var styles = window.getComputedStyle(nodes[i]);
        var rgb = parseColorValue(styles[property]);
        if (!rgb) continue;
        var score = scoreColor(rgb, weight);
        if (score < 0) continue;
        if (!best || score > best.score) {
          best = { score: score, value: rgbToHex(rgb) };
        }
      }
      return best ? best.value : null;
    }

    function detectHostAccentColor(fallback) {
      var candidates = [
        pickColorFromElements('button, [role="button"], input[type="submit"], input[type="button"], .btn, [class*="button"]', 'backgroundColor', 28, 8),
        pickColorFromElements('a, [class*="link"]', 'color', 18, 10),
        pickColorFromElements('header, nav, [class*="header"], [class*="nav"]', 'backgroundColor', 12, 6),
        pickColorFromElements('body, main', 'backgroundColor', 4, 2),
      ].filter(Boolean);
      return candidates[0] || fallback;
    }

    var effectiveColor = autoThemeEnabled ? detectHostAccentColor(color) : color;
    var embedUrl = '${origin}/embed/' + slug + '?theme=' + encodeURIComponent(effectiveColor) + '&sound=' + (soundEnabled ? '1' : '0') + '&widgetTheme=' + encodeURIComponent(widgetTheme);

    // Parse color to RGB for shadows
    var r = parseInt(effectiveColor.slice(1, 3), 16) || 249;
    var g = parseInt(effectiveColor.slice(3, 5), 16) || 115;
    var b = parseInt(effectiveColor.slice(5, 7), 16) || 22;

    // Inject styles
    var style = document.createElement('style');
    style.textContent = [
      '@keyframes kiln-fade-in { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }',
      '@keyframes kiln-fade-out { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.9) translateY(10px); } }',
      '@keyframes kiln-bounce { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.05); } 70% { transform: scale(0.95); } 100% { transform: scale(1); } }',
      '@keyframes kiln-pulse { 0% { box-shadow: 0 0 0 0 rgba(' + r + ',' + g + ',' + b + ',0.5); } 70% { box-shadow: 0 0 0 12px rgba(' + r + ',' + g + ',' + b + ',0); } 100% { box-shadow: 0 0 0 0 rgba(' + r + ',' + g + ',' + b + ',0); } }',
      '@keyframes kiln-slide-up { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }',
      '#kiln-widget-bubble { animation: ' + t.bubbleAnim + '; }',
      '#kiln-widget-frame-wrap.kiln-opening { animation: ' + t.openAnim + ' forwards; }',
      '#kiln-widget-frame-wrap.kiln-closing { animation: kiln-fade-out 0.2s ease-in forwards; }',
      '#kiln-widget-tooltip { opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity 0.25s ease, transform 0.25s ease; }',
      '#kiln-widget-tooltip.kiln-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }',
      '@media (max-width: 480px) {',
      '  #kiln-widget-frame-wrap { width: 100vw !important; height: 100vh !important; bottom: 0 !important; right: 0 !important; left: 0 !important; top: 0 !important; border-radius: 0 !important; position: fixed !important; }',
      '  #kiln-widget-frame-wrap iframe { border-radius: 0 !important; }',
      '  #kiln-widget-bubble.kiln-open { bottom: auto !important; top: 12px !important; right: 12px !important; z-index: 100001 !important; }',
      '  #kiln-widget-tooltip { max-width: min(280px, calc(100vw - 32px)) !important; }',
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

    function wasProactiveShown() {
      try {
        return window.sessionStorage.getItem(sessionKey) === '1';
      } catch (_err) {
        return false;
      }
    }

    function markProactiveShown() {
      try {
        window.sessionStorage.setItem(sessionKey, '1');
      } catch (_err) {
        // noop
      }
    }

    function clearTriggers() {
      if (timeTrigger) {
        clearTimeout(timeTrigger);
        timeTrigger = null;
      }
      window.removeEventListener('scroll', onScroll, { passive: true });
    }

    function getContextAwareMessage() {
      var href = String(window.location.href || '').toLowerCase();
      var builtInRules = [
        { match: 'pricing|preise', message: 'Looking at pricing? I can help you find the right plan.' },
        { match: 'product|produkt', message: 'Want to know more about this product? Ask me anything.' },
        { match: 'contact|kontakt', message: 'Need to get in touch? I can help schedule a call.' },
        { match: 'faq|help', message: 'Can\\'t find what you\\'re looking for? I might be able to help.' }
      ];
      var mergedRules = proactiveRules.concat(builtInRules);

      for (var i = 0; i < mergedRules.length; i++) {
        var parts = String(mergedRules[i].match || '')
          .toLowerCase()
          .split('|')
          .map(function(entry) { return entry.trim(); })
          .filter(Boolean);
        for (var j = 0; j < parts.length; j++) {
          if (href.indexOf(parts[j]) !== -1) {
            return mergedRules[i].message;
          }
        }
      }

      return defaultGreeting;
    }

    // Chat trigger (bubble or text depending on theme)
    var bubble = document.createElement('button');
    bubble.id = 'kiln-widget-bubble';
    bubble.setAttribute('aria-label', 'Open chat');

    if (t.triggerType === 'text') {
      bubble.style.cssText = [
        'border:none;cursor:pointer;background:none;',
        'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
        'font-size:14px;font-weight:500;color:' + effectiveColor + ';',
        'padding:8px 16px;border-radius:8px;',
        'transition:background 0.2s ease;',
        'position:fixed;bottom:20px;' + posX,
        'z-index:100000;outline:none;',
      ].join('');
      bubble.textContent = t.triggerText || 'Chat with us \\u2192';
    } else {
      bubble.style.cssText = [
        'width:' + t.bubbleSize + 'px;height:' + t.bubbleSize + 'px;border-radius:' + t.bubbleRadius + ';border:none;cursor:pointer;',
        'background:' + effectiveColor + ';color:#fff;',
        'display:flex;align-items:center;justify-content:center;',
        'box-shadow:0 4px 24px rgba(' + r + ',' + g + ',' + b + ',0.4);',
        'transition:transform 0.2s ease,box-shadow 0.2s ease;',
        'position:fixed;bottom:20px;' + posX,
        'z-index:100000;outline:none;',
      ].join('');
    }

    var chatIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var closeIcon = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

    function getInitial() {
      return String(config.name || 'K').trim().charAt(0).toUpperCase() || 'K';
    }

    function setBubbleClosedContent() {
      if (t.triggerType === 'text') {
        bubble.textContent = t.triggerText || 'Chat with us \\u2192';
        return;
      }
      bubble.innerHTML = '';
      if (avatarUrl) {
        var avatar = document.createElement('img');
        avatar.src = avatarUrl;
        avatar.alt = config.name || 'Agent';
        avatar.style.cssText = 'width:100%;height:100%;border-radius:' + t.bubbleRadius + ';object-fit:cover;';
        bubble.appendChild(avatar);
        return;
      }

      var label = document.createElement('span');
      label.textContent = getInitial();
      label.style.cssText = 'font-size:' + Math.round(t.bubbleSize * 0.33) + 'px;font-weight:700;letter-spacing:-0.03em;';
      bubble.appendChild(label);
    }

    setBubbleClosedContent();

    if (t.triggerType === 'text') {
      bubble.onmouseenter = function() { markInteraction(); bubble.style.background = 'rgba(0,0,0,0.04)'; };
      bubble.onmouseleave = function() { bubble.style.background = 'none'; };
    } else {
      bubble.onmouseenter = function() { markInteraction(); bubble.style.transform = 'scale(1.1)'; bubble.style.boxShadow = '0 6px 32px rgba(' + r + ',' + g + ',' + b + ',0.55)'; };
      bubble.onmouseleave = function() { if (!isOpen) { bubble.style.transform = 'scale(1)'; bubble.style.boxShadow = '0 4px 24px rgba(' + r + ',' + g + ',' + b + ',0.4)'; } };
    }

    // Frame wrapper (hidden initially)
    var frameWrap = document.createElement('div');
    frameWrap.id = 'kiln-widget-frame-wrap';
    var frameBottom = t.triggerType === 'text' ? '60px' : (t.bubbleSize + 30) + 'px';
    frameWrap.style.cssText = [
      'display:none;position:fixed;bottom:' + frameBottom + ';' + posX,
      'width:400px;height:600px;',
      'border-radius:' + t.windowRadius + ';overflow:hidden;',
      'box-shadow:0 12px 48px rgba(0,0,0,0.25),0 0 0 1px rgba(255,255,255,0.05);',
      'z-index:99999;',
    ].join('');

    // iframe (lazy-loaded on first open)
    var frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:none;border-radius:' + t.windowRadius + ';background:#0C0A09;';
    frame.allow = 'clipboard-write';
    frame.title = config.name || 'Chat';
    frameWrap.appendChild(frame);

    var tooltip = document.createElement('div');
    tooltip.id = 'kiln-widget-tooltip';
    tooltip.style.cssText = [
      'position:fixed;bottom:92px;' + (isRight ? 'right:20px;' : 'left:20px;'),
      'display:flex;align-items:flex-start;gap:10px;',
      'max-width:280px;background:#fff;color:#1a1a1a;padding:12px 14px;border-radius:14px;',
      'box-shadow:0 8px 30px rgba(0,0,0,0.18);z-index:99998;line-height:1.45;',
    ].join('');

    var tooltipMessage = document.createElement('div');
    tooltipMessage.style.cssText = 'flex:1;font-size:13px;font-weight:500;';
    tooltip.appendChild(tooltipMessage);

    var tooltipClose = document.createElement('button');
    tooltipClose.type = 'button';
    tooltipClose.setAttribute('aria-label', 'Dismiss message');
    tooltipClose.style.cssText = 'border:none;background:transparent;color:#57534E;cursor:pointer;font-size:14px;line-height:1;padding:0;margin:1px 0 0;';
    tooltipClose.innerHTML = '✕';
    tooltip.appendChild(tooltipClose);
    document.body.appendChild(tooltip);

    var isOpen = false;
    var iframeLoaded = false;
    function dismissTooltip(markSeen) {
      if (!proactiveVisible) return;
      proactiveVisible = false;
      tooltip.classList.remove('kiln-visible');
      if (autoDismissTimer) {
        clearTimeout(autoDismissTimer);
        autoDismissTimer = null;
      }
      if (markSeen) markProactiveShown();
    }

    function showTooltip(source) {
      if (!proactiveEnabled || proactiveDelay === 0 || hasInteracted || wasProactiveShown() || proactiveVisible) return;
      var message = getContextAwareMessage();
      if (!message) return;

      clearTriggers();
      proactiveVisible = true;
      tooltip.setAttribute('data-source', source);
      tooltipMessage.textContent = message;
      tooltip.classList.add('kiln-visible');
      markProactiveShown();
      autoDismissTimer = setTimeout(function() {
        dismissTooltip(false);
      }, 10000);
    }

    function markInteraction() {
      hasInteracted = true;
      clearTriggers();
      dismissTooltip(true);
    }

    function onScroll() {
      if (!proactiveEnabled || proactiveDelay === 0 || hasInteracted || wasProactiveShown()) return;
      var doc = document.documentElement;
      var scrollTop = window.pageYOffset || doc.scrollTop || 0;
      var maxScroll = Math.max(1, (doc.scrollHeight || document.body.scrollHeight || 0) - window.innerHeight);
      if ((scrollTop / maxScroll) >= 0.7) {
        showTooltip('scroll');
      }
    }

    tooltipClose.onclick = function(event) {
      event.preventDefault();
      event.stopPropagation();
      dismissTooltip(true);
    };

    bubble.onclick = function() {
      markInteraction();
      isOpen = !isOpen;

      if (isOpen) {
        // Load iframe on first open (lazy)
        if (!iframeLoaded) {
          frame.src = embedUrl;
          iframeLoaded = true;
        }

        frameWrap.style.display = 'block';
        frameWrap.className = 'kiln-opening';
        if (t.triggerType === 'text') {
          bubble.textContent = '\\u2715 Close';
        } else {
          bubble.innerHTML = closeIcon;
        }
        bubble.classList.add('kiln-open');
        bubble.style.transform = 'scale(1)';
        bubble.setAttribute('aria-label', 'Close chat');
      } else {
        frameWrap.className = 'kiln-closing';
        setBubbleClosedContent();
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

    if (proactiveEnabled && proactiveDelay > 0 && !wasProactiveShown()) {
      timeTrigger = setTimeout(function() {
        showTooltip('timer');
      }, proactiveDelay * 1000);
      window.addEventListener('scroll', onScroll, { passive: true });
    }

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
