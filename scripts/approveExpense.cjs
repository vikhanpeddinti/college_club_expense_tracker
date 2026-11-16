/**
 * scripts/approveExpense.cjs
 * 
 * Approves a pending club expense on-chain acting as the Club Faculty/Approver (Checker).
 * Uses the primary contract owner account (SEPOLIA_PRIVATE_KEY) to execute
 * the approveExpense(uint256 id) smart contract function on Sepolia.
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const STATUS_NAMES = ["Pending", "Approved", "Rejected"];

async function main() {
  console.log("=================================================");
  console.log("   CHECKER STEP: APPROVE CLUB EXPENSE ON-CHAIN   ");
  console.log("=================================================");

  // 1. Resolve Contract Address
  let contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    const configPath = path.join(__dirname, "..", "public", "contract-config.json");
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      contractAddress = cfg.contractAddress;
    }
  }

  if (!contractAddress || !ethers.isAddress(contractAddress)) {
    throw new Error("Valid CONTRACT_ADDRESS not found in .env or public/contract-config.json");
  }

  // 2. Resolve Approver / Admin Signer
  const signers = await ethers.getSigners();
  if (!signers || signers.length === 0) {
    throw new Error("No signer found. Ensure SEPOLIA_PRIVATE_KEY is configured in .env");
  }
  const approverSigner = signers[0];
  const approverAddress = await approverSigner.getAddress();
  const approverBalance = await ethers.provider.getBalance(approverAddress);

  console.log(`Contract:         ${contractAddress}`);
  console.log(`Approver (Admin): ${approverAddress}`);
  console.log(`Approver Balance: ${ethers.formatEther(approverBalance)} ETH`);

  // 3. Connect to Contract
  const contract = await ethers.getContractAt("ClubExpenseTracker", contractAddress, approverSigner);

  // Validate Caller Role Against Contract Approver
  const contractApprover = await contract.approver();
  if (approverAddress.toLowerCase() !== contractApprover.toLowerCase()) {
    throw new Error(
      `Access Denied: Current signer (${approverAddress}) is not the authorized contract approver (${contractApprover}).\n` +
      `Ensure SEPOLIA_PRIVATE_KEY belongs to the contract deployer / approver account.`
    );
  }

  const clubName = await contract.clubName();
  const initialBudgetPaise = await contract.initialBudget();
  const totalApprovedPaise = await contract.totalApprovedAmount();
  const remainingBudgetPaise = await contract.getRemainingBudget();
  const totalExpenses = await contract.expenseCount();

  console.log(`Club:             ${clubName}`);
  console.log(`Total Budget:     ₹${(Number(initialBudgetPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`Total Approved:   ₹${(Number(totalApprovedPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`Remaining Budget: ₹${(Number(remainingBudgetPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`Total Expenses:   ${totalExpenses.toString()} record(s) on-chain`);

  if (totalExpenses === 0n) {
    console.log("\nNo expenses found on-chain. Submit an expense first with:");
    console.log("  npx hardhat run scripts/submitExpense.cjs --network sepolia\n");
    return;
  }

  // 4. Resolve Target Expense ID (CLI arg, env, or auto-detect first Pending expense)
  let targetId = null;
  // Look for any numeric argument in process.argv
  for (let i = 2; i < process.argv.length; i++) {
    const val = process.argv[i].trim();
    if (/^\d+$/.test(val)) {
      targetId = BigInt(val);
      break;
    }
  }

  if (!targetId && process.env.EXPENSE_ID && /^\d+$/.test(process.env.EXPENSE_ID.trim())) {
    targetId = BigInt(process.env.EXPENSE_ID.trim());
  }

  // If no target ID provided, search for the latest pending expense
  if (!targetId) {
    console.log("\nSearching for pending expenses on-chain...");
    for (let i = Number(totalExpenses); i >= 1; i--) {
      const exp = await contract.expenses(i);
      if (Number(exp.status) === 0) { // Pending
        targetId = BigInt(i);
        console.log(`Auto-selected latest pending expense: ID #${targetId}`);
        break;
      }
    }
  }

  if (!targetId) {
    console.log("\nAll existing expenses are already finalized (Approved or Rejected).");
    console.log("To submit a new pending expense for demonstration:");
    console.log("  npx hardhat run scripts/submitExpense.cjs --network sepolia\n");
    return;
  }

  // 5. Fetch Target Expense Details & Validate Maker-Checker Rules
  if (targetId <= 0n || targetId > totalExpenses) {
    throw new Error(`Expense #${targetId} does not exist. (Total expenses: ${totalExpenses})`);
  }

  const expense = await contract.expenses(targetId);
  const statusName = STATUS_NAMES[Number(expense.status)] || "Unknown";
  const amountInr = Number(expense.amount) / 100;

  console.log("\n-------------------------------------------------");
  console.log(`Target Expense ID: #${targetId.toString()}`);
  console.log(`Submitter (Maker): ${expense.submitter}`);
  console.log(`Amount:            ₹${amountInr.toLocaleString("en-IN")} (${expense.amount.toString()} paise)`);
  console.log(`Purpose:           "${expense.purpose}"`);
  console.log(`Current Status:    ${statusName}`);
  console.log("-------------------------------------------------");

  if (Number(expense.status) !== 0) {
    throw new Error(`Expense #${targetId} is already finalized with status: ${statusName}`);
  }

  // Maker-Checker Non-Self-Approval Verification
  if (expense.submitter.toLowerCase() === approverAddress.toLowerCase()) {
    throw new Error(
      `Self-Approval Violation: Expense #${targetId} was submitted by the Approver wallet (${approverAddress}).\n` +
      `The smart contract strictly enforces Maker-Checker separation (line 132):\n` +
      `  require(exp.submitter != approver, "Approver cannot self-approve expenses");\n` +
      `Please submit expenses using a separate club member account (via scripts/submitExpense.cjs).`
    );
  }

  if (expense.amount > remainingBudgetPaise) {
    throw new Error(
      `Budget Exceeded: Expense requires ₹${amountInr}, but remaining budget is only ₹${Number(remainingBudgetPaise) / 100}`
    );
  }

  // 6. Execute approveExpense(targetId)
  console.log(`\n⏳ Sending approval transaction for Expense #${targetId} to ${network.name || "Sepolia"}...`);
  const tx = await contract.approveExpense(targetId);
  console.log(`Transaction broadcasted. Hash: ${tx.hash}`);
  console.log("Waiting for block confirmation...");

  const receipt = await tx.wait(1);

  // 7. Verify Post-Approval Contract State
  const updatedRemainingPaise = await contract.getRemainingBudget();
  const updatedApprovedPaise = await contract.totalApprovedAmount();

  console.log("\n Expense Approved Successfully On-Chain!");
  console.log(`Expense ID:              #${targetId.toString()}`);
  console.log(`Approver (Checker):      ${approverAddress}`);
  console.log(`Submitter (Maker):       ${expense.submitter}`);
  console.log(`Approved Amount:         ₹${amountInr.toLocaleString("en-IN")}`);
  console.log(`New Remaining Budget:    ₹${(Number(updatedRemainingPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`New Total Approved:      ₹${(Number(updatedApprovedPaise) / 100).toLocaleString("en-IN")}`);
  console.log(`Block Number:            ${receipt.blockNumber}`);
  console.log(`Gas Used:                ${receipt.gasUsed.toString()}`);
  console.log(`Sepolia Etherscan URL:   https://sepolia.etherscan.io/tx/${tx.hash}`);
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error("\n❌ Approval Failed:", error.message || error);
  process.exit(1);
});
