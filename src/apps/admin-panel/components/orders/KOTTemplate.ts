
/** Escapes HTML special characters to prevent XSS in printed KOT output */
function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function generateKOTHtml(order: any, restaurantName: string = "Restaurant") {
  // Use local time (not UTC) for placed_at
  const placedAt = order.placed_at
    ? new Date(order.placed_at).toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      })
    : "—";

  const printedAt = new Date().toLocaleTimeString(undefined, {
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });

  const orderTypeLabel =
    order.order_type === "delivery" ? "DELIVERY"
    : order.order_type === "pickup" ? "PICKUP"
    : order.table_label ? `DINE-IN · Table ${order.table_label}`
    : "DINE-IN";

  const itemsHtml = (order.item_details ?? []).map((item: any) => `
    <div class="item">
      <span class="qty">${escHtml(String(item.quantity))}</span>
      <span class="name">
        ${escHtml(item.name_snapshot)}
        ${item.variant_name ? `<br><small>↳ ${escHtml(item.variant_name)}</small>` : ""}
        ${item.addons?.length ? `<br><small>+ ${(item.addons as any[]).map((a) => escHtml(a.name)).join(", ")}</small>` : ""}
        ${item.notes ? `<br><em class="note">📝 ${escHtml(item.notes)}</em>` : ""}
      </span>
    </div>
    <div class="divider">- - - - - - - - - - - - - - - - - - - - -</div>
  `).join("") || "<div style='text-align:center'>No items</div>";

  const tokenLabel = order.dailyToken ? `Token #${order.dailyToken}` : `#${(order.id?.slice(0, 4) ?? '')}`;
  return `<!DOCTYPE html>
<html>
<head>
  <title>KOT ${escHtml(tokenLabel)}</title>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: monospace;
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 8px 10px;
      font-size: 13px;
      color: #000;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #555;
      margin-bottom: 6px;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #000;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    .title { font-size: 15px; font-weight: bold; letter-spacing: 1px; margin-bottom: 6px; }
    .token-number { font-size: 22px; font-weight: bold; margin: 6px 0; letter-spacing: 2px; }
    .meta { font-size: 12px; line-height: 1.7; }
    .order-type {
      display: inline-block;
      font-weight: bold;
      font-size: 13px;
      margin-top: 4px;
      border: 2px solid #000;
      padding: 1px 8px;
      letter-spacing: 1px;
    }
    .delivery-addr { font-size: 10px; margin-top: 4px; color: #444; }
    .items { margin: 10px 0; }
    .item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 6px;
    }
    .qty {
      font-weight: bold;
      font-size: 15px;
      min-width: 22px;
      text-align: right;
    }
    .name { flex: 1; font-size: 13px; line-height: 1.5; }
    .name small { color: #555; font-size: 11px; }
    .name em.note { color: #333; font-size: 11px; font-style: normal; }
    .divider { font-size: 10px; color: #bbb; margin: 4px 0; }
    .footer {
      border-top: 2px dashed #000;
      padding-top: 8px;
      text-align: center;
      font-size: 10px;
      color: #555;
    }
    @media print {
      body { width: 80mm; padding: 4px; }
      .divider { color: #aaa; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <span>${escHtml(placedAt)}</span>
    <span>${escHtml(tokenLabel)}</span>
  </div>

  <div class="header">
    <div class="title">KITCHEN ORDER TICKET</div>
    <div class="token-number">${escHtml(tokenLabel)}</div>
    <div class="meta">
      <strong>${escHtml(restaurantName)}</strong><br>
      ${escHtml(placedAt)}<br>
      <span class="order-type">${escHtml(orderTypeLabel)}</span>
      ${order.order_type === "delivery" && order.delivery_address
        ? `<div class="delivery-addr">📍 ${escHtml(order.delivery_address)}</div>`
        : ""}
    </div>
  </div>

  <div class="items">
    ${itemsHtml}
  </div>

  <div class="footer">
    printed at ${escHtml(printedAt)}
  </div>

  <script>
    window.onload = function() { window.print(); window.close(); }
  </script>
</body>
</html>`;
}
