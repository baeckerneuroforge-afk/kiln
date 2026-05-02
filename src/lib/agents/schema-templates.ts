/**
 * Pre-built JSON Schema templates for common Action Agent shapes.
 * Used as starting points in the schema editor — users pick a template,
 * then refine. Each template is a complete JSON Schema (draft 2020-12).
 */

export type SchemaTemplate = {
  id: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
};

export const SCHEMA_TEMPLATES: readonly SchemaTemplate[] = [
  {
    id: "lead_enrichment",
    name: "Lead Enrichment",
    description:
      "Takes an email (and optionally a company name) and returns enriched company info, decision makers, and recent news.",
    inputSchema: {
      type: "object",
      properties: {
        email: {
          type: "string",
          format: "email",
          description: "Lead email address",
        },
        companyName: {
          type: "string",
          description: "Optional company name hint",
        },
      },
      required: ["email"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        company: {
          type: "object",
          properties: {
            name: { type: "string" },
            domain: { type: "string" },
            industry: { type: "string" },
            size: { type: "string" },
          },
          required: ["name"],
        },
        decisionMakers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              title: { type: "string" },
              email: { type: "string", format: "email" },
            },
            required: ["name", "title"],
          },
        },
        recentNews: {
          type: "array",
          items: {
            type: "object",
            properties: {
              headline: { type: "string" },
              url: { type: "string", format: "uri" },
              publishedAt: { type: "string", format: "date-time" },
            },
            required: ["headline"],
          },
        },
      },
      required: ["company"],
      additionalProperties: false,
    },
  },
  {
    id: "document_auditor",
    name: "Document Auditor",
    description:
      "Audits a document against a list of criteria and returns a score, issues, and recommendations.",
    inputSchema: {
      type: "object",
      properties: {
        documentText: {
          type: "string",
          description: "Full text of the document to audit",
          minLength: 1,
        },
        criteria: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Audit criteria to check against",
        },
      },
      required: ["documentText", "criteria"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        score: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Overall audit score, 0..1",
        },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: {
                type: "string",
                enum: ["low", "medium", "high"],
              },
              criterion: { type: "string" },
              description: { type: "string" },
              location: { type: "string" },
            },
            required: ["severity", "criterion", "description"],
          },
        },
        recommendations: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["score", "issues"],
      additionalProperties: false,
    },
  },
  {
    id: "data_extractor",
    name: "Data Extractor",
    description:
      "Extracts structured fields from an arbitrary source (text, URL, document) and returns the extracted object plus a confidence score.",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Source content to extract from (text, URL, or document body)",
          minLength: 1,
        },
        fields: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          description: "Names of fields to extract",
        },
      },
      required: ["source", "fields"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        extracted: {
          type: "object",
          description: "Map of fieldName → extracted value",
          additionalProperties: true,
        },
        confidence: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Extraction confidence, 0..1",
        },
      },
      required: ["extracted", "confidence"],
      additionalProperties: false,
    },
  },
] as const;

export function getSchemaTemplate(id: string): SchemaTemplate | undefined {
  return SCHEMA_TEMPLATES.find((t) => t.id === id);
}
