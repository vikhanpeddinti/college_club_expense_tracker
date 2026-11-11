import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("=================================================");
  console.log("Deploying ClubExpenseTracker Smart Contract...");
  console.log(`Network:  ${hre.network.name} (Chain ID: ${hre.network.config.chainId || 31337})`);
  console.log(`Deployer: ${deployer.address}`);

  const clubName = process.env.CLUB_NAME || "College Tech Club";
  // Default: 10,000 INR = 1,000,000 paise
  const initialBudgetPaise = process.env.INITIAL_BUDGET_PAISE
    ? BigInt(process.env.INITIAL_BUDGET_PAISE)
    : 1000000n;

  const budgetInINR = Number(initialBudgetPaise) / 100;
  console.log(`Club Name:      "${clubName}"`);
  console.log(`Initial Budget: ${initialBudgetPaise} paise (₹${budgetInINR.toLocaleString("en-IN")})`);

  const Factory = await hre.ethers.getContractFactory("ClubExpenseTracker");
  const contract = await Factory.deploy(clubName, initialBudgetPaise);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log("-------------------------------------------------");
  console.log(`SUCCESS! Contract deployed at: ${contractAddress}`);
  console.log(`Approver set to deployer:     ${deployer.address}`);
  console.log("=================================================");

  // Export contract configuration and ABI to public/ for frontend
  const publicDir = path.join(__dirname, "..", "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const configPath = path.join(publicDir, "contract-config.json");
  const configData = {
    contractAddress: contractAddress,
    chainId: hre.network.config.chainId || 11155111,
    networkName: hre.network.name,
    rpcUrl: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
    clubName: clubName,
    initialBudgetPaise: initialBudgetPaise.toString(),
    initialBudgetINR: budgetInINR,
    approver: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
  console.log(`Updated frontend config: ${configPath}`);

  // Copy ABI to public/
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "ClubExpenseTracker.sol",
    "ClubExpenseTracker.json"
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
    const abiPath = path.join(publicDir, "contract-abi.json");
    fs.writeFileSync(abiPath, JSON.stringify(artifact.abi, null, 2));
    console.log(`Exported frontend ABI:   ${abiPath}`);
  }
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});

