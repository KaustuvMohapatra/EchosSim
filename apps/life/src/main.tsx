import { createRoot } from "react-dom/client";
import { App } from "./ui/App.js";

const el = document.getElementById("root");
if (!el) throw new Error("#root missing");
createRoot(el).render(<App />);
