import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DashboardApp } from "./DashboardApp";
import "./styles.css";

const root = document.getElementById("dashboard-root");

if (!root) {
  throw new Error("Missing #dashboard-root element.");
}

createRoot(root).render(
  <StrictMode>
    <DashboardApp />
  </StrictMode>
);
