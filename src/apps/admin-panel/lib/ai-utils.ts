// AI Utilities — Free + Paid tier implementations
// Free: template-based / keyword-based (no API key needed)
// Paid: OpenAI GPT-4o-mini / HuggingFace (requires API key)

// ─────────────────────────────────────────────────────────
// 1. AI MENU DESCRIPTION GENERATOR
// ─────────────────────────────────────────────────────────

const DESCRIPTION_TEMPLATES = [
  "A delicious {name} crafted with care and served fresh. A popular choice among our guests.",
  "Our signature {name} — perfectly prepared and bursting with flavor. A must-try dish.",
  "Enjoy our freshly prepared {name}, made with the finest ingredients for an unforgettable taste.",
  "Indulge in our {name} — a customer favorite that combines authentic flavors with quality preparation.",
  "Savor the taste of our {name}. Carefully prepared to delight your palate every time.",
];

const CATEGORY_DESCRIPTORS: Record<string, string> = {
  "starters": "appetizer",
  "appetizers": "starter",
  "mains": "main course",
  "main course": "entrée",
  "desserts": "sweet treat",
  "beverages": "refreshing drink",
  "drinks": "beverage",
  "salads": "fresh salad",
  "soups": "warming soup",
  "pizzas": "artisan pizza",
  "burgers": "gourmet burger",
  "biryani": "aromatic biryani",
  "thali": "complete thali",
  "tandoor": "tandoori specialty",
  "chinese": "Indo-Chinese favorite",
  "south indian": "South Indian delicacy",
  "snacks": "crunchy snack",
  "combo": "value combo meal",
  "sides": "perfect side dish",
};

/**
 * Generate a menu description using templates (FREE tier)
 */
export function generateDescriptionFree(
  itemName: string,
  categoryName?: string,
  priceCents?: number
): string {
  const template = DESCRIPTION_TEMPLATES[Math.floor(Math.random() * DESCRIPTION_TEMPLATES.length)];
  let desc = template.replace("{name}", itemName);

  // Add category-specific flavor
  if (categoryName) {
    const cat = categoryName.toLowerCase();
    const descriptor = CATEGORY_DESCRIPTORS[cat];
    if (descriptor) {
      desc += ` A wonderful ${descriptor} you won't want to miss.`;
    }
  }

  // Add price context for premium items
  if (priceCents && priceCents > 50000) {
    desc += " A premium selection for the discerning palate.";
  }

  return desc;
}

/**
 * Generate a menu description using OpenAI (PAID tier)
 * Calls a Supabase Edge Function to proxy the request
 */
export async function generateDescriptionPaid(
  itemName: string,
  categoryName?: string,
  priceCents?: number,
  accessToken?: string
): Promise<string> {
  if (!accessToken) throw new Error("Authentication required");

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("Supabase URL not configured");

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/ai-description-generator`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          item_name: itemName,
          category: categoryName || "",
          price_cents: priceCents || 0,
        }),
      }
    );

    if (!response.ok) {
      // Fall back to free tier if edge function fails
      console.warn("Paid AI description failed, falling back to free tier");
      return generateDescriptionFree(itemName, categoryName, priceCents);
    }

    const data = await response.json();
    return data.description || generateDescriptionFree(itemName, categoryName, priceCents);
  } catch {
    // Network error — fall back to free tier
    return generateDescriptionFree(itemName, categoryName, priceCents);
  }
}

// ─────────────────────────────────────────────────────────
// 2. REVIEW SENTIMENT ANALYSIS
// ─────────────────────────────────────────────────────────

const POSITIVE_WORDS = new Set([
  "amazing", "awesome", "best", "brilliant", "delicious", "excellent", "fantastic",
  "favorite", "fresh", "friendly", "good", "great", "happy", "incredible",
  "love", "loved", "nice", "outstanding", "perfect", "phenomenal", "pleasant",
  "recommend", "satisfied", "superb", "tasty", "wonderful", "worth",
  "yummy", "अच्छा", "बढ़िया", "मज़ा", "स्वादिष्ट", "शानदार",
]);

const NEGATIVE_WORDS = new Set([
  "awful", "bad", "bitter", "bland", "boring", "cold", "complaint", "dirty",
  "disappoint", "disappointed", "disgusting", "expensive", "horrible", "late",
  "never", "poor", "raw", "rude", "slow", "stale", "terrible", "unhappy",
  "waste", "worse", "worst", "बुरा", "ख़राब", "गंदा", "महंगा",
]);

export type SentimentResult = {
  label: "positive" | "neutral" | "negative";
  score: number; // -1 to +1
  emoji: string;
  color: string;
};

/**
 * Analyze review sentiment using keyword scoring (FREE tier)
 */
export function analyzeSentimentFree(text: string, rating?: number): SentimentResult {
  if (!text || text.trim().length === 0) {
    // Fall back to rating-based sentiment
    if (rating && rating >= 4) return { label: "positive", score: 0.6, emoji: "😊", color: "text-green-600" };
    if (rating && rating <= 2) return { label: "negative", score: -0.6, emoji: "😞", color: "text-red-500" };
    return { label: "neutral", score: 0, emoji: "😐", color: "text-amber-500" };
  }

  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z\u0900-\u097F]/g, "");
    if (POSITIVE_WORDS.has(cleanWord)) positiveCount++;
    if (NEGATIVE_WORDS.has(cleanWord)) negativeCount++;
  }

  // Factor in star rating (if available)
  if (rating) {
    if (rating >= 4) positiveCount += 2;
    else if (rating <= 2) negativeCount += 2;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { label: "neutral", score: 0, emoji: "😐", color: "text-amber-500" };
  }

  const score = (positiveCount - negativeCount) / Math.max(total, 1);

  if (score > 0.2) return { label: "positive", score, emoji: "😊", color: "text-green-600" };
  if (score < -0.2) return { label: "negative", score, emoji: "😞", color: "text-red-500" };
  return { label: "neutral", score, emoji: "😐", color: "text-amber-500" };
}

// ─────────────────────────────────────────────────────────
// 3. STALE ITEM DETECTION
// ─────────────────────────────────────────────────────────

/**
 * Check if a menu item is "stale" (not ordered in X days)
 */
export function isStaleItem(lastOrderedAt: string | null, thresholdDays = 30): boolean {
  if (!lastOrderedAt) return true; // Never ordered
  const lastDate = new Date(lastOrderedAt);
  const diffMs = Date.now() - lastDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays > thresholdDays;
}

/**
 * Get stale status label
 */
export function getStaleLabel(lastOrderedAt: string | null): { text: string; variant: "warning" | "danger" | null } {
  if (!lastOrderedAt) return { text: "Never ordered", variant: "danger" };
  const diffDays = Math.floor((Date.now() - new Date(lastOrderedAt).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 60) return { text: `${diffDays}d stale`, variant: "danger" };
  if (diffDays > 30) return { text: `${diffDays}d inactive`, variant: "warning" };
  return { text: "", variant: null };
}
