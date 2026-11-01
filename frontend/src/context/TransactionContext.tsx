import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { ContractTransactionReceipt, ContractTransactionResponse, JsonRpcSigner } from "ethers";
import { describeError } from "../utils/errors";
import { shortAddress } from "../utils/format";
import { useChain } from "./ChainContext";
import { useWallet } from "./WalletContext";

export type TxPhase = "wallet" | "pending" | "confirmed" | "failed";

export interface TrackedTx {
  id: number;
  label: string;
  phase: TxPhase;
  hash: string | null;
  blockNumber: number | null;
  error: string | null;
}

interface TransactionContextValue {
  transactions: TrackedTx[];
  dismiss: (id: number) => void;
  /** True while any transaction is waiting for the wallet or for confirmation. */
  busy: boolean;
  /**
   * Signs and sends a transaction, tracking it through wallet -> pending -> confirmed or failed.
   * Resolves to the receipt only after the transaction is mined successfully, otherwise null.
   */
  send: (label: string, action: (signer: JsonRpcSigner) => Promise<ContractTransactionResponse>) => Promise<ContractTransactionReceipt | null>;
}

const TransactionContext = createContext<TransactionContextValue | null>(null);

export function TransactionProvider({ children }: { children: ReactNode }) {
  const { address, connect, onExpectedNetwork, switchNetwork, getSigner, installed } = useWallet();
  const { refresh } = useChain();
  const [transactions, setTransactions] = useState<TrackedTx[]>([]);
  const nextId = useRef(1);

  const update = useCallback((id: number, patch: Partial<TrackedTx>) => {
    setTransactions((list) => list.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx)));
  }, []);

  const dismiss = useCallback((id: number) => {
    setTransactions((list) => list.filter((tx) => tx.id !== id));
  }, []);

  const send = useCallback<TransactionContextValue["send"]>(
    async (label, action) => {
      const id = nextId.current++;
      setTransactions((list) => [...list, { id, label, phase: "wallet", hash: null, blockNumber: null, error: null }]);
      const fail = (error: string) => {
        update(id, { phase: "failed", error });
        return null;
      };

      if (!installed) return fail("MetaMask was not detected. Install it to send transactions.");
      const account = address ?? (await connect());
      if (!account) return fail("Connect a wallet to send this transaction.");
      if (!onExpectedNetwork && !(await switchNetwork())) return fail("Switch MetaMask to the local Hardhat network, then try again.");

      let signer: JsonRpcSigner;
      try {
        signer = await getSigner(account);
      } catch (error) {
        console.error("[FundFlow] could not get a signer from the wallet", error);
        return fail(`Your wallet did not give FundFlow access to ${shortAddress(account)}. In MetaMask, select that account and connect it to this site, then try again.`);
      }

      try {
        const response = await action(signer);
        update(id, { phase: "pending", hash: response.hash });
        const receipt = await response.wait();
        if (!receipt || receipt.status !== 1) return fail("The transaction was mined but reverted.");
        update(id, { phase: "confirmed", blockNumber: receipt.blockNumber });
        refresh();
        return receipt as ContractTransactionReceipt;
      } catch (error) {
        return fail(describeError(error));
      }
    },
    [address, connect, getSigner, installed, onExpectedNetwork, refresh, switchNetwork, update],
  );

  const busy = transactions.some((tx) => tx.phase === "wallet" || tx.phase === "pending");
  const value = useMemo(() => ({ transactions, dismiss, send, busy }), [transactions, dismiss, send, busy]);
  return <TransactionContext.Provider value={value}>{children}</TransactionContext.Provider>;
}

export function useTransactions() {
  const value = useContext(TransactionContext);
  if (!value) throw new Error("useTransactions must be used inside TransactionProvider");
  return value;
}
