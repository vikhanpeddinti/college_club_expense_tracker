import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

// Minimal contract ABI for on-chain state verification
const MINIMAL_ABI = [
  "function getExpense(uint256 _id) external view returns (tuple(uint256 id, address submitter, uint256 amount, string purpose, uint8 status, uint256 submittedAt, uint256 decidedAt))",
  "function expenseCount() external view returns (uint256)",
  "function approver() external view returns (address)",
  "function getRemainingBudget() external view returns (uint256)"
];

const STATUS_MAP = ["PENDING", "APPROVED", "REJECTED"];

export default async function handler(req, res) {
  // Set CORS headers for browser requests
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET: Health / Status check
  if (req.method === "GET") {
    const hasSupabase = Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const contractConfigured = Boolean(process.env.CONTRACT_ADDRESS);

    return res.status(200).json({
      status: "ok",
      service: "ClubExpenseTracker Sync Endpoint",
      configured: {
        supabase: hasSupabase,
        contract: contractConfigured,
        rpc: Boolean(process.env.SEPOLIA_RPC_URL)
      },
      message: hasSupabase
        ? "Supabase service-role configured and ready for verified syncs."
        : "Supabase service-role key not yet configured in environment variables. Running in direct on-chain mode."
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const { txHash, expenseId, action, contractAddress: reqContractAddress, rpcUrl: reqRpcUrl } = req.body || {};

  // 1. Input format validation
  if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x") || txHash.length !== 66) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing txHash. Must be a 66-character hex string starting with 0x."
    });
  }

  if (!expenseId || isNaN(parseInt(expenseId, 10)) || parseInt(expenseId, 10) <= 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing expenseId. Must be a positive integer."
    });
  }

  const numericExpenseId = parseInt(expenseId, 10);

  // 2. Resolve contract address & RPC endpoint
  const contractAddress =
    process.env.CONTRACT_ADDRESS ||
    reqContractAddress ||
    getContractAddressFromFile();

  if (!contractAddress || contractAddress === "0x0000000000000000000000000000000000000000") {
    return res.status(400).json({
      success: false,
      error: "Contract address is not configured. Deploy the contract or provide CONTRACT_ADDRESS."
    });
  }

  const rpcUrl =
    process.env.SEPOLIA_RPC_URL ||
    reqRpcUrl ||
    "https://ethereum-sepolia-rpc.publicnode.com";

  // 3. Verify on-chain transaction receipt & authoritative contract state
  let receipt;
  let onChainExpense;
  let provider;

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);

    // Fetch transaction receipt from the blockchain
    receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.status(404).json({
        success: false,
        txConfirmedOnChain: false,
        error: `Transaction ${txHash} not yet mined or not found on configured network (${rpcUrl}).`,
        retryable: true
      });
    }

    if (receipt.status !== 1) {
      return res.status(400).json({
        success: false,
        txConfirmedOnChain: false,
        error: `Transaction ${txHash} failed / reverted on-chain. Database will not record reverted transactions.`
      });
    }

    // Verify transaction destination matches contract
    if (receipt.to && receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        txConfirmedOnChain: true,
        error: `Transaction recipient (${receipt.to}) does not match configured tracker contract (${contractAddress}).`
      });
    }

    // Read AUTHORITATIVE expense details directly from the smart contract
    const contract = new ethers.Contract(contractAddress, MINIMAL_ABI, provider);
    const rawExpense = await contract.getExpense(numericExpenseId);

    onChainExpense = {
      id: Number(rawExpense.id),
      submitter: rawExpense.submitter.toLowerCase(),
      amount_paise: Number(rawExpense.amount),
      purpose: rawExpense.purpose,
      status: STATUS_MAP[Number(rawExpense.status)] || "PENDING",
      submitted_at: new Date(Number(rawExpense.submittedAt) * 1000).toISOString(),
      decided_at: Number(rawExpense.decidedAt) > 0 ? new Date(Number(rawExpense.decidedAt) * 1000).toISOString() : null
    };
  } catch (rpcErr) {
    return res.status(502).json({
      success: false,
      txConfirmedOnChain: false,
      error: `Failed to query blockchain RPC: ${rpcErr.message}`,
      retryable: true
    });
  }

  // 4. Verify Supabase configuration
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    // Transaction is verified on-chain, but Supabase is unconfigured in this environment
    return res.status(200).json({
      success: true,
      txConfirmedOnChain: true,
      databaseSynced: false,
      message: "Transaction verified on-chain! Supabase database sync skipped because SUPABASE_SERVICE_ROLE_KEY is not set in environment.",
      authoritativeOnChainRecord: onChainExpense
    });
  }

  // 5. Idempotent Upsert to Supabase PostgreSQL database
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Upsert into expenses table (keyed on id)
    const expensePayload = {
      id: onChainExpense.id,
      submitter: onChainExpense.submitter,
      amount_paise: onChainExpense.amount_paise,
      purpose: onChainExpense.purpose,
      status: onChainExpense.status,
      tx_hash: txHash,
      submitted_at: onChainExpense.submitted_at,
      decided_at: onChainExpense.decided_at,
      updated_at: new Date().toISOString()
    };

    if (action === "SUBMIT" || !onChainExpense.decided_at) {
      expensePayload.submitted_tx_hash = txHash;
    } else {
      expensePayload.decided_tx_hash = txHash;
    }

    const { data: upsertData, error: upsertError } = await supabase
      .from("expenses")
      .upsert(expensePayload, { onConflict: "id" })
      .select();

    if (upsertError) {
      throw upsertError;
    }

    // Record audit log
    await supabase.from("sync_logs").insert({
      tx_hash: txHash,
      expense_id: onChainExpense.id,
      action: action || onChainExpense.status,
      status: "SUCCESS",
      details: {
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : null,
        amount_paise: onChainExpense.amount_paise
      }
    });

    return res.status(200).json({
      success: true,
      txConfirmedOnChain: true,
      databaseSynced: true,
      expense: upsertData ? upsertData[0] : expensePayload,
      message: "Authoritative blockchain state verified and synced to Supabase database mirror."
    });
  } catch (dbErr) {
    // Crucial requirement: Clearly distinguish confirmed blockchain tx from failed DB sync
    console.error("Supabase sync error:", dbErr);
    return res.status(500).json({
      success: false,
      txConfirmedOnChain: true,
      databaseSynced: false,
      error: `Blockchain transaction is confirmed on-chain, but Supabase sync failed: ${dbErr.message}`,
      retryable: true,
      authoritativeOnChainRecord: onChainExpense
    });
  }
}

function getContractAddressFromFile() {
  try {
    const configPath = path.join(process.cwd(), "public", "contract-config.json");
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      return cfg.contractAddress;
    }
  } catch {
    // fallback
  }
  return null;
}

