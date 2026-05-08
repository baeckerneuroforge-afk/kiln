"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KbUploadZone } from "@/components/onboarding/kb-upload-zone";
import { KbUrlScraper } from "@/components/onboarding/kb-url-scraper";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function KnowledgePage({ params }: { params: { wizardId: string } }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([""]);

  async function save(skip = false) {
    const payload = {
      skipped: skip,
      urls: urls.filter(Boolean),
      files: await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          contentBase64: await fileToBase64(file),
        }))
      ),
    };
    const response = await fetch(`/api/onboarding/wizard/${params.wizardId}/upload-kb`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) router.push(`/dashboard/onboarding/${params.wizardId}/channels`);
  }

  return (
    <WizardShell wizardId={params.wizardId} step={3} title="Knowledge Base Upload" description="Add PDFs and important website pages now, or skip and add knowledge later.">
      <div className="space-y-4">
        <KbUploadZone files={files} onFiles={setFiles} />
        <KbUrlScraper urls={urls} onChange={setUrls} />
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => save(true)}>Skip for now</Button>
          <Button onClick={() => save(false)}>Continue</Button>
        </div>
      </div>
    </WizardShell>
  );
}
