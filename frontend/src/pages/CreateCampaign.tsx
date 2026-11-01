import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Lock, Plus, Rocket, Trash2 } from "lucide-react";
import { Button, ErrorMessage, Notice, PageHeader } from "../components/ui";
import { useChain, useChainNow } from "../context/ChainContext";
import { useTransactions } from "../context/TransactionContext";
import { useWallet } from "../context/WalletContext";
import { campaignAddressFromLogs, createCampaign } from "../services/transactions";
import { formatBps, formatDuration, formatEth, parseEthInput, parsePercentToBps } from "../utils/format";

const STEPS = ["Details", "Funding", "Milestones", "Review", "Submit"];

type Unit = "minutes" | "hours" | "days";
const UNIT_SECONDS: Record<Unit, number> = { minutes: 60, hours: 3600, days: 86_400 };

interface MilestoneDraft {
  id: number;
  description: string;
  percent: string;
}

function byteLength(text: string) {
  return new TextEncoder().encode(text).length;
}

function durationSeconds(value: string, unit: Unit): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value) * UNIT_SECONDS[unit];
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-1.5">{label}</label>
      {children}
      {error ? <p className="mt-1.5 text-[13px] text-danger">{error}</p> : hint && <p className="mt-1.5 text-xs text-text-3">{hint}</p>}
    </div>
  );
}

function DurationInput({ id, value, unit, onValue, onUnit, invalid }: { id: string; value: string; unit: Unit; onValue: (v: string) => void; onUnit: (u: Unit) => void; invalid: boolean }) {
  return (
    <div className="flex gap-2">
      <input id={id} inputMode="numeric" value={value} onChange={(e) => onValue(e.target.value)} aria-invalid={invalid} className="field num" />
      <select aria-label="Unit" value={unit} onChange={(e) => onUnit(e.target.value as Unit)} className="field w-32">
        <option value="minutes">Minutes</option>
        <option value="hours">Hours</option>
        <option value="days">Days</option>
      </select>
    </div>
  );
}

