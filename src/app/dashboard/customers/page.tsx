"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CustomerProfileRow {
  id: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  fullName: string | null;
  totalConversations: number;
  lastSeenAt: string;
  isAnonymized: boolean;
}

interface CustomersResponse {
  profiles: CustomerProfileRow[];
  total: number;
  page: number;
  limit: number;
}

export default function CustomersPage() {
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (channel) params.set("channel", channel);
    setLoading(true);
    fetch(`/api/customers?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Status ${response.status}`);
        return (await response.json()) as CustomersResponse;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [search, channel]);

  const profiles = useMemo(() => data?.profiles ?? [], [data]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Meine Kunden</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-Conversation Customer-Profile mit Memory und DSGVO-Aktionen.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Suche nach Name, Email oder Telefon"
            className="pl-9"
          />
        </div>
        <select
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Alle Kanaele</option>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Fehler beim Laden: {error}
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-16 text-center text-muted-foreground">
          <Users className="mb-3 h-8 w-8" />
          <p className="text-sm">Noch keine Customer-Profile in dieser Sub-Org.</p>
          <p className="text-xs">Profile entstehen automatisch sobald Email- oder WhatsApp-Anfragen eingehen.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Telefon</th>
                <th className="px-4 py-2">Conversations</th>
                <th className="px-4 py-2">Zuletzt gesehen</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-foreground">
                    {profile.fullName || "(unbenannt)"}
                    {profile.isAnonymized ? (
                      <Badge variant="outline" className="ml-2">anonymisiert</Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{profile.primaryEmail || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{profile.primaryPhone || "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{profile.totalConversations}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {new Date(profile.lastSeenAt).toLocaleString("de-DE")}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/dashboard/customers/${profile.id}`}>
                      <Button variant="outline" size="sm">Details</Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            <span>{data?.total ?? profiles.length} Customer gesamt</span>
          </div>
        </div>
      )}
    </div>
  );
}
