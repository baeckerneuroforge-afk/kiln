"use client";

import React from "react";

// Gmail envelope icon (red #EA4335)
function GmailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Envelope body */}
      <rect x="1" y="3" width="14" height="10" rx="1.5" fill="#EA4335" opacity="0.15" />
      <rect
        x="1"
        y="3"
        width="14"
        height="10"
        rx="1.5"
        stroke="#EA4335"
        strokeWidth="1.2"
      />
      {/* Envelope flap / M shape */}
      <path
        d="M1.5 3.5L8 9L14.5 3.5"
        stroke="#EA4335"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Side lines for depth */}
      <path
        d="M1.5 12.5L5.5 8.5"
        stroke="#EA4335"
        strokeWidth="1.0"
        strokeLinecap="round"
      />
      <path
        d="M14.5 12.5L10.5 8.5"
        stroke="#EA4335"
        strokeWidth="1.0"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Slack logo (4-color hash/pound shape)
function SlackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top-left: pink/red */}
      <rect x="1.5" y="5.5" width="4" height="1.8" rx="0.9" fill="#E01E5A" />
      <rect x="5.5" y="1.5" width="1.8" height="4" rx="0.9" fill="#E01E5A" />
      <circle cx="2.4" cy="2.4" r="0.9" fill="#E01E5A" />

      {/* Top-right: cyan */}
      <rect x="8.7" y="1.5" width="1.8" height="4" rx="0.9" fill="#36C5F0" />
      <rect x="10.5" y="5.5" width="4" height="1.8" rx="0.9" fill="#36C5F0" />
      <circle cx="13.6" cy="2.4" r="0.9" fill="#36C5F0" />

      {/* Bottom-left: green */}
      <rect x="5.5" y="10.5" width="1.8" height="4" rx="0.9" fill="#2EB67D" />
      <rect x="1.5" y="8.7" width="4" height="1.8" rx="0.9" fill="#2EB67D" />
      <circle cx="2.4" cy="13.6" r="0.9" fill="#2EB67D" />

      {/* Bottom-right: yellow */}
      <rect x="10.5" y="8.7" width="4" height="1.8" rx="0.9" fill="#ECB22E" />
      <rect x="8.7" y="10.5" width="1.8" height="4" rx="0.9" fill="#ECB22E" />
      <circle cx="13.6" cy="13.6" r="0.9" fill="#ECB22E" />

      {/* Center cross overlaps */}
      <rect x="5.5" y="5.5" width="1.8" height="1.8" rx="0.4" fill="#E01E5A" />
      <rect x="8.7" y="5.5" width="1.8" height="1.8" rx="0.4" fill="#36C5F0" />
      <rect x="5.5" y="8.7" width="1.8" height="1.8" rx="0.4" fill="#2EB67D" />
      <rect x="8.7" y="8.7" width="1.8" height="1.8" rx="0.4" fill="#ECB22E" />
    </svg>
  );
}

// Google Sheets icon (green #0F9D58)
function GoogleSheetsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Document shape with folded corner */}
      <path
        d="M3 1.5h6.5L13 5v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-13a1 1 0 011-1z"
        fill="#0F9D58"
      />
      {/* Folded corner */}
      <path d="M9.5 1.5V5H13L9.5 1.5z" fill="#065F38" />
      {/* Grid lines for spreadsheet look */}
      <rect x="4" y="7" width="8" height="6" rx="0.3" fill="white" opacity="0.9" />
      {/* Horizontal dividers */}
      <line x1="4" y1="9" x2="12" y2="9" stroke="#0F9D58" strokeWidth="0.6" />
      <line x1="4" y1="11" x2="12" y2="11" stroke="#0F9D58" strokeWidth="0.6" />
      {/* Vertical divider */}
      <line x1="7" y1="7" x2="7" y2="13" stroke="#0F9D58" strokeWidth="0.6" />
    </svg>
  );
}

