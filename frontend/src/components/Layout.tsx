import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { parseEther } from "ethers";
import { Coins, Menu, ServerCrash, TriangleAlert, Unplug, X } from "lucide-react";
import { useChain } from "../context/ChainContext";
import { useWallet } from "../context/WalletContext";
import { FAUCET_AMOUNT_ETH, requestTestEth } from "../services/faucet";
import { Button } from "./ui";
import { TransactionStatus } from "./TransactionStatus";
import { WalletConnectButton } from "./WalletConnectButton";

const NAV = [
  { to: "/campaigns", label: "Explore" },
  { to: "/governance", label: "Governance" },
  { to: "/dashboard/creator", label: "Creator" },
  { to: "/dashboard/contributor", label: "Contributor" },
  { to: "/transactions", label: "History" },
];

export function Logo() {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5" aria-label="FundFlow home">
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="2" y="15" width="5" height="7" rx="1.5" fill="var(--color-accent)" />
        <rect x="9.5" y="9" width="5" height="13" rx="1.5" fill="var(--color-accent)" opacity=".7" />
        <rect x="17" y="2" width="5" height="20" rx="1.5" fill="var(--color-accent)" opacity=".4" />
      </svg>
      <span className="display text-[22px] leading-none">FundFlow</span>
    </Link>
  );
}

function Navbar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm transition-colors ${isActive ? "text-text bg-hover" : "text-text-2 hover:text-text"}`;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="page flex h-15 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label="Main" className="hidden lg:flex items-center gap-0.5">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/create" className="hidden md:inline text-sm text-text-2 hover:text-text px-3">
            Start a campaign
          </Link>
          <WalletConnectButton />
          <button type="button" className="lg:hidden p-1.5 text-text-2 hover:text-text" onClick={() => setOpen((v) => !v)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="lg:hidden border-t border-line page py-3 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
          <NavLink to="/create" className={linkClass}>
            Start a campaign
          </NavLink>
        </nav>
      )}
    </header>
  );
}

const LOCAL_CHAIN_ID = 31337;

/** Offers test ETH to a connected wallet that has almost none, on the local development chain only. */
function TestEthBanner() {
  const { provider, refresh } = useChain();
  const { address } = useWallet();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    if (!provider || !address) return;
    setSending(true);
    setError(null);
    try {
      await requestTestEth(provider, address);
      refresh();
    } catch (err) {
      console.error("[FundFlow] test ETH request failed", err);
      setError("Could not send test ETH. Check that `npm run chain` is still running.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div role="status" className="border-b border-accent/25 bg-accent-wash">
      <div className="page py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-text-2">
        <Coins className="size-4 text-accent shrink-0" />
        <span className="flex-1 min-w-48">
          {error ?? "This wallet has no test ETH on the local chain. Test ETH is free and has no real value."}
        </span>
        <Button size="sm" onClick={request} loading={sending}>
          Get {FAUCET_AMOUNT_ETH} test ETH
        </Button>
      </div>
    </div>
  );
}

function StatusBanner() {
  const { status, config } = useChain();
  const { address, balance, onExpectedNetwork, switchNetwork } = useWallet();

  if (status === "ready" && address && onExpectedNetwork && config?.chainId === LOCAL_CHAIN_ID && balance !== null && balance < parseEther("1")) {
    return <TestEthBanner />;
  }

  let banner = null;
  if (status === "offline") {
    banner = {
      icon: ServerCrash,
      text: <>Cannot reach the local blockchain at <code className="font-mono">{config?.rpcUrl ?? "http://127.0.0.1:8545"}</code>. Start it with <code className="font-mono">npm run chain</code>.</>,
    };
  } else if (status === "not-deployed") {
    banner = {
      icon: Unplug,
      text: <>No FundFlow contract found on this chain. A restarted chain starts empty. Run <code className="font-mono">npm run deploy</code>.</>,
    };
  } else if (address && !onExpectedNetwork) {
    banner = {
      icon: TriangleAlert,
      text: <>Your wallet is on a different network. FundFlow transactions run on chain {config?.chainId}.</>,
      action: (
        <Button size="sm" variant="secondary" onClick={switchNetwork}>
          Switch network
        </Button>
      ),
    };
  }
  if (!banner) return null;
  const Icon = banner.icon;
  return (
    <div role="alert" className="border-b border-warn/25 bg-warn-wash">
      <div className="page py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-text-2">
        <Icon className="size-4 text-warn shrink-0" />
        <span className="flex-1 min-w-48">{banner.text}</span>
        {banner.action}
      </div>
    </div>
  );
}

function Footer() {
  const { config, blockNumber, status } = useChain();
  return (
    <footer className="mt-24 border-t border-line">
      <div className="page py-10 grid gap-8 sm:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 text-[13px] text-text-3 max-w-sm">
            A university Blockchain Technology project. Runs on a local development chain using test ETH only. Not audited and not for real funds.
          </p>
          <p className="mt-3 text-xs text-text-3 num">
            {status === "ready" ? `Connected to ${config?.networkName}, chain ${config?.chainId}, block ${blockNumber}` : "Not connected to a chain"}
          </p>
        </div>
        <nav aria-label="Platform" className="flex flex-col gap-2 text-sm text-text-2">
          <div className="text-xs text-text-3 mb-1">Platform</div>
          <Link className="hover:text-text" to="/campaigns">Explore campaigns</Link>
          <Link className="hover:text-text" to="/create">Start a campaign</Link>
          <Link className="hover:text-text" to="/governance">Governance</Link>
        </nav>
        <nav aria-label="Your activity" className="flex flex-col gap-2 text-sm text-text-2">
          <div className="text-xs text-text-3 mb-1">Your activity</div>
          <Link className="hover:text-text" to="/dashboard/creator">Creator dashboard</Link>
          <Link className="hover:text-text" to="/dashboard/contributor">Contributor dashboard</Link>
          <Link className="hover:text-text" to="/transactions">Transaction history</Link>
          <Link className="hover:text-text" to="/setup">Wallet setup</Link>
        </nav>
      </div>
    </footer>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="min-h-dvh flex flex-col">
      <Navbar />
      <StatusBanner />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <TransactionStatus />
    </div>
  );
}
