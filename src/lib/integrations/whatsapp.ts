import crypto from "crypto";

const WHATSAPP_API = "https://graph.facebook.com/v21.0";

export interface WhatsAppIncomingMessage {
  from: string; // Sender phone number
  text: string;
  messageId: string;
  senderName: string;
  timestamp: number;
}

// Send a text message via Meta Cloud API
export async function sendWhatsAppMessage(
  phoneNumberId: string,
  to: string,
  text: string,
  accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // WhatsApp limits individual messages to ~4096 chars
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, 4096));
    remaining = remaining.slice(4096);
  }

  let lastMessageId: string | undefined;

  for (const chunk of chunks) {
    const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: chunk },
      }),
    });

    const data = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message || "Failed to send message" };
    }

    lastMessageId = data.messages?.[0]?.id;
  }

  return { success: true, messageId: lastMessageId };
}

// Mark a message as read (sends blue ticks)
export async function markAsRead(
  phoneNumberId: string,
  messageId: string,
  accessToken: string
): Promise<void> {
  await fetch(`${WHATSAPP_API}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => {
    // Best-effort, don't fail on read receipt errors
  });
}

// Verify Meta webhook signature (X-Hub-Signature-256 header)
export function verifyWebhookSignature(
  appSecret: string,
  rawBody: string,
  signature: string
): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;

  const expectedSignature = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const providedSignature = signature.replace("sha256=", "");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(providedSignature)
    );
  } catch {
    return false;
  }
}

// Parse incoming webhook payload from Meta
export function parseIncomingMessage(
  body: Record<string, unknown>
): WhatsAppIncomingMessage | null {
  try {
    const entry = (body.entry as Array<Record<string, unknown>>)?.[0];
    if (!entry) return null;

    const changes = (entry.changes as Array<Record<string, unknown>>)?.[0];
    if (!changes) return null;

    const value = changes.value as Record<string, unknown>;
    if (!value) return null;

    const messages = value.messages as Array<Record<string, unknown>>;
    if (!messages || messages.length === 0) return null;

    const message = messages[0];

    // Only handle text messages
    if (message.type !== "text") return null;

    const textObj = message.text as Record<string, string>;
    if (!textObj || !textObj.body) return null;

    // Extract sender name from contacts
    const contacts = value.contacts as Array<Record<string, unknown>>;
    const senderProfile = contacts?.[0]?.profile as Record<string, string>;
    const senderName = senderProfile?.name || "User";

    return {
      from: message.from as string,
      text: textObj.body,
      messageId: message.id as string,
      senderName,
      timestamp: parseInt(message.timestamp as string, 10),
    };
  } catch {
    return null;
  }
}

// Verify the phone number ID is valid via Meta API
export async function verifyPhoneNumber(
  phoneNumberId: string,
  accessToken: string
): Promise<{ valid: boolean; displayNumber?: string; error?: string }> {
  try {
    const res = await fetch(`${WHATSAPP_API}/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await res.json();

    if (data.error) {
      return { valid: false, error: data.error.message || "Invalid phone number ID" };
    }

    return {
      valid: true,
      displayNumber: data.display_phone_number || data.verified_name || phoneNumberId,
    };
  } catch {
    return { valid: false, error: "Could not verify phone number" };
  }
}
