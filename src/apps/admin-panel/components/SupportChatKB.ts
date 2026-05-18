// ─── Support Chat Knowledge Base ─────────────────────────────────────────────
export type KBEntry = {
  keywords: string[];
  answer: string;
  followUps?: string[];
  navLink?: string;
  topic?: string;
};

// Synonym expansion map
export const SYNONYMS: Record<string, string[]> = {
  order: ["orders","ordering","purchase"],
  menu: ["food","dish","dishes","item","items","meal"],
  inventory: ["stock","ingredient","ingredients","supply","supplies","inventry","inventori"],
  staff: ["employee","team","waiter","waitress","chef","cashier","worker"],
  billing: ["bill","payment","plan","subscription","pricing","upgrade","price"],
  analytics: ["report","reports","insight","insights","stats","statistics","revenue","sales"],
  delivery: ["deliver","shipping","zone","zones"],
  coupon: ["discount","offer","promo","promotion","reward","code"],
  reservation: ["booking","reserve","table booking","book"],
  review: ["rating","feedback","star","stars"],
  qr: ["qr code","scan","scanner","barcode"],
  branding: ["logo","color","theme","customize","brand","design"],
  kitchen: ["kds","kitchen display","kitchen board","cook"],
  whatsapp: ["whatsapp","wa","notification","sms"],
  holiday: ["holiday","vacation","closed","close","break"],
};

