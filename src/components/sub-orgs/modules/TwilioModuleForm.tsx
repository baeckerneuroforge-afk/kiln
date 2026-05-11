"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TwilioCredentialsDraft } from "./validation";

interface TwilioModuleFormProps {
  value: TwilioCredentialsDraft;
  onChange: (next: TwilioCredentialsDraft) => void;
  errors: Record<string, string>;
  disabled?: boolean;
  groupId: string;
}

export function TwilioModuleForm({ value, onChange, errors, disabled, groupId }: TwilioModuleFormProps) {
  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor={`${groupId}-sid`}>Twilio Account SID</Label>
        <Input
          id={`${groupId}-sid`}
          type="text"
          autoComplete="off"
          placeholder="ACxxxxxxxxxxxxxxxx"
          value={value.accountSid ?? ""}
          onChange={(event) => onChange({ ...value, accountSid: event.target.value })}
          disabled={disabled}
          aria-invalid={!!errors.accountSid}
          aria-describedby={errors.accountSid ? `${groupId}-sid-error` : undefined}
        />
        {errors.accountSid ? (
          <p id={`${groupId}-sid-error`} className="mt-1 text-xs text-destructive">
            {errors.accountSid}
          </p>
        ) : null}
      </div>
      <div>
        <Label htmlFor={`${groupId}-token`}>Auth Token</Label>
        <Input
          id={`${groupId}-token`}
          type="password"
          autoComplete="off"
          value={value.authToken ?? ""}
          onChange={(event) => onChange({ ...value, authToken: event.target.value })}
          disabled={disabled}
          aria-invalid={!!errors.authToken}
          aria-describedby={errors.authToken ? `${groupId}-token-error` : undefined}
        />
        {errors.authToken ? (
          <p id={`${groupId}-token-error`} className="mt-1 text-xs text-destructive">
            {errors.authToken}
          </p>
        ) : null}
      </div>
      <div>
        <Label htmlFor={`${groupId}-phone`}>
          Telefonnummer <span className="text-xs text-muted-foreground">(E.164, optional)</span>
        </Label>
        <Input
          id={`${groupId}-phone`}
          type="text"
          autoComplete="off"
          placeholder="+49301234567"
          value={value.phoneNumber ?? ""}
          onChange={(event) => onChange({ ...value, phoneNumber: event.target.value })}
          disabled={disabled}
          aria-invalid={!!errors.phoneNumber}
          aria-describedby={errors.phoneNumber ? `${groupId}-phone-error` : undefined}
        />
        {errors.phoneNumber ? (
          <p id={`${groupId}-phone-error`} className="mt-1 text-xs text-destructive">
            {errors.phoneNumber}
          </p>
        ) : null}
      </div>
    </div>
  );
}
