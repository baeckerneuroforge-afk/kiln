/**
 * Workflow Lead Trigger
 * Wird aufgerufen wenn ein Agent einen Lead erfasst.
 * Prüft ob der Agent zu Teams mit Lead-Trigger-Workflows gehört
 * und startet diese automatisch.
 */

import { prisma } from "@/lib/prisma";
import {
  executeWorkflow,
  extractWorkflowDefinition,
} from "@/lib/services/workflow-runtime";

/**
 * Trigger alle Workflows die einen lead-Trigger haben und
 * deren Agent den Lead erfasst hat.
 */
export async function triggerLeadWorkflows(
  agentId: string,
  userId: string,
  leadData: Record<string, unknown>
): Promise<void> {
  try {
    // Finde alle Teams in denen dieser Agent Mitglied ist
    const memberships = await prisma.agentTeamMember.findMany({
      where: { agentId },
      select: {
        team: {
          select: {
            id: true,
            userId: true,
            config: true,
            goal: true,
            status: true,
          },
        },
      },
    });

    for (const membership of memberships) {
      const team = membership.team;
      if (team.status !== "ACTIVE") continue;

      const workflowDef = extractWorkflowDefinition(team.config);
      if (!workflowDef) continue;

      // Prüfe ob es einen Lead-Trigger gibt
      const leadTrigger = workflowDef.nodes.find(
        (n) => n.type === "trigger_lead"
      );
      if (!leadTrigger) continue;

      // Prüfe den Agent-Filter
      const agentFilter = leadTrigger.config.agentFilter;
      if (agentFilter && agentFilter !== "all" && agentFilter !== agentId) {
        continue;
      }

      // Starte den Workflow
      executeWorkflow({
        teamId: team.id,
        userId: team.userId,
        triggerNodeId: leadTrigger.id,
        triggerPayload: leadData,
        goal: team.goal || "Lead-triggered Workflow",
      }).catch((err) => {
        console.error(
          `[Lead Trigger] Workflow für Team ${team.id} fehlgeschlagen:`,
          err
        );
      });
    }
  } catch (err) {
    console.error("[Lead Trigger] Fehler:", err);
  }
}
