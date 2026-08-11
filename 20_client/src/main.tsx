import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { CurrencyProvider } from "./context/CurrencyContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <CurrencyProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
