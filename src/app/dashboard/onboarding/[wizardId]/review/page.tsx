"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ActivationProgress } from "@/components/onboarding/activation-progress";
import { ReviewSummary } from "@/components/onboarding/review-summary";
import { WizardShell } from "@/components/onboarding/wizard-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import type { WizardBasics, WizardChannelConfig, WizardTemplateSelection } from "@/lib/onboarding/types";

interface WizardStatus {
  basics: WizardBasics;
  selectedTemplates: WizardTemplateSelection[];
  channelConfig: WizardChannelConfig;
  knowledgeConfig?: { files?: unknown[]; urls?: string[] };
  progress?: { label?: string };
  result?: { relationshipId?: string };
}

export default function ReviewPage({ params }: { params: { wizardId: string } }) {
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [activating, setActivating] = useState(false);
  const [doneHref, setDoneHref] = useState<string | null>(null);

  const load = useCallback(async () => {
    const body = (await (await fetch(`/api/onboarding/wizard/${params.wizardId}/status`)).json()) as WizardStatus;
    setStatus(body);
    if (body.result?.relationshipId) setDoneHref(`/dashboard/agency/sub-orgs/${body.result.relationshipId}`);
  }, [params.wizardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const workerCount = useMemo(() => {
    const selected = status?.selectedTemplates?.filter((item) => item.selected).length ?? 0;
    return Math.max(selected * 2, selected);
  }, [status?.selectedTemplates]);

  async function activate() {
    setActivating(true);
    const response = await fetch(`/api/onboarding/wizard/${params.wizardId}/activate`, { method: "POST" });
    const body = await response.json();
    setActivating(false);
    if (response.ok) {
      const relationshipId = body.result?.relationshipId;
      setDoneHref(relationshipId ? `/dashboard/agency/sub-orgs/${relationshipId}` : "/dashboard/agency/sub-orgs");
    }
  }

  if (!status) {
    return <div className="flex h-80 items-center justify-center text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading review</div>;
  }

  return (
    <WizardShell wizardId={params.wizardId} step={6} title="Review + Activate" description="Confirm the generated customer setup before provisioning the workspace.">
      <div className="space-y-5">
        <ReviewSummary
          basics={status.basics}
          templates={status.selectedTemplates ?? []}
          channels={status.channelConfig ?? {}}
          kbCount={(status.knowledgeConfig?.files?.length ?? 0) + (status.knowledgeConfig?.urls?.length ?? 0)}
          workerCount={workerCount}
        />
        <div className="flex justify-end gap-3">
          {doneHref ? (
            <Link href={doneHref} className={buttonVariants()}>Open customer</Link>
          ) : (
            <Button onClick={activate} disabled={activating}>
              {activating && <Loader2 className="h-4 w-4 animate-spin" />}
              Activate Customer
            </Button>
          )}
        </div>
      </div>
      <ActivationProgress open={activating} label={status.progress?.label || "Creating Sub-Org, Departments, Knowledge Base, and Channels..."} done={Boolean(doneHref)} />
    </WizardShell>
  );
}
