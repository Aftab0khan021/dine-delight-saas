// ─── Support Chat Knowledge Base ─────────────────────────────────────────────
export type KBEntry = {
  keywords: string[];
  answers: string[];  // Multiple variants — bot picks randomly
  followUps?: string[];
  navLink?: string;
  topic?: string;
};

// Conversational prefixes the bot randomly prepends
export const INTROS: string[] = [
  "", "", "",  // often no intro
  "Great question! ",
  "Sure thing! ",
  "Absolutely! ",
  "Of course! ",
  "Happy to help! ",
  "Good one — ",
  "Glad you asked! ",
];

export const EMPATHY_INTROS: string[] = [
  "Oh no, that sounds frustrating! ",
  "I totally understand — ",
  "Sorry you're dealing with that! ",
  "Let's get this sorted out. ",
  "I hear you — ",
];

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
  // ── Greetings & small talk ──
  { keywords: ["hello","hi","hey","help","support","assist"], topic: "greeting",
    answers: [
      "Hey there! 👋 I'm here to help you with anything. What's on your mind?\n\nSome popular topics:\n• Orders & Kitchen\n• Menu Management\n• Inventory & Stock\n• Billing & Plans",
      "Hi! 😊 Welcome! I'm all ears — what do you need help with today?\n\nI can help with:\n• Orders & Kitchen\n• Menu setup\n• Inventory tracking\n• Staff & permissions",
      "Hello! 👋 Good to see you here. Ask me anything about the system — I've got you covered!",
    ],
    followUps: ["How to manage orders?","Menu setup help","Inventory guide","Staff management"] },
  { keywords: ["thank","thanks","thx","awesome","great","perfect","nice"],
    answers: [
      "You're welcome! 😊 Anything else I can help with?",
      "Happy to help! Let me know if anything else comes up 👍",
      "Glad I could help! Don't hesitate to ask if you need anything else 😊",
      "Anytime! That's what I'm here for 🙌",
    ] },
  { keywords: ["bye","goodbye","close chat","done","that's all"],
    answers: [
      "Take care! 👋 Come back anytime you need help!",
      "Bye for now! 😊 I'll be right here if you need me. Have a great day!",
      "Goodbye! Don't be a stranger — I'm always here to help 👋",
    ] },
  { keywords: ["how are you","how r u","wassup","what's up","whats up"],
    answers: [
      "I'm doing great, thanks for asking! 😊 Ready to help you with anything. What do you need?",
      "All good on my end! 🙌 More importantly — how can I help YOU today?",
      "Doing well! Thanks for asking 😊 What can I help you with?",
    ] },
  { keywords: ["who are you","your name","what are you","are you real","are you ai","are you a bot","are you human"],
    answers: [
      "I'm Sarah from the Dine Delight support team! 😊 I'm here to help you navigate the system and answer any questions. What do you need help with?",
      "Hey! I'm Sarah — your dedicated support assistant. I know the system inside-out, so feel free to ask me anything!",
    ] },
  { keywords: ["good morning","morning"],
    answers: ["Good morning! ☀️ Hope you're having a great start to the day. How can I help?","Morning! 🌅 What can I do for you today?"] },
  { keywords: ["good afternoon","afternoon"],
    answers: ["Good afternoon! 🌤️ What can I help you with?","Afternoon! Hope your day's going well. What do you need?"] },
  { keywords: ["good evening","evening","good night"],
    answers: ["Good evening! 🌙 How can I help you?","Evening! What can I do for you tonight?"] },

  // ── Dashboard ──
  { keywords: ["dashboard","home","overview"], topic: "dashboard", navLink: "/admin",
    answers: [
      "Your Dashboard is basically your command center! 🎯 You'll see today's revenue, order count, recent orders, and quick stats at a glance. It updates in real-time too!",
      "The Dashboard gives you a bird's-eye view of everything — revenue, orders, stats. Think of it as your daily snapshot 📊",
    ],
    followUps: ["How to manage orders?","View analytics","Quick order help"] },

  // ── Orders ──
  { keywords: ["order","orders","manage order"], topic: "orders", navLink: "/admin/orders",
    answers: [
      "The Orders page is set up like a Kanban board — super visual! 📋\n\nYour orders flow through: New → Accepted → Cooking → Ready → Completed\n\nYou can drag cards between columns or click to change status. Everything syncs in real-time, so your kitchen always sees the latest!",
      "Managing orders is pretty straightforward! You've got a Kanban-style board where orders move through stages.\n\nPro tip: Use the time filter (Today/Weekly/Monthly) to focus on what matters. And don't worry — it all updates live! ⚡",
    ],
    followUps: ["Quick order help","Kitchen board setup","Track order status"] },
  { keywords: ["quick order","pos","staff order","place order","walk-in"], topic: "quickorder", navLink: "/admin/quick-order",
    answers: [
      "Quick Order is basically your POS system! 🏪 Perfect for walk-in customers.\n\nHere's the flow:\n1. Browse or search menu items\n2. Add to cart (it stays fixed while you scroll — nice, right?)\n3. Set order type: Dine-In, Pickup, or Delivery\n4. Apply any discounts or coupons\n5. Choose payment: Cash, Card, or UPI\n\nDone! Order placed in seconds 🚀",
    ],
    followUps: ["How to apply coupon?","Delivery setup","Menu management"] },

  // ── Kitchen ──
  { keywords: ["kitchen","kitchen board","kds","kitchen display"], topic: "kitchen", navLink: "/admin/kitchen",
    answers: [
      "The Kitchen Board is a game-changer for your kitchen staff! 👨‍🍳\n\nIt's a real-time display showing orders in columns (New → Cooking → Ready). Your chefs just tap to update status — no more shouting across the kitchen!\n\nOh, and it plays a sound when new orders come in 🔔\n\nEnable it from Explore Features if you haven't already.",
    ],
    followUps: ["How to manage orders?","Sound notifications","Enable features"] },

  // ── Menu ──
  { keywords: ["menu","menu item","add item","category","categories","food"], topic: "menu", navLink: "/admin/menu",
    answers: [
      "Menu Management is where the magic happens! 🍽️\n\nYou can:\n• Create categories and drag to reorder them\n• Add items with photos, prices, variants & add-ons\n• Set food type (Veg 🟢 / Non-Veg 🔴 / Vegan)\n• Mark items as sold out with one click\n\nQuick tip: Keep it to 6-9 categories for the best customer experience!",
      "Setting up your menu is really intuitive! Head to Menu in the sidebar.\n\nCreate your categories first, then add items under each one. You can upload photos, set prices, add variants (like sizes), and even add-ons (extra cheese, etc.).\n\nEverything shows up on your public menu instantly! ✨",
    ],
    followUps: ["How to add variants?","Set daily special","Link ingredients"] },
  { keywords: ["variant","variants","size","addon","add-on","addons","extra","customize"], topic: "variants",
    answers: [
      "Variants and add-ons are super useful! Here's the difference:\n\n**Variants** = Different sizes/options (Small ₹99, Medium ₹149, Large ₹199)\n**Add-ons** = Extras customers can tack on (Extra Cheese +₹30, Spicy Sauce +₹10)\n\nTo set them up: Click any menu item → Edit → look for the Variants/Add-ons section.\n\nCustomers will see these options when ordering! 🎯",
    ],
    followUps: ["Menu management","Pricing help","Add new item"] },

  // ── Inventory ──
  { keywords: ["inventory","ingredient","stock","low stock"], topic: "inventory", navLink: "/admin/inventory",
    answers: [
      "Inventory management is honestly one of the most powerful features! 📦\n\nHere's what it does:\n• Track all your ingredients with stock levels\n• Bulk add multiple ingredients at once\n• Set low-stock alerts (so you never run out!)\n• Link ingredients to menu items\n• Stock auto-deducts when orders are accepted\n• Menu items auto-disable when ingredients run out\n\nIt basically runs itself once you set it up! 🎯",
    ],
    followUps: ["How to restock?","Link ingredients","Bulk add items"] },
  { keywords: ["restock","replenish","add stock","stock movement"], topic: "restock", navLink: "/admin/inventory",
    answers: [
      "Restocking is quick! Just go to Inventory, find the ingredient, and hit **Restock**. Enter the quantity and optional notes — that's it!\n\nThe cool part? If any menu items were auto-disabled because of low stock, they'll automatically come back online 🟢",
    ],
    followUps: ["View stock movements","Low stock alerts","Inventory setup"] },
  { keywords: ["link ingredient","ingredient link","recipe","deduction","conversion"], topic: "linking", navLink: "/admin/inventory",
    answers: [
      "Linking ingredients to menu items is how the auto-deduction magic works! ✨\n\nHere's how:\n1. Go to Inventory → Click **Links** on any ingredient\n2. Check the menu items you want to link\n3. For each item, set: quantity used, unit, and conversion factor\n4. Pro tip: Use 'Quick Fill' to batch-apply the same values\n5. Hit Link!\n\nNow when that menu item is ordered, the ingredient stock updates automatically 🎯",
    ],
    followUps: ["Conversion units","Restock help","Bulk linking"] },

  // ── Staff ──
  { keywords: ["staff","employee","team","role","permission","invite"], topic: "staff", navLink: "/admin/staff",
    answers: [
      "Staff management gives you full control over your team! 👥\n\n• **Invite** team members via email\n• **Assign roles**: Admin, Manager, Chef, Waiter, Cashier\n• **Set permissions** per person (super granular!)\n• Staff only see what they have access to\n\nSo your chef sees the kitchen board, your cashier sees the POS, and so on. Nice and clean! 🎯",
    ],
    followUps: ["How to invite staff?","Set permissions","Role types"] },

  // ── QR & Branding ──
  { keywords: ["qr","qr code","scan","table qr"], topic: "qr", navLink: "/admin/qr-menu",
    answers: [
      "QR codes are such a time-saver! 📱\n\nEach table gets its own unique QR code. Customers scan it → see your beautiful digital menu → place orders right from their phone.\n\nYou can customize the QR design and colors to match your brand. Go to QR Menu in the sidebar to set it up!",
    ],
    followUps: ["Branding setup","Table management","Public menu"] },
  { keywords: ["branding","logo","color","theme","customize","appearance"], topic: "branding", navLink: "/admin/branding",
    answers: [
      "Branding is where you make the system truly yours! 🎨\n\n• Upload your logo and cover image\n• Set your brand colors\n• Configure operating hours per day\n• Add contact info and address\n• Control Holiday Mode\n\nYour public menu and restaurant profile will reflect all these changes instantly!",
    ],
    followUps: ["Set operating hours","Holiday mode","Upload logo"] },

  // ── Billing ──
  { keywords: ["billing","plan","subscription","payment","pricing","upgrade"], topic: "billing", navLink: "/admin/billing",
    answers: [
      "You can manage everything billing-related from the Billing page! 💳\n\n• See your current plan and what's included\n• Upgrade or downgrade anytime\n• View your invoice history\n• Update payment methods\n\nIf you're not sure which plan is right for you, I can help you compare!",
    ],
    followUps: ["View plans","Feature comparison","Payment issues"] },

  // ── Coupons ──
  { keywords: ["coupon","discount","offer","promo","promotion","reward"], topic: "coupons", navLink: "/admin/coupons",
    answers: [
      "Coupons are great for bringing customers back! 🎟️\n\nYou can create:\n• **Percentage** discounts (10% off)\n• **Flat** discounts (₹50 off)\n• Set minimum order amounts\n• Add expiry dates\n• Limit usage per customer\n\nCustomers enter the code at checkout and boom — discount applied!\n\nEnable this from Explore Features → Coupons if you haven't yet.",
    ],
    followUps: ["Create a coupon","Set min order","Track usage"] },

  // ── Reservations ──
  { keywords: ["reservation","booking","table booking","reserve"], topic: "reservations", navLink: "/admin/reservations",
    answers: [
      "Table reservations let your customers book ahead! 🪑\n\n• They pick a date, time, and party size\n• You get notified and can approve or decline\n• Set your available time slots\n• Manage everything from one dashboard\n\nEnable from Explore Features → Table Reservations.",
    ],
    followUps: ["Set time slots","Manage bookings","Enable feature"] },

  // ── Reviews ──
  { keywords: ["review","rating","feedback","star"], topic: "reviews", navLink: "/admin/reviews",
    answers: [
      "Reviews are super important for building trust! ⭐\n\nYour customers can leave ratings and comments on your restaurant profile. You can:\n• View all reviews in one place\n• Track your average rating over time\n• Approve/moderate reviews before they go public\n\nEnable from Explore Features → Reviews.",
    ],
    followUps: ["Manage reviews","Improve ratings","Enable feature"] },

  // ── Analytics ──
  { keywords: ["analytics","report","insight","revenue","sales","chart"], topic: "analytics", navLink: "/admin/analytics",
    answers: [
      "The Analytics page is where you see the big picture! 📊\n\n• **Revenue trends** — daily, weekly, monthly\n• **Top sellers** — know what's hot\n• **Order volume** — track your busiest times\n• **Peak hours** — staff accordingly\n\nSeriously useful for making smart business decisions. Enable from Explore Features if needed!",
    ],
    followUps: ["Revenue report","Top items","Peak hours"] },

  // ── Delivery ──
  { keywords: ["delivery","delivery zone","delivery area","deliver"], topic: "delivery", navLink: "/admin/delivery-zones",
    answers: [
      "Delivery zones let you control where you deliver and at what cost! 🚚\n\n• Draw zones on a map\n• Set different delivery fees per zone\n• Configure minimum order amounts\n• Enable/disable zones as needed\n\nEnable from Explore Features → Delivery Zones.",
    ],
    followUps: ["Set delivery fee","Draw zone","Min order amount"] },

  // ── WhatsApp ──
  { keywords: ["whatsapp","notification","sms","otp","bot"], topic: "whatsapp",
    answers: [
      "WhatsApp integration keeps your customers in the loop! 📱\n\n• Send order status notifications automatically\n• WhatsApp Bot handles common queries\n• OTP verification adds security to orders\n\nSet it up from the sidebar → WhatsApp Bot / OTP Settings.",
    ],
    followUps: ["Setup WhatsApp","OTP settings","Notification config"] },

  // ── Holiday / Hours ──
  { keywords: ["holiday","vacation","closed","break","operating hours","business hours","schedule","open","close time"], topic: "hours", navLink: "/admin/branding",
    answers: [
      "You can control when your restaurant appears open or closed! ⏰\n\n• **Operating Hours**: Set different hours for each day of the week in Branding\n• **Holiday Mode**: Toggle this on to temporarily close your restaurant\n• **Custom message**: Tell customers why you're closed and when you'll be back\n\nYour public menu automatically shows \"Closed\" and blocks ordering when you're off. Pretty smart, right? 😊",
    ],
    followUps: ["Set operating hours","Enable holiday mode","Custom message"] },

  // ── Features ──
  { keywords: ["feature","explore","enable","disable","module","activate"], topic: "features", navLink: "/admin/explore",
    answers: [
      "The Explore Features page is like your feature store! ✨\n\nToggle on/off any module you want:\n• Kitchen Display, Inventory, Coupons\n• Reservations, Reviews, Analytics\n• WhatsApp CRM, API Access\n• And more!\n\nEach one works independently, so just pick what you need. No clutter!",
    ],
    followUps: ["Enable kitchen display","Setup inventory","Enable coupons"] },

  // ── Collaborative ordering ──
  { keywords: ["collaborative","shared cart","group order","split","together"], topic: "collab",
    answers: [
      "Group ordering is awesome for parties! 🎉\n\nHere's how it works:\n1. One person starts an order\n2. They share a link with friends/family\n3. Everyone adds their own items to the same cart\n4. One person places the final order\n\nPerfect for office lunches, family dinners, or group events!",
    ],
    followUps: ["How to share cart?","Place group order","Order management"] },

  // ── Troubleshooting ──
  { keywords: ["not working","error","bug","issue","problem","broken","crash","help me"], topic: "issues",
    answers: [
      "Oh no, sorry to hear that! 😟 Let's try a few things:\n\n1. **Refresh the page** (Ctrl+R or ⌘+R)\n2. **Clear your browser cache** (Ctrl+Shift+Delete)\n3. **Check your internet** — is it stable?\n4. **Try logging out and back in**\n\nIf none of that works, tell me exactly what's happening and I'll dig deeper! 🔍",
      "That's no fun! Let me help you troubleshoot 🔧\n\nFirst, try refreshing the page. If that doesn't work, clear your cache and log back in.\n\nStill stuck? Describe the issue and I'll do my best to figure it out!",
    ],
    followUps: ["Login issues","Slow performance","Something else"] },
  { keywords: ["login","sign in","password","forgot password","access","can't login","locked out"], topic: "login",
    answers: [
      "Login trouble? No worries, it happens! 🔐\n\n• Double-check your email and password\n• Try **Forgot Password** — you'll get a reset link\n• Check your spam/junk folder for the email\n• Staff members need an invitation from the admin first\n\nStill can't get in? Let me know what error you're seeing!",
    ],
    followUps: ["Reset password","Invite staff","Access denied"] },
  { keywords: ["slow","loading","performance","lag","freeze","stuck"], topic: "performance",
    answers: [
      "A slow system is the worst! 😤 Let's speed things up:\n\n1. Check your internet speed (speedtest.net)\n2. Close extra browser tabs — they eat RAM!\n3. Try Ctrl+Shift+R for a hard refresh\n4. Chrome or Edge work best with our system\n5. Clear your cache if it's been a while\n\nUsually one of these does the trick! 🚀",
    ],
    followUps: ["Still slow","Report issue","Browser support"] },
];

