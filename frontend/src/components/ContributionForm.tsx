import { useState, type FormEvent } from "react";
import { Coins } from "lucide-react";
import { useTransactions } from "../context/TransactionContext";
import { useWallet } from "../context/WalletContext";
import { contribute } from "../services/transactions";
import { formatEth, parseEthInput } from "../utils/format";
import type { Campaign } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "./ui";
import { ConnectWalletAction } from "./WalletConnectButton";

export function ContributionForm({ campaign }: { campaign: Campaign }) {
  const { address, balance } = useWallet();
  const { send, busy } = useTransactions();
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);

  const wei = parseEthInput(amount);
  let problem: string | null = null;
  if (amount.trim() === "" || wei === null) problem = "Enter an amount in ETH, for example 0.5.";
  else if (wei === 0n) problem = "The amount must be greater than zero.";
  else if (balance !== null && wei > balance) problem = `This wallet only has ${formatEth(balance)} test ETH.`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!problem) setConfirming(true);
  };

  const showProblem = touched && problem;

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="contribution-amount" className="text-sm font-medium">Contribute test ETH</label>
      <div className="relative mt-2">
        <input
          id="contribution-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-invalid={!!showProblem}
          aria-describedby={showProblem ? "contribution-error" : undefined}
          className="field pr-14 num"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3">ETH</span>
      </div>
      {showProblem && <p id="contribution-error" className="mt-1.5 text-[13px] text-danger">{problem}</p>}
      {address ? (
        <Button type="submit" className="w-full mt-3" disabled={busy}>
          <Coins className="size-4" /> Contribute
        </Button>
      ) : (
        <div className="mt-3">
          <ConnectWalletAction label="Connect wallet to contribute" className="w-full" />
        </div>
      )}
      <p className="mt-2.5 text-xs text-text-3">
        Funds stay locked in the campaign contract and are released only through approved milestones. Refunds apply if the campaign fails or is cancelled, excluding anything already released.
      </p>

      <ConfirmDialog
        open={confirming}
        title="Confirm contribution"
        confirmLabel="Send contribution"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          if (wei === null) return;
          const receipt = await send(`Contribute ${formatEth(wei)} ETH`, (signer) => contribute(signer, campaign.address, wei));
          if (receipt) {
            setAmount("");
            setTouched(false);
          }
        }}
      >
        <p>You are sending <strong className="text-text num">{wei !== null ? formatEth(wei) : "0"} test ETH</strong> to this campaign's contract.</p>
        <p>Your total contribution becomes your voting weight on its milestones, and fixes your share of any refund.</p>
      </ConfirmDialog>
    </form>
  );
}
