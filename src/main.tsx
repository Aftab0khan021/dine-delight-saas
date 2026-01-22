import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Initialize Sentry for error tracking
import { initSentry } from "./lib/sentry";
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
