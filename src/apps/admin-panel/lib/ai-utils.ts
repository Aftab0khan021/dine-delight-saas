// ═══════════════════════════════════════════════════════════
// AI Utilities — Free + Paid tier implementations
// Free:  template-based / keyword-based (no API key needed)
// Paid:  GPT-4o / Claude / Gemini via Supabase Edge Functions
//
// Every feature has BOTH tiers. Unified wrappers auto-select:
//   isPaid=true  → call edge function → fallback to free on error
//   isPaid=false → use local free function
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// Helper: call a Supabase Edge Function
async function callEdgeFunction<T>(
  functionName: string,
  body: Record<string, unknown>,
  accessToken: string
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Edge function ${functionName} failed: ${res.status}`);
  return res.json();
}

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
  starters: "appetizer",
  appetizers: "starter",
  mains: "main course",
  "main course": "entrée",
  desserts: "sweet treat",
  beverages: "refreshing drink",
  drinks: "beverage",
  salads: "fresh salad",
  soups: "warming soup",
  pizzas: "artisan pizza",
  burgers: "gourmet burger",
  biryani: "aromatic biryani",
  thali: "complete thali",
  tandoor: "tandoori specialty",
  chinese: "Indo-Chinese favorite",
  "south indian": "South Indian delicacy",
  snacks: "crunchy snack",
  combo: "value combo meal",
  sides: "perfect side dish",
};

/** Generate a menu description using templates (FREE tier) */
export function generateDescriptionFree(
  itemName: string,
  categoryName?: string,
  priceCents?: number
): string {
  const template =
    DESCRIPTION_TEMPLATES[Math.floor(Math.random() * DESCRIPTION_TEMPLATES.length)];
  let desc = template.replace("{name}", itemName);

  if (categoryName) {
    const descriptor = CATEGORY_DESCRIPTORS[categoryName.toLowerCase()];
    if (descriptor) desc += ` A wonderful ${descriptor} you won't want to miss.`;
  }

  if (priceCents && priceCents > 50000) {
    desc += " A premium selection for the discerning palate.";
  }

  return desc;
}

/** Generate a menu description using AI (PAID tier) */
export async function generateDescriptionPaid(
  itemName: string,
  categoryName?: string,
  priceCents?: number,
  accessToken?: string
): Promise<string> {
  if (!accessToken) return generateDescriptionFree(itemName, categoryName, priceCents);

  try {
    const data = await callEdgeFunction<{ description: string }>(
      "ai-description-generator",
      {
        item_name: itemName,
        category: categoryName || "",
        price_cents: priceCents || 0,
      },
      accessToken
    );
    return data.description || generateDescriptionFree(itemName, categoryName, priceCents);
  } catch {
    if (import.meta.env.DEV) console.warn("Paid AI description failed, falling back to free tier");
    return generateDescriptionFree(itemName, categoryName, priceCents);
  }
}

/** Unified wrapper — auto-selects tier */
export async function generateDescription(opts: {
  isPaid: boolean;
  itemName: string;
  categoryName?: string;
  priceCents?: number;
  accessToken?: string | null;
}): Promise<string> {
  if (opts.isPaid && opts.accessToken) {
    return generateDescriptionPaid(
      opts.itemName,
      opts.categoryName,
      opts.priceCents,
      opts.accessToken
    );
  }
  return generateDescriptionFree(opts.itemName, opts.categoryName, opts.priceCents);
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
  topics?: string[];   // Paid tier: extracted topics
  tierUsed: "free" | "paid";
};

/** Analyze sentiment using keyword scoring (FREE tier) */
export function analyzeSentimentFree(text: string, rating?: number): SentimentResult {
  if (!text || text.trim().length === 0) {
    if (rating && rating >= 4) return { label: "positive", score: 0.6, emoji: "😊", color: "text-green-600", tierUsed: "free" };
    if (rating && rating <= 2) return { label: "negative", score: -0.6, emoji: "😞", color: "text-red-500", tierUsed: "free" };
    return { label: "neutral", score: 0, emoji: "😐", color: "text-amber-500", tierUsed: "free" };
  }

  const words = text.toLowerCase().split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    const cleanWord = word.replace(/[^a-zA-Z\u0900-\u097F]/g, "");
    if (POSITIVE_WORDS.has(cleanWord)) positiveCount++;
    if (NEGATIVE_WORDS.has(cleanWord)) negativeCount++;
  }

  if (rating) {
    if (rating >= 4) positiveCount += 2;
    else if (rating <= 2) negativeCount += 2;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { label: "neutral", score: 0, emoji: "😐", color: "text-amber-500", tierUsed: "free" };
  }

  const score = (positiveCount - negativeCount) / Math.max(total, 1);

  if (score > 0.2) return { label: "positive", score, emoji: "😊", color: "text-green-600", tierUsed: "free" };
  if (score < -0.2) return { label: "negative", score, emoji: "😞", color: "text-red-500", tierUsed: "free" };
  return { label: "neutral", score, emoji: "😐", color: "text-amber-500", tierUsed: "free" };
}

/** Analyze sentiment using AI (PAID tier) */
export async function analyzeSentimentPaid(
  text: string,
  rating: number | undefined,
  accessToken: string
): Promise<SentimentResult> {
  try {
    const data = await callEdgeFunction<{
      label: "positive" | "neutral" | "negative";
      score: number;
      topics?: string[];
    }>("ai-sentiment-analyzer", { text, rating: rating || 0 }, accessToken);

    const emojiMap = { positive: "😊", neutral: "😐", negative: "😞" };
    const colorMap = { positive: "text-green-600", neutral: "text-amber-500", negative: "text-red-500" };

    return {
      label: data.label,
      score: data.score,
      emoji: emojiMap[data.label],
      color: colorMap[data.label],
      topics: data.topics,
      tierUsed: "paid",
    };
  } catch {
    if (import.meta.env.DEV) console.warn("Paid sentiment failed, falling back to free");
    return analyzeSentimentFree(text, rating);
  }
}

