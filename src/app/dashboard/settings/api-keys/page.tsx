import { redirect } from "next/navigation";

export default function ApiKeysSettingsRedirect() {
  redirect("/dashboard/settings?tab=api-keys");
}
