/**
 * Sprint 19.7.5 — deployTeamTemplate now honours an optional targetOrgId
 * so every entity created during the long transaction (AgentTeam + each
 * Agent) lands under the right Clerk org.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserEmail = vi.hoisted(() => vi.fn());
const mockTransaction = vi.hoisted(() =>
  vi.fn(async (cb: (tx: unknown) => unknown) => cb(buildTx())),
);
const txCalls = vi.hoisted(() => ({
  user: { upsert: vi.fn() },
  agentTeam: { create: vi.fn(), update: vi.fn() },
  agent: { create: vi.fn() },
  agentTeamMember: { create: vi.fn(), update: vi.fn() },
  agentAction: { createMany: vi.fn() },
  agentOrchestration: { create: vi.fn() },
}));

function buildTx() {
  return {
    user: txCalls.user,
    agentTeam: txCalls.agentTeam,
    agent: txCalls.agent,
    agentTeamMember: txCalls.agentTeamMember,
    agentAction: txCalls.agentAction,
    agentOrchestration: txCalls.agentOrchestration,
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));
vi.mock("@/lib/clerk-user-email", () => ({
  getUserEmailOrPlaceholder: mockUserEmail,
}));

import { deployTeamTemplate } from "@/lib/team-templates";

beforeEach(() => {
  mockUserEmail.mockReset();
  mockUserEmail.mockResolvedValue("a@b.c");

  txCalls.user.upsert.mockReset();
  txCalls.agentTeam.create.mockReset();
  txCalls.agentTeam.update.mockReset();
  txCalls.agent.create.mockReset();
  txCalls.agentTeamMember.create.mockReset();
  txCalls.agentTeamMember.update.mockReset();
  txCalls.agentAction.createMany.mockReset();
  txCalls.agentOrchestration.create.mockReset();

  txCalls.user.upsert.mockResolvedValue({});
  txCalls.agentTeam.create.mockResolvedValue({ id: "team_1", name: "Sales" });
  txCalls.agentTeam.update.mockResolvedValue({});
  let agentCounter = 0;
  txCalls.agent.create.mockImplementation((args: { data: { name: string } }) => {
    agentCounter += 1;
    return Promise.resolve({ id: `agent_${agentCounter}`, name: args.data.name });
  });
  let memberCounter = 0;
  txCalls.agentTeamMember.create.mockImplementation(() => {
    memberCounter += 1;
    return Promise.resolve({ id: `member_${memberCounter}` });
  });
  txCalls.agentTeamMember.update.mockResolvedValue({});
  txCalls.agentAction.createMany.mockResolvedValue({});
  txCalls.agentOrchestration.create.mockResolvedValue({});
});

describe("deployTeamTemplate(targetOrgId)", () => {
  it("passes targetOrgId into the AgentTeam create + each Agent create", async () => {
    await deployTeamTemplate(
      "user_1",
      "sales-pipeline",
      { businessName: "Acme", industry: "general" },
      "org_clerk_sub",
    );

    const teamArgs = txCalls.agentTeam.create.mock.calls[0][0];
    expect(teamArgs.data.orgId).toBe("org_clerk_sub");

    // sales-pipeline has 3 non-approval-gate agents (qualifier, closer,
    // follow-up). The approval-gate role does NOT create an Agent row.
    for (const call of txCalls.agent.create.mock.calls) {
      expect(call[0].data.orgId).toBe("org_clerk_sub");
    }
    expect(txCalls.agent.create.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("omits orgId when targetOrgId is not provided (legacy agency path)", async () => {
    await deployTeamTemplate("user_1", "sales-pipeline", { businessName: "Acme" });

    const teamArgs = txCalls.agentTeam.create.mock.calls[0][0];
    expect(teamArgs.data.orgId).toBeUndefined();

    for (const call of txCalls.agent.create.mock.calls) {
      expect(call[0].data.orgId).toBeUndefined();
    }
  });

  it("threads `null` targetOrgId as undefined (no accidental NULL writes)", async () => {
    await deployTeamTemplate("user_1", "sales-pipeline", {}, null);
    expect(txCalls.agentTeam.create.mock.calls[0][0].data.orgId).toBeUndefined();
  });

  it("throws on unknown templateId", async () => {
    await expect(
      deployTeamTemplate("user_1", "made-up-template"),
    ).rejects.toThrow(/Unknown team template/);
  });
});