/** Unified wrapper — auto-selects tier */
export async function analyzeSentiment(opts: {
  isPaid: boolean;
  text: string;
  rating?: number;
  accessToken?: string | null;
}): Promise<SentimentResult> {
  if (opts.isPaid && opts.accessToken) {
    return analyzeSentimentPaid(opts.text, opts.rating, opts.accessToken);
  }
  return analyzeSentimentFree(opts.text, opts.rating);
}

// ─────────────────────────────────────────────────────────
// 3. AI DEMAND FORECAST (for Order Heatmap)
// ─────────────────────────────────────────────────────────

export interface DemandForecast {
  peakHours: string[];      // e.g. ["Fri 7pm", "Sat 1pm"]
  slowHours: string[];      // e.g. ["Mon 3pm", "Tue 10am"]
  recommendations: string[]; // e.g. ["Add staff on Friday evenings"]
  tierUsed: "free" | "paid";
}

/** Basic demand analysis from heatmap data (FREE tier) */
export function forecastDemandFree(
  matrix: number[][],
  dayLabels: string[],
  hourLabels: string[]
): DemandForecast {
  const peaks: { day: number; hour: number; count: number }[] = [];
  const slows: { day: number; hour: number; count: number }[] = [];
  let max = 0;

  // Find max
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (matrix[d][h] > max) max = matrix[d][h];
    }
  }

  if (max === 0) {
    return { peakHours: [], slowHours: [], recommendations: ["Not enough order data yet"], tierUsed: "free" };
  }

  // Find peaks (>75% of max) and slows (>0 but <25% of max)
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const v = matrix[d][h];
      if (v > max * 0.75) peaks.push({ day: d, hour: h, count: v });
      if (v > 0 && v < max * 0.25) slows.push({ day: d, hour: h, count: v });
    }
  }

  peaks.sort((a, b) => b.count - a.count);
  slows.sort((a, b) => a.count - b.count);

  const peakHours = peaks.slice(0, 5).map(p => `${dayLabels[p.day]} ${hourLabels[p.hour]}`);
  const slowHours = slows.slice(0, 5).map(s => `${dayLabels[s.day]} ${hourLabels[s.hour]}`);

  const recommendations: string[] = [];
  if (peaks.length > 0) {
    recommendations.push(`Schedule extra staff during ${peakHours[0]} — your busiest time`);
  }
  if (slows.length > 0) {
    recommendations.push(`Consider promotions during ${slowHours[0]} to boost orders`);
  }
  // Weekend vs weekday comparison
  const weekdayTotal = matrix.slice(1, 6).flat().reduce((a, b) => a + b, 0);
  const weekendTotal = [matrix[0], matrix[6]].flat().reduce((a, b) => a + b, 0);
  if (weekendTotal > weekdayTotal * 0.5) {
    recommendations.push("Weekends are strong — ensure full kitchen capacity");
  }

  return { peakHours, slowHours, recommendations, tierUsed: "free" };
}

/** AI-powered demand forecast (PAID tier) */
export async function forecastDemandPaid(
  matrix: number[][],
  dayLabels: string[],
  hourLabels: string[],
  accessToken: string
): Promise<DemandForecast> {
  try {
    const data = await callEdgeFunction<{
      peakHours: string[];
      slowHours: string[];
      recommendations: string[];
    }>("ai-demand-forecast", { matrix, dayLabels, hourLabels }, accessToken);

    return { ...data, tierUsed: "paid" };
  } catch {
    if (import.meta.env.DEV) console.warn("Paid demand forecast failed, falling back to free");
    return forecastDemandFree(matrix, dayLabels, hourLabels);
  }
}

/** Unified wrapper */
export async function forecastDemand(opts: {
  isPaid: boolean;
  matrix: number[][];
  dayLabels: string[];
  hourLabels: string[];
  accessToken?: string | null;
}): Promise<DemandForecast> {
  if (opts.isPaid && opts.accessToken) {
    return forecastDemandPaid(opts.matrix, opts.dayLabels, opts.hourLabels, opts.accessToken);
  }
  return forecastDemandFree(opts.matrix, opts.dayLabels, opts.hourLabels);
}

// ─────────────────────────────────────────────────────────
// 4. STALE ITEM DETECTION (local only — no paid tier needed)
// ─────────────────────────────────────────────────────────

/** Check if a menu item is "stale" (not ordered in X days) */
export function isStaleItem(lastOrderedAt: string | null, thresholdDays = 30): boolean {
  if (!lastOrderedAt) return true;
  const diffMs = Date.now() - new Date(lastOrderedAt).getTime();
  return diffMs / (1000 * 60 * 60 * 24) > thresholdDays;
}

/** Get stale status label */
export function getStaleLabel(
  lastOrderedAt: string | null
): { text: string; variant: "warning" | "danger" | null } {
  if (!lastOrderedAt) return { text: "Never ordered", variant: "danger" };
  const diffDays = Math.floor(
    (Date.now() - new Date(lastOrderedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays > 60) return { text: `${diffDays}d stale`, variant: "danger" };
  if (diffDays > 30) return { text: `${diffDays}d inactive`, variant: "warning" };
  return { text: "", variant: null };
}
