import { useState } from "react";
import { Check, ExternalLink, ShieldAlert } from "lucide-react";
import { CopyButton } from "../components/Address";
import { Button, Notice, PageHeader } from "../components/ui";
import { useChain } from "../context/ChainContext";
import { useWallet } from "../context/WalletContext";

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-5">
      <span className="display text-3xl text-text-3 w-6 shrink-0 num">{number}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-medium">{title}</h2>
        <div className="mt-1.5 text-sm text-text-2 space-y-2">{children}</div>
      </div>
    </li>
  );
}

export function WalletSetup() {
  const { config } = useChain();
  const { installed, address, onExpectedNetwork, switchNetwork } = useWallet();
  const [switchFailed, setSwitchFailed] = useState(false);

  const rows: [string, string][] = [
    ["Network name", config?.networkName ?? "Hardhat Local"],
    ["RPC URL", config?.rpcUrl ?? "http://127.0.0.1:8545"],
    ["Chain ID", String(config?.chainId ?? 31337)],
    ["Currency symbol", "ETH"],
  ];

  return (
    <div className="page max-w-3xl">
      <PageHeader eyebrow="Wallet setup" title="Connect MetaMask to the local chain">
        FundFlow runs on a Hardhat development chain on your computer. Nothing here uses real money.
      </PageHeader>

      <Notice icon={ShieldAlert} tone="warn">
        FundFlow will never ask for your seed phrase or private key. Hardhat's test account keys are public and shared by every developer, so anything sent to them on a real network is lost. Use them only on this local chain, ideally in a separate MetaMask profile.
      </Notice>

      <ol className="mt-4 divide-y divide-line">
        <Step number={1} title="Install MetaMask">
          {installed ? (
            <p className="flex items-center gap-1.5 text-accent"><Check className="size-4" /> A wallet was detected in this browser.</p>
          ) : (
            <p>
              <a href="https://metamask.io/download/" target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent hover:underline">
                Download MetaMask <ExternalLink className="size-3.5" />
              </a>
              , add it to your browser, then reload this page.
            </p>
          )}
        </Step>

        <Step number={2} title="Add the local network">
          <p>In MetaMask, add a network manually with these values, or use the button.</p>
          <dl className="card divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <dt className="text-text-3 text-[13px]">{label}</dt>
                <dd className="flex items-center gap-1 font-mono text-[13px] text-text min-w-0 break-all">
                  {value} <CopyButton value={value} label={`Copy ${label}`} />
                </dd>
              </div>
            ))}
          </dl>
          {installed && (
            <div className="pt-1">
              {address && onExpectedNetwork ? (
                <p className="flex items-center gap-1.5 text-accent"><Check className="size-4" /> Your wallet is on this network.</p>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    setSwitchFailed(false);
                    setSwitchFailed(!(await switchNetwork()));
                  }}
                >
                  Add or switch network in MetaMask
                </Button>
              )}
              {switchFailed && <p className="mt-2 text-danger text-[13px]">MetaMask did not switch networks. Add the values above manually.</p>}
            </div>
          )}
        </Step>

        <Step number={3} title="Import a test account">
          <p>
            A new MetaMask account of your own shows 0 ETH, because only the test accounts are funded. Run <code className="font-mono text-text">npm run accounts</code> in a terminal to list them with their private keys. In MetaMask choose Add account, then Private key, and paste one key there. Never paste a key into a website.
          </p>
          <p>Import at least two accounts to try the full flow: one as the creator and one as a contributor. Switch between them in MetaMask and FundFlow updates automatically.</p>
        </Step>

        <Step number={4} title="After a chain restart">
          <p>
            Campaigns exist only on the running chain, so restarting it erases them. Run <code className="font-mono text-text">npm run deploy</code> again. If MetaMask then shows nonce errors, open its Settings, Advanced, and clear activity data.
          </p>
        </Step>
      </ol>
    </div>
  );
}
