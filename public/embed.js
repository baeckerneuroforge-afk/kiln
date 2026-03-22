/**
 * KILN Embed Loader
 * Lightweight script that reads data attributes from the page,
 * creates an iframe, and handles responsive sizing.
 * Usage: <div data-kiln-agent="..." data-kiln-component="..." data-kiln-token="..."></div>
 *        <script src="https://app.kiln.so/embed.js" async></script>
 */
(function () {
  "use strict";

  var KILN_BASE =
    (document.currentScript && document.currentScript.getAttribute("data-base-url")) ||
    (function () {
      var scripts = document.getElementsByTagName("script");
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i].src || "";
        if (src.indexOf("embed.js") !== -1) {
          return src.replace(/\/embed\.js.*$/, "");
        }
      }
      return "";
    })();

  function initKilnEmbeds() {
    var containers = document.querySelectorAll("[data-kiln-agent][data-kiln-component]");

    for (var i = 0; i < containers.length; i++) {
      var el = containers[i];
      if (el.getAttribute("data-kiln-initialized")) continue;

      var agentId = el.getAttribute("data-kiln-agent");
      var component = el.getAttribute("data-kiln-component");
      var token = el.getAttribute("data-kiln-token");
      var theme = el.getAttribute("data-kiln-theme") || "dark";
      var width = el.getAttribute("data-kiln-width") || "100%";
      var height = el.getAttribute("data-kiln-height") || "500px";
      var branding = el.getAttribute("data-kiln-branding") !== "false";

      if (!agentId || !component || !token) continue;

      var src =
        KILN_BASE +
        "/embed/" +
        encodeURIComponent(agentId) +
        "/" +
        encodeURIComponent(component) +
        "?token=" +
        encodeURIComponent(token) +
        "&theme=" +
        encodeURIComponent(theme) +
        "&branding=" +
        (branding ? "true" : "false");

      var iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.style.width = width;
      iframe.style.height = height;
      iframe.style.border = "none";
      iframe.style.borderRadius = "12px";
      iframe.style.display = "block";
      iframe.setAttribute("allow", "clipboard-write");
      iframe.setAttribute("loading", "lazy");
      iframe.setAttribute("title", "KILN " + component);

      el.innerHTML = "";
      el.appendChild(iframe);
      el.setAttribute("data-kiln-initialized", "true");
    }
  }

  // Run when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initKilnEmbeds);
  } else {
    initKilnEmbeds();
  }

  // Observe for dynamically added containers
  if (typeof MutationObserver !== "undefined") {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) {
          initKilnEmbeds();
          break;
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Handle resize messages from embedded iframes
  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "kiln-resize") return;
    var iframes = document.querySelectorAll("iframe[src*='embed']");
    for (var i = 0; i < iframes.length; i++) {
      if (iframes[i].contentWindow === event.source) {
        iframes[i].style.height = event.data.height + "px";
        break;
      }
    }
  });
})();