// ── Matching Engine ──────────────────────────────────────────────────────────

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

export function findBestMatch(input: string, lastTopic?: string): KBEntry | null {
  const q = input.toLowerCase().trim();
  if (!q) return null;

  // Context follow-ups
  if (lastTopic && /^(how|tell me more|more|what else|explain|details|yes|ok|sure|go on|continue)/.test(q)) {
    const topicMatch = KB.find(e => e.topic === lastTopic && e.followUps?.length);
    if (topicMatch) return topicMatch;
  }

  const words = expandQuery(q.split(/\s+/));
  let best: KBEntry | null = null;
  let bestScore = 0;

  for (const entry of KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) { score += kw.length * 2; continue; }
      for (const w of words) {
        if (fuzzyMatch(w, kw)) { score += kw.length; break; }
      }
    }
    if (lastTopic && entry.topic === lastTopic) score *= 1.3;
    if (score > bestScore) { bestScore = score; best = entry; }
  }

  return bestScore >= 3 ? best : null;
}

// Pick a random answer variant
export function pickAnswer(entry: KBEntry): string {
  const idx = Math.floor(Math.random() * entry.answers.length);
  return entry.answers[idx];
}

// Add a natural conversational intro
export function addIntro(answer: string, isIssue: boolean): string {
  const pool = isIssue ? EMPATHY_INTROS : INTROS;
  const intro = pool[Math.floor(Math.random() * pool.length)];
  return intro + answer;
}

export const FALLBACK_ANSWERS = [
  "Hmm, I'm not sure I follow! 🤔 Could you rephrase that?\n\nOr pick a topic:\n• **Orders** • **Menu** • **Inventory**\n• **Staff** • **Billing** • **QR Codes**",
  "I want to help but I'm not quite getting what you mean 😅\n\nTry asking about:\n• Orders & Kitchen\n• Menu Management\n• Inventory & Stock\n• Staff & Permissions\n• Billing & Plans",
  "Sorry, I didn't catch that! Could you try asking differently? 🤔\n\nI'm great with questions about orders, menu, inventory, staff, and more!",
];

export const QUICK_TOPICS = [
  { label: "Orders", icon: "📋", query: "How to manage orders?" },
  { label: "Menu", icon: "🍽️", query: "Menu management help" },
  { label: "Inventory", icon: "📦", query: "Inventory guide" },
  { label: "Staff", icon: "👥", query: "Staff management" },
  { label: "Billing", icon: "💳", query: "Billing and plans" },
  { label: "More", icon: "✨", query: "What features are available?" },
];
