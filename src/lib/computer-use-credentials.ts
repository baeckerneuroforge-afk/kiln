/**
 * Computer Use Credential Management
 * Verschlüsselte Speicherung von Login-Daten für authentifizierte Browsing-Sessions.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

export interface CredentialInput {
  agentId: string;
  serviceName: string;
  loginUrl: string;
  username: string;
  password: string;
}

export interface CredentialView {
  id: string;
  serviceName: string;
  loginUrl: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface DecryptedCredential {
  username: string;
  password: string;
  loginUrl: string;
  serviceName: string;
}

export async function saveCredential(input: CredentialInput) {
  return prisma.agentCredential.create({
    data: {
      agentId: input.agentId,
      serviceName: input.serviceName,
      loginUrl: input.loginUrl,
      encryptedUsername: encrypt(input.username),
      encryptedPassword: encrypt(input.password),
    },
    select: {
      id: true,
      serviceName: true,
      loginUrl: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
}

export async function getCredentials(agentId: string): Promise<CredentialView[]> {
  return prisma.agentCredential.findMany({
    where: { agentId },
    select: {
      id: true,
      serviceName: true,
      loginUrl: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDecryptedCredential(
  credentialId: string,
  agentId: string
): Promise<DecryptedCredential | null> {
  const cred = await prisma.agentCredential.findFirst({
    where: { id: credentialId, agentId },
  });
  if (!cred) return null;

  return {
    username: decrypt(cred.encryptedUsername),
    password: decrypt(cred.encryptedPassword),
    loginUrl: cred.loginUrl,
    serviceName: cred.serviceName,
  };
}

export async function deleteCredential(credentialId: string, agentId: string) {
  return prisma.agentCredential.deleteMany({
    where: { id: credentialId, agentId },
  });
}

export async function markCredentialUsed(credentialId: string) {
  return prisma.agentCredential.update({
    where: { id: credentialId },
    data: { lastUsedAt: new Date() },
  });
}
