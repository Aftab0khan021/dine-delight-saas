import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Home() {
  const navigate = useNavigate();

  // Detect if user just accepted invitation (needs to set password)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      // Only redirect if user has a session AND there's an access_token in the URL
      // (meaning they just clicked the invitation link)
      const urlParams = new URLSearchParams(window.location.search);
      const hasAccessToken = urlParams.has('access_token') || urlParams.has('token_hash');

      if (session?.user && hasAccessToken) {
        // User just clicked invitation link, redirect to password setup
        navigate('/auth/set-password');
      }
    };

    checkSession();
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Restaurant SaaS</h1>
          <nav className="space-x-4">
            <Link to="/admin/auth">
              <Button variant="outline">Restaurant Login</Button>
            </Link>
            <Link to="/super-admin/auth">
              <Button variant="ghost">Super-Admin</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 text-center">
          <h2 className="text-5xl font-bold mb-6">
            Manage Your Restaurant Business
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Complete restaurant management platform with menu management, order tracking, and analytics
          </p>
          <div className="space-x-4">
            <Link to="/admin/auth">
              <Button size="lg">Get Started</Button>
            </Link>
            <Button size="lg" variant="outline">Learn More</Button>
          </div>
        </section>

        <section className="bg-muted py-20">
          <div className="container mx-auto px-4">
            <h3 className="text-3xl font-bold text-center mb-12">Features</h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-background p-6 rounded-lg">
                <h4 className="text-xl font-semibold mb-3">Menu Management</h4>
                <p className="text-muted-foreground">
                  Easily create and update your menu items with photos and pricing
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg">
                <h4 className="text-xl font-semibold mb-3">Order Tracking</h4>
                <p className="text-muted-foreground">
                  Real-time order management and kitchen display system
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg">
                <h4 className="text-xl font-semibold mb-3">Analytics</h4>
                <p className="text-muted-foreground">
                  Comprehensive insights into your restaurant performance
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 Restaurant SaaS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
