// ─────────────────────────────────────────────────────────────────────────────
// Unit Conversion Library for Inventory
// Used when linking menu items to ingredients with different units
// (e.g. ingredient stored in kg, recipe uses tbsp)
// ─────────────────────────────────────────────────────────────────────────────

export type UnitCategory = "weight" | "volume" | "spoon" | "count";

export interface UnitDef {
  symbol: string;
  label: string;
  category: UnitCategory;
  /** factor to convert THIS unit → base unit of its category (kg for weight, L for volume) */
  toBase: number;
}

// ─── Unit Definitions ────────────────────────────────────────────────────────

export const ALL_UNITS: UnitDef[] = [
  // Weight (base: kg)
  { symbol: "kg",     label: "Kilogram (kg)",        category: "weight", toBase: 1 },
  { symbol: "g",      label: "Gram (g)",              category: "weight", toBase: 0.001 },
  { symbol: "mg",     label: "Milligram (mg)",        category: "weight", toBase: 0.000001 },
  { symbol: "lb",     label: "Pound (lb)",            category: "weight", toBase: 0.453592 },
  { symbol: "oz",     label: "Ounce weight (oz)",     category: "weight", toBase: 0.028350 },

  // Volume (base: L)
  { symbol: "L",      label: "Litre (L)",             category: "volume", toBase: 1 },
  { symbol: "ml",     label: "Millilitre (ml)",        category: "volume", toBase: 0.001 },
  { symbol: "fl oz",  label: "Fluid Ounce (fl oz)",   category: "volume", toBase: 0.029574 },
  { symbol: "pt",     label: "Pint (pt)",             category: "volume", toBase: 0.473176 },
  { symbol: "qt",     label: "Quart (qt)",            category: "volume", toBase: 0.946353 },
  { symbol: "gal",    label: "Gallon (gal)",          category: "volume", toBase: 3.785411 },

  // Spoon / Culinary measures (stored separately — cross-category)
  { symbol: "cup",    label: "Cup US (240ml)",        category: "spoon",  toBase: 0.23659 },  // in L
  { symbol: "cup(m)", label: "Cup Metric (250ml)",    category: "spoon",  toBase: 0.25 },
  { symbol: "tbsp",   label: "Tablespoon (tbsp)",     category: "spoon",  toBase: 0.014787 }, // in L
  { symbol: "tsp",    label: "Teaspoon (tsp)",        category: "spoon",  toBase: 0.004929 }, // in L
  { symbol: "dsp",    label: "Dessert Spoon (dsp)",   category: "spoon",  toBase: 0.009858 },
  { symbol: "drop",   label: "Drop",                  category: "spoon",  toBase: 0.00005 },
  { symbol: "dash",   label: "Dash",                  category: "spoon",  toBase: 0.000616 },
  // NOTE: pinch is a dry measure — placed in weight (base: kg) to avoid mixed-base errors in spoon category
  { symbol: "pinch",  label: "Pinch (dry ~0.3g)",     category: "weight", toBase: 0.0003 },

  // Count
  { symbol: "pcs",    label: "Piece (pcs)",           category: "count",  toBase: 1 },
  { symbol: "doz",    label: "Dozen (12 pcs)",        category: "count",  toBase: 12 },
  { symbol: "bunch",  label: "Bunch",                 category: "count",  toBase: 1 },
  { symbol: "portion",label: "Portion",               category: "count",  toBase: 1 },
  { symbol: "slice",  label: "Slice",                 category: "count",  toBase: 1 },
  { symbol: "fillet", label: "Fillet",                category: "count",  toBase: 1 },
  { symbol: "clove",  label: "Clove (~5g)",           category: "count",  toBase: 1 },
];

export const UNIT_CATEGORIES: Record<UnitCategory, string> = {
  weight: "Weight",
  volume: "Volume",
  spoon: "Spoon / Cup",
  count: "Count / Piece",
};

/** All symbols as a flat string array (for the old UNITS constant) */
export const ALL_UNIT_SYMBOLS = ALL_UNITS.map(u => u.symbol);

