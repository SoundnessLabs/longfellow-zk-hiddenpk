import React from "react";
import ReactDOM from "react-dom/client";
import { WalletInterface } from "./components/WalletInterface";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletInterface />
  </React.StrictMode>,
);
