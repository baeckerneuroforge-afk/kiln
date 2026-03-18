// ── Embed Widget Themes ──────────────────────────────────────
// 4 vordefinierte Themes für das Chat-Widget

export type EmbedThemeId = "modern" | "classic" | "minimal" | "playful";

export interface EmbedThemeBubble {
  size: number; // px
  borderRadius: string;
  animation: string; // CSS animation name
  triggerType: "icon" | "text"; // Icon-Button oder Text-Link
  triggerText?: string; // Nur für "text" triggerType
}

export interface EmbedThemeChat {
  windowRadius: string;
  headerStyle: "gradient" | "solid" | "none";
  headerFont: string;
  bodyFont: string;
  messageBubbleRadius: string;
  messageBubbleStyle: "filled" | "outlined" | "plain"; // plain = kein Bubble
  inputRadius: string;
  shadow: string;
  borderWidth: string;
}

export interface EmbedThemeAnimations {
  windowOpen: string; // CSS animation
  windowClose: string;
  messageAppear: string;
  bubbleHover: string;
}

export interface EmbedThemeColors {
  // Werden als CSS-Variablen injiziert — Agent-Accent überschreibt --kiln-accent
  agentBubbleBg: string;
  agentBubbleText: string;
  userBubbleBg: string; // "var(--kiln-accent)" = dynamisch
  userBubbleText: string;
  headerBg: string; // "var(--kiln-accent)" oder gradient
  headerText: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;
  windowBg: string;
  windowBorder: string;
}

export interface EmbedTheme {
  id: EmbedThemeId;
  name: string;
  description: string;
  bubble: EmbedThemeBubble;
  chat: EmbedThemeChat;
  animations: EmbedThemeAnimations;
  colors: EmbedThemeColors;
}

// ── Theme Definitions ────────────────────────────────────────

const modernTheme: EmbedTheme = {
  id: "modern",
  name: "Modern",
  description: "Clean, professional look with gradients and smooth animations",
  bubble: {
    size: 60,
    borderRadius: "50%",
    animation: "kiln-fade-in 0.3s ease-out",
    triggerType: "icon",
  },
  chat: {
    windowRadius: "16px",
    headerStyle: "gradient",
    headerFont: "'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFont: "'Inter', 'Segoe UI', system-ui, sans-serif",
    messageBubbleRadius: "16px",
    messageBubbleStyle: "filled",
    inputRadius: "12px",
    shadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
    borderWidth: "0",
  },
  animations: {
    windowOpen: "kiln-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
    windowClose: "kiln-slide-down 0.2s ease-in",
    messageAppear: "kiln-fade-in 0.25s ease-out",
    bubbleHover: "kiln-pulse 0.3s ease",
  },
  colors: {
    agentBubbleBg: "#f4f4f5",
    agentBubbleText: "#18181b",
    userBubbleBg: "var(--kiln-accent)",
    userBubbleText: "#ffffff",
    headerBg: "linear-gradient(135deg, var(--kiln-accent), var(--kiln-accent-dark))",
    headerText: "#ffffff",
    inputBg: "#ffffff",
    inputText: "#18181b",
    inputBorder: "#e4e4e7",
    windowBg: "#ffffff",
    windowBorder: "transparent",
  },
};

const classicTheme: EmbedTheme = {
  id: "classic",
  name: "Classic",
  description: "Traditional enterprise chat with borders and serif accents",
  bubble: {
    size: 56,
    borderRadius: "8px",
    animation: "kiln-fade-in 0.2s ease",
    triggerType: "icon",
  },
  chat: {
    windowRadius: "8px",
    headerStyle: "solid",
    headerFont: "'Georgia', 'Times New Roman', serif",
    bodyFont: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    messageBubbleRadius: "6px",
    messageBubbleStyle: "outlined",
    inputRadius: "6px",
    shadow: "none",
    borderWidth: "1px",
  },
  animations: {
    windowOpen: "kiln-fade-in 0.2s ease",
    windowClose: "kiln-fade-out 0.15s ease",
    messageAppear: "kiln-fade-in 0.2s ease",
    bubbleHover: "none",
  },
  colors: {
    agentBubbleBg: "#ffffff",
    agentBubbleText: "#1a1a1a",
    userBubbleBg: "var(--kiln-accent)",
    userBubbleText: "#ffffff",
    headerBg: "var(--kiln-accent)",
    headerText: "#ffffff",
    inputBg: "#ffffff",
    inputText: "#1a1a1a",
    inputBorder: "#d1d5db",
    windowBg: "#fafafa",
    windowBorder: "#d1d5db",
  },
};

