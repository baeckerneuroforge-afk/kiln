"use client";

import { useState, useEffect, useCallback } from "react";
import { Info, Trash2, Lock, Plus } from "lucide-react";

interface ConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      {hint && (
        <p className="flex items-start gap-1 text-[10px] text-zinc-500">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  );
}

function ConfigInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-green-500/60 transition-colors placeholder:text-zinc-600 font-mono"
    />
  );
}

function ConfigTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-green-500/60 transition-colors placeholder:text-zinc-600 resize-none"
    />
  );
}

/* ── Google Sheets Read ── */

export function GoogleSheetsReadConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Spreadsheet ID" hint="Aus der URL: docs.google.com/spreadsheets/d/{ID}/..." />
        <ConfigInput
          value={String(config.spreadsheetId || "")}
          onChange={(v) => onChange({ ...config, spreadsheetId: v })}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Bereich (Range)" hint="z.B. Sheet1!A1:D10 oder Sheet1!A:Z für alle Spalten" />
        <ConfigInput
          value={String(config.range || "Sheet1!A:Z")}
          onChange={(v) => onChange({ ...config, range: v })}
          placeholder="Sheet1!A:Z"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" hint="Name der Variable im Workflow-Context" />
        <ConfigInput
          value={String(config.resultKey || "sheetsData")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="sheetsData"
        />
      </div>
    </div>
  );
}

/* ── Google Sheets Write ── */

export function GoogleSheetsWriteConfig({ config, onChange }: ConfigProps) {
  const [valuesStr, setValuesStr] = useState(
    Array.isArray(config.values)
      ? (config.values as string[]).join(", ")
      : String(config.values || "")
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Spreadsheet ID" />
        <ConfigInput
          value={String(config.spreadsheetId || "")}
          onChange={(v) => onChange({ ...config, spreadsheetId: v })}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Ziel-Sheet" hint="Name des Sheets, in das geschrieben wird" />
        <ConfigInput
          value={String(config.range || "Sheet1")}
          onChange={(v) => onChange({ ...config, range: v })}
          placeholder="Sheet1"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Werte" hint="Komma-separierte Werte, die als neue Zeile angehängt werden. {{ expressions }} möglich." />
        <ConfigTextarea
          value={valuesStr}
          onChange={(v) => {
            setValuesStr(v);
            onChange({ ...config, values: v.split(",").map((s) => s.trim()) });
          }}
          placeholder="{{ lead.name }}, {{ lead.email }}, {{ now() }}"
        />
      </div>
    </div>
  );
}

/* ── Gmail Send ── */

export function GmailSendConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Empfänger (To)" />
        <ConfigInput
          value={String(config.to || "")}
          onChange={(v) => onChange({ ...config, to: v })}
          placeholder="{{ lead.email }}"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Betreff" />
        <ConfigInput
          value={String(config.subject || "")}
          onChange={(v) => onChange({ ...config, subject: v })}
          placeholder="Danke für Ihre Anfrage"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Nachricht" />
        <ConfigTextarea
          value={String(config.body || "")}
          onChange={(v) => onChange({ ...config, body: v })}
          placeholder="Hallo {{ lead.name }},&#10;&#10;vielen Dank für Ihre Nachricht..."
          rows={5}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Reply-To Message ID" hint="Optional: Als Antwort auf eine bestehende E-Mail" />
        <ConfigInput
          value={String(config.replyToMessageId || "")}
          onChange={(v) => onChange({ ...config, replyToMessageId: v })}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

/* ── Slack Send Integration ── */

export function SlackSendIntegrationConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Channel" hint="Channel-Name (#general) oder Channel-ID" />
        <ConfigInput
          value={String(config.channel || "")}
          onChange={(v) => onChange({ ...config, channel: v })}
          placeholder="#general"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Nachricht" />
        <ConfigTextarea
          value={String(config.message || "")}
          onChange={(v) => onChange({ ...config, message: v })}
          placeholder="Neuer Lead: {{ lead.name }} ({{ lead.email }})"
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Thread (optional)" hint="Thread-Timestamp für Antworten in einem Thread" />
        <ConfigInput
          value={String(config.threadTs || "")}
          onChange={(v) => onChange({ ...config, threadTs: v })}
          placeholder="Optional"
        />
      </div>
    </div>
  );
}

