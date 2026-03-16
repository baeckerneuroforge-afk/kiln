import { z } from "zod";
export function registerAgentTools(server, client) {
    // ── kiln_list_agents ──
    server.tool("kiln_list_agents", "List all AI agents for the authenticated user. Returns id, name, slug, status, agentMode (CHAT or TASK), model, conversation/run count, and public URL.", {}, async () => client.callTool("kiln_list_agents", {}));
    // ── kiln_create_agent ──
    server.tool("kiln_create_agent", "Create a new AI agent. Set agentMode to CHAT for conversational agents or TASK for autonomous background agents.", {
        name: z.string().describe("Name of the agent"),
        description: z.string().describe("What the agent does"),
        industry: z.string().optional().describe("Industry context (e.g. 'real estate', 'saas', 'ecommerce')"),
        agentMode: z.enum(["CHAT", "TASK"]).optional().describe("Agent mode: CHAT (conversational) or TASK (background execution)"),
    }, async (args) => client.callTool("kiln_create_agent", args));
    // ── kiln_create_task_agent ──
    server.tool("kiln_create_task_agent", "Create a fully configured Task Agent with input schema, output format, pre/post-processing, and actions. Returns the agent ID ready for execution.", {
        name: z.string().describe("Name of the task agent"),
        description: z.string().describe("What the task does"),
        systemPrompt: z.string().optional().describe("Custom system prompt (auto-generated if omitted)"),
        model: z.string().optional().describe("LLM model ID (default: claude-sonnet-4-20250514)"),
        inputSchema: z.object({
            fields: z.array(z.object({
                name: z.string(),
                type: z.enum(["string", "number", "boolean", "object", "array"]),
                description: z.string().optional(),
                required: z.boolean().optional(),
            })),
        }).optional().describe("Schema describing expected input data"),
        outputFormat: z.enum(["json", "text", "markdown"]).optional().describe("Desired output format (default: text)"),
        preProcess: z.object({
            code: z.string().optional().describe("JavaScript transform code (receives `input`)"),
            conditions: z.array(z.object({
                field: z.string().describe("Field path (e.g. 'input.email')"),
                op: z.enum(["exists", "not_exists", "equals", "not_equals", "contains", "not_contains", "gt", "lt", "gte", "lte"]),
                value: z.string().optional(),
            })).optional().describe("Conditions that must be met to run"),
        }).optional().describe("Pre-processing: validate/transform input before LLM call"),
        postProcess: z.object({
            code: z.string().optional().describe("JavaScript transform code (receives `output` and `input`)"),
            branches: z.array(z.object({
                name: z.string().describe("Branch name"),
                condition: z.string().describe("JavaScript condition expression"),
                outputType: z.enum(["EMAIL", "HTTP_REQUEST", "WEBHOOK", "NEXT_AGENT", "NONE"]),
                outputConfig: z.record(z.string()).optional(),
            })).optional().describe("Conditional output routing"),
        }).optional().describe("Post-processing: transform output and route to branches"),
        actions: z.array(z.enum(["COLLECT_EMAIL", "SCORE_LEAD", "HTTP_REQUEST", "FIRE_WEBHOOK", "CUSTOM_CODE"])).optional().describe("Actions the agent can use"),
    }, async (args) => client.callTool("kiln_create_task_agent", args));
    // ── kiln_update_agent ──
    server.tool("kiln_update_agent", "Update an existing agent's configuration. Only provided fields are changed.", {
        id: z.string().describe("Agent ID"),
        system_prompt: z.string().optional().describe("New system prompt"),
        personality: z.object({
            tone: z.string().optional(),
            language: z.string().optional(),
            formality: z.string().optional(),
        }).optional().describe("Personality settings"),
        welcome_message: z.string().optional().describe("New welcome message"),
        name: z.string().optional().describe("New agent name"),
        model: z.string().optional().describe("LLM model ID"),
    }, async (args) => client.callTool("kiln_update_agent", args));
    // ── kiln_delete_agent ──
    server.tool("kiln_delete_agent", "Permanently delete an agent and all its data (conversations, knowledge base, actions). This cannot be undone.", {
        id: z.string().describe("Agent ID to delete"),
    }, async (args) => client.callTool("kiln_delete_agent", args));
    // ── kiln_clone_agent ──
    server.tool("kiln_clone_agent", "Clone an existing agent with all its configuration, actions, custom tools, and knowledge base.", {
        id: z.string().describe("Source agent ID to clone"),
        name: z.string().describe("Name for the cloned agent"),
    }, async (args) => client.callTool("kiln_clone_agent", args));
    // ── kiln_deploy_agent ──
    server.tool("kiln_deploy_agent", "Deploy or undeploy an agent by changing its status to LIVE, DRAFT, or PAUSED.", {
        id: z.string().describe("Agent ID"),
        status: z.enum(["LIVE", "DRAFT", "PAUSED"]).describe("Target status"),
    }, async (args) => client.callTool("kiln_deploy_agent", args));
}
//# sourceMappingURL=agents.js.map