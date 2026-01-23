import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import "./index.css";

// Initialize Sentry for error tracking
import { initSentry } from "./lib/sentry";
initSentry();

// Initialize PostHog for analytics
import { initAnalytics } from "./lib/analytics";
initAnalytics();

createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
        <App />
    </ErrorBoundary>
);