/* ── Calendar Create ── */

export function CalendarCreateConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Titel" />
        <ConfigInput
          value={String(config.title || "")}
          onChange={(v) => onChange({ ...config, title: v })}
          placeholder="Meeting mit {{ lead.name }}"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel label="Start (ISO)" />
          <ConfigInput
            value={String(config.start || "")}
            onChange={(v) => onChange({ ...config, start: v })}
            placeholder="2026-03-20T10:00:00"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel label="Ende (ISO)" />
          <ConfigInput
            value={String(config.end || "")}
            onChange={(v) => onChange({ ...config, end: v })}
            placeholder="2026-03-20T11:00:00"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Beschreibung" />
        <ConfigTextarea
          value={String(config.description || "")}
          onChange={(v) => onChange({ ...config, description: v })}
          placeholder="Optional"
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Teilnehmer E-Mail" />
        <ConfigInput
          value={String(config.attendeeEmail || "")}
          onChange={(v) => onChange({ ...config, attendeeEmail: v })}
          placeholder="{{ lead.email }}"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Zeitzone" />
        <ConfigInput
          value={String(config.timezone || "Europe/Berlin")}
          onChange={(v) => onChange({ ...config, timezone: v })}
          placeholder="Europe/Berlin"
        />
      </div>
    </div>
  );
}

/* ── Calendar Check ── */

export function CalendarCheckConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <FieldLabel label="Von (ISO)" />
          <ConfigInput
            value={String(config.startDate || "")}
            onChange={(v) => onChange({ ...config, startDate: v })}
            placeholder="2026-03-20T00:00:00"
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel label="Bis (ISO)" />
          <ConfigInput
            value={String(config.endDate || "")}
            onChange={(v) => onChange({ ...config, endDate: v })}
            placeholder="2026-03-25T23:59:59"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <FieldLabel label="Slot (Min)" />
          <ConfigInput
            type="number"
            value={String(config.slotMinutes || 30)}
            onChange={(v) => onChange({ ...config, slotMinutes: parseInt(v) || 30 })}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel label="Tag Start" />
          <ConfigInput
            type="number"
            value={String(config.dayStartHour ?? 9)}
            onChange={(v) => onChange({ ...config, dayStartHour: parseInt(v) ?? 9 })}
          />
        </div>
        <div className="space-y-1.5">
          <FieldLabel label="Tag Ende" />
          <ConfigInput
            type="number"
            value={String(config.dayEndHour ?? 17)}
            onChange={(v) => onChange({ ...config, dayEndHour: parseInt(v) ?? 17 })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "availableSlots")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="availableSlots"
        />
      </div>
    </div>
  );
}

/* ── Notion Create ── */

export function NotionCreateConfig({ config, onChange }: ConfigProps) {
  const [propsStr, setPropsStr] = useState(
    typeof config.properties === "object" && config.properties
      ? JSON.stringify(config.properties, null, 2)
      : "{}"
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Datenbank ID" hint="32-stellige ID aus der Notion-URL" />
        <ConfigInput
          value={String(config.databaseId || "")}
          onChange={(v) => onChange({ ...config, databaseId: v })}
          placeholder="a1b2c3d4e5f6..."
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Properties (JSON)" hint='z.B. {"Name": "{{ lead.name }}", "Email": "{{ lead.email }}"}' />
        <ConfigTextarea
          value={propsStr}
          onChange={(v) => {
            setPropsStr(v);
            try {
              onChange({ ...config, properties: JSON.parse(v) });
            } catch {
              // Ungültiges JSON — ignorieren bis es valide ist
            }
          }}
          placeholder='{"Name": "{{ lead.name }}", "Email": "{{ lead.email }}"}'
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Seiteninhalt (optional)" hint="Text-Content der neuen Seite" />
        <ConfigTextarea
          value={String(config.content || "")}
          onChange={(v) => onChange({ ...config, content: v })}
          placeholder="Optional: Inhalt der Notion-Seite"
          rows={3}
        />
      </div>
    </div>
  );
}

