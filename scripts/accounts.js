// Prints Hardhat's default local test accounts and their current balances, for importing into MetaMask.
// `npm run chain` prints these once, but its log soon scrolls them out of view.
// These keys come from Hardhat's publicly known test mnemonic. Use them on this local chain only.

const { HDNodeWallet, JsonRpcProvider, formatEther } = require("ethers");

const PUBLIC_TEST_MNEMONIC = "test test test test test test test test test test test junk";
const COUNT = 7;

async function main() {
  const provider = new JsonRpcProvider(process.env.VITE_RPC_URL || "http://127.0.0.1:8545", 31337, { staticNetwork: true });

  console.log("Hardhat test accounts. Import a key in MetaMask: Add account > Private key.");
  console.log("WARNING: these keys are public. Anything sent to them on a real network will be lost.\n");

  for (let i = 0; i < COUNT; i++) {
    const wallet = HDNodeWallet.fromPhrase(PUBLIC_TEST_MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`);
    const balance = await provider.getBalance(wallet.address).catch(() => null);
    console.log(`Account #${i}: ${wallet.address}  ${balance === null ? "(chain not running)" : `${Number(formatEther(balance)).toFixed(2)} ETH`}`);
    console.log(`Private key: ${wallet.privateKey}\n`);
  }
  provider.destroy();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
