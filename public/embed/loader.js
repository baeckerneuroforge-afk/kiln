/**
 * KILN Embed Loader
 * Lightweight script (<20KB) that reads data attributes from the script tag
 * and creates an iframe pointing to the embed component page.
 */
(function () {
  "use strict";

  // Prevent double loading
  if (window.__kilnEmbedLoaderReady) return;
  window.__kilnEmbedLoaderReady = true;

  // Find the current script tag
  var scriptTag =
    document.currentScript ||
    (function () {
      var scripts = document.querySelectorAll(
        'script[data-agent-id][data-component]'
      );
      return scripts[scripts.length - 1];
    })();

  if (!scriptTag) {
    console.error("[KILN Embed] Script-Tag nicht gefunden");
    return;
  }

  // Read data attributes
  var agentId = scriptTag.getAttribute("data-agent-id");
  var component = scriptTag.getAttribute("data-component");
  var theme = scriptTag.getAttribute("data-theme") || "dark";
  var token = scriptTag.getAttribute("data-token") || "";
  var width = scriptTag.getAttribute("data-width") || "100%";
  var height = scriptTag.getAttribute("data-height") || "500px";
  var branding = scriptTag.getAttribute("data-branding") !== "false";

  if (!agentId) {
    console.error("[KILN Embed] data-agent-id fehlt");
    return;
  }
  if (!component) {
    console.error("[KILN Embed] data-component fehlt");
    return;
  }
  if (!token) {
    console.error("[KILN Embed] data-token fehlt");
    return;
  }

  // Determine base URL from script src
  var baseUrl = (function () {
    var src = scriptTag.getAttribute("src") || "";
    var match = src.match(/^(https?:\/\/[^/]+)/);
    return match ? match[1] : "";
  })();

  if (!baseUrl) {
    console.error("[KILN Embed] Basis-URL konnte nicht ermittelt werden");
    return;
  }

  // Build the iframe URL
  var embedUrl =
    baseUrl +
    "/embed/components/" +
    encodeURIComponent(agentId) +
    "/" +
    encodeURIComponent(component) +
    "?token=" +
    encodeURIComponent(token) +
    "&theme=" +
    encodeURIComponent(theme) +
    "&branding=" +
    (branding ? "true" : "false");

  // Create container
  var container = document.createElement("div");
  container.className = "kiln-embed-container";
  container.style.cssText = [
    "width:" + width + ";",
    "max-width:100%;",
    "margin:0 auto;",
    "position:relative;",
    "overflow:hidden;",
    "border-radius:12px;",
    "background:" + (theme === "light" ? "#ffffff" : "#0C0A09") + ";",
  ].join("");

  // Create iframe
  var iframe = document.createElement("iframe");
  iframe.src = embedUrl;
  iframe.title = "KILN " + component;
  iframe.allow = "clipboard-write";
  iframe.setAttribute("loading", "lazy");
  iframe.style.cssText = [
    "width:100%;",
    "height:" + height + ";",
    "border:none;",
    "border-radius:12px;",
    "display:block;",
    "background:transparent;",
  ].join("");

  // Handle responsive sizing
  function handleResize() {
    var containerWidth = container.offsetWidth;
    if (containerWidth < 400) {
      iframe.style.minHeight = "300px";
    }
  }

  // Observe container size changes
  if (typeof ResizeObserver !== "undefined") {
    var observer = new ResizeObserver(handleResize);
    observer.observe(container);
  } else {
    window.addEventListener("resize", handleResize);
  }

  // Listen for height messages from the embed iframe
  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "kiln-embed-resize") return;
    if (event.data.agentId !== agentId || event.data.component !== component)
      return;
    if (typeof event.data.height === "number" && event.data.height > 0) {
      iframe.style.height = event.data.height + "px";
    }
  });

  // Insert into DOM
  container.appendChild(iframe);
  scriptTag.parentNode.insertBefore(container, scriptTag.nextSibling);
})();
