import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { ArrowLeft, FileText } from "lucide-react";

export default function TermsOfService() {
  useSEO({
    title: "Terms of Service | Dine Delight",
    description: "Terms and conditions for using the Dine Delight platform.",
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
            <FileText className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Terms of Service</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-10 sm:py-16">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Last updated: {LAST_UPDATED}
          </p>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-8 text-[15px] leading-relaxed">

          {/* 1. Acceptance */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Dine Delight platform ("Service"), you agree to be bound by these
              Terms of Service ("Terms"). If you do not agree to these Terms, please do not use the Service.
            </p>
            <p>
              These Terms apply to all visitors, customers placing orders, restaurant owners using our
              admin panel, and staff members accessing the platform.
            </p>
          </section>

          {/* 2. Description of Service */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">2. Description of Service</h2>
            <p>
              Dine Delight is a restaurant management platform that provides:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Online menu management and QR-code based ordering</li>
              <li>Real-time order tracking and kitchen display systems</li>
              <li>Payment processing integration (via Razorpay)</li>
              <li>Customer engagement tools (loyalty programs, coupons, WhatsApp notifications)</li>
              <li>Analytics and business insights for restaurant owners</li>
              <li>Staff management with role-based access control</li>
            </ul>
          </section>

          {/* 3. User Accounts */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">3. User Accounts</h2>
            <h3 className="font-medium text-base mt-4 mb-2">3.1 Restaurant Accounts</h3>
            <p>
              Restaurant owners must register with a valid email address. You are responsible for
              maintaining the confidentiality of your account credentials and for all activities
              under your account.
            </p>

            <h3 className="font-medium text-base mt-4 mb-2">3.2 Customer Accounts</h3>
            <p>
              Customers access their dashboard via OTP-based phone verification. By providing your
              phone number, you consent to receiving order-related SMS/WhatsApp messages.
            </p>

            <h3 className="font-medium text-base mt-4 mb-2">3.3 Age Requirement</h3>
            <p>
              You must be at least <strong>13 years of age</strong> to use the Service. Users between
              13 and 18 must have parental or guardian consent.
            </p>
          </section>

          {/* 4. Orders & Payments */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">4. Orders & Payments</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Orders placed through the platform are between <strong>you and the restaurant</strong>. Dine Delight acts as a technology facilitator, not a party to the transaction.</li>
              <li>Menu prices, taxes, and charges are set by each restaurant independently.</li>
              <li>Online payments are processed securely by <strong>Razorpay</strong>. Dine Delight does not store your payment credentials.</li>
              <li>For refunds and order disputes, please contact the restaurant directly. Dine Delight is not responsible for food quality, delivery timing, or order accuracy.</li>
              <li>Restaurants may accept or reject orders at their discretion based on availability and operational capacity.</li>
            </ul>
          </section>

          {/* 5. Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">5. Acceptable Use</h2>
            <p>You agree NOT to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Submit false orders, fake reviews, or spam content</li>
              <li>Attempt to gain unauthorized access to other users' accounts or restaurant data</li>
              <li>Interfere with, disrupt, or overload the Service (including DDoS attacks or automated scraping)</li>
              <li>Reverse-engineer, decompile, or attempt to extract the source code of the platform</li>
              <li>Use automated bots or scripts to interact with the Service without permission</li>
            </ul>
            <p className="mt-3">
              Violation of these terms may result in immediate account suspension or termination.
            </p>
          </section>

          {/* 6. Intellectual Property */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">6. Intellectual Property</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>The Dine Delight platform, including its design, code, features, and branding, is owned by <strong>[Company Name]</strong> and protected by intellectual property laws.</li>
              <li>Restaurants retain ownership of their menu content, images, and branding uploaded to the platform.</li>
              <li>By uploading content, restaurants grant Dine Delight a non-exclusive license to display and distribute that content as part of the Service.</li>
            </ul>
          </section>

          {/* 7. Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">7. Limitation of Liability</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Dine Delight is provided <strong>"as is"</strong> without warranties of any kind, either express or implied.</li>
              <li>We are not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</li>
              <li>We are not responsible for the quality, safety, or legality of food prepared by restaurants using our platform.</li>
              <li>We do not guarantee uninterrupted or error-free operation of the Service.</li>
              <li>Our total liability to you shall not exceed the amount you paid to Dine Delight (if any) in the 12 months preceding the claim.</li>
            </ul>
          </section>

          {/* 8. Privacy */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">8. Privacy</h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <Link to="/privacy" className="text-primary hover:underline font-medium">
                Privacy Policy
              </Link>
              , which describes how we collect, use, and protect your personal information.
            </p>
          </section>

          {/* 9. Termination */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">9. Termination</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>We may suspend or terminate your access to the Service at any time for violation of these Terms, abuse, or any other reason at our sole discretion.</li>
              <li>Restaurant owners may delete their account and data by contacting our support team.</li>
              <li>Upon termination, your right to use the Service ceases immediately.</li>
            </ul>
          </section>

          {/* 10. Governing Law */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">10. Governing Law & Disputes</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of <strong>India</strong>.
              Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the
              courts in <strong>[City, State]</strong>.
            </p>
          </section>

          {/* 11. Changes to Terms */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">11. Changes to These Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be effective immediately
              upon posting. Your continued use of the Service after changes constitutes acceptance of the
              updated Terms.
            </p>
          </section>

          {/* 12. Contact */}
          <section>
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">12. Contact Us</h2>
            <p>For questions about these Terms, please contact us:</p>
            <div className="bg-muted/50 rounded-lg p-4 mt-3 space-y-1.5 text-sm">
              <p><strong>Company:</strong> [Company Name]</p>
              <p><strong>Email:</strong> [contact@email.com]</p>
            </div>
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
