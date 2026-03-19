/**
 * Image Actions — Post-analysis action detection and document extraction for vision V1.0.
 */

export interface ImageActionResult {
  triggerAction: boolean;
  action: string;
  reason: string;
  priority: "normal" | "urgent";
}

export interface ExtractedDocument {
  documentType: string;
  fields: Record<string, string | number | null>;
  imageUrl?: string;
}

/**
 * Ask Claude to determine if the image analysis should trigger an action.
 */
export async function detectImageAction(
  imageAnalysis: string,
  availableActions: string[]
): Promise<ImageActionResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || availableActions.length === 0) return null;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Based on this image analysis, should any action be triggered automatically?

Image Analysis: "${imageAnalysis.slice(0, 1000)}"

Available Actions: ${availableActions.join(", ")}

Rules:
- If urgency/severity detected (damage, emergency, injury) → trigger BOOK_APPOINTMENT with priority "urgent"
- If a product is identified → trigger PRODUCT_LOOKUP if available
- If a document detected (invoice, receipt, contract) → trigger EXTRACT_DATA if available
- Only trigger if clearly warranted by the analysis

Return ONLY valid JSON:
{"triggerAction": true/false, "action": "ACTION_NAME", "reason": "brief reason", "priority": "normal"|"urgent"}`,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ImageActionResult>;
    if (!parsed.triggerAction) return null;

    return {
      triggerAction: true,
      action: parsed.action || "",
      reason: parsed.reason || "",
      priority: parsed.priority === "urgent" ? "urgent" : "normal",
    };
  } catch {
    return null;
  }
}

/**
 * Extract structured document data from the vision model's analysis.
 */
export async function extractDocumentData(
  imageAnalysis: string
): Promise<ExtractedDocument | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Check if analysis mentions document-like content
  const docKeywords = [
    "invoice", "receipt", "contract", "form", "document",
    "rechnung", "quittung", "vertrag", "formular", "dokument",
    "bill", "statement", "order", "certificate",
  ];
  const analysisLower = imageAnalysis.toLowerCase();
  if (!docKeywords.some((kw) => analysisLower.includes(kw))) {
    return null;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `Extract structured data from this image analysis of a document.

Analysis: "${imageAnalysis.slice(0, 2000)}"

Return ONLY valid JSON:
{
  "documentType": "invoice|receipt|contract|form|certificate|other",
  "fields": {
    "documentNumber": "...",
    "date": "...",
    "amount": "...",
    "currency": "...",
    "vendor": "...",
    "recipient": "...",
    "lineItems": "...",
    "dueDate": "...",
    "notes": "..."
  }
}

Only include fields that are clearly present. Set missing fields to null.`,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedDocument>;
    if (!parsed.documentType || !parsed.fields) return null;

    return {
      documentType: parsed.documentType,
      fields: parsed.fields,
    };
  } catch {
    return null;
  }
}
