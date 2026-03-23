import { Sandbox } from "e2b";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const BROWSER_CONTROLLER_PORT = 8765;
const BROWSER_CONTROLLER_PATH = "/tmp/kiln_browser_controller.py";

const BROWSER_CONTROLLER_SCRIPT = String.raw`
import base64
import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"

playwright = sync_playwright().start()
browser = playwright.chromium.launch(headless=True)
context = browser.new_context(
    viewport={"width": 1280, "height": 720},
    user_agent=USER_AGENT,
)
page = context.new_page()
page.set_default_timeout(30000)
page.set_default_navigation_timeout(30000)


def wait_after_action():
    try:
        page.wait_for_load_state("networkidle", timeout=5000)
    except Exception:
        try:
            page.wait_for_timeout(500)
        except Exception:
            pass


def pack_state(include_screenshot=False, full_page=False):
    payload = {
        "success": True,
        "url": page.url or "",
        "html": page.content(),
    }
    if include_screenshot:
        screenshot = page.screenshot(type="png", full_page=full_page)
        payload["screenshot"] = base64.b64encode(screenshot).decode("utf-8")
    return payload


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send(self, payload, status=200):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def _handle(self, path, payload):
        if path == "/health":
            return {"success": True, "url": page.url or ""}

        if path == "/navigate":
            page.goto(
                payload["url"],
                wait_until="networkidle",
                timeout=int(payload.get("timeout", 30000)),
            )
            return pack_state(
                include_screenshot=bool(payload.get("withScreenshot", False)),
                full_page=bool(payload.get("fullPage", False)),
            )

        if path == "/state":
            return pack_state(
                include_screenshot=bool(payload.get("withScreenshot", False)),
                full_page=bool(payload.get("fullPage", False)),
            )

        if path == "/screenshot":
            screenshot = page.screenshot(
                type="png",
                full_page=bool(payload.get("fullPage", False)),
            )
            return {
                "success": True,
                "url": page.url or "",
                "screenshot": base64.b64encode(screenshot).decode("utf-8"),
            }

        if path == "/click":
            selector = payload.get("selector")
            if selector:
                page.locator(selector).first.click(timeout=int(payload.get("timeout", 10000)))
            else:
                page.mouse.click(float(payload["x"]), float(payload["y"]))
            wait_after_action()
            return pack_state(
                include_screenshot=bool(payload.get("withScreenshot", False)),
                full_page=bool(payload.get("fullPage", False)),
            )

        if path == "/type":
            selector = payload.get("selector")
            text = str(payload.get("text", ""))
            if selector:
                locator = page.locator(selector).first
                locator.click(timeout=int(payload.get("timeout", 10000)))
                if bool(payload.get("clear", True)):
                    locator.fill("")
                locator.type(text, delay=int(payload.get("delay", 25)))
            else:
                page.keyboard.type(text, delay=int(payload.get("delay", 25)))
            wait_after_action()
            return pack_state(
                include_screenshot=bool(payload.get("withScreenshot", False)),
                full_page=bool(payload.get("fullPage", False)),
            )

        if path == "/scroll":
            amount = int(payload.get("amount", 500))
            if str(payload.get("direction", "down")) == "up":
                amount = -abs(amount)
            else:
                amount = abs(amount)
            page.mouse.wheel(0, amount)
            page.wait_for_timeout(350)
            return pack_state(
                include_screenshot=bool(payload.get("withScreenshot", False)),
                full_page=bool(payload.get("fullPage", False)),
            )

        if path == "/eval":
            source = str(payload.get("script", ""))
            result = page.evaluate("(source) => (new Function(source))()", source)
            return {
                "success": True,
                "url": page.url or "",
                "result": result,
            }

        raise ValueError(f"Unsupported route: {path}")

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            payload = self._handle(path, {})
            self._send(payload)
        except Exception as exc:
            self._send(
                {
                    "success": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                },
                status=500,
            )

    def do_POST(self):
        path = urlparse(self.path).path
        payload = self._read_json()
        try:
            response = self._handle(path, payload)
            self._send(response)
        except PlaywrightTimeoutError as exc:
            self._send(
                {
                    "success": False,
                    "error": f"Playwright timeout: {exc}",
                    "traceback": traceback.format_exc(),
                },
                status=504,
            )
        except Exception as exc:
            self._send(
                {
                    "success": False,
                    "error": str(exc),
                    "traceback": traceback.format_exc(),
                },
                status=500,
            )


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"KILN_BROWSER_CONTROLLER_READY:{port}", flush=True)
    try:
        server.serve_forever()
    finally:
        try:
            context.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass
        try:
            playwright.stop()
        except Exception:
            pass


if __name__ == "__main__":
    main()
`;

interface BrowserRpcResponse<T = unknown> {
  success: boolean;
  url?: string;
  html?: string;
  screenshot?: string;
  result?: T;
  error?: string;
  traceback?: string;
}

interface BrowserRpcState {
  url: string;
  html: string;
  screenshot?: string | null;
}

export class E2BBrowserSession {
  readonly backend = "e2b";
  readonly sandboxId: string;

  private readonly sandbox: Sandbox;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private closed = false;