/* ── Airtable Create ── */

export function AirtableCreateConfig({ config, onChange }: ConfigProps) {
  const [fieldsStr, setFieldsStr] = useState(
    typeof config.fields === "object" && config.fields
      ? JSON.stringify(config.fields, null, 2)
      : "{}"
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Base ID" hint="Beginnt mit 'app...' — aus der Airtable URL" />
        <ConfigInput
          value={String(config.baseId || "")}
          onChange={(v) => onChange({ ...config, baseId: v })}
          placeholder="appXXXXXXXXXXXXXX"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Tabellenname" />
        <ConfigInput
          value={String(config.tableName || "")}
          onChange={(v) => onChange({ ...config, tableName: v })}
          placeholder="Leads"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Felder (JSON)" hint='z.B. {"Name": "{{ lead.name }}", "Email": "{{ lead.email }}"}' />
        <ConfigTextarea
          value={fieldsStr}
          onChange={(v) => {
            setFieldsStr(v);
            try {
              onChange({ ...config, fields: JSON.parse(v) });
            } catch {
              // Ungültiges JSON — ignorieren
            }
          }}
          placeholder='{"Name": "{{ lead.name }}", "Email": "{{ lead.email }}"}'
          rows={4}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="API Token (optional)" hint="Nur nötig wenn keine Airtable-Integration verbunden ist" />
        <ConfigInput
          value={String(config.apiToken || "")}
          onChange={(v) => onChange({ ...config, apiToken: v })}
          placeholder="pat..."
        />
      </div>
    </div>
  );
}

/* ── AI Summarize ── */

export function AiSummarizeConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Eingabetext" hint="Text oder {{ expression }} zum Zusammenfassen" />
        <ConfigTextarea
          value={String(config.input || "")}
          onChange={(v) => onChange({ ...config, input: v })}
          placeholder="{{ previousNode.output }}"
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Länge" />
        <select
          value={String(config.maxLength || "kurz")}
          onChange={(e) => onChange({ ...config, maxLength: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-pink-500/60 transition-colors"
        >
          <option value="kurz">Kurz (2-3 Sätze)</option>
          <option value="mittel">Mittel (1 Absatz)</option>
          <option value="lang">Lang (3 Absätze)</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Sprache" />
        <select
          value={String(config.language || "de")}
          onChange={(e) => onChange({ ...config, language: e.target.value })}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-pink-500/60 transition-colors"
        >
          <option value="de">Deutsch</option>
          <option value="en">Englisch</option>
          <option value="fr">Französisch</option>
          <option value="es">Spanisch</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "summary")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="summary"
        />
      </div>
    </div>
  );
}

/* ── AI Classify ── */

export function AiClassifyConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Eingabetext" />
        <ConfigTextarea
          value={String(config.input || "")}
          onChange={(v) => onChange({ ...config, input: v })}
          placeholder="{{ message.text }}"
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Kategorien" hint="Komma-separierte Liste der möglichen Kategorien" />
        <ConfigTextarea
          value={String(config.categories || "")}
          onChange={(v) => onChange({ ...config, categories: v })}
          placeholder="Support-Anfrage, Beschwerde, Feature-Wunsch, Lob, Sonstiges"
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "classification")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="classification"
        />
      </div>
    </div>
  );
}

/* ── AI Extract ── */

export function AiExtractConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Eingabetext" />
        <ConfigTextarea
          value={String(config.input || "")}
          onChange={(v) => onChange({ ...config, input: v })}
          placeholder="{{ email.body }}"
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Zu extrahierende Felder" hint="Komma-separierte Feldnamen" />
        <ConfigTextarea
          value={String(config.fields || "")}
          onChange={(v) => onChange({ ...config, fields: v })}
          placeholder="Name, E-Mail, Telefonnummer, Firma, Anliegen"
          rows={2}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "extracted")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="extracted"
        />
      </div>
    </div>
  );
}

