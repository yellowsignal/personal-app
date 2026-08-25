import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { VaultProvider } from "./context/VaultContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import { registerPushWorker } from "./api/push";
import "./index.css";

if ("serviceWorker" in navigator) {
  void registerPushWorker();
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <CurrencyProvider>
          <AuthProvider>
            <VaultProvider>
              <App />
            </VaultProvider>
          </AuthProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
