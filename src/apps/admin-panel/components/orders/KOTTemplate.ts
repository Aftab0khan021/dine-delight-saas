
import { format } from "date-fns";

export function generateKOTHtml(order: any, restaurantName: string = "Restaurant") {
    const itemsHtml = order.item_details?.map((item: any) => `
    <div class="item">
      <span class="qty">${item.quantity}</span>
      <span class="name">
        ${item.name_snapshot}
        ${item.variant_name ? `<br><small>(${item.variant_name})</small>` : ''}
        ${item.addons?.length ? `<br><small>+ ${item.addons.map((a: any) => a.name).join(', ')}</small>` : ''}
      </span>
    </div>
    ${item.notes ? `<div class="notes">Note: ${item.notes}</div>` : ''}
  `).join("") || "<div>No items</div>";

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>KOT #${order.id.slice(0, 4)}</title>
      <style>
        body { font-family: monospace; width: 80mm; margin: 0; padding: 10px; box-sizing: border-box; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
        .title { font-size: 1.2em; font-weight: bold; }
        .meta { font-size: 0.9em; margin-top: 5px; }
        .items { margin-bottom: 20px; }
        .item { display: flex; margin-bottom: 10px; align-items: flex-start; }
        .qty { font-weight: bold; width: 30px; font-size: 1.1em; }
        .name { flex: 1; }
        .notes { font-size: 0.8em; font-style: italic; margin-left: 30px; margin-bottom: 5px; }
        .footer { text-align: center; border-top: 1px dashed #000; padding-top: 10px; font-size: 0.8em; }
        small { color: #555; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">KITCHEN ORDER TICKET</div>
        <div class="meta">
          ${restaurantName}<br>
          Order #${order.id.slice(0, 4)}<br>
          ${format(new Date(order.placed_at), "MMM d, h:mm a")}<br>
          <strong>${order.table_label ? `Table: ${order.table_label}` : "TAKEAWAY"}</strong>
        </div>
      </div>
      
      <div class="items">
        ${itemsHtml}
      </div>

      <div class="footer">
        printed at ${format(new Date(), "h:mm:ss a")}
      </div>
      
      <script>
        window.onload = function() { window.print(); window.close(); }
      </script>
    </body>
    </html>
  `;
}
