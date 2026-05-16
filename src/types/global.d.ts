/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Razorpay ────────────────────────────────────────────────────────────────
// Global type declaration for the Razorpay checkout SDK loaded via <script>.

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id?: string;
  image?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler?: (response: RazorpayResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: string, callback: (...args: any[]) => void): void;
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): RazorpayInstance;
}

// ─── AudioContext ────────────────────────────────────────────────────────────
// Safari uses webkitAudioContext

interface Window {
  Razorpay?: RazorpayConstructor;
  webkitAudioContext?: typeof AudioContext;
}
