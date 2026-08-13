import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main>
      <p className="eyebrow">SHIGUANG LAB</p>
      <h1>Asset first. AI everywhere.</h1>
      <p>Monorepo 基础骨架已就绪，产品页面将在这里开始生长。</p>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