export const KB: KBEntry[] = [
  // Greetings
  { keywords: ["hello","hi","hey","help","support","assist"], topic: "greeting",
    answer: "Hello! 👋 I'm here to help you get the most out of your restaurant management system. What can I assist you with today?",
    followUps: ["How to manage orders?","Menu setup help","Inventory guide","Staff management"] },
  { keywords: ["thank","thanks","thx","awesome","great"],
    answer: "You're welcome! 😊 Feel free to reach out anytime. We're always here for you!" },
  { keywords: ["bye","goodbye","close chat"],
    answer: "Goodbye! 👋 Don't hesitate to come back if you need help. Have a great day!" },

  // Dashboard
  { keywords: ["dashboard","home","overview"], topic: "dashboard", navLink: "/admin",
    answer: "Your **Dashboard** shows today's revenue, order count, recent orders feed, and quick stats (pending, accepted, completed).",
    followUps: ["How to manage orders?","View analytics","Quick order help"] },

  // Orders
  { keywords: ["order","orders","manage order"], topic: "orders", navLink: "/admin/orders",
    answer: "The **Orders** page shows all orders in a Kanban board: New → Accepted → Cooking → Ready → Completed.\n\n• Use time filters (Today/Weekly/Monthly)\n• Click any order for full details\n• Drag or click to change status\n• Real-time sync enabled!",
    followUps: ["Quick order help","Kitchen board setup","Track order status"] },
  { keywords: ["quick order","pos","staff order","place order","walk-in"], topic: "quickorder", navLink: "/admin/quick-order",
    answer: "**Quick Order** is your staff POS for walk-in customers.\n\n• Search/browse menu by category\n• Grid/List view toggle\n• Set order type: Dine-In, Pickup, Delivery\n• Apply discounts, tips, coupons\n• Cash, Card, or UPI payment",
    followUps: ["How to apply coupon?","Delivery setup","Menu management"] },

  // Kitchen
  { keywords: ["kitchen","kitchen board","kds","kitchen display"], topic: "kitchen", navLink: "/admin/kitchen",
    answer: "The **Kitchen Board** is a real-time display for your kitchen staff.\n\n• Shows orders: New → Accepted → Cooking → Ready\n• One-click status updates\n• Sound notifications for new orders\n• Enable from Explore Features → Kitchen Display",
    followUps: ["How to manage orders?","Sound notifications","Enable features"] },

  // Menu
  { keywords: ["menu","menu item","add item","category","categories","food"], topic: "menu", navLink: "/admin/menu",
    answer: "**Menu Management** lets you:\n• Create categories with drag-to-sort\n• Add items with photos, prices, variants & add-ons\n• Set food type (Veg/Non-Veg/Vegan)\n• Mark items as sold out or toggle visibility\n\n**Tip:** Keep 6-9 categories for best UX!",
    followUps: ["How to add variants?","Set daily special","Link ingredients"] },
  { keywords: ["variant","variants","size","addon","add-on","addons","extra"], topic: "variants",
    answer: "**Variants** = size options (Small/Medium/Large) with different prices.\n**Add-ons** = extras (Extra Cheese, Spicy Sauce).\n\nManage per item: Click item → Edit → Variants/Add-ons tab.",
    followUps: ["Menu management","Pricing help","Add new item"] },

  // Inventory
  { keywords: ["inventory","ingredient","stock","low stock"], topic: "inventory", navLink: "/admin/inventory",
    answer: "**Inventory** tracks your ingredients:\n• Add ingredients with stock levels & units\n• **Bulk Add** multiple at once\n• Set low-stock thresholds for alerts\n• Link ingredients to menu items\n• Stock auto-deducts on order acceptance\n• Items auto-disable when stock runs out",
    followUps: ["How to restock?","Link ingredients","Bulk add items"] },
  { keywords: ["restock","replenish","add stock","stock movement"], topic: "restock", navLink: "/admin/inventory",
    answer: "To restock: Go to Inventory → Find ingredient → Click **Restock** → Enter quantity & notes. Stock updates and disabled menu items re-enable automatically!",
    followUps: ["View stock movements","Low stock alerts","Inventory setup"] },
  { keywords: ["link ingredient","ingredient link","recipe","deduction"], topic: "linking", navLink: "/admin/inventory",
    answer: "To link ingredients to menu items:\n1. Inventory → Click **Links** on any ingredient\n2. Check menu items to link\n3. Set quantity, unit & conversion factor per item\n4. Use 'Quick Fill' to batch-apply values\n5. Click Link!",
    followUps: ["Conversion units","Restock help","Bulk linking"] },

  // Staff
  { keywords: ["staff","employee","team","role","permission","invite"], topic: "staff", navLink: "/admin/staff",
    answer: "**Staff Management:**\n• Invite team members via email\n• Assign roles: Admin, Manager, Chef, Waiter, Cashier\n• Set granular permissions per staff\n• Staff see only what they have access to",
    followUps: ["How to invite staff?","Set permissions","Role types"] },

  // QR & Branding
  { keywords: ["qr","qr code","scan","table qr"], topic: "qr", navLink: "/admin/qr-menu",
    answer: "**QR Menu** generates scannable codes for your tables!\n• Each table gets a unique QR\n• Customers scan to view your digital menu\n• They can order directly from their phone\n• Customize QR style and colors",
    followUps: ["Branding setup","Table management","Public menu"] },
  { keywords: ["branding","logo","color","theme","customize","appearance"], topic: "branding", navLink: "/admin/branding",
    answer: "**Branding** lets you customize your look:\n• Upload logo & cover image\n• Set brand colors\n• Configure operating hours\n• Set restaurant details (address, phone)\n• Holiday mode control",
    followUps: ["Set operating hours","Holiday mode","Upload logo"] },

  // Billing
  { keywords: ["billing","plan","subscription","payment","pricing","upgrade"], topic: "billing", navLink: "/admin/billing",
    answer: "**Billing** manages your subscription:\n• View current plan & usage\n• Upgrade/downgrade anytime\n• View invoice history\n• Manage payment methods",
    followUps: ["View plans","Feature comparison","Payment issues"] },

  // Coupons
  { keywords: ["coupon","discount","offer","promo","promotion","reward"], topic: "coupons", navLink: "/admin/coupons",
    answer: "**Rewards & Offers** — create coupon codes:\n• Percentage or flat discounts\n• Min order amounts\n• Validity periods & usage limits\n• Track redemptions\n\nEnable from Explore Features → Coupons.",
    followUps: ["Create a coupon","Set min order","Track usage"] },

  // Reservations
  { keywords: ["reservation","booking","table booking","reserve"], topic: "reservations", navLink: "/admin/reservations",
    answer: "**Reservations** handles table bookings:\n• Customers book online\n• View & manage all bookings\n• Approve or decline\n• Set time slots\n\nEnable from Explore Features → Table Reservations.",
    followUps: ["Set time slots","Manage bookings","Enable feature"] },

  // Reviews
  { keywords: ["review","rating","feedback","star"], topic: "reviews", navLink: "/admin/reviews",
    answer: "**Reviews** shows customer feedback:\n• View all ratings and comments\n• Track average rating over time\n• Approve/moderate reviews\n\nEnable from Explore Features → Reviews.",
    followUps: ["Manage reviews","Improve ratings","Enable feature"] },

  // Analytics
  { keywords: ["analytics","report","insight","revenue","sales","chart"], topic: "analytics", navLink: "/admin/analytics",
    answer: "**Analytics** gives detailed insights:\n• Revenue trends (daily/weekly/monthly)\n• Top selling items\n• Order volume charts\n• Peak hour analysis\n\nEnable from Explore Features → Analytics.",
    followUps: ["Revenue report","Top items","Peak hours"] },

  // Delivery
  { keywords: ["delivery","delivery zone","delivery area","deliver"], topic: "delivery", navLink: "/admin/delivery-zones",
    answer: "**Delivery Zones:**\n• Draw zones on a map\n• Set delivery fees per zone\n• Set minimum order amounts\n• Enable/disable zones\n\nEnable from Explore Features → Delivery Zones.",
    followUps: ["Set delivery fee","Draw zone","Min order amount"] },

  // WhatsApp
  { keywords: ["whatsapp","notification","sms","otp","bot"], topic: "whatsapp",
    answer: "**WhatsApp Integration:**\n• Order notifications to customers\n• WhatsApp Bot for automated replies\n• OTP verification for orders\n\nConfigure from sidebar → WhatsApp Bot / OTP Settings.",
    followUps: ["Setup WhatsApp","OTP settings","Notification config"] },

  // Holiday / Operating Hours
  { keywords: ["holiday","vacation","closed","break","operating hours","business hours","schedule"], topic: "hours", navLink: "/admin/branding",
    answer: "**Operating Hours & Holiday Mode:**\n• Set hours per day in Branding → Operating Hours\n• Enable Holiday Mode to temporarily close\n• Set custom closed message\n• Public menu auto-shows 'Closed' badge\n\nGo to Branding to configure.",
    followUps: ["Set operating hours","Enable holiday mode","Custom message"] },

  // Features
  { keywords: ["feature","explore","enable","disable","module","activate"], topic: "features", navLink: "/admin/explore",
    answer: "Go to **Explore Features** to enable/disable modules:\n• Kitchen Display, Inventory, Coupons\n• Reservations, Reviews, Analytics\n• WhatsApp CRM, API Access\n• And more!\n\nEach feature toggles independently.",
    followUps: ["Enable kitchen display","Setup inventory","Enable coupons"] },

  // Collaborative ordering
  { keywords: ["collaborative","shared cart","group order","split"], topic: "collab",
    answer: "**Collaborative Ordering** lets multiple people add to the same cart:\n• Share a link with friends/family\n• Everyone adds their items\n• One person places the final order\n• Great for group dining!",
    followUps: ["How to share cart?","Place group order","Order management"] },

  // Common issues
  { keywords: ["not working","error","bug","issue","problem","broken","crash"], topic: "issues",
    answer: "Quick fixes:\n1. **Refresh** (Ctrl+R)\n2. **Clear cache** (Ctrl+Shift+Delete)\n3. **Check internet**\n4. **Log out and back in**\n\nIf it persists, describe what's happening and I'll help!",
    followUps: ["Login issues","Slow performance","Report a bug"] },
  { keywords: ["login","sign in","password","forgot password","access","can't login"], topic: "login",
    answer: "**Login help:**\n• Use your registered email & password\n• Click 'Forgot Password' to reset\n• Check spam for reset emails\n• Staff need an invitation link from admin",
    followUps: ["Reset password","Invite staff","Access denied"] },
  { keywords: ["slow","loading","performance","lag","freeze"], topic: "performance",
    answer: "If the system feels slow:\n1. Check internet speed\n2. Close extra browser tabs\n3. Hard refresh (Ctrl+Shift+R)\n4. Use Chrome/Edge for best performance\n5. Clear browser cache",
    followUps: ["Still slow","Report issue","Browser support"] },
];

