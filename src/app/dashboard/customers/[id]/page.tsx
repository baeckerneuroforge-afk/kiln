"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Trash2, Download, Shield, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface CustomerProfile {
  id: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  fullName: string | null;
  totalConversations: number;
  lastSeenAt: string;
  firstSeenAt: string;
  emailAliases: string[];
  phoneAliases: string[];
  isAnonymized: boolean;
  consentGiven: boolean;
  preferences: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

interface MemoryEntry {
  id: string;
  type: string;
  content: string;
  source: string;
  importance: number;
  isActive: boolean;
  createdAt: string;
  expiresAt: string | null;
  departmentId: string | null;
}

interface ChannelMessage {
  id: string;
  channel: string;
  direction: string;
  emailFrom: string | null;
  emailSubject: string | null;
  whatsappFrom: string | null;
  whatsappBody: string | null;
  createdAt: string;
}

interface DetailResponse {
  profile: CustomerProfile;
  memoryEntries: MemoryEntry[];
  channelMessages: ChannelMessage[];
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = params?.id;
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryType, setMemoryType] = useState("FACT");
  const [mergeDuplicateId, setMergeDuplicateId] = useState("");

  const fetchDetail = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    const response = await fetch(`/api/customers/${customerId}`);
    if (response.ok) {
      const payload = (await response.json()) as DetailResponse;
      setData(payload);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleAddMemory = useCallback(async () => {
    if (!customerId || !memoryDraft.trim()) return;
    setBusy("memory");
    await fetch(`/api/customers/${customerId}/memory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: memoryDraft.trim(), type: memoryType, importance: 6 }),
    });
    setMemoryDraft("");
    setBusy(null);
    await fetchDetail();
  }, [customerId, memoryDraft, memoryType, fetchDetail]);

  const handleDeleteMemory = useCallback(
    async (entryId: string) => {
      if (!customerId) return;
      if (!confirm("Memory-Eintrag wirklich loeschen?")) return;
      await fetch(`/api/customers/${customerId}/memory/${entryId}`, { method: "DELETE" });
      await fetchDetail();
    },
    [customerId, fetchDetail],
  );

  const handleExport = useCallback(async () => {
    if (!customerId) return;
    const response = await fetch(`/api/customers/${customerId}/export`);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-${customerId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [customerId]);

  const handleAnonymize = useCallback(async () => {
    if (!customerId) return;
    if (!confirm("Customer-Profile anonymisieren? PII wird unwiderruflich entfernt, Statistiken bleiben.")) return;
    setBusy("anonymize");
    await fetch(`/api/customers/${customerId}/anonymize`, { method: "POST" });
    setBusy(null);
    await fetchDetail();
  }, [customerId, fetchDetail]);

  const handleDelete = useCallback(async () => {
    if (!customerId) return;
    if (!confirm("Wirklich loeschen? Bestaetige fuer DSGVO-konforme Loeschung. Diese Aktion ist nicht reversibel.")) return;
    setBusy("delete");
    await fetch(`/api/customers/${customerId}`, { method: "DELETE" });
    router.push("/dashboard/customers");
  }, [customerId, router]);

  const handleMerge = useCallback(async () => {
    if (!customerId || !mergeDuplicateId.trim()) return;
    setBusy("merge");
    await fetch(`/api/customers/${customerId}/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ duplicateId: mergeDuplicateId.trim() }),
    });
    setMergeDuplicateId("");
    setBusy(null);
    await fetchDetail();
  }, [customerId, mergeDuplicateId, fetchDetail]);

  const profile = data?.profile;
  const memory = useMemo(() => data?.memoryEntries ?? [], [data]);
  const messages = useMemo(() => data?.channelMessages ?? [], [data]);

  if (loading || !profile) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/customers" className="text-xs text-muted-foreground hover:underline">
            ← Alle Kunden
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {profile.fullName || "(unbenannt)"}
            {profile.isAnonymized ? <Badge variant="outline" className="ml-3">anonymisiert</Badge> : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            Erste Sichtung: {new Date(profile.firstSeenAt).toLocaleString("de-DE")} · Letzte:{" "}
            {new Date(profile.lastSeenAt).toLocaleString("de-DE")} · {profile.totalConversations} Conversations
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> DSGVO-Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleAnonymize} disabled={busy === "anonymize" || profile.isAnonymized}>
            <Shield className="mr-2 h-4 w-4" /> Anonymisieren
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy === "delete"}>
            <Trash2 className="mr-2 h-4 w-4" /> DSGVO-Loeschen
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identifier</h2>
          <p className="text-muted-foreground">Email: {profile.primaryEmail || "—"}</p>
          <p className="text-muted-foreground">Telefon: {profile.primaryPhone || "—"}</p>
          {profile.emailAliases.length > 1 ? (
            <p className="mt-2 text-xs text-muted-foreground">Alle Emails: {profile.emailAliases.join(", ")}</p>
          ) : null}
          {profile.phoneAliases.length > 1 ? (
            <p className="text-xs text-muted-foreground">Alle Telefone: {profile.phoneAliases.join(", ")}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border p-4 text-sm">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">DSGVO</h2>
          <p className="text-muted-foreground">Consent: {profile.consentGiven ? "Erteilt" : "Nicht erteilt"}</p>
          <p className="text-muted-foreground">Anonymisiert: {profile.isAnonymized ? "Ja" : "Nein"}</p>
        </div>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Memory-Timeline ({memory.length})</h2>
        <div className="mb-4 flex flex-col gap-2 md:flex-row">
          <select
            value={memoryType}
            onChange={(event) => setMemoryType(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm md:w-44"
          >
            <option value="FACT">FACT</option>
            <option value="PREFERENCE">PREFERENCE</option>
            <option value="EVENT">EVENT</option>
            <option value="INTERACTION">INTERACTION</option>
          </select>
          <Textarea
            value={memoryDraft}
            onChange={(event) => setMemoryDraft(event.target.value)}
            placeholder="Neue Memory-Notiz hinzufuegen…"
            rows={2}
            className="flex-1"
          />
          <Button onClick={handleAddMemory} disabled={busy === "memory" || !memoryDraft.trim()}>
            Hinzufuegen
          </Button>
        </div>
        <ul className="space-y-3 text-sm">
          {memory.length === 0 ? (
            <li className="rounded-md border border-dashed border-border p-3 text-muted-foreground">
              Noch keine Memory-Eintraege fuer diesen Kunden.
            </li>
          ) : (
            memory.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between rounded-md border border-border p-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={entry.isActive ? "default" : "outline"}>{entry.type}</Badge>
                    <span>Wichtigkeit {entry.importance}/10</span>
                    <span>·</span>
                    <span>{new Date(entry.createdAt).toLocaleString("de-DE")}</span>
                    <span>·</span>
                    <span>{entry.source}</span>
                  </div>
                  <p className="mt-1 text-foreground">{entry.content}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDeleteMemory(entry.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Conversation-History ({messages.length})</h2>
        <ul className="space-y-2 text-sm">
          {messages.length === 0 ? (
            <li className="rounded-md border border-dashed border-border p-3 text-muted-foreground">
              Keine zugeordneten Channel-Nachrichten.
            </li>
          ) : (
            messages.map((message) => (
              <li key={message.id} className="rounded-md border border-border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{message.channel}</Badge>
                  <span>{message.direction}</span>
                  <span>·</span>
                  <span>{new Date(message.createdAt).toLocaleString("de-DE")}</span>
                </div>
                <p className="mt-1 text-foreground">
                  {message.emailSubject || message.whatsappBody || message.emailFrom || message.whatsappFrom || "(leer)"}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-border p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Profile mergen</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Falls dieser Kunde versehentlich zwei Profile hat: ID des Duplikat-Profils eingeben.
          Aliasse, Memory und Conversations werden in dieses Profile kopiert; das Duplikat geloescht.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={mergeDuplicateId}
            onChange={(event) => setMergeDuplicateId(event.target.value)}
            placeholder="Duplicate Customer ID"
            className="flex-1 min-w-[260px]"
          />
          <Button onClick={handleMerge} disabled={busy === "merge" || !mergeDuplicateId.trim()}>
            <GitMerge className="mr-2 h-4 w-4" /> Mergen
          </Button>
        </div>
      </section>
    </div>
  );
}
