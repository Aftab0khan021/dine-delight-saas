import { CartItem } from "../hooks/useRestaurantCart";
import { CollabPresence } from "../hooks/useCollaborativeCart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/formatting";
import { User, Users, Split, Hand } from "lucide-react";

type SplitBillProps = {
  items: CartItem[];
  participants: CollabPresence[];
  deviceToken: string;
  currencyCode: string;
  onClaim: (cart_id: string) => void;
  onUnclaim: (cart_id: string) => void;
  onSplitEvenly: () => void;
  getMyBill: () => { items: CartItem[]; totalCents: number };
  getBillByParticipant: () => {
    bills: Record<string, { items: CartItem[]; totalCents: number; name?: string }>;
    unclaimed: CartItem[];
  };
};

function participantLabel(token: string, participants: CollabPresence[], deviceToken: string) {
  if (token === deviceToken) return "You";
  const p = participants.find(pp => pp.token === token);
  return p?.name || `Guest ${token.slice(0, 4)}`;
}

export function SplitBillView({
  items, participants, deviceToken, currencyCode,
  onClaim, onUnclaim, onSplitEvenly, getMyBill, getBillByParticipant,
}: SplitBillProps) {
  const myBill = getMyBill();
  const { bills, unclaimed } = getBillByParticipant();
  const totalCents = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);

  return (
    <Tabs defaultValue="split" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="full"><Users className="h-3 w-3 mr-1" /> Full</TabsTrigger>
        <TabsTrigger value="split"><Split className="h-3 w-3 mr-1" /> Split</TabsTrigger>
        <TabsTrigger value="mine"><User className="h-3 w-3 mr-1" /> My Bill</TabsTrigger>
      </TabsList>

      {/* Full Bill */}
      <TabsContent value="full" className="space-y-2 mt-3">
        {items.map(item => (
          <div key={item.cart_id} className="flex items-center justify-between text-sm border-b pb-2">
            <div className="flex items-center gap-2">
              <span className="font-medium bg-muted rounded px-1.5 py-0.5 text-xs">{item.quantity}x</span>
              <span>{item.name}</span>
              {item.claimedBy && (
                <Badge variant="outline" className="text-[10px] px-1.5">
                  {participantLabel(item.claimedBy, participants, deviceToken)}
                </Badge>
              )}
            </div>
            <span className="text-muted-foreground">{formatMoney(item.price_cents * item.quantity, currencyCode)}</span>
          </div>
        ))}
        <div className="flex justify-between font-bold pt-2">
          <span>Total</span>
          <span>{formatMoney(totalCents, currencyCode)}</span>
        </div>
      </TabsContent>

      {/* Split View */}
      <TabsContent value="split" className="space-y-4 mt-3">
        {/* Action bar */}
        {unclaimed.length > 0 && (
          <Button variant="outline" size="sm" className="w-full" onClick={onSplitEvenly}>
            <Split className="h-3 w-3 mr-2" /> Split {unclaimed.length} unclaimed item(s) evenly
          </Button>
        )}

        {/* Per-participant sections */}
        {Object.entries(bills).map(([token, bill]) => (
          <div key={token} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${token === deviceToken ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {participantLabel(token, participants, deviceToken).charAt(0).toUpperCase()}
                </div>
                {participantLabel(token, participants, deviceToken)}
              </h4>
              <span className="font-bold text-sm">{formatMoney(bill.totalCents, currencyCode)}</span>
            </div>
            {bill.items.map(item => (
              <div key={item.cart_id} className="flex items-center justify-between text-xs pl-8">
                <span>{item.quantity}x {item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatMoney(item.price_cents * item.quantity, currencyCode)}</span>
                  {token === deviceToken && (
                    <Button variant="ghost" size="sm" className="h-5 px-1 text-[10px]" onClick={() => onUnclaim(item.cart_id)}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Unclaimed items */}
        {unclaimed.length > 0 && (
          <div className="border border-dashed rounded-lg p-3 space-y-2 opacity-80">
            <h4 className="font-semibold text-sm text-muted-foreground">Unclaimed Items</h4>
            {unclaimed.map(item => (
              <div key={item.cart_id} className="flex items-center justify-between text-xs">
                <span>{item.quantity}x {item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatMoney(item.price_cents * item.quantity, currencyCode)}</span>
                  <Button variant="secondary" size="sm" className="h-5 px-2 text-[10px]" onClick={() => onClaim(item.cart_id)}>
                    <Hand className="h-2.5 w-2.5 mr-1" /> Claim
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-6">Add items to the cart to start splitting the bill.</p>
        )}
      </TabsContent>

      {/* My Bill */}
      <TabsContent value="mine" className="space-y-2 mt-3">
        {myBill.items.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            You haven't claimed any items yet. Go to the <strong>Split</strong> tab to claim your items.
          </p>
        ) : (
          <>
            {myBill.items.map(item => (
              <div key={item.cart_id} className="flex items-center justify-between text-sm border-b pb-2">
                <span>{item.quantity}x {item.name}</span>
                <span>{formatMoney(item.price_cents * item.quantity, currencyCode)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 text-primary">
              <span>Your Total</span>
              <span>{formatMoney(myBill.totalCents, currencyCode)}</span>
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
