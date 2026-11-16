/**
 * scripts/fundAccount.cjs
 * 
 * Transfers SepoliaETH from the Primary Deployer (Approver/Owner)
 * to the Secondary Test Account (Club Member / Maker) to cover gas fees
 * for submitting expense proposals on-chain.
 */

const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  console.log("=================================================");
  console.log("   MAKER-CHECKER SETUP: FUND SECONDARY ACCOUNT   ");
  console.log("=================================================");

  // 1. Resolve Primary Deployer Signer
  const signers = await ethers.getSigners();
  if (!signers || signers.length === 0) {
    throw new Error("No signer available. Ensure SEPOLIA_PRIVATE_KEY is set in .env");
  }
  const deployer = signers[0];
  console.log(`Deployer (Approver / Funder): ${deployer.address}`);

  const deployerBalanceBefore = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer Balance:            ${ethers.formatEther(deployerBalanceBefore)} ETH`);

  // 2. Resolve Recipient (Member / Submitter) Address
  let recipient = process.argv[2];
  if (!recipient || !ethers.isAddress(recipient)) {
    if (process.env.APPROVER_2_ADDRESS && ethers.isAddress(process.env.APPROVER_2_ADDRESS.trim())) {
      recipient = process.env.APPROVER_2_ADDRESS.trim();
    } else if (process.env.APPROVER_2_PRIVATE_KEY) {
      const cleanKey = process.env.APPROVER_2_PRIVATE_KEY.trim().replace(/^0x/, "");
      if (cleanKey.length === 64) {
        const wallet = new ethers.Wallet("0x" + cleanKey);
        recipient = wallet.address;
      }
    }
  }

  if (!recipient || !ethers.isAddress(recipient)) {
    throw new Error(
      "Recipient address not specified or invalid. Set APPROVER_2_ADDRESS or APPROVER_2_PRIVATE_KEY in .env, or pass as argument: node scripts/fundAccount.cjs <0xAddress>"
    );
  }

  const checksumRecipient = ethers.getAddress(recipient);
  console.log(`Member (Recipient / Maker):  ${checksumRecipient}`);

  const recipientBalanceBefore = await ethers.provider.getBalance(checksumRecipient);
  console.log(`Recipient Balance Before:    ${ethers.formatEther(recipientBalanceBefore)} ETH`);

  // 3. Amount to send (default 0.01 SepoliaETH)
  const amountInEth = process.argv[3] || "0.01";
  const amountWei = ethers.parseEther(amountInEth);

  if (deployerBalanceBefore < amountWei) {
    throw new Error(
      `Insufficient deployer funds. Balance: ${ethers.formatEther(deployerBalanceBefore)} ETH, Attempted to send: ${amountInEth} ETH`
    );
  }

  console.log(`\n⏳ Sending ${amountInEth} SepoliaETH to ${checksumRecipient}...`);
  const tx = await deployer.sendTransaction({
    to: checksumRecipient,
    value: amountWei
  });

  console.log(`Transaction broadcasted. Hash: ${tx.hash}`);
  console.log("Waiting for block confirmation on Sepolia...");
  const receipt = await tx.wait(1);

  const recipientBalanceAfter = await ethers.provider.getBalance(checksumRecipient);
  console.log("\nTransfer Confirmed!");
  console.log(`Block Number:            ${receipt.blockNumber}`);
  console.log(`Gas Used:                ${receipt.gasUsed.toString()}`);
  console.log(`Recipient Balance After: ${ethers.formatEther(recipientBalanceAfter)} ETH`);
  console.log(`Sepolia Etherscan URL:   https://sepolia.etherscan.io/tx/${tx.hash}`);
  console.log("=================================================");
  console.log("Next step: Run 'npx hardhat run scripts/submitExpense.cjs --network sepolia'");
  console.log("to submit an expense proposal using the funded Member account.\n");
}

main().catch((error) => {
  console.error("\n❌ Funding Failed:", error.message || error);
  process.exit(1);
});
