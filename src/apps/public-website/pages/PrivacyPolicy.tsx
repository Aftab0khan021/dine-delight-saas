import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPolicy() {
  useSEO({
    title: "Privacy Policy | Dine Delight",
    description: "Learn how Dine Delight collects, uses, and protects your personal information.",
  });

  const LAST_UPDATED = "May 9, 2026";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-4 h-14">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Privacy Policy</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">

          {/* 1. Introduction */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">1. Introduction</h2>
            <p>
              Welcome to <strong>Dine Delight</strong> ("we", "our", "us"). We operate the Dine Delight
              platform — a restaurant management SaaS that powers online ordering, QR-code menus, kitchen
              dashboards, and customer engagement tools for restaurants.
            </p>
            <p>
              This Privacy Policy explains how we collect, use, disclose, and protect your personal
              information when you use our website, mobile web app, and related services (collectively,
              the "Service"). By using the Service, you agree to the practices described in this policy.
            </p>
            <p>
              {/* Placeholder for company name — update when provided */}
              <em>
                Dine Delight is operated by <strong>[Company Name]</strong>. For privacy inquiries,
                contact us at <strong>[contact@email.com]</strong>.
              </em>
            </p>
          </section>

          {/* 2. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">2. Information We Collect</h2>

            <h3 className="font-medium text-base mt-4 mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Phone Number</strong> — Required for placing orders and OTP-based login to your customer dashboard.</li>
              <li><strong>Name</strong> — Optional; used to personalize your order experience.</li>
              <li><strong>Email Address</strong> — Optional; used for account profile purposes.</li>
              <li><strong>Delivery Address</strong> — Provided when you choose delivery; saved optionally for future orders.</li>
              <li><strong>Order Details</strong> — Items ordered, quantities, special instructions, and payment method selected.</li>
              <li><strong>Ratings & Reviews</strong> — Star rating and optional text feedback you provide after completing an order.</li>
            </ul>

            <h3 className="font-medium text-base mt-4 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>IP Address</strong> — Used for rate limiting and security purposes (e.g., preventing abuse).</li>
              <li><strong>Device & Browser Information</strong> — Collected by Cloudflare Turnstile for bot protection and security verification.</li>
              <li><strong>Usage Data</strong> — Pages viewed, features used, and interaction patterns to improve our Service.</li>
            </ul>

            <h3 className="font-medium text-base mt-4 mb-2">2.3 Information We Do NOT Collect</h3>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We do <strong>not</strong> store your credit/debit card numbers, UPI PINs, or bank account details. All payment processing is handled securely by our payment partner, Razorpay.</li>
              <li>We do <strong>not</strong> use tracking cookies or third-party advertising trackers.</li>
              <li>We do <strong>not</strong> access your device contacts, camera, or location unless you explicitly grant permission.</li>
            </ul>
          </section>

          {/* 3. How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Order Processing</strong> — To place, prepare, and deliver your food orders to the correct restaurant kitchen.</li>
              <li><strong>Authentication</strong> — To verify your identity via OTP when accessing your customer dashboard.</li>
              <li><strong>Customer Dashboard</strong> — To display your order history, loyalty points, saved addresses, and profile.</li>
              <li><strong>Order Notifications</strong> — To send status updates about your order (e.g., "Your order is ready for pickup").</li>
              <li><strong>Loyalty Programs</strong> — To track and reward loyalty points based on your orders (if enabled by the restaurant).</li>
              <li><strong>Security</strong> — To detect and prevent fraud, abuse, and unauthorized access through rate limiting and bot protection.</li>
              <li><strong>Service Improvement</strong> — To analyze aggregated, anonymized usage patterns and improve the platform.</li>
            </ul>
          </section>

          {/* 4. Third-Party Services */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">4. Third-Party Services</h2>
            <p>We use the following trusted third-party services to operate our platform:</p>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left px-3 py-2 border-b font-medium">Service</th>
                    <th className="text-left px-3 py-2 border-b font-medium">Purpose</th>
                    <th className="text-left px-3 py-2 border-b font-medium">Data Shared</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Supabase</td>
                    <td className="px-3 py-2">Database hosting & authentication</td>
                    <td className="px-3 py-2">Account data, order records</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Cloudflare</td>
                    <td className="px-3 py-2">Security verification (Turnstile)</td>
                    <td className="px-3 py-2">IP address, browser fingerprint</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">Razorpay</td>
                    <td className="px-3 py-2">Payment processing</td>
                    <td className="px-3 py-2">Payment details (handled by Razorpay directly)</td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-3 py-2 font-medium">WhatsApp Business API</td>
                    <td className="px-3 py-2">Order notifications & OTP delivery</td>
                    <td className="px-3 py-2">Phone number, order status messages</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium">Vercel</td>
                    <td className="px-3 py-2">Web hosting & content delivery</td>
                    <td className="px-3 py-2">Standard web request data</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Each of these services has their own privacy policies. We encourage you to review them.
            </p>
          </section>

          {/* 5. Data Storage & Security */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">5. Data Storage & Security</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your data is stored securely on <strong>Supabase</strong> (PostgreSQL) with row-level security policies that restrict data access.</li>
              <li>All data is transmitted using <strong>HTTPS/TLS encryption</strong>.</li>
              <li>Payment signature verification uses <strong>HMAC-SHA256</strong> cryptographic verification.</li>
              <li>Sensitive endpoints are protected by <strong>rate limiting</strong> and <strong>Cloudflare Turnstile</strong> bot protection.</li>
              <li>Restaurant admin accounts use <strong>secure authentication</strong> with password hashing and session management.</li>
              <li>Customer sessions use <strong>OTP-based authentication</strong> — no passwords are stored for customers.</li>
            </ul>
          </section>

          {/* 6. Cookies & Local Storage */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">6. Cookies & Local Storage</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>No tracking cookies</strong> — We do not use advertising or analytics cookies.</li>
              <li><strong>Essential cookies</strong> — Supabase authentication uses secure, HTTP-only cookies for session management.</li>
              <li><strong>Local Storage</strong> — We store your customer session (phone number and expiry) in your browser's local storage for convenience. This data never leaves your device unless you interact with the Service.</li>
              <li><strong>Service Worker</strong> — Our Progressive Web App (PWA) caches static assets for faster loading and offline menu access. No personal data is cached.</li>
            </ul>
          </section>

          {/* 7. Data Sharing */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">7. Data Sharing</h2>
            <p><strong>We never sell your personal data to third parties.</strong></p>
            <p>We share your data only in these limited circumstances:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>With the Restaurant</strong> — Your order details (name, phone, items, delivery address) are shared with the restaurant you order from so they can fulfill your order.</li>
              <li><strong>With Payment Processors</strong> — Payment information is shared directly with Razorpay for transaction processing. We do not store or have access to your payment credentials.</li>
              <li><strong>With Communication Providers</strong> — Your phone number is shared with WhatsApp Business API for order notifications and OTP delivery.</li>
              <li><strong>Legal Requirements</strong> — We may disclose your information if required by law, regulation, or legal process.</li>
            </ul>
          </section>

          {/* 8. Your Rights */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">8. Your Rights</h2>
            <p>
              Under applicable data protection laws (including the Indian Digital Personal Data Protection
              Act, 2023 and GDPR for users in the European Economic Area), you have the following rights:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Right to Access</strong> — You can view your personal data, order history, and profile through your Customer Dashboard.</li>
              <li><strong>Right to Correction</strong> — You can update your name, email, and saved addresses in your Customer Dashboard at any time.</li>
              <li><strong>Right to Withdraw Consent</strong> — You can opt-out of marketing communications by contacting us or the restaurant directly.</li>
              <li><strong>Right to Grievance Redressal</strong> — If you have concerns about how your data is handled, you may contact our Grievance Officer at the email provided below.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us at <strong>[contact@email.com]</strong>.
            </p>
          </section>

          {/* 9. Age Requirement */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">9. Age Requirement</h2>
            <p>
              Our Service is intended for users who are at least <strong>13 years of age</strong>. We do
              not knowingly collect personal information from children under 13. If we learn that we have
              collected data from a child under 13, we will take steps to delete it promptly.
            </p>
            <p>
              If you are between 13 and 18 years of age, you should use the Service only with the
              involvement and consent of a parent or guardian.
            </p>
          </section>

          {/* 10. Data Retention */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">10. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong>Order Data</strong> — Retained as long as the restaurant's account is active, as it is needed for business records, analytics, and legal compliance.</li>
              <li><strong>Customer Profiles</strong> — Retained until you request deletion or the associated restaurant account is closed.</li>
              <li><strong>Security Logs</strong> — IP-based rate limiting logs are retained for up to 90 days.</li>
              <li><strong>Local Storage</strong> — Customer sessions in your browser expire automatically based on the configured session duration.</li>
            </ul>
          </section>

          {/* 11. Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we make changes, we will update
              the "Last updated" date at the top of this page. We encourage you to review this policy
              periodically.
            </p>
            <p>
              For significant changes that affect how we handle your personal data, we will make
              reasonable efforts to provide notice through the Service.
            </p>
          </section>

          {/* 12. Contact Us */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">12. Contact Us</h2>
            <p>If you have any questions, concerns, or requests regarding this Privacy Policy, please contact us:</p>
            <div className="bg-muted/50 rounded-lg p-4 mt-3 space-y-1.5 text-sm">
              <p><strong>Company:</strong> [Company Name]</p>
              <p><strong>Email:</strong> [contact@email.com]</p>
              <p><strong>Grievance Officer:</strong> [Name / Designation]</p>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              We will respond to your inquiry within 30 days.
            </p>
          </section>

        </div>

        {/* Back to Home */}
        <div className="mt-12 pt-8 border-t text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </main>
    </div>
  );
}
