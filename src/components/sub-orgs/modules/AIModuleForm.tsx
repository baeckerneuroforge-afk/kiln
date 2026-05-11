"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AICredentialsDraft } from "./validation";

interface AIModuleFormProps {
  value: AICredentialsDraft;
  onChange: (next: AICredentialsDraft) => void;
  errors: Record<string, string>;
  disabled?: boolean;
  groupId: string;
}

export function AIModuleForm({ value, onChange, errors, disabled, groupId }: AIModuleFormProps) {
  return (
    <div className="grid gap-3">
      <div>
        <Label htmlFor={`${groupId}-anthropic`}>Anthropic API Key</Label>
        <Input
          id={`${groupId}-anthropic`}
          type="password"
          autoComplete="off"
          placeholder="sk-ant-..."
          value={value.anthropicKey ?? ""}
          onChange={(event) => onChange({ ...value, anthropicKey: event.target.value })}
          disabled={disabled}
          aria-invalid={!!errors.anthropicKey}
          aria-describedby={errors.anthropicKey ? `${groupId}-anthropic-error` : undefined}
        />
        {errors.anthropicKey ? (
          <p id={`${groupId}-anthropic-error`} className="mt-1 text-xs text-destructive">
            {errors.anthropicKey}
          </p>
        ) : null}
      </div>
      <div>
        <Label htmlFor={`${groupId}-openai`}>
          OpenAI API Key <span className="text-xs text-muted-foreground">(optional, Fallback)</span>
        </Label>
        <Input
          id={`${groupId}-openai`}
          type="password"
          autoComplete="off"
          placeholder="sk-..."
          value={value.openaiKey ?? ""}
          onChange={(event) => onChange({ ...value, openaiKey: event.target.value })}
          disabled={disabled}
          aria-invalid={!!errors.openaiKey}
          aria-describedby={errors.openaiKey ? `${groupId}-openai-error` : undefined}
        />
        {errors.openaiKey ? (
          <p id={`${groupId}-openai-error`} className="mt-1 text-xs text-destructive">
            {errors.openaiKey}
          </p>
        ) : null}
      </div>
    </div>
  );
}
