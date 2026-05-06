import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { canAccessTeam, canEditTeam } from "@/lib/team-permissions";
import {
  maskWorkflowSecret,
  normalizeWorkflowVariableType,
  prepareWorkflowVariableForStorage,
  toClientWorkflowVariable,
} from "@/lib/workflow-variables-runtime";

function variableNameValid(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canAccessTeam(params.id, userId))) {
    return Response.json({ error: "Team not found" }, { status: 404 });
  }

  const variables = await prisma.workflowVariable.findMany({
    where: { agentTeamId: params.id },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({ variables: variables.map(toClientWorkflowVariable) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditTeam(params.id, userId))) {
    return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
  }

  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!variableNameValid(name)) {
    return Response.json(
      { error: "Variable name must start with a letter or underscore and contain only letters, numbers, and underscores." },
      { status: 400 }
    );
  }

  const existing = await prisma.workflowVariable.findUnique({
    where: { agentTeamId_name: { agentTeamId: params.id, name } },
  });

  const incomingType = normalizeWorkflowVariableType(body.type);
  const incomingIsSecret = incomingType === "SECRET" || body.isSecret === true;
  const value =
    incomingIsSecret &&
    (body.value === maskWorkflowSecret("") || body.value === "••••••••") &&
    existing
      ? existing.value
      : prepareWorkflowVariableForStorage({
          name,
          value: body.value ?? "",
          type: incomingType,
          isSecret: incomingIsSecret,
        }).value;

  const variable = await prisma.workflowVariable.upsert({
    where: { agentTeamId_name: { agentTeamId: params.id, name } },
    update: {
      value,
      type: incomingType,
      isSecret: incomingIsSecret,
    },
    create: {
      agentTeamId: params.id,
      name,
      value,
      type: incomingType,
      isSecret: incomingIsSecret,
    },
  });

  return Response.json({ variable: toClientWorkflowVariable(variable) }, { status: existing ? 200 : 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditTeam(params.id, userId))) {
    return Response.json({ error: "Team not found or insufficient permissions" }, { status: 404 });
  }

  const url = new URL(request.url);
  let variableId = url.searchParams.get("variableId");
  let name = url.searchParams.get("name");

  if (!variableId && !name) {
    const body = await request.json().catch(() => null);
    variableId = typeof body?.variableId === "string" ? body.variableId : null;
    name = typeof body?.name === "string" ? body.name : null;
  }

  const deleted = await prisma.workflowVariable.deleteMany({
    where: {
      agentTeamId: params.id,
      ...(variableId ? { id: variableId } : { name: name || "__missing__" }),
    },
  });

  return Response.json({ success: deleted.count > 0 });
}
