import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ChainProvider } from "./context/ChainContext";
import { DataProvider } from "./context/DataContext";
import { WalletProvider } from "./context/WalletContext";
import { TransactionProvider } from "./context/TransactionContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ChainProvider>
        <DataProvider>
          <WalletProvider>
            <TransactionProvider>
              <App />
            </TransactionProvider>
          </WalletProvider>
        </DataProvider>
      </ChainProvider>
    </BrowserRouter>
  </StrictMode>,
);
