// Local-only development helper. Moves the running Hardhat node's clock forward and mines a block, so
// deadlines and voting periods can be demonstrated without waiting.
// Usage: npm run advance-time -- --minutes 10
//        npm run advance-time -- --days 3

const RPC_URL = process.env.VITE_RPC_URL || "http://127.0.0.1:8545";

async function rpc(method, params = []) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const { result, error } = await response.json();
  if (error) throw new Error(error.message);
  return result;
}

function flag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? 0 : Number(process.argv[index + 1]);
}

async function main() {
  const seconds = flag("minutes") * 60 + flag("days") * 86_400;
  if (!(seconds > 0)) throw new Error("Pass --minutes and/or --days with a positive value");

  const chainId = Number(await rpc("eth_chainId"));
  if (chainId !== 31337) throw new Error(`Refusing to change time on chain ${chainId}`);

  await rpc("evm_increaseTime", [seconds]);
  await rpc("evm_mine");
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  console.log(`Advanced ${seconds}s. Chain time: ${new Date(Number(block.timestamp) * 1000).toISOString()}`);
}

main().catch((error) => {
  console.error(error.cause?.code === "ECONNREFUSED" ? `Cannot reach the chain at ${RPC_URL}. Is "npm run chain" running?` : error.message);
  process.exitCode = 1;
});