const minimalTheme: EmbedTheme = {
  id: "minimal",
  name: "Minimal",
  description: "Ultra-clean text trigger, no bubbles, premium feel",
  bubble: {
    size: 0, // Kein Bubble
    borderRadius: "0",
    animation: "kiln-fade-in 0.3s ease",
    triggerType: "text",
    triggerText: "Chat with us →",
  },
  chat: {
    windowRadius: "12px",
    headerStyle: "none",
    headerFont: "'Inter', system-ui, sans-serif",
    bodyFont: "'Inter', system-ui, sans-serif",
    messageBubbleRadius: "0",
    messageBubbleStyle: "plain",
    inputRadius: "0",
    shadow: "0 4px 24px rgba(0,0,0,0.08)",
    borderWidth: "1px",
  },
  animations: {
    windowOpen: "kiln-fade-in 0.25s ease",
    windowClose: "kiln-fade-out 0.2s ease",
    messageAppear: "kiln-fade-in 0.2s ease",
    bubbleHover: "none",
  },
  colors: {
    agentBubbleBg: "transparent",
    agentBubbleText: "#374151",
    userBubbleBg: "transparent",
    userBubbleText: "#111827",
    headerBg: "transparent",
    headerText: "#111827",
    inputBg: "transparent",
    inputText: "#111827",
    inputBorder: "#e5e7eb",
    windowBg: "#ffffff",
    windowBorder: "#e5e7eb",
  },
};

const playfulTheme: EmbedTheme = {
  id: "playful",
  name: "Playful",
  description: "Fun, colorful design with bounce animations and pill shapes",
  bubble: {
    size: 70,
    borderRadius: "50%",
    animation: "kiln-bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
    triggerType: "icon",
  },
  chat: {
    windowRadius: "24px",
    headerStyle: "gradient",
    headerFont: "'Inter', 'Nunito', system-ui, sans-serif",
    bodyFont: "'Inter', 'Nunito', system-ui, sans-serif",
    messageBubbleRadius: "20px",
    messageBubbleStyle: "filled",
    inputRadius: "20px",
    shadow: "0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1)",
    borderWidth: "0",
  },
  animations: {
    windowOpen: "kiln-bounce-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
    windowClose: "kiln-slide-down 0.2s ease-in",
    messageAppear: "kiln-pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
    bubbleHover: "kiln-wiggle 0.4s ease",
  },
  colors: {
    agentBubbleBg: "#f0f9ff",
    agentBubbleText: "#1e293b",
    userBubbleBg: "var(--kiln-accent)",
    userBubbleText: "#ffffff",
    headerBg: "linear-gradient(135deg, var(--kiln-accent), var(--kiln-accent-light))",
    headerText: "#ffffff",
    inputBg: "#f8fafc",
    inputText: "#1e293b",
    inputBorder: "#e2e8f0",
    windowBg: "#ffffff",
    windowBorder: "transparent",
  },
};

// ── Registry ─────────────────────────────────────────────────

export const EMBED_THEMES: Record<EmbedThemeId, EmbedTheme> = {
  modern: modernTheme,
  classic: classicTheme,
  minimal: minimalTheme,
  playful: playfulTheme,
};

export const EMBED_THEME_LIST: EmbedTheme[] = [
  modernTheme,
  classicTheme,
  minimalTheme,
  playfulTheme,
];

export function getEmbedTheme(id: string | null | undefined): EmbedTheme {
  if (id && id in EMBED_THEMES) return EMBED_THEMES[id as EmbedThemeId];
  return modernTheme;
}

// ── CSS Generation ───────────────────────────────────────────

