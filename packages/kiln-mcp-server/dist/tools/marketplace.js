import { z } from "zod";
export function registerMarketplaceTools(server, client) {
    // ── kiln_get_analytics ──
    server.tool("kiln_get_analytics", "Get analytics for an agent: total conversations, leads collected, average lead score, and daily breakdown.", {
        agentId: z.string().describe("Agent ID"),
        range: z.enum(["7d", "30d", "90d"]).describe("Time range"),
    }, async (args) => client.callTool("kiln_get_analytics", args));
    // ── kiln_get_conversations ──
    server.tool("kiln_get_conversations", "Retrieve conversation logs for an agent with messages, lead scores, and visitor info.", {
        agentId: z.string().describe("Agent ID"),
        limit: z.number().optional().describe("Max conversations to return (default 20, max 100)"),
        minScore: z.number().optional().describe("Filter by minimum lead score (1-10)"),
    }, async (args) => client.callTool("kiln_get_conversations", args));
    // ── kiln_get_leads ──
    server.tool("kiln_get_leads", "Get collected leads for an agent with email, name, score, and conversation context.", {
        agentId: z.string().describe("Agent ID"),
        minScore: z.number().optional().describe("Filter by minimum lead score (1-10)"),
    }, async (args) => client.callTool("kiln_get_leads", args));
    // ── kiln_set_white_label ──
    server.tool("kiln_set_white_label", "Configure white-label branding for an agent: primary color, logo URL, and badge visibility.", {
        agentId: z.string().describe("Agent ID"),
        primaryColor: z.string().optional().describe("Hex color (e.g. '#F97316')"),
        logoUrl: z.string().optional().describe("URL to logo image"),
        hideBadge: z.boolean().optional().describe("Hide 'Powered by KILN' badge (Pro/Agency only)"),
    }, async (args) => client.callTool("kiln_set_white_label", args));
    // ── kiln_get_embed_code ──
    server.tool("kiln_get_embed_code", "Get the embed code (script tag) and public URL for an agent's chat widget.", {
        agentId: z.string().describe("Agent ID"),
    }, async (args) => client.callTool("kiln_get_embed_code", args));
    // ── kiln_create_webhook ──
    server.tool("kiln_create_webhook", "Create an inbound webhook endpoint for an agent. External services can POST to this URL to trigger agent processing.", {
        agentId: z.string().describe("Agent ID"),
        authType: z.enum(["NONE", "HEADER_AUTH", "HMAC"]).optional().describe("Authentication type (default: NONE)"),
        authValue: z.string().optional().describe("Bearer token or HMAC secret"),
        responseMode: z.enum(["IMMEDIATE", "AFTER_PROCESSING"]).optional().describe("IMMEDIATE returns 202 instantly, AFTER_PROCESSING waits for response"),
    }, async (args) => client.callTool("kiln_create_webhook", args));
    // ── kiln_list_webhooks ──
    server.tool("kiln_list_webhooks", "List all inbound webhooks for an agent with their URLs, auth config, and execution stats.", {
        agentId: z.string().describe("Agent ID"),
    }, async (args) => client.callTool("kiln_list_webhooks", args));
    // ── kiln_delete_webhook ──
    server.tool("kiln_delete_webhook", "Delete an inbound webhook endpoint. This permanently removes the webhook and all its execution logs.", {
        agentId: z.string().describe("Agent ID (for ownership verification)"),
        webhookId: z.string().describe("Webhook ID to delete"),
    }, async (args) => client.callTool("kiln_delete_webhook", args));
}
//# sourceMappingURL=marketplace.js.map