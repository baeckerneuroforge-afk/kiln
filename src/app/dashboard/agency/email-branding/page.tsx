"use client";

import { Mail } from "lucide-react";
import { EmailBrandingForm } from "@/components/email-branding/email-branding-form";

export default function AgencyEmailBrandingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 font-serif text-2xl text-foreground">
          <Mail className="h-5 w-5 text-kiln-orange" />
          Email Branding
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          White-label transactional emails sent from this agency. Logo and
          accent color reuse the values you already configured under{" "}
          <a href="/dashboard/agency/branding" className="text-kiln-orange hover:underline">
            Branding
          </a>
          .
        </p>
      </header>

      <EmailBrandingForm
        title="Agency-level email"
        description="Applies to every email unless a customer (sub-org) overrides it below."
        endpoint="/api/email-branding/agency"
      />
    </div>
  );
}
