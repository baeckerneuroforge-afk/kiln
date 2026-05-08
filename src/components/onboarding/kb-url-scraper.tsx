"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function KbUrlScraper({
  urls,
  onChange,
}: {
  urls: string[];
  onChange: (urls: string[]) => void;
}) {
  function addUrl() {
    onChange([...urls, ""]);
  }
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Website URLs</h3>
          <p className="text-sm text-muted-foreground">Paste up to 20 important pages to scrape into the KB.</p>
        </div>
        <Button type="button" variant="outline" onClick={addUrl}>
          <Plus className="h-4 w-4" />
          Add URL
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {urls.map((url, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={url}
              onChange={(event) => onChange(urls.map((item, i) => (i === index ? event.target.value : item)))}
              placeholder="https://kunde.de/faq"
              className="h-10 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-kiln-orange"
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(urls.filter((_, i) => i !== index))}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
