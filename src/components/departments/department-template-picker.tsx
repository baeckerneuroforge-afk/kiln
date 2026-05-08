"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Headphones, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DepartmentTemplatePicker() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function createCustomerSupport() {
    setLoading(true);
    const response = await fetch("/api/departments/templates/customer-support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const department = await response.json();
    setLoading(false);
    if (response.ok) {
      router.push(`/dashboard/departments/${department.id}`);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <button
        type="button"
        onClick={createCustomerSupport}
        disabled={loading}
        className="rounded-lg border border-orange-500/25 bg-card/80 p-5 text-left transition hover:border-orange-500/50 hover:shadow-[0_0_24px_rgba(249,115,22,0.08)]"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10">
            <Headphones className="h-5 w-5 text-orange-300" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Customer Support</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Manager loop with Triage, L1, L2, and Escalator workers. Approval-first by default.
            </p>
            <Button className="mt-5 bg-orange-500 text-white hover:bg-orange-600" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </div>
        </div>
      </button>
    </div>
  );
}
