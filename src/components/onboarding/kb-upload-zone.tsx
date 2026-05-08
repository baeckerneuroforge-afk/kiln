"use client";

import { Upload } from "lucide-react";

export function KbUploadZone({
  files,
  onFiles,
}: {
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center transition-colors hover:border-kiln-orange/50">
      <Upload className="h-8 w-8 text-kiln-orange" />
      <span className="mt-3 text-sm font-medium text-foreground">Drop PDFs or click to upload</span>
      <span className="mt-1 text-xs text-muted-foreground">Max 50 PDFs, 100MB total. Invalid files are skipped during activation.</span>
      <input
        type="file"
        accept="application/pdf"
        multiple
        className="hidden"
        onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
      />
      {files.length > 0 && (
        <span className="mt-3 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{files.length} files selected</span>
      )}
    </label>
  );
}
