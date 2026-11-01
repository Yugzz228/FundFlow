import { Route, Routes } from "react-router-dom";
import { Compass } from "lucide-react";
import { Layout } from "./components/Layout";
import { EmptyState, LinkButton } from "./components/ui";
import { Landing } from "./pages/Landing";
import { Explore } from "./pages/Explore";
import { CampaignDetail } from "./pages/CampaignDetail";
import { CreateCampaign } from "./pages/CreateCampaign";
import { CreatorDashboard } from "./pages/CreatorDashboard";
import { ContributorDashboard } from "./pages/ContributorDashboard";
import { Governance, MilestoneVote } from "./pages/Governance";
import { Transactions } from "./pages/Transactions";
import { CreatorProfile } from "./pages/CreatorProfile";
import { WalletSetup } from "./pages/WalletSetup";

function NotFound() {
  return (
    <div className="page py-16">
      <EmptyState icon={Compass} title="Page not found" action={<LinkButton to="/campaigns">Explore campaigns</LinkButton>}>
        That address does not match anything in FundFlow.
      </EmptyState>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />
        <Route path="campaigns" element={<Explore />} />
        <Route path="campaigns/:address" element={<CampaignDetail />} />
        <Route path="campaigns/:address/milestones/:index" element={<MilestoneVote />} />
        <Route path="create" element={<CreateCampaign />} />
        <Route path="governance" element={<Governance />} />
        <Route path="dashboard/creator" element={<CreatorDashboard />} />
        <Route path="dashboard/contributor" element={<ContributorDashboard />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="creators/:address" element={<CreatorProfile />} />
        <Route path="setup" element={<WalletSetup />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
