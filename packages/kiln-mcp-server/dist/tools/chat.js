import { z } from "zod";
export function registerChatTools(server, client) {
    // ── kiln_chat ──
    server.tool("kiln_chat", "Send a message to a Chat Agent and get a response. Use sessionId to maintain conversation context across messages.", {
        agentId: z.string().describe("Agent ID"),
        message: z.string().describe("Message to send to the agent"),
        sessionId: z.string().optional().describe("Session ID for conversation continuity (auto-generated if omitted)"),
    }, async (args) => client.callTool("kiln_chat", args));
    // ── kiln_run_agent ──
    server.tool("kiln_run_agent", "Manually trigger a Task Agent with text input and return the execution result. Only works for agents with agentMode=TASK.", {
        agentId: z.string().describe("Agent ID of the task agent to run"),
        input: z.string().optional().describe("Input text or instructions for the task"),
    }, async (args) => client.callTool("kiln_run_agent", args));
    // ── kiln_run_task ──
    server.tool("kiln_run_task", "Execute a Task Agent with structured JSON input. Supports full tool calling, pre/post-processing, and output routing. Waits for completion.", {
        agentId: z.string().describe("Agent ID of the task agent to run"),
        input: z.record(z.unknown()).optional().describe("JSON object with input data matching the agent's input schema"),
    }, async (args) => client.callTool("kiln_run_task", args));
    // ── kiln_get_runs ──
    server.tool("kiln_get_runs", "Get execution history for a Task Agent. Returns recent runs with status, duration, output preview, and credits used.", {
        agentId: z.string().describe("Agent ID"),
        limit: z.number().optional().describe("Number of runs to return (default 20, max 50)"),
    }, async (args) => client.callTool("kiln_get_runs", args));
}
//# sourceMappingURL=chat.js.map