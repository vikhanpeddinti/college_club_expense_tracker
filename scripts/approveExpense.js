import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATUS_NAMES = ["Pending", "Approved", "Rejected"];

async function main() {
  console.log("=================================================");
  console.log("   ADMIN SCRIPT: APPROVE CLUB EXPENSE ON-CHAIN   ");
  console.log("=================================================");

  // 1. Resolve Admin / Approver Signer
  const signers = await hre.ethers.getSigners();
  if (!signers || signers.length === 0) {
    throw new Error("No signer available. Check SEPOLIA_PRIVATE_KEY in .env");
  }
  const adminSigner = signers[0];
  console.log(`Network:      ${hre.network.name} (Chain ID: ${hre.network.config.chainId || 11155111})`);
  console.log(`Admin Caller: ${adminSigner.address}`);

  // 2. Resolve Contract Address
  let contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    const configPath = path.join(__dirname, "..", "public", "contract-config.json");
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      contractAddress = cfg.contractAddress;
    }
  }

  if (!contractAddress) {
    throw new Error("Contract address not found. Specify CONTRACT_ADDRESS in .env or run deploy script.");
  }
  console.log(`Contract:     ${contractAddress}`);

  // Check if contract exists on this network
  const code = await hre.ethers.provider.getCode(contractAddress);
  if (code === "0x" || code === "0x0") {
    throw new Error(
      `No contract bytecode found at ${contractAddress} on '${hre.network.name}'.\n` +
      `Make sure you are targeting the right network (e.g., '--network sepolia') where the contract is deployed.`
    );
  }

  // 3. Attach Contract
  const tracker = await hre.ethers.getContractAt("ClubExpenseTracker", contractAddress, adminSigner);

  // 4. Resolve Target Expense ID
  // Supports: EXPENSE_ID env var, CLI argument (e.g., node script 1), or auto-detecting first Pending expense
  let targetId = null;
  const args = process.argv.slice(2);
  const cliArg = args.find((arg) => !arg.startsWith("--") && !isNaN(parseInt(arg, 10)));

  if (process.env.EXPENSE_ID) {
    targetId = parseInt(process.env.EXPENSE_ID, 10);
  } else if (cliArg) {
    targetId = parseInt(cliArg, 10);
  }

  const totalExpenses = await tracker.expenseCount();
  console.log(`Total On-Chain Expenses: ${totalExpenses.toString()}`);

  if (totalExpenses === 0n) {
    console.log("\n⚠️ No expenses found on-chain. Submit an expense first before running approval.");
    return;
  }

  // If no specific ID provided, find the earliest Pending expense
  if (!targetId) {
    console.log("No specific expense ID passed. Scanning for first 'Pending' expense...");
    for (let i = 1n; i <= totalExpenses; i++) {
      const exp = await tracker.getExpense(i);
      if (Number(exp.status) === 0) { // 0 = Pending
        targetId = Number(i);
        console.log(`Found Pending expense: ID #${targetId}`);
        break;
      }
    }
  }

  if (!targetId) {
    targetId = 1; // Fallback default
  }

  console.log(`\nTarget Expense ID to Approve: #${targetId}`);

  // 5. Pre-Flight On-Chain State Checks
  const expense = await tracker.getExpense(targetId);
  const statusStr = STATUS_NAMES[Number(expense.status)] || "Unknown";
  const amountINR = Number(expense.amount) / 100;
  const remainingBefore = await tracker.getRemainingBudget();
  const remainingBeforeINR = Number(remainingBefore) / 100;
  const contractApprover = await tracker.approver();

  console.log("-------------------------------------------------");
  console.log(`Expense #${targetId} Details:`);
  console.log(`  Submitter:        ${expense.submitter}`);
  console.log(`  Amount:           ₹${amountINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (${expense.amount} paise)`);
  console.log(`  Purpose:          "${expense.purpose}"`);
  console.log(`  Current Status:   ${statusStr}`);
  console.log(`  Remaining Budget: ₹${remainingBeforeINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
  console.log("-------------------------------------------------");

  // Validation 1: Already decided
  if (Number(expense.status) !== 0) {
    console.log(`❌ Reverted Check: Expense #${targetId} is already ${statusStr}. Only Pending expenses can be approved.`);
    return;
  }

  // Validation 2: Caller is Approver
  if (adminSigner.address.toLowerCase() !== contractApprover.toLowerCase()) {
    console.log(`❌ Reverted Check: Caller (${adminSigner.address}) is not the contract approver (${contractApprover}).`);
    return;
  }

  // Validation 3: Self-Approval Prevention
  if (expense.submitter.toLowerCase() === contractApprover.toLowerCase()) {
    console.log("❌ Reverted Check: Approver cannot self-approve expenses submitted by their own address.");
    return;
  }

  // Validation 4: Budget Limit
  if (expense.amount > remainingBefore) {
    console.log(`❌ Reverted Check: Expense amount (₹${amountINR}) exceeds remaining budget (₹${remainingBeforeINR}).`);
    return;
  }

  // 6. Execute approveExpense(uint256 id) on Ethereum Sepolia
  console.log(`\n⏳ Sending approveExpense(${targetId}) transaction to ${hre.network.name}...`);
  const tx = await tracker.approveExpense(targetId);
  console.log(`Transaction Broadcast! Hash: ${tx.hash}`);
  console.log("Waiting for block confirmation on-chain...");

  const receipt = await tx.wait(1);

  // 7. Post-Mining Verification
  const remainingAfter = await tracker.getRemainingBudget();
  const remainingAfterINR = Number(remainingAfter) / 100;
  const totalApprovedAfter = await tracker.totalApprovedAmount();

  console.log("\n=================================================");
  console.log("🎉 SUCCESS! EXPENSE APPROVED LIVE ON-CHAIN");
  console.log("=================================================");
  console.log(`Admin Wallet:       ${adminSigner.address}`);
  console.log(`Approved Expense:   #${targetId} ("${expense.purpose}")`);
  console.log(`Mined In Block:     ${receipt.blockNumber}`);
  console.log(`Gas Used:           ${receipt.gasUsed.toString()}`);
  console.log(`New Approved Total: ₹${(Number(totalApprovedAfter) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
  console.log(`New Remaining Bal:  ₹${remainingAfterINR.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
  console.log("-------------------------------------------------");
  console.log("🔍 Sepolia Etherscan Verification Link:");
  console.log(`https://sepolia.etherscan.io/tx/${receipt.hash}`);
  console.log("=================================================");

  // 8. Sync Database Mirror (if Supabase configured)
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("expenses")
        .upsert(
          {
            id: targetId,
            status: "APPROVED",
            decided_tx_hash: receipt.hash,
            tx_hash: receipt.hash,
            decided_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      console.log("✅ Supabase database mirror updated with on-chain confirmation.");
    } catch (dbErr) {
      console.warn("Notice: Database sync skipped:", dbErr.message);
    }
  }
}

main().catch((error) => {
  console.error("\n❌ Script execution failed:", error.reason || error.message);
  process.exitCode = 1;
});

