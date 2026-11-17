import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";
import App from "./App";
import "./styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("The Lunaris root element is missing.");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </React.StrictMode>,
);
