"use client";

import { useState } from "react";
import { Info } from "lucide-react";

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