/** Group units by category for Select rendering — memoized at module level */
const _unitsByCategory: Record<UnitCategory, UnitDef[]> = {
  weight: [], volume: [], spoon: [], count: [],
};
for (const u of ALL_UNITS) _unitsByCategory[u.category].push(u);
export const UNITS_BY_CATEGORY = _unitsByCategory;

/** @deprecated Use UNITS_BY_CATEGORY instead — kept for backward compat */
export function getUnitsByCategory(): Record<UnitCategory, UnitDef[]> {
  return UNITS_BY_CATEGORY;
}

// ─── Unit → Category lookup ───────────────────────────────────────────────────

export function getUnitDef(symbol: string): UnitDef | undefined {
  return ALL_UNITS.find(u => u.symbol === symbol);
}

export function getUnitCategory(symbol: string): UnitCategory | null {
  return getUnitDef(symbol)?.category ?? null;
}

// ─── Same-category conversion ────────────────────────────────────────────────

/**
 * Convert a value from `fromUnit` to `toUnit` when both are in the same category.
 * Returns null if conversion is not possible (different categories, or unknown units).
 */
export function convertSameCategory(qty: number, fromSymbol: string, toSymbol: string): number | null {
  if (fromSymbol === toSymbol) return qty;
  const from = getUnitDef(fromSymbol);
  const to = getUnitDef(toSymbol);
  if (!from || !to) return null;
  if (from.category !== to.category) return null;
  // qty * from.toBase gives value in base; divide by to.toBase to get target unit
  return (qty * from.toBase) / to.toBase;
}

// ─── Ingredient-specific Suggestion Table (USDA + common culinary sources) ───

interface ConversionSuggestion {
  /** partial ingredient name patterns (lowercase, matched with includes) */
  patterns: string[];
  /** from unit symbol */
  from: string;
  /** to unit symbol — the storage unit this converts to */
  to: string;
  /** conversion factor: 1 `from` = `factor` `to` */
  factor: number;
  /** source note */
  note?: string;
}

