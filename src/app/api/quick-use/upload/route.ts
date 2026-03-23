import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_MESSAGE,
  type QuickUseFileAttachment,
} from "@/lib/quick-use/types";

export const dynamic = "force-dynamic";

const TEMP_BUCKET = "quick-use-uploads";
/** Temp files auto-delete after 24h via Supabase lifecycle policy */
const SIGNED_URL_TTL = 24 * 60 * 60; // 24h in seconds

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return Response.json({ error: "No files provided" }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_MESSAGE) {
    return Response.json(
      { error: `Maximum ${MAX_FILES_PER_MESSAGE} files per message` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const attachments: QuickUseFileAttachment[] = [];
  const errors: string[] = [];

  for (const file of files) {
    // Validate type
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type as typeof ALLOWED_UPLOAD_TYPES[number])) {
      errors.push(`${file.name}: unsupported file type (${file.type})`);
      continue;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: exceeds 10 MB limit`);
      continue;
    }

    if (file.size === 0) {
      errors.push(`${file.name}: file is empty`);
      continue;
    }

    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${userId}/${id}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(TEMP_BUCKET)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      errors.push(`${file.name}: upload failed (${uploadError.message})`);
      continue;
    }

    // Generate signed URL for temporary access
    const { data: signedData, error: signError } = await supabase.storage
      .from(TEMP_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL);

    if (signError || !signedData?.signedUrl) {
      errors.push(`${file.name}: could not generate download URL`);
      continue;
    }

    attachments.push({
      id,
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
      storagePath,
      url: signedData.signedUrl,
    });
  }

  if (attachments.length === 0 && errors.length > 0) {
    return Response.json({ error: errors.join("; ") }, { status: 400 });
  }

  return Response.json({ attachments, errors: errors.length > 0 ? errors : undefined });
}
