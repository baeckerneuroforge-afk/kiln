import os from "os";
import path from "path";
import { promises as fs } from "fs";
export const DEFAULT_API_BASE_URL = "https://kilnbase.com/api/v1";
export class KilnApiError extends Error {
    status;
    body;
    constructor(message, status, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = "KilnApiError";
    }
}
export function getKilnConfigPath() {
    return path.join(os.homedir(), ".kilnrc");
}
export async function readStoredConfig() {
    try {
        const raw = await fs.readFile(getKilnConfigPath(), "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed.apiKey || typeof parsed.apiKey !== "string")
            return null;
        return {
            apiKey: parsed.apiKey,
            ...(typeof parsed.baseUrl === "string" ? { baseUrl: parsed.baseUrl } : {}),
        };
    }
    catch {
        return null;
    }
}
export async function writeStoredConfig(config) {
    await fs.writeFile(getKilnConfigPath(), `${JSON.stringify(config, null, 2)}\n`, {
        mode: 0o600,
    });
}
export class KilnApiClient {
    apiKey;
    baseUrl;
    constructor(apiKey, baseUrl) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl.replace(/\/+$/, "");
    }
    static async create(options = {}) {
        const stored = await readStoredConfig();
        const apiKey = options.apiKey || process.env.KILN_API_KEY || stored?.apiKey;
        if (!apiKey) {
            throw new Error("No API key configured. Run `kiln login` or pass --api-key.");
        }
        const baseUrl = options.baseUrl || process.env.KILN_API_BASE_URL || stored?.baseUrl || DEFAULT_API_BASE_URL;
        return new KilnApiClient(apiKey, baseUrl);
    }
    async request(pathname, init = {}) {
        const response = await fetch(`${this.baseUrl}${pathname}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                ...(init.headers || {}),
            },
        });
        const text = await response.text();
        const body = text ? JSON.parse(text) : null;
        if (!response.ok) {
            const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
                ? body.error
                : `KILN API request failed with status ${response.status}`;
            throw new KilnApiError(message, response.status, body);
        }
        return body;
    }
    listAgents() {
        return this.request("/agents");
    }
    createAgent(payload) {
        return this.request("/agents", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }
    updateAgent(agentId, payload) {
        return this.request(`/agents/${agentId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
        });
    }
    addKnowledge(agentId, payload) {
        return this.request(`/agents/${agentId}/knowledge`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }
    getLogs(agentId, limit = 10) {
        const params = new URLSearchParams({ limit: String(limit) });
        return this.request(`/agents/${agentId}/logs?${params}`);
    }
    testAgent(agentId, message, sessionId) {
        return this.request(`/agents/${agentId}/chat`, {
            method: "POST",
            body: JSON.stringify({
                message,
                ...(sessionId ? { sessionId } : {}),
            }),
        });
    }
}