export function CreateCampaign() {
  const navigate = useNavigate();
  const now = useChainNow();
  const { config, limits, status } = useChain();
  const { address, balance, onExpectedNetwork } = useWallet();
  const { send } = useTransactions();

  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [target, setTarget] = useState("");
  const [fundingValue, setFundingValue] = useState("7");
  const [fundingUnit, setFundingUnit] = useState<Unit>("days");
  const [votingValue, setVotingValue] = useState("3");
  const [votingUnit, setVotingUnit] = useState<Unit>("days");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { id: 1, description: "", percent: "50" },
    { id: 2, description: "", percent: "50" },
  ]);
  const [nextId, setNextId] = useState(3);
  const [phase, setPhase] = useState<"idle" | "sending">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const targetWei = parseEthInput(target);
  const fundingSeconds = durationSeconds(fundingValue, fundingUnit);
  const votingSeconds = durationSeconds(votingValue, votingUnit);
  const maxMilestones = limits?.maxMilestones ?? 10;
  const maxFunding = limits?.maxFundraisingDuration ?? 365 * 86_400;
  const minVoting = limits?.minVotingPeriod ?? 300;
  const maxVoting = limits?.maxVotingPeriod ?? 30 * 86_400;

  const bpsList = milestones.map((m) => parsePercentToBps(m.percent));
  const bpsTotal = bpsList.reduce<number>((sum, bps) => sum + (bps ?? 0), 0);

  const errors = useMemo(() => {
    const titleError = !title.trim() ? "Enter a title." : byteLength(title) > (limits?.maxTitleLength ?? 120) ? `Keep the title under ${limits?.maxTitleLength ?? 120} characters.` : null;
    const descriptionError = !description.trim() ? "Enter a description." : byteLength(description) > (limits?.maxDescriptionLength ?? 2000) ? `Keep the description under ${limits?.maxDescriptionLength ?? 2000} characters.` : null;
    const imageError = imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim()) ? "Use an http or https URL, or leave this empty." : byteLength(imageUrl) > (limits?.maxUrlLength ?? 512) ? "This URL is too long." : null;
    const targetError = targetWei === null ? "Enter a target in ETH, for example 5." : targetWei === 0n ? "The target must be greater than zero." : null;
    const fundingError = fundingSeconds === null || fundingSeconds < 60 ? "Fundraising must last at least one minute." : fundingSeconds > maxFunding ? "Fundraising cannot last more than one year." : null;
    const votingError = votingSeconds === null || votingSeconds < minVoting || votingSeconds > maxVoting ? `Each vote must last between ${formatDuration(minVoting)} and ${formatDuration(maxVoting)}.` : null;
    const milestoneErrors = milestones.map((m, i) => {
      if (!m.description.trim()) return "Describe this milestone.";
      if (byteLength(m.description) > (limits?.maxMilestoneTextLength ?? 500)) return "This description is too long.";
      if (bpsList[i] === null) return "Enter a percentage with up to two decimals.";
      if (bpsList[i] === 0) return "The allocation must be greater than zero.";
      return null;
    });
    const totalError = bpsTotal !== 10_000 ? `Allocations must add up to exactly 100%. They currently add up to ${formatBps(bpsTotal)}.` : null;
    return { titleError, descriptionError, imageError, targetError, fundingError, votingError, milestoneErrors, totalError };
  }, [title, description, imageUrl, targetWei, fundingSeconds, votingSeconds, milestones, bpsList, bpsTotal, limits, maxFunding, minVoting, maxVoting]);

  const stepValid = [
    !errors.titleError && !errors.descriptionError && !errors.imageError,
    !errors.targetError && !errors.fundingError && !errors.votingError,
    errors.milestoneErrors.every((e) => !e) && !errors.totalError,
    true,
    true,
  ];

  const next = () => {
    if (!stepValid[step]) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => s + 1);
    window.scrollTo(0, 0);
  };

  const shown = <T,>(error: T) => (showErrors ? error : null);

  const updateMilestone = (id: number, patch: Partial<MilestoneDraft>) => setMilestones((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const submit = async () => {
    if (!config?.factoryAddress || targetWei === null || fundingSeconds === null || votingSeconds === null) return;
    setPhase("sending");
    setSubmitError(null);
    const factory = config.factoryAddress;
    const receipt = await send(`Create "${title.trim()}"`, (signer) =>
      createCampaign(signer, factory, {
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        fundingTarget: targetWei,
        // Measured from chain time, which can differ from the browser clock on a local chain.
        deadline: now + fundingSeconds,
        votingPeriod: votingSeconds,
        milestoneDescriptions: milestones.map((m) => m.description.trim()),
        milestoneAllocationsBps: bpsList as number[],
      }),
    );
    setPhase("idle");
    const campaign = receipt ? campaignAddressFromLogs(receipt.logs) : null;
    if (campaign) {
      navigate(`/campaigns/${campaign}`);
    } else {
      setSubmitError("The transaction did not complete. The status message on screen explains why. Your inputs are unchanged, so you can try again.");
    }
  };

  return (
    <div className="page max-w-3xl">
      <PageHeader eyebrow="New campaign" title="Start a campaign">
        Your campaign is deployed as its own smart contract. Its rules are fixed from that moment on.
      </PageHeader>

      <ol className="flex gap-1.5 mb-8" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex-1 min-w-0" aria-current={index === step ? "step" : undefined}>
            <div className={`h-1 rounded-full ${index <= step ? "bg-accent" : "bg-hover"}`} />
            <div className={`mt-2 text-xs truncate ${index === step ? "text-text" : "text-text-3"}`}>{label}</div>
          </li>
        ))}
      </ol>

      <div className="card p-5 sm:p-7">
        {step === 0 && (
          <div className="space-y-5">
            <Field id="title" label="Campaign title" error={shown(errors.titleError)}>
              <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="field" aria-invalid={!!shown(errors.titleError)} />
            </Field>
            <Field id="description" label="Short description" error={shown(errors.descriptionError)} hint="Stored on-chain, so keep it short.">
              <textarea id="description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} className="field" aria-invalid={!!shown(errors.descriptionError)} />
            </Field>
            <Field id="image" label="Project image URL (optional)" error={shown(errors.imageError)} hint="Only the link is stored on-chain. The image behind it can change.">
              <input id="image" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="field" placeholder="https://" aria-invalid={!!shown(errors.imageError)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field id="target" label="Funding target (test ETH)" error={shown(errors.targetError)} hint="The campaign must reach this before its deadline. Contributions above it are accepted until the deadline.">
              <input id="target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} className="field num" placeholder="5" aria-invalid={!!shown(errors.targetError)} />
            </Field>
            <Field id="funding-duration" label="Fundraising period" error={shown(errors.fundingError)} hint={fundingSeconds && !errors.fundingError ? `Contributions close about ${formatDuration(fundingSeconds)} from now, by chain time.` : undefined}>
              <DurationInput id="funding-duration" value={fundingValue} unit={fundingUnit} onValue={setFundingValue} onUnit={setFundingUnit} invalid={!!shown(errors.fundingError)} />
            </Field>
            <Field id="voting-duration" label="Voting period per milestone" error={shown(errors.votingError)} hint={`Between ${formatDuration(minVoting)} and ${formatDuration(maxVoting)}. Fixed once the campaign is created.`}>
              <DurationInput id="voting-duration" value={votingValue} unit={votingUnit} onValue={setVotingValue} onUnit={setVotingUnit} invalid={!!shown(errors.votingError)} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div>
            <ul className="space-y-3.5">
              {milestones.map((milestone, index) => (
                <li key={milestone.id} className="rounded-[10px] border border-line p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Milestone {index + 1}</span>
                    {milestones.length > 1 && (
                      <button type="button" aria-label={`Remove milestone ${index + 1}`} onClick={() => setMilestones((list) => list.filter((m) => m.id !== milestone.id))} className="p-1 text-text-3 hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-2.5 grid gap-3 sm:grid-cols-[1fr_110px]">
                    <div>
                      <label htmlFor={`m-${milestone.id}-text`} className="sr-only">Milestone {index + 1} description</label>
                      <input id={`m-${milestone.id}-text`} placeholder="What will be delivered?" value={milestone.description} onChange={(e) => updateMilestone(milestone.id, { description: e.target.value })} className="field" />
                    </div>
                    <div className="relative">
                      <label htmlFor={`m-${milestone.id}-percent`} className="sr-only">Milestone {index + 1} allocation in percent</label>
                      <input id={`m-${milestone.id}-percent`} inputMode="decimal" value={milestone.percent} onChange={(e) => updateMilestone(milestone.id, { percent: e.target.value })} className="field pr-7 num" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3">%</span>
                    </div>
                  </div>
                  {showErrors && errors.milestoneErrors[index] && <p className="mt-1.5 text-[13px] text-danger">{errors.milestoneErrors[index]}</p>}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={milestones.length >= maxMilestones}
                onClick={() => {
                  setMilestones((list) => [...list, { id: nextId, description: "", percent: "" }]);
                  setNextId((n) => n + 1);
                }}
              >
                <Plus className="size-4" /> Add milestone ({milestones.length}/{maxMilestones})
              </Button>
              <div className={`text-sm num flex items-center gap-1.5 ${bpsTotal === 10_000 ? "text-accent" : "text-warn"}`} aria-live="polite">
                {bpsTotal === 10_000 && <Check className="size-4" />} Total: {formatBps(bpsTotal)} of 100%
              </div>
            </div>
            {showErrors && errors.totalError && <p className="mt-2 text-[13px] text-danger">{errors.totalError}</p>}
            <div className="mt-5">
              <Notice icon={Lock}>Allocations are percentages of whatever is finally raised. You cannot change them after the campaign is created.</Notice>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="display text-3xl">{title.trim()}</h2>
            <p className="mt-2 text-sm text-text-2 whitespace-pre-line">{description.trim()}</p>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3 text-sm">
              <div><dt className="text-xs text-text-3">Funding target</dt><dd className="num mt-0.5">{targetWei !== null ? formatEth(targetWei) : ""} ETH</dd></div>
              <div><dt className="text-xs text-text-3">Fundraising period</dt><dd className="num mt-0.5">{formatDuration(fundingSeconds ?? 0)}</dd></div>
              <div><dt className="text-xs text-text-3">Each vote lasts</dt><dd className="num mt-0.5">{formatDuration(votingSeconds ?? 0)}</dd></div>
            </dl>
            <ol className="mt-5 divide-y divide-line border-y border-line">
              {milestones.map((milestone, index) => (
                <li key={milestone.id} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                  <span>{index + 1}. {milestone.description.trim()}</span>
                  <span className="num text-text-2 shrink-0">{formatBps(bpsList[index] ?? 0)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              <Notice icon={Lock} tone="warn">
                Once deployed, none of this can be edited. Funds only reach you through milestones contributors approve. If a milestone is rejected or its vote expires, anyone can cancel the campaign and contributors share the funds that were not approved.
              </Notice>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="font-medium">Deploy your campaign contract</h2>
            <p className="mt-1.5 text-sm text-text-2">MetaMask will ask you to confirm a transaction. It costs only test ETH for gas.</p>
            <ul className="mt-4 space-y-2 text-sm">
              <SubmitCheck ok={status === "ready"} text={status === "ready" ? "FundFlow contract found on the local chain" : "FundFlow contract not reachable. Check the chain and deployment."} />
              <SubmitCheck ok={!!address} text={address ? "Wallet connected" : "Connect your wallet (you will be asked when you submit)"} pending={!address} />
              {address && <SubmitCheck ok={onExpectedNetwork} text={onExpectedNetwork ? "Wallet is on the right network" : "Wallet is on another network (you will be asked to switch)"} pending={!onExpectedNetwork} />}
              {address && balance !== null && <SubmitCheck ok={balance > 0n} text={balance > 0n ? `Balance: ${formatEth(balance)} test ETH` : "This wallet has no test ETH for gas. Import a funded Hardhat account."} />}
            </ul>
            {submitError && <div className="mt-4"><ErrorMessage title="Campaign not created">{submitError}</ErrorMessage></div>}
          </div>
        )}

        <div className="mt-7 pt-5 border-t border-line flex justify-between gap-3">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => { setStep((s) => s - 1); setShowErrors(false); setSubmitError(null); }} disabled={phase === "sending"}>
              <ArrowLeft className="size-4" /> Back
            </Button>
          ) : <span />}
          {step < 4 ? (
            <Button onClick={next}>
              {step === 3 ? "Continue to submit" : "Continue"} <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={phase === "sending"} disabled={status !== "ready"}>
              {phase !== "sending" && <Rocket className="size-4" />} {phase === "sending" ? "Waiting for confirmation" : "Create campaign"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SubmitCheck({ ok, text, pending = false }: { ok: boolean; text: string; pending?: boolean }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? "text-text-2" : pending ? "text-text-2" : "text-danger"}`}>
      {ok ? <Check className="size-4 mt-0.5 text-accent shrink-0" /> : <span className={`size-1.5 rounded-full mt-2 mx-1 shrink-0 ${pending ? "bg-warn" : "bg-danger"}`} />}
      {text}
    </li>
  );
}
