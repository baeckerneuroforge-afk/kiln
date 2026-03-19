/**
 * Image Product Match — searches agent KB for products matching an image description.
 */

import { searchRelevantChunks } from "@/lib/rag";

export interface ProductMatch {
  name: string;
  content: string;
  similarity: number;
}

/**
 * Match products from an agent's KB based on the vision model's image description.
 * Returns top 3 matches above the similarity threshold.
 */
export async function matchProductFromImage(
  agentId: string,
  imageAnalysis: string
): Promise<ProductMatch[]> {
  if (!imageAnalysis || imageAnalysis.length < 10) return [];

  try {
    const chunks = await searchRelevantChunks(agentId, imageAnalysis, 5);

    // Filter for product-like content with high similarity
    const matches = chunks
      .filter((c) => c.similarity > 0.7)
      .slice(0, 3)
      .map((c) => {
        // Extract a product name from the first line of content
        const firstLine = c.content.split("\n")[0].replace(/^(Frage|Antwort|Produkt|Product):\s*/i, "").trim();
        return {
          name: firstLine.slice(0, 100),
          content: c.content.slice(0, 300),
          similarity: Math.round(c.similarity * 100) / 100,
        };
      });

    return matches;
  } catch (err) {
    console.error("[ImageProductMatch] Search failed:", err);
    return [];
  }
}