/* ── Computer Use ── */

export function ComputerUseConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Aufgabe" hint="Was soll der AI-Agent auf der Webseite tun?" />
        <ConfigTextarea
          value={String(config.task || "")}
          onChange={(v) => onChange({ ...config, task: v })}
          placeholder="Finde die aktuellen Preise für das Pro-Paket und extrahiere alle Features"
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Start-URL" hint="URL oder {{ expression }}" />
        <ConfigInput
          value={String(config.startUrl || "")}
          onChange={(v) => onChange({ ...config, startUrl: v })}
          placeholder="https://example.com/pricing"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Max. Schritte" hint="Maximale Anzahl besuchter Seiten (1-25)" />
        <ConfigInput
          value={String(config.maxSteps || "10")}
          onChange={(v) => onChange({ ...config, maxSteps: parseInt(v) || 10 })}
          placeholder="10"
          type="number"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <FieldLabel label="Screenshots speichern" />
          <button
            onClick={() => onChange({ ...config, captureScreenshots: !config.captureScreenshots })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              config.captureScreenshots !== false ? "bg-pink-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                config.captureScreenshots !== false ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <FieldLabel label="Daten extrahieren" />
          <button
            onClick={() => onChange({ ...config, extractData: !config.extractData })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              config.extractData ? "bg-pink-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                config.extractData ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      {!!config.extractData && (
        <div className="space-y-1.5">
          <FieldLabel label="Daten-Schema" hint="JSON-Schema oder Feldbeschreibung für die zu extrahierenden Daten" />
          <ConfigTextarea
            value={String(config.dataSchema || "")}
            onChange={(v) => onChange({ ...config, dataSchema: v })}
            placeholder='{ "price": "number", "features": "string[]", "planName": "string" }'
            rows={4}
          />
        </div>
      )}
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "computerUseResult")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="computerUseResult"
        />
      </div>

      {/* Login/Credentials Section */}
      <div className="border-t border-zinc-700/50 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <FieldLabel label="Login erforderlich" hint="Für geschützte Seiten mit Login" />
          <button
            onClick={() => onChange({ ...config, requiresLogin: !config.requiresLogin })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              config.requiresLogin ? "bg-pink-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
                config.requiresLogin ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {!!config.requiresLogin && (
          <CredentialSelector
            credentialId={String(config.credentialId || "")}
            onChange={(id) => onChange({ ...config, credentialId: id })}
          />
        )}
      </div>
    </div>
  );
}

/* ── Deep Research ── */

