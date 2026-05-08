import { prisma } from "@/lib/prisma";
import { asJsonRecord, deepMerge, toPrismaJson } from "./json";

const MEMORY_WARNING_BYTES = 1024 * 1024;

export async function readMemory(departmentId: string): Promise<Record<string, unknown>> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { operatingMemory: true },
  });

  return asJsonRecord(department?.operatingMemory);
}

export async function patchMemory(
  departmentId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const current = await readMemory(departmentId);
  const next = deepMerge(current, patch);
  warnIfLargeMemory(departmentId, next);

  await prisma.department.update({
    where: { id: departmentId },
    data: { operatingMemory: toPrismaJson(next) },
  });
}

export async function setMemoryKey(
  departmentId: string,
  key: string,
  value: unknown
): Promise<void> {
  await patchMemory(departmentId, { [key]: value });
}

function warnIfLargeMemory(departmentId: string, memory: Record<string, unknown>) {
  const bytes = Buffer.byteLength(JSON.stringify(memory));
  if (bytes > MEMORY_WARNING_BYTES) {
    console.warn(
      `Department ${departmentId} operating memory is ${bytes} bytes; consider compacting it.`
    );
  }
}