// Fuzzy match: allows 1-2 char difference
export function fuzzyMatch(word: string, target: string): boolean {
  if (target.includes(word) || word.includes(target)) return true;
  if (Math.abs(word.length - target.length) > 2) return false;
  let diff = 0;
  const shorter = word.length <= target.length ? word : target;
  const longer = word.length > target.length ? word : target;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) diff++;
    if (diff > 2) return false;
  }
  return diff + (longer.length - shorter.length) <= 2;
}

// Expand synonyms
function expandQuery(words: string[]): string[] {
  const expanded = [...words];
  for (const word of words) {
    for (const [, synonyms] of Object.entries(SYNONYMS)) {
      if (synonyms.some(s => fuzzyMatch(word, s))) {
        expanded.push(...synonyms);
      }
    }
  }
  return [...new Set(expanded)];
}

// Smart scoring
export function findBestMatch(input: string, lastTopic?: string): KBEntry | null {
  const q = input.toLowerCase().trim();
  if (!q) return null;

  // Context follow-ups
  if (lastTopic && /^(how|tell me more|more|what else|explain|details|yes|ok)/.test(q)) {
    const topicMatch = KB.find(e => e.topic === lastTopic && e.followUps?.length);
    if (topicMatch) return topicMatch;
  }

  const words = expandQuery(q.split(/\s+/));
  let best: KBEntry | null = null;
  let bestScore = 0;

  for (const entry of KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      // Exact substring match
      if (q.includes(kw)) { score += kw.length * 2; continue; }
      // Word-level match
      for (const w of words) {
        if (fuzzyMatch(w, kw)) { score += kw.length; break; }
      }
    }
    // Boost if matches last topic
    if (lastTopic && entry.topic === lastTopic) score *= 1.3;
    if (score > bestScore) { bestScore = score; best = entry; }
  }

  return bestScore >= 3 ? best : null;
}

export const FALLBACK_ANSWER = "I appreciate your question! I don't have a specific answer for that right now. Here are topics I can help with:\n\n• **Orders** — Managing and tracking\n• **Menu** — Items, categories, variants\n• **Inventory** — Stock and ingredients\n• **Staff** — Team and permissions\n• **Billing** — Plans and subscriptions\n\nCould you pick a topic or rephrase? 😊";

export const QUICK_TOPICS = [
  { label: "Orders", icon: "📋", query: "How to manage orders?" },
  { label: "Menu", icon: "🍽️", query: "Menu management help" },
  { label: "Inventory", icon: "📦", query: "Inventory guide" },
  { label: "Staff", icon: "👥", query: "Staff management" },
  { label: "Billing", icon: "💳", query: "Billing and plans" },
  { label: "More", icon: "✨", query: "What features are available?" },
];
