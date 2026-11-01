import { useEffect } from "react";
import { CheckCircle2, Loader2, Wallet, X, XCircle } from "lucide-react";
import { useTransactions, type TrackedTx } from "../context/TransactionContext";
import { shortHash } from "../utils/format";
import { CopyButton } from "./Address";

const PHASE_TEXT: Record<TrackedTx["phase"], string> = {
  wallet: "Waiting for you to confirm in your wallet",
  pending: "Submitted, waiting to be mined",
  confirmed: "Confirmed on-chain",
  failed: "Not completed",
};

function TransactionToast({ tx }: { tx: TrackedTx }) {
  const { dismiss } = useTransactions();

  useEffect(() => {
    if (tx.phase !== "confirmed" && tx.phase !== "failed") return;
    // Failures stay up longer so there is time to read why.
    const timer = setTimeout(() => dismiss(tx.id), tx.phase === "failed" ? 30_000 : 10_000);
    return () => clearTimeout(timer);
  }, [tx.phase, tx.id, dismiss]);

  const Icon = tx.phase === "confirmed" ? CheckCircle2 : tx.phase === "failed" ? XCircle : tx.phase === "wallet" ? Wallet : Loader2;
  const color = tx.phase === "confirmed" ? "text-accent" : tx.phase === "failed" ? "text-danger" : "text-info";

  return (
    <div className="card toast-in p-3.5 flex gap-3 bg-raised">
      <Icon className={`size-5 shrink-0 mt-0.5 ${color} ${tx.phase === "pending" ? "animate-spin" : ""}`} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">{tx.label}</div>
        <div className="text-text-2 text-[13px] mt-0.5">{tx.error ?? PHASE_TEXT[tx.phase]}</div>
        {tx.hash && (
          <div className="mt-1 flex items-center gap-1 text-text-3 text-xs">
            <span className="font-mono" title={tx.hash}>{shortHash(tx.hash)}</span>
            <CopyButton value={tx.hash} label="Copy transaction hash" />
            {tx.blockNumber !== null && <span>· block {tx.blockNumber}</span>}
          </div>
        )}
      </div>
      {(tx.phase === "confirmed" || tx.phase === "failed") && (
        <button type="button" onClick={() => dismiss(tx.id)} aria-label="Dismiss" className="self-start p-0.5 text-text-3 hover:text-text">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Live status of the transactions sent from this tab. "Confirmed" only ever follows a mined receipt. */
export function TransactionStatus() {
  const { transactions } = useTransactions();
  return (
    <div aria-live="polite" className="fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] space-y-2.5 pointer-events-none [&>*]:pointer-events-auto">
      {transactions.map((tx) => (
        <TransactionToast key={tx.id} tx={tx} />
      ))}
    </div>
  );
}