export const CONVERSION_SUGGESTIONS: ConversionSuggestion[] = [
  // ── Flours ────────────────────────────────────────────────────────────────
  // NOTE: besan and cornflour/cornstarch have dedicated rows below — excluded here to prevent wrong match order
  { patterns: ["flour", "maida", "atta"],                                       from: "tbsp", to: "g",  factor: 8,     note: "USDA all-purpose flour" },
  { patterns: ["flour", "maida", "atta"],                                       from: "cup",  to: "g",  factor: 120,   note: "USDA all-purpose flour" },
  { patterns: ["besan"],                                                         from: "tbsp", to: "g",  factor: 10,    note: "Chickpea flour" },
  { patterns: ["besan"],                                                         from: "cup",  to: "g",  factor: 92,    note: "Chickpea flour" },
  { patterns: ["cornstarch", "cornflour"],                                       from: "tbsp", to: "g",  factor: 8,     note: "USDA" },
  { patterns: ["cornstarch", "cornflour"],                                       from: "cup",  to: "g",  factor: 128,   note: "USDA" },
  { patterns: ["cocoa"],                                                         from: "tbsp", to: "g",  factor: 5.4,   note: "USDA cocoa powder" },
  { patterns: ["cocoa"],                                                         from: "cup",  to: "g",  factor: 85,    note: "USDA" },

  // ── Sugars ────────────────────────────────────────────────────────────────
  { patterns: ["sugar", "cheeni"],                                               from: "tbsp", to: "g",  factor: 12.5,  note: "USDA granulated" },
  { patterns: ["sugar", "cheeni"],                                               from: "cup",  to: "g",  factor: 200,   note: "USDA granulated" },
  { patterns: ["sugar", "cheeni"],                                               from: "tsp",  to: "g",  factor: 4.2,   note: "USDA granulated" },
  { patterns: ["brown sugar"],                                                   from: "tbsp", to: "g",  factor: 13.8,  note: "USDA packed" },
  { patterns: ["powdered sugar", "icing sugar"],                                 from: "cup",  to: "g",  factor: 120,   note: "USDA" },

  // ── Fats & Dairy ──────────────────────────────────────────────────────────
  { patterns: ["butter", "makkhan"],                                             from: "tbsp", to: "g",  factor: 14.2,  note: "USDA" },
  { patterns: ["butter", "makkhan"],                                             from: "cup",  to: "g",  factor: 227,   note: "USDA" },
  { patterns: ["ghee"],                                                          from: "tbsp", to: "g",  factor: 14,    note: "Dense fat" },
  { patterns: ["ghee"],                                                          from: "tsp",  to: "g",  factor: 4.6,   note: "Dense fat" },
  { patterns: ["oil", "tel"],                                                    from: "tbsp", to: "ml", factor: 13.5,  note: "Generic oil volume" },
  { patterns: ["oil", "tel"],                                                    from: "cup",  to: "ml", factor: 216,   note: "Generic oil volume" },
  { patterns: ["oil", "tel"],                                                    from: "tsp",  to: "ml", factor: 4.5,   note: "Generic oil volume" },
  { patterns: ["milk", "doodh", "cream"],                                        from: "cup",  to: "ml", factor: 240,   note: "Volume" },
  { patterns: ["milk", "doodh", "cream"],                                        from: "tbsp", to: "ml", factor: 15,    note: "Volume" },
  { patterns: ["cheese"],                                                        from: "cup",  to: "g",  factor: 113,   note: "USDA grated" },
  { patterns: ["yogurt", "curd", "dahi"],                                        from: "cup",  to: "g",  factor: 245,   note: "USDA" },
  { patterns: ["yogurt", "curd", "dahi"],                                        from: "tbsp", to: "g",  factor: 15,    note: "USDA" },

  // ── Liquids ───────────────────────────────────────────────────────────────
  { patterns: ["water", "pani", "stock", "broth", "juice"],                      from: "cup",  to: "ml", factor: 236.6, note: "Volume = mass for water" },
  { patterns: ["water", "pani", "stock", "broth", "juice"],                      from: "tbsp", to: "ml", factor: 14.8,  note: "Volume" },
  { patterns: ["honey", "syrup", "molasses"],                                    from: "tbsp", to: "g",  factor: 21,    note: "Dense liquid" },
  { patterns: ["honey", "syrup", "molasses"],                                    from: "cup",  to: "g",  factor: 340,   note: "Dense liquid" },
  { patterns: ["vinegar", "soy sauce", "sauce"],                                 from: "tbsp", to: "ml", factor: 15,    note: "Volume" },

  // ── Spices & Seasonings ────────────────────────────────────────────────────
  { patterns: ["salt", "namak"],                                                 from: "tsp",  to: "g",  factor: 6,     note: "USDA table salt" },
  { patterns: ["salt", "namak"],                                                 from: "tbsp", to: "g",  factor: 18,    note: "USDA table salt" },
  { patterns: ["pepper", "kali mirch"],                                          from: "tsp",  to: "g",  factor: 2.3,   note: "USDA ground pepper" },
  { patterns: ["turmeric", "haldi"],                                             from: "tsp",  to: "g",  factor: 2.8,   note: "USDA" },
  { patterns: ["cumin", "jeera"],                                                from: "tsp",  to: "g",  factor: 2.1,   note: "USDA ground" },
  { patterns: ["coriander", "dhania"],                                           from: "tsp",  to: "g",  factor: 1.8,   note: "USDA ground" },
  { patterns: ["chili", "chilli", "mirch"],                                      from: "tsp",  to: "g",  factor: 2.7,   note: "Ground chili" },
  { patterns: ["garam masala"],                                                  from: "tsp",  to: "g",  factor: 2.5,   note: "Ground mix" },
  { patterns: ["cardamom", "elaichi"],                                           from: "tsp",  to: "g",  factor: 2.2,   note: "Ground" },
  { patterns: ["cinnamon", "dalchini"],                                          from: "tsp",  to: "g",  factor: 2.6,   note: "Ground" },
  { patterns: ["ginger", "adrak"],                                               from: "tsp",  to: "g",  factor: 1.8,   note: "Ground" },
  { patterns: ["baking powder"],                                                 from: "tsp",  to: "g",  factor: 4,     note: "USDA" },
  { patterns: ["baking soda", "soda"],                                           from: "tsp",  to: "g",  factor: 6,     note: "USDA" },
  { patterns: ["yeast"],                                                         from: "tsp",  to: "g",  factor: 3,     note: "Instant dry yeast packet" },

  // ── Grains & Starches ─────────────────────────────────────────────────────
  { patterns: ["rice", "chawal"],                                                from: "cup",  to: "g",  factor: 185,   note: "Uncooked raw rice" },
  { patterns: ["oats"],                                                          from: "cup",  to: "g",  factor: 90,    note: "Rolled oats" },
  { patterns: ["semolina", "rava", "sooji"],                                     from: "cup",  to: "g",  factor: 167,   note: "Coarse semolina" },

  // ── Produce / Count ────────────────────────────────────────────────────────
  { patterns: ["garlic", "lahsun"],                                              from: "clove", to: "g", factor: 5,     note: "1 medium clove ≈ 5g" },
  { patterns: ["onion", "pyaz"],                                                 from: "pcs",   to: "g", factor: 150,   note: "1 medium onion ≈ 150g" },
  { patterns: ["tomato", "tamatar"],                                             from: "pcs",   to: "g", factor: 120,   note: "1 medium tomato ≈ 120g" },
  { patterns: ["egg", "anda"],                                                   from: "pcs",   to: "g", factor: 55,    note: "1 large egg ≈ 55g" },
  { patterns: ["lemon", "nimbu"],                                                from: "pcs",   to: "g", factor: 60,    note: "1 medium lemon ≈ 60g" },
];

