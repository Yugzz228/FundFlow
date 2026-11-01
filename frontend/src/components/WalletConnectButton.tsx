import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Loader2, LogOut, TriangleAlert, User, Wallet } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { formatEth, shortAddress } from "../utils/format";
import { Button, LinkButton } from "./ui";
import { CopyButton } from "./Address";

/**
 * Connect control for use inside a page. It always explains what is happening, and stays clickable
 * while waiting: a MetaMask popup can be hidden behind the browser, and a repeat click tells the user so.
 */
export function ConnectWalletAction({ label = "Connect wallet", className }: { label?: string; className?: string }) {
  const { installed, connect, connecting, connectError } = useWallet();

  if (!installed) {
    return (
      <div>
        <LinkButton to="/setup" className={className}>
          <Wallet className="size-4" /> Set up MetaMask
        </LinkButton>
        <p role="status" className="mt-2 text-[13px] text-text-2">
          No wallet was detected in this browser. Open FundFlow in Chrome, Edge or Firefox with the MetaMask extension installed and enabled.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Button className={className} onClick={connect}>
        {connecting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" />}
        {connecting ? "Waiting for MetaMask" : label}
      </Button>
      {connecting && (
        <p role="status" className="mt-2 text-[13px] text-text-2">
          Approve the request in MetaMask. If no popup appeared, click the MetaMask icon in your browser toolbar and unlock it.
        </p>
      )}
      {connectError && !connecting && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {connectError}
        </p>
      )}
    </div>
  );
}

export function WalletConnectButton() {
  const { installed, address, balance, connecting, onExpectedNetwork, connect, disconnect, switchNetwork, connectError } = useWallet();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!installed) {
    return (
      <LinkButton to="/setup" variant="secondary" size="sm">
        <Wallet className="size-4" /> Install MetaMask
      </LinkButton>
    );
  }

  if (!address) {
    return (
      <div className="relative">
        <Button size="sm" onClick={connect}>
          {connecting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" />}
          {connecting ? "Check MetaMask" : "Connect wallet"}
        </Button>
        {connectError && (
          <div role="alert" className="absolute right-0 top-full mt-2 w-64 card bg-raised p-3 text-[13px] text-danger z-40">
            {connectError}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2" ref={menu}>
      {!onExpectedNetwork && (
        <Button size="sm" variant="danger" onClick={switchNetwork}>
          <TriangleAlert className="size-4" /> <span className="hidden sm:inline">Wrong network</span>
        </Button>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-8 items-center gap-2 rounded-[9px] border border-line-strong bg-raised pl-3 pr-2 text-[13px] hover:bg-hover"
      >
        {balance !== null && <span className="num text-text-2 hidden sm:inline">{formatEth(balance, 2)} ETH</span>}
        <span className="font-mono">{shortAddress(address)}</span>
        <ChevronDown className="size-3.5 text-text-3" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-64 card bg-raised p-2 z-40 rise">
          <div className="px-2.5 py-2">
            <div className="text-xs text-text-3">Connected wallet</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="font-mono text-[13px]">{shortAddress(address)}</span>
              <CopyButton value={address} label="Copy address" />
            </div>
            {balance !== null && <div className="text-[13px] text-text-2 num mt-1">{formatEth(balance)} test ETH</div>}
          </div>
          <div className="h-px bg-line my-1" />
          <Link role="menuitem" to={`/creators/${address}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-hover">
            <User className="size-4 text-text-3" /> My creator profile
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-hover text-left"
          >
            <LogOut className="size-4 text-text-3" /> Clear connection
          </button>
        </div>
      )}
    </div>
  );
}
