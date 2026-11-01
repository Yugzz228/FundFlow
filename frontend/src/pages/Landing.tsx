import { useMemo } from "react";
import { ArrowRight, Check, Coins, FileCheck2, Flag, HandCoins, Lock, Minus, Rocket, Vote } from "lucide-react";
import { CampaignCard } from "../components/CampaignCard";
import { EmptyState, LinkButton, LoadingState, SectionHeading } from "../components/ui";
import { useChain, useChainNow } from "../context/ChainContext";
import { useData } from "../context/DataContext";
import { formatEth, progressBps } from "../utils/format";
import { campaignPhase } from "../utils/status";

const STEPS = [
  { icon: Rocket, title: "Create", text: "A creator deploys a campaign with a target, a deadline and fixed milestone allocations." },
  { icon: Coins, title: "Fund", text: "Contributors send test ETH. It stays locked in the campaign contract." },
  { icon: Flag, title: "Finalize", text: "After the deadline, anyone can settle the outcome. Missed targets open full refunds." },
  { icon: FileCheck2, title: "Submit", text: "The creator publishes evidence for the current milestone, which opens a time-limited vote." },
  { icon: Vote, title: "Vote", text: "Contributors vote, weighted by what they contributed. The creator cannot vote." },
  { icon: HandCoins, title: "Release", text: "An approved milestone becomes claimable. Anything else stops the release and leads to refunds." },
];

