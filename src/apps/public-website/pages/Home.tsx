import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">Restaurant SaaS</h1>
          <nav className="flex flex-wrap gap-2">
            <Link to="/admin/auth">
              <Button variant="outline" size="sm">Restaurant Login</Button>
            </Link>
            <Link to="/superadmin/auth">
              <Button variant="ghost" size="sm">Super-Admin</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 py-12 sm:py-20 text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 sm:mb-6 leading-tight">
            Manage Your Restaurant Business
          </h2>
          <p className="text-base sm:text-xl text-muted-foreground mb-6 sm:mb-8 max-w-2xl mx-auto">
            Complete restaurant management platform with menu management, order tracking, and analytics
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/admin/auth">
              <Button size="lg" className="w-full sm:w-auto">Get Started</Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>Learn More</Button>
          </div>
        </section>

        <section id="features" className="bg-muted py-12 sm:py-20">
          <div className="container mx-auto px-4">
            <h3 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">Features</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8">
              <div className="bg-background p-6 rounded-lg shadow-sm">
                <h4 className="text-lg sm:text-xl font-semibold mb-3">Menu Management</h4>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Easily create and update your menu items with photos and pricing
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg shadow-sm">
                <h4 className="text-lg sm:text-xl font-semibold mb-3">Order Tracking</h4>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Real-time order management and kitchen display system
                </p>
              </div>
              <div className="bg-background p-6 rounded-lg shadow-sm sm:col-span-2 md:col-span-1">
                <h4 className="text-lg sm:text-xl font-semibold mb-3">Analytics</h4>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Comprehensive insights into your restaurant performance
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 sm:py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>&copy; {new Date().getFullYear()} Dine Delight. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
