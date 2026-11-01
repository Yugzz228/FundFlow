export interface AppConfig {
  chainId: number;
  rpcUrl: string;
  factoryAddress: string | null;
  deploymentBlock: number;
  networkName: string;
}

const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_RPC_URL = "http://127.0.0.1:8545";

interface DeploymentFile {
  network: string;
  chainId: number;
  factoryAddress: string;
  deploymentBlock: number;
}

async function readDeploymentFile(): Promise<DeploymentFile | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}deployment.json`, { cache: "no-store" });
    if (!response.ok) return null;
    // A dev server answers a missing file with index.html, which fails this parse.
    return (await response.json()) as DeploymentFile;
  } catch {
    return null;
  }
}

/** Reads the deployment written by scripts/deploy.ts. VITE_ variables take priority if set. */
export async function loadConfig(): Promise<AppConfig> {
  const file = await readDeploymentFile();
  const envChainId = Number(import.meta.env.VITE_CHAIN_ID);
  return {
    chainId: envChainId > 0 ? envChainId : (file?.chainId ?? DEFAULT_CHAIN_ID),
    rpcUrl: import.meta.env.VITE_RPC_URL || DEFAULT_RPC_URL,
    factoryAddress: import.meta.env.VITE_FACTORY_ADDRESS || file?.factoryAddress || null,
    deploymentBlock: file?.deploymentBlock ?? 0,
    networkName: file?.network === "localhost" || !file ? "Hardhat Local" : file.network,
  };
}
