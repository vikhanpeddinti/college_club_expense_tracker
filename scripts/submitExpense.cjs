/**
 * scripts/submitExpense.cjs
 * 
 * Submits a new expense proposal on-chain acting as the Club Member (Maker).
 * Uses the secondary funded account (APPROVER_2_PRIVATE_KEY) to demonstrate
 * separation of duties between Member (Submitter) and Approver (Owner).
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("=================================================");
  console.log("   MAKER STEP: SUBMIT CLUB EXPENSE (MEMBER)      ");
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

  // 2. Resolve Club Member (Maker) Signer
  let memberSigner;
  const memberKey = process.env.APPROVER_2_PRIVATE_KEY || process.env.MEMBER_PRIVATE_KEY;
  if (memberKey) {
    const cleanKey = memberKey.trim().replace(/^0x/, "");
    if (cleanKey.length === 64) {
      memberSigner = new ethers.Wallet("0x" + cleanKey, ethers.provider);
    }
  }

  if (!memberSigner) {
    const signers = await ethers.getSigners();
    if (signers.length > 1) {
      memberSigner = signers[1];
    } else if (signers.length > 0) {
      memberSigner = signers[0];
      console.warn("⚠️ Warning: APPROVER_2_PRIVATE_KEY not set. Using primary signer for submission.");
    } else {
      throw new Error("No signer found. Set APPROVER_2_PRIVATE_KEY in .env");
    }
  }

  const memberAddress = await memberSigner.getAddress();
  const memberBalance = await ethers.provider.getBalance(memberAddress);

  console.log(`Contract:         ${contractAddress}`);
  console.log(`Member (Maker):   ${memberAddress}`);
  console.log(`Member Balance:   ${ethers.formatEther(memberBalance)} ETH`);

  if (memberBalance === 0n) {
    throw new Error(
      `Member wallet ${memberAddress} has 0 ETH. Please run:\n` +
      `  npx hardhat run scripts/fundAccount.cjs --network sepolia\n` +
      `to fund this account with SepoliaETH for gas.`
    );
  }

  // 3. Connect to Contract
  const contract = await ethers.getContractAt("ClubExpenseTracker", contractAddress, memberSigner);

  // Validate Roles & Constraints
  const contractApprover = await contract.approver();
  const clubName = await contract.clubName();
  const remainingBudgetPaise = await contract.getRemainingBudget();
  const remainingBudgetInr = Number(remainingBudgetPaise) / 100;

  console.log(`Club Name:        ${clubName}`);
  console.log(`Club Approver:    ${contractApprover}`);
  console.log(`Remaining Budget: ₹${remainingBudgetInr.toLocaleString("en-IN")} (${remainingBudgetPaise.toString()} paise)`);

  if (memberAddress.toLowerCase() === contractApprover.toLowerCase()) {
    console.warn("\n⚠️ WARNING: Submitter address matches Contract Approver address.");
    console.warn("   Self-approval is forbidden by ClubExpenseTracker.sol (line 132).");
    console.warn("   Use a separate secondary key (APPROVER_2_PRIVATE_KEY) to test full Maker-Checker workflow.\n");
  } else {
    console.log("Role Check:      Verified distinct Member account (Maker-Checker compliant).");
  }

  // 4. Determine Expense Parameters
  // Optional CLI arguments: node submitExpense.cjs [amountInInr] [purpose]
  const amountInInr = process.argv[2] && !isNaN(process.argv[2]) ? Number(process.argv[2]) : 500;
  const purpose = process.argv[3] || "Arduino Uno & Sensor Kit for Robotics Workshop";
  const amountInPaise = BigInt(Math.round(amountInInr * 100));

  if (amountInPaise <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
  if (amountInPaise > remainingBudgetPaise) {
    console.warn(`⚠️ Warning: Expense amount (₹${amountInInr}) exceeds remaining budget (₹${remainingBudgetInr}). It will revert on approval if not rejected.`);
  }

  console.log("\n-------------------------------------------------");
  console.log(`Expense Amount:   ₹${amountInInr.toLocaleString("en-IN")} (${amountInPaise.toString()} paise)`);
  console.log(`Purpose:          "${purpose}"`);
  console.log("-------------------------------------------------");

  // 5. Submit Expense On-Chain
  console.log(`\n⏳ Submitting expense to ${network.name || "Sepolia"}...`);
  const tx = await contract.submitExpense(amountInPaise, purpose);
  console.log(`Transaction broadcasted. Hash: ${tx.hash}`);
  console.log("Waiting for block confirmation...");

  const receipt = await tx.wait(1);

  // 6. Find New Expense ID from event or total count
  let newExpenseId = null;
  if (receipt.logs) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === "ExpenseSubmitted") {
          newExpenseId = parsed.args.id.toString();
          break;
        }
      } catch (e) {
        // Log may belong to another contract / event
      }
    }
  }

  if (!newExpenseId) {
    newExpenseId = (await contract.expenseCount()).toString();
  }

  console.log("\n Expense Submitted Successfully On-Chain!");
  console.log(`New Expense ID:          #${newExpenseId}`);
  console.log(`Submitter (Member):      ${memberAddress}`);
  console.log(`Block Number:            ${receipt.blockNumber}`);
  console.log(`Gas Used:                ${receipt.gasUsed.toString()}`);
  console.log(`Sepolia Etherscan URL:   https://sepolia.etherscan.io/tx/${tx.hash}`);
  console.log("=================================================");
  console.log(`Next step: Run the approval script to finalize this expense on-chain:`);
  console.log(`  npx hardhat run scripts/approveExpense.cjs --network sepolia -- ${newExpenseId}`);
  console.log("=================================================\n");
}

main().catch((error) => {
  console.error("\n❌ Submission Failed:", error.message || error);
  process.exit(1);
});