/** Static explainer of how funds move. Clearly captioned as an illustration, with made-up proportions. */
function ReleaseIllustration() {
  const rows = [
    { name: "Milestone 1", share: "30%", state: "Funds released", width: "30%", fill: "bg-accent", tone: "text-accent", icon: Check },
    { name: "Milestone 2", share: "30%", state: "Contributors voting", width: "30%", fill: "bg-info", tone: "text-info", icon: Vote },
    { name: "Milestone 3", share: "40%", state: "Locked in contract", width: "40%", fill: "bg-line-strong", tone: "text-text-3", icon: Lock },
  ];
  return (
    <figure className="card p-6 sm:p-7 rise">
      <div className="flex gap-1">
        {rows.map((row) => (
          <div key={row.name} className={`h-2.5 rounded-full ${row.fill}`} style={{ width: row.width }} />
        ))}
      </div>
      <ul className="mt-6 divide-y divide-line">
        {rows.map(({ name, share, state, tone, icon: Icon }) => (
          <li key={name} className="flex items-center gap-4 py-3.5">
            <span className="display text-3xl w-16 num">{share}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{name}</span>
              <span className={`inline-flex items-center gap-1.5 text-[13px] ${tone}`}>
                <Icon className="size-3.5" /> {state}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 text-xs text-text-3">Illustration of one campaign's funds, not live data.</figcaption>
    </figure>
  );
}

function FeaturedCampaigns() {
  const { campaigns, loading } = useData();
  const { status } = useChain();
  const now = useChainNow();

  const featured = useMemo(() => {
    const rank = (phase: string) => (phase === "fundraising" ? 0 : phase === "milestones" ? 1 : 2);
    return [...campaigns]
      .sort((a, b) => rank(campaignPhase(a, now)) - rank(campaignPhase(b, now)) || progressBps(b.totalRaised, b.fundingTarget) - progressBps(a.totalRaised, a.fundingTarget))
      .slice(0, 3);
    // Ordering only needs to change when the data does, so the clock is deliberately not a dependency.
  }, [campaigns]);

  if (loading && status !== "offline") return <LoadingState />;
  if (featured.length === 0) {
    return (
      <EmptyState title="No campaigns on this chain yet" action={<LinkButton to="/create">Create the first campaign</LinkButton>}>
        Campaigns live on the local blockchain, so a fresh chain starts empty.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {featured.map((campaign) => (
        <CampaignCard key={campaign.address} campaign={campaign} />
      ))}
    </div>
  );
}

function ChainFigures() {
  const { campaigns } = useData();
  const { status } = useChain();
  if (status !== "ready" || campaigns.length === 0) return null;
  const raised = campaigns.reduce((sum, c) => sum + c.totalRaised, 0n);
  const released = campaigns.reduce((sum, c) => sum + c.totalReleased, 0n);
  return (
    <p className="mt-8 text-[13px] text-text-3 num">
      Read from this local chain: {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}, {formatEth(raised, 2)} test ETH raised, {formatEth(released, 2)} released.
    </p>
  );
}

export function Landing() {
  return (
    <>
      <section className="page grid items-center gap-12 pt-14 pb-20 lg:grid-cols-[1.25fr_1fr] lg:pt-24 lg:pb-28">
        <div className="rise">
          <h1 className="display text-[3.1rem] leading-[1.02] sm:text-7xl">
            Funding innovation. <span className="text-text-2">Releasing progress.</span> <em className="text-accent">Building trust.</em>
          </h1>
          <p className="mt-6 text-lg text-text-2 max-w-xl">
            A transparent crowdfunding platform where project funding follows milestones and contributors participate in the decisions that matter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to="/campaigns" size="lg">
              Explore Campaigns <ArrowRight className="size-4" />
            </LinkButton>
            <LinkButton to="/create" size="lg" variant="secondary">
              Start a Campaign
            </LinkButton>
          </div>
          <ChainFigures />
        </div>
        <ReleaseIllustration />
      </section>

      <section className="border-y border-line bg-surface/50 py-20">
        <div className="page">
          <SectionHeading eyebrow="How FundFlow works" title="Six steps, each enforced on-chain">
            Every step is a contract rule, so the website can show the rules but cannot bypass them.
          </SectionHeading>
          <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="flex gap-4">
                <span className="display text-4xl text-text-3 num w-7 shrink-0">{index + 1}</span>
                <div>
                  <h3 className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-accent" /> {title}
                  </h3>
                  <p className="mt-1.5 text-sm text-text-2">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page py-20 grid gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow="Milestone-based release" title="Money moves in stages, not all at once">
            A creator splits the campaign into up to ten milestones when it is created, and those shares cannot change afterwards. Each one is a separate decision.
          </SectionHeading>
          <ul className="mt-7 space-y-3 text-sm text-text-2">
            <li className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> Milestones run strictly in order, and each can be submitted once.</li>
            <li className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> Approval makes funds claimable. Transfer is a separate transaction you can see in the history.</li>
            <li className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> If a milestone is rejected or its vote expires, contributors share what has not been approved.</li>
          </ul>
        </div>
        <div>
          <SectionHeading eyebrow="Contributor voting" title="Those who funded it decide">
            Voting weight equals recorded contribution. A milestone passes with at least 60% of the weight that participated.
          </SectionHeading>
          <ul className="mt-7 space-y-3 text-sm text-text-2">
            <li className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> One vote per wallet per milestone, final once cast.</li>
            <li className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> The creator's wallet cannot vote, even if it contributed.</li>
            <li className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> A vote nobody takes part in never counts as approval.</li>
          </ul>
        </div>
      </section>

      <section className="border-t border-line py-20">
        <div className="page">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-9">
            <SectionHeading eyebrow="Featured campaigns" title="On this chain right now" />
            <LinkButton to="/campaigns" variant="ghost">
              View all <ArrowRight className="size-4" />
            </LinkButton>
          </div>
          <FeaturedCampaigns />
        </div>
      </section>

      <section className="border-t border-line bg-surface/50 py-20">
        <div className="page">
          <SectionHeading eyebrow="Trust and transparency" title="What the contract does, and what it can't" />
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="card p-6">
              <h3 className="font-medium">Enforced by the smart contract</h3>
              <ul className="mt-4 space-y-3 text-sm text-text-2">
                {["Funds are held by the contract, with no admin who can move them", "Deadlines, vote counting and the 60% threshold", "Release amounts, and one claim per milestone", "Refunds, which exclude funds already approved for release"].map((item) => (
                  <li key={item} className="flex gap-3"><Check className="size-4 mt-0.5 text-accent shrink-0" /> {item}</li>
                ))}
              </ul>
            </div>
            <div className="card p-6">
              <h3 className="font-medium">Not guaranteed by FundFlow</h3>
              <ul className="mt-4 space-y-3 text-sm text-text-2">
                {["Whether submitted evidence is true: it is recorded, not verified", "That a project will succeed, or that a creator's past predicts their future", "Refunds of money already released to a creator", "Protection from one person using many wallets"].map((item) => (
                  <li key={item} className="flex gap-3"><Minus className="size-4 mt-0.5 text-text-3 shrink-0" /> {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