export function DeepResearchConfig({ config, onChange }: ConfigProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Forschungsthema" hint="Thema oder Frage für die Recherche. Unterstützt {{ expressions }}." />
        <ConfigTextarea
          value={String(config.topic || "")}
          onChange={(v) => onChange({ ...config, topic: v })}
          placeholder="Aktuelle Markttrends im Bereich KI-Chatbots für den Kundenservice"
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Tiefe" hint="Wie gründlich soll recherchiert werden?" />
        <div className="flex gap-2">
          {(["quick", "standard", "deep"] as const).map((d) => (
            <button
              key={d}
              onClick={() => onChange({ ...config, depth: d })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                (config.depth || "standard") === d
                  ? "border-pink-500/50 bg-pink-500/10 text-pink-400"
                  : "border-[#2a2a3a] bg-[#141418] text-zinc-500 hover:text-zinc-400"
              }`}
            >
              {d === "quick" ? "Schnell" : d === "standard" ? "Standard" : "Tief"}
              <span className="block text-[9px] text-zinc-600 mt-0.5">
                {d === "quick" ? "~5 Quellen" : d === "standard" ? "~15 Quellen" : "~30 Quellen"}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Sprache" />
        <div className="flex gap-2">
          {[
            { value: "de", label: "Deutsch" },
            { value: "en", label: "English" },
          ].map((lang) => (
            <button
              key={lang.value}
              onClick={() => onChange({ ...config, language: lang.value })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                (config.language || "de") === lang.value
                  ? "border-pink-500/50 bg-pink-500/10 text-pink-400"
                  : "border-[#2a2a3a] bg-[#141418] text-zinc-500 hover:text-zinc-400"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "researchResult")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="researchResult"
        />
      </div>
      <div className="rounded-lg border border-[#2a2a3a] bg-[#141418] p-3">
        <p className="text-[10px] text-zinc-600">
          <span className="font-medium text-zinc-500">Output:</span> summary, fullReport, sources[], confidence (0-100), queriesUsed[], totalDurationMs
        </p>
      </div>
    </div>
  );
}

/* ── Code Sandbox ── */

export function CodeSandboxConfig({ config, onChange }: ConfigProps) {
  const packages = (config.packages as string[]) || [];
  const [newPkg, setNewPkg] = useState("");

  const addPackage = () => {
    if (newPkg.trim() && !packages.includes(newPkg.trim())) {
      onChange({ ...config, packages: [...packages, newPkg.trim()] });
      setNewPkg("");
    }
  };

  const removePackage = (pkg: string) => {
    onChange({ ...config, packages: packages.filter((p: string) => p !== pkg) });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <FieldLabel label="Aufgabe / Ziel" hint="Beschreibe was der Code tun soll. Der Agent schreibt und führt den Code automatisch aus." />
        <ConfigTextarea
          value={String(config.goal || "")}
          onChange={(v) => onChange({ ...config, goal: v })}
          placeholder="Analysiere die CSV-Daten aus dem vorherigen Schritt, erstelle ein Balkendiagramm und speichere es als PNG"
          rows={3}
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Sprache" />
        <div className="flex gap-2">
          {(["python", "javascript", "auto"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => onChange({ ...config, language: lang })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                (config.language || "python") === lang
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-[#2a2a3a] bg-[#141418] text-zinc-500 hover:text-zinc-400"
              }`}
            >
              {lang === "python" ? "Python" : lang === "javascript" ? "JavaScript" : "Auto"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Max. Iterationen" hint="Wie oft darf der Agent den Code überarbeiten (1-10)" />
        <ConfigInput
          value={String(config.maxIterations || "5")}
          onChange={(v) => onChange({ ...config, maxIterations: parseInt(v) || 5 })}
          placeholder="5"
          type="number"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Pakete vorinstallieren" hint="pip/npm Pakete die vor der Ausführung installiert werden" />
        <div className="flex gap-2">
          <input
            value={newPkg}
            onChange={(e) => setNewPkg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addPackage()}
            placeholder="pandas, matplotlib, ..."
            className="flex-1 bg-[#141418] border border-[#2a2a3a] rounded-lg text-sm text-zinc-300 px-3 py-2 outline-none focus:border-green-500/60 transition-colors placeholder:text-zinc-700"
          />
          <button
            onClick={addPackage}
            className="px-3 py-2 rounded-lg bg-green-500/10 text-green-400 text-xs font-medium border border-green-500/30 hover:bg-green-500/20 transition-colors"
          >
            +
          </button>
        </div>
        {packages.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {packages.map((pkg: string) => (
              <span
                key={pkg}
                className="inline-flex items-center gap-1 rounded-md bg-green-500/10 border border-green-500/20 px-2 py-1 text-[10px] font-mono text-green-400"
              >
                {pkg}
                <button onClick={() => removePackage(pkg)} className="hover:text-red-400 transition-colors">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Timeout (Sekunden)" hint="Maximale Laufzeit der Sandbox" />
        <ConfigInput
          value={String(Math.round((Number(config.timeoutMs) || 600000) / 1000))}
          onChange={(v) => onChange({ ...config, timeoutMs: (parseInt(v) || 600) * 1000 })}
          placeholder="600"
          type="number"
        />
      </div>
      <div className="space-y-1.5">
        <FieldLabel label="Result Key" />
        <ConfigInput
          value={String(config.resultKey || "codeSandboxResult")}
          onChange={(v) => onChange({ ...config, resultKey: v })}
          placeholder="codeSandboxResult"
        />
      </div>
      <div className="rounded-lg border border-[#2a2a3a] bg-[#141418] p-3">
        <p className="text-[10px] text-zinc-600">
          <span className="font-medium text-zinc-500">Output:</span> goal, language, iterations, finalOutput, executionLog[], artifacts[], totalDurationMs, status
        </p>
      </div>
    </div>
  );
}

/* ── Credential Selector for Computer Use ── */

interface CredentialOption {
  id: string;
  serviceName: string;
  loginUrl: string;
  lastUsedAt: string | null;
}

function CredentialSelector({
  credentialId,
  onChange,
}: {
  credentialId: string;
  onChange: (id: string) => void;
}) {
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newService, setNewService] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Lade Credentials — wir brauchen eine agentId. Die holen wir aus der URL.
  const agentId = typeof window !== "undefined"
    ? window.location.pathname.match(/agents\/([^/]+)/)?.[1] || ""
    : "";

  const loadCredentials = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/credentials`);
      if (res.ok) {
        const data = await res.json();
        setCredentials(data.credentials || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [agentId]);

  useEffect(() => { loadCredentials(); }, [loadCredentials]);

  async function handleSave() {
    if (!newService.trim() || !newUrl.trim() || !newUsername.trim() || !newPassword) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceName: newService,
          loginUrl: newUrl,
          username: newUsername,
          password: newPassword,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        onChange(data.credential.id);
        setNewService(""); setNewUrl(""); setNewUsername(""); setNewPassword("");
        setShowAddForm(false);
        await loadCredentials();
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/agents/${agentId}/credentials/${id}`, { method: "DELETE" });
      if (credentialId === id) onChange("");
      await loadCredentials();
    } catch { /* ignore */ }
  }

  if (loading) {
    return <p className="text-[10px] text-zinc-500">Lade Credentials...</p>;
  }

  return (
    <div className="space-y-3">
      {/* Select existing */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
          <Lock className="h-3 w-3" /> Gespeicherte Logins
        </label>
        {credentials.length > 0 ? (
          <div className="space-y-1.5">
            {credentials.map((c) => (
              <div
                key={c.id}
                onClick={() => onChange(c.id)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer border transition-colors ${
                  credentialId === c.id
                    ? "border-pink-500/50 bg-pink-500/10"
                    : "border-zinc-700 bg-zinc-800 hover:border-zinc-600"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-zinc-200 truncate">{c.serviceName}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{c.loginUrl}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}
                  className="ml-2 text-zinc-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-zinc-500">Keine Credentials gespeichert</p>
        )}
      </div>

      {/* Add new */}
      {showAddForm ? (
        <div className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
          <ConfigInput
            value={newService}
            onChange={setNewService}
            placeholder="Service Name (z.B. HubSpot CRM)"
          />
          <ConfigInput
            value={newUrl}
            onChange={setNewUrl}
            placeholder="Login-URL (https://app.hubspot.com/login)"
          />
          <ConfigInput
            value={newUsername}
            onChange={setNewUsername}
            placeholder="Username / E-Mail"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Passwort"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 px-3 py-2 outline-none focus:border-green-500/60 transition-colors placeholder:text-zinc-600 font-mono"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !newService.trim() || !newUrl.trim() || !newUsername.trim() || !newPassword}
              className="flex-1 rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              {saving ? "Speichern..." : "Credential speichern"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Abbrechen
            </button>
          </div>
          <p className="text-[9px] text-zinc-600 flex items-center gap-1">
            <Lock className="h-2.5 w-2.5" />
            Credentials werden verschlüsselt gespeichert (AES-256-GCM)
          </p>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-[11px] text-pink-400 hover:text-pink-300 transition-colors"
        >
          <Plus className="h-3 w-3" /> Neues Credential hinzufügen
        </button>
      )}
    </div>
  );
}