  private constructor(sandbox: Sandbox, timeoutMs: number) {
    this.sandbox = sandbox;
    this.sandboxId = sandbox.sandboxId;
    this.timeoutMs = timeoutMs;
    this.baseUrl = `https://${sandbox.getHost(BROWSER_CONTROLLER_PORT)}`;
  }

  static async start(options?: {
    timeoutMs?: number;
    metadata?: Record<string, string>;
  }): Promise<E2BBrowserSession> {
    const apiKey = process.env.E2B_API_KEY;
    if (!apiKey) {
      throw new Error("E2B_API_KEY not configured");
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const sandbox = await Sandbox.create({
      apiKey,
      timeoutMs,
      metadata: {
        service: "kiln-computer-use",
        ...(options?.metadata || {}),
      },
    });

    const session = new E2BBrowserSession(sandbox, timeoutMs);
    await session.bootstrap();
    return session;
  }

  async navigate(url: string, options?: { timeout?: number; withScreenshot?: boolean }): Promise<BrowserRpcState> {
    const response = await this.rpc<unknown>("/navigate", {
      url,
      timeout: options?.timeout ?? 30000,
      withScreenshot: options?.withScreenshot ?? false,
      fullPage: false,
    });

    return {
      url: response.url || url,
      html: response.html || "",
      screenshot: response.screenshot || null,
    };
  }

  async state(options?: { withScreenshot?: boolean; fullPage?: boolean }): Promise<BrowserRpcState> {
    const response = await this.rpc<unknown>("/state", {
      withScreenshot: options?.withScreenshot ?? false,
      fullPage: options?.fullPage ?? false,
    });

    return {
      url: response.url || "",
      html: response.html || "",
      screenshot: response.screenshot || null,
    };
  }

  async screenshot(options?: { fullPage?: boolean }): Promise<string> {
    const response = await this.rpc<unknown>("/screenshot", {
      fullPage: options?.fullPage ?? false,
    });
    return response.screenshot || "";
  }

  async click(options: { selector?: string; x?: number; y?: number; withScreenshot?: boolean }): Promise<BrowserRpcState> {
    const response = await this.rpc<unknown>("/click", {
      ...options,
      fullPage: false,
    });
    return {
      url: response.url || "",
      html: response.html || "",
      screenshot: response.screenshot || null,
    };
  }

  async type(options: {
    text: string;
    selector?: string;
    clear?: boolean;
    delay?: number;
    withScreenshot?: boolean;
  }): Promise<BrowserRpcState> {
    const response = await this.rpc<unknown>("/type", {
      ...options,
      fullPage: false,
    });
    return {
      url: response.url || "",
      html: response.html || "",
      screenshot: response.screenshot || null,
    };
  }

  async scroll(direction: "up" | "down", amount: number, withScreenshot = false): Promise<BrowserRpcState> {
    const response = await this.rpc<unknown>("/scroll", {
      direction,
      amount,
      withScreenshot,
      fullPage: false,
    });
    return {
      url: response.url || "",
      html: response.html || "",
      screenshot: response.screenshot || null,
    };
  }

  async evaluate<T>(script: string): Promise<T> {
    const response = await this.rpc<T>("/eval", { script });
    return response.result as T;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.sandbox.kill().catch(() => {});
  }

  private async bootstrap(): Promise<void> {
    await this.sandbox.files.write(BROWSER_CONTROLLER_PATH, BROWSER_CONTROLLER_SCRIPT);
    await this.ensurePlaywright();
    await this.startController();
    await this.waitUntilReady();
  }

  private async ensurePlaywright(): Promise<void> {
    const installCommand = [
      "python3 -c \"import playwright\" >/dev/null 2>&1",
      "(python3 -m pip install --disable-pip-version-check playwright && python3 -m playwright install chromium)",
    ].join(" || ");

    const result = await this.sandbox.commands.run(
      `bash -lc ${JSON.stringify(installCommand)}`,
      {
        cwd: "/home/user",
        timeoutMs: 240000,
      }
    );

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to install Playwright in E2B sandbox");
    }
  }

  private async startController(): Promise<void> {
    await this.sandbox.commands.run(
      `python3 -u ${BROWSER_CONTROLLER_PATH} ${BROWSER_CONTROLLER_PORT}`,
      {
        background: true,
        cwd: "/home/user",
      }
    );
  }

  private async waitUntilReady(): Promise<void> {
    const startedAt = Date.now();
    let lastError = "Browser controller did not start";

    while (Date.now() - startedAt < 60000) {
      try {
        const response = await fetch(`${this.baseUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          return;
        }

        lastError = `Health check returned ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Health check failed";
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Timed out starting E2B browser controller: ${lastError}`);
  }

  private async rpc<T>(path: string, payload?: Record<string, unknown>): Promise<BrowserRpcResponse<T>> {
    if (this.closed) {
      throw new Error("E2B browser session is closed");
    }

    await this.sandbox.setTimeout(this.timeoutMs).catch(() => {});

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(35000),
    });

    const data = await response.json().catch(() => ({ success: false, error: response.statusText })) as BrowserRpcResponse<T>;
    if (!response.ok || !data.success) {
      throw new Error(data.error || `Browser controller request failed: ${response.status}`);
    }

    return data;
  }
}
