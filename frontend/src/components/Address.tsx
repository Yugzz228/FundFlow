import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy } from "lucide-react";
import { shortAddress } from "../utils/format";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.warn("[FundFlow] clipboard write failed", error);
    }
  };
  return (
    <button type="button" onClick={copy} aria-label={copied ? "Copied" : label} title={copied ? "Copied" : label} className="inline-flex p-1 rounded text-text-3 hover:text-text">
      {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** Shortened wallet address. Links to the creator profile when `profile` is set. */
export function Address({ address, profile = false, copy = false, you }: { address: string; profile?: boolean; copy?: boolean; you?: boolean }) {
  const text = <span title={address} className="font-mono text-[13px]">{shortAddress(address)}</span>;
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {profile ? (
        <Link to={`/creators/${address}`} className="text-text-2 hover:text-accent underline-offset-2 hover:underline">
          {text}
        </Link>
      ) : (
        text
      )}
      {you && <span className="text-xs text-accent">you</span>}
      {copy && <CopyButton value={address} label="Copy address" />}
    </span>
  );
}
