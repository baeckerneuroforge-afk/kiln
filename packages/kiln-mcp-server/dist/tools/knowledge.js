import { z } from "zod";
export function registerKnowledgeTools(server, client) {
    // ── kiln_add_knowledge ──
    server.tool("kiln_add_knowledge", "Add a knowledge base entry to an agent. Supports TEXT, URL, PDF, or FAQ content for RAG.", {
        agentId: z.string().describe("Agent ID"),
        type: z.enum(["TEXT", "URL", "PDF", "FAQ"]).describe("Knowledge type"),
        sourceName: z.string().describe("Name for this knowledge source (e.g. 'Product FAQ')"),
        content: z.string().describe("The content text, URL, or FAQ entries"),
    }, async (args) => client.callTool("kiln_add_knowledge", args));
    // ── kiln_add_action ──
    server.tool("kiln_add_action", "Enable and configure a pre-built action on an agent (appointment booking, email collection, lead scoring, custom code, etc.).", {
        agentId: z.string().describe("Agent ID"),
        type: z.enum(["BOOK_APPOINTMENT", "COLLECT_EMAIL", "SCORE_LEAD", "CUSTOM_CODE", "SEND_EMAIL", "NOTIFY_OWNER", "FIRE_WEBHOOK", "HANDOFF_HUMAN"]).describe("Action type"),
        config: z.record(z.unknown()).optional().describe("Action config (e.g. { calendlyUrl, emailTemplate, webhookUrl, code })"),
    }, async (args) => client.callTool("kiln_add_action", args));
    // ── kiln_add_custom_tool ──
    server.tool("kiln_add_custom_tool", "Add a custom HTTP API tool to an agent. The agent can call this tool during conversations to fetch external data.", {
        agentId: z.string().describe("Agent ID"),
        name: z.string().describe("Tool name (will be converted to snake_case)"),
        description: z.string().describe("When the agent should use this tool"),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).describe("HTTP method"),
        url: z.string().describe("Endpoint URL (supports {{variable}} placeholders)"),
        headers: z.record(z.string()).optional().describe("HTTP headers"),
        bodyTemplate: z.string().optional().describe("JSON body template with {{variable}} placeholders"),
    }, async (args) => client.callTool("kiln_add_custom_tool", args));
    // ── kiln_add_custom_code ──
    server.tool("kiln_add_custom_code", "Add a CUSTOM_CODE action to an agent. The code runs in a sandboxed environment when triggered during conversation.", {
        agentId: z.string().describe("Agent ID"),
        description: z.string().describe("What the custom code does"),
        code: z.string().describe("JavaScript code to execute (sandboxed, 5s timeout)"),
    }, async (args) => client.callTool("kiln_add_custom_code", args));
    // ── kiln_add_branch ──
    server.tool("kiln_add_branch", "Add a prompt branch to an agent. When user messages match keywords, the prompt snippet is injected into the system prompt.", {
        agentId: z.string().describe("Agent ID"),
        name: z.string().describe("Branch name (e.g. 'Pricing Questions')"),
        keywords: z.array(z.string()).describe("Keywords that trigger this branch (case-insensitive)"),
        promptSnippet: z.string().describe("Prompt text injected when keywords match"),
    }, async (args) => client.callTool("kiln_add_branch", args));
    // ── kiln_set_memory ──
    server.tool("kiln_set_memory", "Toggle persistent memory for an agent. When enabled, the agent remembers user details across conversations.", {
        agentId: z.string().describe("Agent ID"),
        enabled: z.boolean().describe("Enable or disable persistent memory"),
    }, async (args) => client.callTool("kiln_set_memory", args));
    // ── kiln_create_test ──
    server.tool("kiln_create_test", "Create a test case for an agent. Tests check if the agent's response contains expected keywords.", {
        agentId: z.string().describe("Agent ID"),
        name: z.string().describe("Test case name"),
        inputMessage: z.string().describe("Message to send to the agent"),
        expectedKeywords: z.array(z.string()).describe("Keywords the response must contain to pass"),
    }, async (args) => client.callTool("kiln_create_test", args));
    // ── kiln_run_tests ──
    server.tool("kiln_run_tests", "Execute all test cases for an agent. Sends each input to the LLM and checks for expected keywords. Returns pass/fail score.", {
        agentId: z.string().describe("Agent ID"),
    }, async (args) => client.callTool("kiln_run_tests", args));
}
//# sourceMappingURL=knowledge.js.map