// Google Calendar icon (blue #4285F4)
function GoogleCalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Calendar body */}
      <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" fill="#4285F4" />
      {/* Top bar (darker) */}
      <rect x="1.5" y="3" width="13" height="3" rx="1.5" fill="#3367D6" />
      <rect x="1.5" y="4.5" width="13" height="1.5" fill="#3367D6" />
      {/* Calendar hooks */}
      <rect x="4.5" y="1.5" width="1.2" height="3" rx="0.6" fill="white" />
      <rect x="10.3" y="1.5" width="1.2" height="3" rx="0.6" fill="white" />
      {/* Date grid area */}
      <rect x="3" y="7" width="10" height="6.5" rx="0.5" fill="white" opacity="0.9" />
      {/* Grid dots / date markers */}
      <circle cx="5.2" cy="8.8" r="0.7" fill="#4285F4" />
      <circle cx="8" cy="8.8" r="0.7" fill="#4285F4" />
      <circle cx="10.8" cy="8.8" r="0.7" fill="#4285F4" />
      <circle cx="5.2" cy="11.2" r="0.7" fill="#4285F4" />
      <circle cx="8" cy="11.2" r="0.7" fill="#EA4335" />
      <circle cx="10.8" cy="11.2" r="0.7" fill="#4285F4" />
    </svg>
  );
}

// Notion "N" icon (white on transparent)
function NotionIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Rounded square background */}
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2.5"
        stroke="white"
        strokeWidth="1.0"
        fill="white"
        fillOpacity="0.08"
      />
      {/* Stylized "N" letterform matching Notion's serif style */}
      <path
        d="M4.5 4h2.2l3.6 5.2V4h1.5v8h-2L6.2 6.8V12H4.5V4z"
        fill="white"
        fillRule="evenodd"
      />
    </svg>
  );
}

// Airtable icon (blue #18BFFF) - diamond/rhombus shape
function AirtableIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top half - blue rhombus */}
      <path
        d="M7.4 1.8a1 1 0 011.2 0l5.6 3.5a0.5 0.5 0 010 .85L8.3 9.4a1 1 0 01-0.6 0L1.8 6.15a0.5 0.5 0 010-.85L7.4 1.8z"
        fill="#18BFFF"
      />
      {/* Bottom-left section */}
      <path
        d="M7.5 10.2L2.1 7.2a0.3 0.3 0 00-.45.26v4a0.8 0.8 0 00.4.7l5 2.8a0.3 0.3 0 00.45-.26v-4.5z"
        fill="#FF6F2C"
      />
      {/* Bottom-right section */}
      <path
        d="M8.5 10.2l5.4-3a0.3 0.3 0 01.45.26v4a0.8 0.8 0 01-.4.7l-5 2.8a0.3 0.3 0 01-.45-.26v-4.5z"
        fill="#18BFFF"
        opacity="0.7"
      />
    </svg>
  );
}

/**
 * Maps workflow node types to their brand icon components.
 * Only integration/service nodes are included here;
 * logic and control nodes use Lucide icons via the caller's fallback.
 */
const brandIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  // Gmail / E-Mail
  gmail_send: GmailIcon,
  send_email: GmailIcon,

  // Slack
  send_slack: SlackIcon,
  slack_send_integration: SlackIcon,

  // Google Sheets
  google_sheets_read: GoogleSheetsIcon,
  google_sheets_write: GoogleSheetsIcon,

  // Google Calendar
  calendar_create: GoogleCalendarIcon,
  calendar_check: GoogleCalendarIcon,

  // Notion
  notion_create: NotionIcon,

  // Airtable
  airtable_create: AirtableIcon,
};

/**
 * Returns a brand SVG icon for known integration node types.
 * Returns null for unrecognized types so the caller can fall back to Lucide icons.
 */
export function getNodeIcon(
  nodeType: string,
  className?: string
): React.ReactNode | null {
  const Icon = brandIconMap[nodeType];
  if (!Icon) return null;
  return <Icon className={className || "h-4 w-4"} />;
}

export { brandIconMap };