// ─── Suggestion Engine ────────────────────────────────────────────────────────

export interface ConversionHint {
  factor: number;
  label: string;  // human-readable e.g. "1 tbsp ≈ 8g (USDA flour)"
  note?: string;
}

/**
 * Get a suggested conversion factor for linking a recipe unit to a storage unit.
 * @param ingredientName - name of the ingredient (fuzzy matched)
 * @param recipeUnit     - the unit staff will enter quantities in (e.g. "tbsp")
 * @param storageUnit    - the ingredient's storage unit (e.g. "g", "kg")
 * @returns ConversionHint or null if no suggestion found
 */
export function getSuggestedConversion(
  ingredientName: string,
  recipeUnit: string,
  storageUnit: string,
): ConversionHint | null {
  if (!ingredientName || !recipeUnit || !storageUnit) return null;
  if (recipeUnit === storageUnit) return { factor: 1, label: `Same unit — no conversion needed` };

  const name = ingredientName.toLowerCase().trim();

  // 1. Try ingredient-specific suggestions first
  for (const s of CONVERSION_SUGGESTIONS) {
    if (s.from !== recipeUnit) continue;
    const matchesIngredient = s.patterns.some(p => name.includes(p));
    if (!matchesIngredient) continue;

    // Factor converts recipeUnit → s.to (e.g. tbsp → g)
    // If s.to matches storageUnit directly, we're done
    if (s.to === storageUnit) {
      return {
        factor: s.factor,
        label: `1 ${recipeUnit} ≈ ${s.factor} ${storageUnit}`,
        note: s.note,
      };
    }

    // If s.to and storageUnit are in the same category, chain the conversion
    const chained = convertSameCategory(s.factor, s.to, storageUnit);
    if (chained !== null) {
      return {
        factor: parseFloat(chained.toFixed(6)),
        label: `1 ${recipeUnit} ≈ ${parseFloat(chained.toFixed(6))} ${storageUnit}`,
        note: s.note,
      };
    }
  }

  // 2. Fallback: try pure same-category unit conversion (e.g. tbsp → L, g → kg)
  const sameCat = convertSameCategory(1, recipeUnit, storageUnit);
  if (sameCat !== null) {
    return {
      factor: parseFloat(sameCat.toFixed(6)),
      label: `1 ${recipeUnit} = ${parseFloat(sameCat.toFixed(6))} ${storageUnit}`,
      note: "Volume/weight unit conversion",
    };
  }

  return null; // cross-category, no ingredient match — user must enter manually
}

/**
 * Format a factor for display, removing trailing zeros.
 * Returns "—" for non-finite/NaN values.
 */
export function formatFactor(factor: number): string {
  if (!isFinite(factor) || isNaN(factor)) return "—";
  if (factor === 0) return "0";
  if (factor >= 1) return parseFloat(factor.toFixed(4)).toString();
  return parseFloat(factor.toFixed(6)).toString();
}