export function generateThemeCSS(theme: EmbedTheme, accentColor: string): string {
  // Accent-Varianten berechnen
  const accentDark = darkenColor(accentColor, 15);
  const accentLight = lightenColor(accentColor, 15);

  return `
/* Theme: ${theme.name} */
:root {
  --kiln-accent: ${accentColor};
  --kiln-accent-dark: ${accentDark};
  --kiln-accent-light: ${accentLight};
  --kiln-bubble-size: ${theme.bubble.size}px;
  --kiln-bubble-radius: ${theme.bubble.borderRadius};
  --kiln-window-radius: ${theme.chat.windowRadius};
  --kiln-window-shadow: ${theme.chat.shadow};
  --kiln-window-border: ${theme.chat.borderWidth} solid ${theme.colors.windowBorder};
  --kiln-window-bg: ${theme.colors.windowBg};
  --kiln-header-bg: ${theme.colors.headerBg};
  --kiln-header-text: ${theme.colors.headerText};
  --kiln-header-font: ${theme.chat.headerFont};
  --kiln-body-font: ${theme.chat.bodyFont};
  --kiln-msg-radius: ${theme.chat.messageBubbleRadius};
  --kiln-msg-agent-bg: ${theme.colors.agentBubbleBg};
  --kiln-msg-agent-text: ${theme.colors.agentBubbleText};
  --kiln-msg-user-bg: ${theme.colors.userBubbleBg};
  --kiln-msg-user-text: ${theme.colors.userBubbleText};
  --kiln-input-bg: ${theme.colors.inputBg};
  --kiln-input-text: ${theme.colors.inputText};
  --kiln-input-border: ${theme.colors.inputBorder};
  --kiln-input-radius: ${theme.chat.inputRadius};
}

/* Animations */
@keyframes kiln-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes kiln-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes kiln-slide-up {
  from { opacity: 0; transform: translateY(20px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes kiln-slide-down {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(20px) scale(0.95); }
}
@keyframes kiln-bounce-in {
  0% { opacity: 0; transform: scale(0.3); }
  50% { opacity: 1; transform: scale(1.05); }
  70% { transform: scale(0.95); }
  100% { transform: scale(1); }
}
@keyframes kiln-pop-in {
  0% { opacity: 0; transform: scale(0.8) translateY(4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes kiln-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}
@keyframes kiln-wiggle {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
  75% { transform: rotate(-3deg); }
  100% { transform: rotate(0deg); }
}

/* Bubble trigger */
.kiln-bubble {
  width: var(--kiln-bubble-size);
  height: var(--kiln-bubble-size);
  border-radius: var(--kiln-bubble-radius);
  background: var(--kiln-accent);
  animation: ${theme.bubble.animation};
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.kiln-bubble:hover {
  ${theme.animations.bubbleHover !== "none" ? `animation: ${theme.animations.bubbleHover};` : "transform: scale(1.05);"}
  box-shadow: 0 6px 20px rgba(0,0,0,0.2);
}
.kiln-bubble svg {
  width: ${Math.round(theme.bubble.size * 0.4)}px;
  height: ${Math.round(theme.bubble.size * 0.4)}px;
  fill: white;
}

/* Text trigger (Minimal theme) */
.kiln-text-trigger {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--kiln-body-font);
  font-size: 14px;
  color: var(--kiln-accent);
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  transition: background 0.2s ease, color 0.2s ease;
  animation: ${theme.bubble.animation};
}
.kiln-text-trigger:hover {
  background: rgba(0,0,0,0.04);
}

/* Chat window */
.kiln-window {
  position: fixed;
  bottom: ${theme.bubble.size > 0 ? theme.bubble.size + 40 : 60}px;
  right: 24px;
  width: 380px;
  max-height: 600px;
  border-radius: var(--kiln-window-radius);
  background: var(--kiln-window-bg);
  border: var(--kiln-window-border);
  box-shadow: var(--kiln-window-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 9998;
  font-family: var(--kiln-body-font);
}
.kiln-window.kiln-open {
  animation: ${theme.animations.windowOpen};
}
.kiln-window.kiln-close {
  animation: ${theme.animations.windowClose};
}

/* Header */
${theme.chat.headerStyle !== "none" ? `
.kiln-header {
  background: var(--kiln-header-bg);
  color: var(--kiln-header-text);
  padding: 16px 20px;
  font-family: var(--kiln-header-font);
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 10px;
}
` : `
.kiln-header {
  display: none;
}
`}

/* Messages */
.kiln-messages {
  flex: 1;
  overflow-y: auto;
  padding: ${theme.chat.messageBubbleStyle === "plain" ? "16px 20px" : "16px 12px"};
}

.kiln-msg {
  animation: ${theme.animations.messageAppear};
  margin-bottom: ${theme.chat.messageBubbleStyle === "plain" ? "12px" : "8px"};
  display: flex;
}

.kiln-msg-agent {
  justify-content: flex-start;
}
.kiln-msg-user {
  justify-content: flex-end;
}

.kiln-msg-bubble {
  max-width: 80%;
  padding: ${theme.chat.messageBubbleStyle === "plain" ? "4px 0" : "10px 14px"};
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.kiln-msg-agent .kiln-msg-bubble {
  background: var(--kiln-msg-agent-bg);
  color: var(--kiln-msg-agent-text);
  border-radius: var(--kiln-msg-radius);
  ${theme.chat.messageBubbleStyle === "outlined" ? `border: 1px solid ${theme.colors.inputBorder};` : ""}
  ${theme.chat.messageBubbleStyle === "plain" ? `
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 12px;
    max-width: 100%;
  ` : ""}
}

.kiln-msg-user .kiln-msg-bubble {
  background: var(--kiln-msg-user-bg);
  color: var(--kiln-msg-user-text);
  border-radius: var(--kiln-msg-radius);
  ${theme.chat.messageBubbleStyle === "plain" ? `
    text-align: right;
    font-weight: 500;
    border-bottom: 1px solid #f0f0f0;
    padding-bottom: 12px;
    max-width: 100%;
  ` : ""}
}

/* Input */
.kiln-input-wrap {
  padding: 12px;
  border-top: 1px solid ${theme.colors.inputBorder};
  display: flex;
  gap: 8px;
  background: var(--kiln-window-bg);
}

.kiln-input {
  flex: 1;
  background: var(--kiln-input-bg);
  color: var(--kiln-input-text);
  border: 1px solid var(--kiln-input-border);
  border-radius: var(--kiln-input-radius);
  padding: 10px 14px;
  font-size: 14px;
  font-family: var(--kiln-body-font);
  outline: none;
  transition: border-color 0.2s ease;
}
.kiln-input:focus {
  border-color: var(--kiln-accent);
}
.kiln-input::placeholder {
  color: #9ca3af;
}

.kiln-send-btn {
  background: var(--kiln-accent);
  color: white;
  border: none;
  border-radius: var(--kiln-input-radius);
  padding: 0 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.15s ease;
}
.kiln-send-btn:hover {
  filter: brightness(1.1);
  ${theme.id === "playful" ? "transform: scale(1.1) rotate(5deg);" : "transform: scale(1.02);"}
}
.kiln-send-btn:active {
  transform: scale(0.95);
}
.kiln-send-btn svg {
  width: 18px;
  height: 18px;
  fill: white;
}

${theme.id === "playful" ? `
/* Playful wave pattern in header */
.kiln-header::after {
  content: "";
  position: absolute;
  bottom: -8px;
  left: 0;
  right: 0;
  height: 16px;
  background: var(--kiln-window-bg);
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
}
.kiln-header {
  position: relative;
  padding-bottom: 20px;
}
` : ""}
`;
}

// ── Farb-Hilfsfunktionen ─────────────────────────────────────

function hexToHSL(hex: string): { h: number; s: number; l: number } {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function darkenColor(hex: string, amount: number): string {
  try {
    const { h, s, l } = hexToHSL(hex);
    return hslToHex(h, s, Math.max(0, l - amount));
  } catch {
    return hex;
  }
}

function lightenColor(hex: string, amount: number): string {
  try {
    const { h, s, l } = hexToHSL(hex);
    return hslToHex(h, s, Math.min(100, l + amount));
  } catch {
    return hex;
  }
}
