/**
 * Blockchain-Based College Club Expense Tracker
 * Frontend Client Application (Vanilla JavaScript + Ethers.js v6)
 *
 * ARCHITECTURE:
 * - Read-Only Operations (Page Load): Uses a public Sepolia JSON-RPC provider.
 *   Fetches club summary, budget, and expenses immediately without triggering
 *   unwanted MetaMask popups, connection dialogs, or network warnings.
 * - Write Operations (Submit / Approve / Reject): Triggered strictly on explicit
 *   user action, prompting MetaMask (or private-key fallback) only when needed.
 */

// Application State
const state = {
  readOnlyProvider: null,
  readOnlyContract: null,
  provider: null,
  signer: null,
  contract: null, // Write contract instance (with signer)
  userAddress: null,
  approverAddress: null,
  isApprover: false,
  chainId: null,
  config: null,
  abi: null,
  expenses: [],
  clubSummary: {
    name: "College Club",
    initialBudgetPaise: 0n,
    totalApprovedPaise: 0n,
    remainingBudgetPaise: 0n,
    expenseCount: 0n,
  },
  supabaseMirrorActive: false,
};

// Sepolia Network Configuration
const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
const LOCAL_CHAIN_ID = 31337;
const DEFAULT_SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// DOM Elements Cache
const elements = {};

document.addEventListener("DOMContentLoaded", async () => {
  cacheElements();
  bindEvents();
  await loadContractConfigAndABI();
  initReadOnlyContract();
  await checkDatabaseMirrorStatus();
  await fetchContractData(false); // Immediate read-only fetch via public RPC
  elements.submitExpenseBtn.disabled = false; // Ready for submission (triggers wallet on click)
  await checkExistingConnectionSilently(); // Silent check for already authorized wallets
});

function cacheElements() {
  elements.connectWalletBtn = document.getElementById("connectWalletBtn");
  elements.connectBtnText = document.getElementById("connectBtnText");
  elements.networkBadge = document.getElementById("networkBadge");
  elements.networkName = document.getElementById("networkName");
  elements.roleBadge = document.getElementById("roleBadge");
  elements.roleLabel = document.getElementById("roleLabel");
  elements.notificationBanner = document.getElementById("notificationBanner");
  elements.notifIcon = document.getElementById("notifIcon");
  elements.notifText = document.getElementById("notifText");
  elements.notifCloseBtn = document.getElementById("notifCloseBtn");
  elements.clubHeading = document.getElementById("clubHeading");
  elements.contractAddressDisplay = document.getElementById("contractAddressDisplay");
  elements.contractLinkContainer = document.getElementById("contractLinkContainer");
  elements.totalBudgetValue = document.getElementById("totalBudgetValue");
  elements.totalBudgetPaise = document.getElementById("totalBudgetPaise");
  elements.approvedBudgetValue = document.getElementById("approvedBudgetValue");
  elements.approvedBudgetPaise = document.getElementById("approvedBudgetPaise");
  elements.remainingBudgetValue = document.getElementById("remainingBudgetValue");
  elements.remainingBudgetPaise = document.getElementById("remainingBudgetPaise");
  elements.budgetProgressBar = document.getElementById("budgetProgressBar");
  elements.budgetPercentText = document.getElementById("budgetPercentText");
  elements.submitExpenseForm = document.getElementById("submitExpenseForm");
  elements.expenseAmount = document.getElementById("expenseAmount");
  elements.expensePurpose = document.getElementById("expensePurpose");
  elements.paiseHelper = document.getElementById("paiseHelper");
  elements.charCount = document.getElementById("charCount");
  elements.submitExpenseBtn = document.getElementById("submitExpenseBtn");
  elements.submitSpinner = document.getElementById("submitSpinner");
  elements.searchInput = document.getElementById("searchInput");
  elements.statusFilter = document.getElementById("statusFilter");
  elements.refreshBtn = document.getElementById("refreshBtn");
  elements.syncStatusBadge = document.getElementById("syncStatusBadge");
  elements.syncStatusText = document.getElementById("syncStatusText");
  elements.recordCountText = document.getElementById("recordCountText");
  elements.expenseTableBody = document.getElementById("expenseTableBody");
}

function bindEvents() {
  // Explicit wallet connection button
  elements.connectWalletBtn.addEventListener("click", async () => {
    await ensureWalletConnected();
  });

  elements.notifCloseBtn.addEventListener("click", hideNotification);

  // Real-time INR to paise conversion helper
  elements.expenseAmount.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      const paise = Math.round(val * 100);
      elements.paiseHelper.textContent = `Equivalent: ${paise.toLocaleString("en-IN")} paise (Accounting value)`;
    } else {
      elements.paiseHelper.textContent = "Equivalent: 0 paise";
    }
  });

  // Character counter for purpose input
  elements.expensePurpose.addEventListener("input", (e) => {
    elements.charCount.textContent = e.target.value.length;
  });

  // Form Submission
  elements.submitExpenseForm.addEventListener("submit", handleSubmitExpense);

  // Search & Filter
  elements.searchInput.addEventListener("input", renderExpenseTable);
  elements.statusFilter.addEventListener("change", renderExpenseTable);
  elements.refreshBtn.addEventListener("click", () => fetchContractData(true));
}

/**
 * 1. Load Contract Config and ABI
 */
async function loadContractConfigAndABI() {
  try {
    const configRes = await fetch("contract-config.json");
    if (configRes.ok) {
      state.config = await configRes.json();
      console.log("Loaded contract configuration:", state.config);
    }
  } catch (err) {
    console.warn("Could not load contract-config.json, using fallback", err);
  }

  try {
    const abiRes = await fetch("contract-abi.json");
    if (abiRes.ok) {
      state.abi = await abiRes.json();
      console.log("Loaded contract ABI");
    }
  } catch (err) {
    console.warn("Could not load contract-abi.json", err);
  }

  // Fallback default minimal ABI if file load fails
  if (!state.abi) {
    state.abi = [
      "function clubName() view returns (string)",
      "function approver() view returns (address)",
      "function initialBudget() view returns (uint256)",
      "function totalApprovedAmount() view returns (uint256)",
      "function expenseCount() view returns (uint256)",
      "function getRemainingBudget() view returns (uint256)",
      "function getClubSummary() view returns (string, address, uint256, uint256, uint256, uint256)",
      "function getExpense(uint256) view returns (tuple(uint256 id, address submitter, uint256 amount, string purpose, uint8 status, uint256 submittedAt, uint256 decidedAt))",
      "function getAllExpenses() view returns (tuple(uint256 id, address submitter, uint256 amount, string purpose, uint8 status, uint256 submittedAt, uint256 decidedAt)[])",
      "function submitExpense(uint256 _amountInPaise, string _purpose) returns (uint256)",
      "function approveExpense(uint256 _id)",
      "function rejectExpense(uint256 _id)",
      "event ExpenseSubmitted(uint256 indexed id, address indexed submitter, uint256 amount, string purpose, uint256 timestamp)",
      "event ExpenseApproved(uint256 indexed id, address indexed submitter, uint256 amount, uint256 remainingBudget, uint256 timestamp)",
      "event ExpenseRejected(uint256 indexed id, address indexed submitter, uint256 amount, uint256 timestamp)",
    ];
  }

  // Update UI with contract address
  const addr = state.config?.contractAddress || "Not configured yet";
  elements.contractAddressDisplay.textContent = `Contract: ${formatAddress(addr, 6)}`;
  elements.contractAddressDisplay.title = addr;

  if (state.config?.contractAddress && state.config.contractAddress.startsWith("0x")) {
    elements.contractLinkContainer.innerHTML = `
      <a href="https://sepolia.etherscan.io/address/${state.config.contractAddress}" target="_blank" rel="noopener noreferrer">
        View Contract on Sepolia Etherscan ↗
      </a>
    `;
  }
}

/**
 * 2. Public Sepolia RPC Read-Only Contract Initialization
 * Completely decoupled from MetaMask - executes silently on page load.
 */
function getRpcUrl() {
  return state.config?.rpcUrl || DEFAULT_SEPOLIA_RPC;
}

function initReadOnlyContract() {
  if (!state.config?.contractAddress || state.config.contractAddress === "0x0000000000000000000000000000000000000000") {
    console.warn("Contract address not configured yet.");
    return false;
  }

  try {
    const rpcUrl = getRpcUrl();
    state.readOnlyProvider = new ethers.JsonRpcProvider(rpcUrl);
    state.readOnlyContract = new ethers.Contract(state.config.contractAddress, state.abi, state.readOnlyProvider);

    // Initial badge reflects Sepolia public RPC status
    updateNetworkDisplay("Sepolia (Public RPC)", true);
    return true;
  } catch (err) {
    console.error("Failed to initialize public read-only RPC provider:", err);
    return false;
  }
}

/**
 * 3. Check Supabase Database Mirror Status via /api/sync
 */
async function checkDatabaseMirrorStatus() {
  try {
    const res = await fetch("/api/sync");
    if (res.ok) {
      const data = await res.json();
      if (data.configured && data.configured.supabase) {
        state.supabaseMirrorActive = true;
        elements.syncStatusBadge.innerHTML = `<span class="sync-dot"></span><span>Database Mirror: Active (Supabase)</span>`;
        return;
      }
    }
  } catch (e) {
    // API endpoint might be running locally without serverless runner
  }
  state.supabaseMirrorActive = false;
  elements.syncStatusBadge.innerHTML = `<span class="sync-dot warning"></span><span>Direct Blockchain Mode (Authoritative Ledger)</span>`;
}

/**
 * 4. Fetch On-Chain Data (Authoritative)
 * Uses public RPC contract for non-intrusive reads, falls back to active contract.
 */
async function fetchContractData(showToast = false) {
  const targetContract = state.readOnlyContract || state.contract;
  if (!targetContract) {
    console.warn("Contract not initialized yet.");
    return;
  }

  try {
    if (showToast) showNotification("Fetching updated state from Ethereum Sepolia...", "pending");

    // Fetch club summary
    const summary = await targetContract.getClubSummary();
    state.clubSummary.name = summary[0];
    state.clubSummary.approver = summary[1];
    state.clubSummary.initialBudgetPaise = summary[2];
    state.clubSummary.totalApprovedPaise = summary[3];
    state.clubSummary.remainingBudgetPaise = summary[4];
    state.clubSummary.expenseCount = summary[5];

    state.approverAddress = summary[1];

    // Determine current user role if wallet connected
    checkUserRole();

    // Update Budget Overview Cards
    updateBudgetCards();

    // Fetch All Expenses from Smart Contract
    const rawExpenses = await targetContract.getAllExpenses();
    state.expenses = rawExpenses.map((e) => ({
      id: Number(e.id),
      submitter: e.submitter,
      amountPaise: BigInt(e.amount),
      amountINR: Number(e.amount) / 100,
      purpose: e.purpose,
      status: parseStatus(Number(e.status)),
      submittedAt: Number(e.submittedAt),
      decidedAt: Number(e.decidedAt),
    }));

    renderExpenseTable();

    if (showToast) showNotification("Blockchain data refreshed successfully!", "success");
  } catch (err) {
    console.error("Error fetching contract data:", err);
    if (showToast) showNotification(`Failed to query blockchain: ${err.message}`, "error");
  }
}

function checkUserRole() {
  if (state.userAddress && state.approverAddress) {
    state.isApprover = state.userAddress.toLowerCase() === state.approverAddress.toLowerCase();
    updateRoleDisplay(state.isApprover);
  } else {
    state.isApprover = false;
    elements.roleBadge.classList.add("hidden");
  }
}

function updateRoleDisplay(isApprover) {
  elements.roleBadge.classList.remove("hidden");
  if (isApprover) {
    elements.roleBadge.className = "badge badge-role approver";
    elements.roleLabel.textContent = "👑 Role: Approver (Club Faculty / Lead)";
  } else {
    elements.roleBadge.className = "badge badge-role";
    elements.roleLabel.textContent = "👥 Role: Club Member";
  }
}

function updateBudgetCards() {
  const initialPaise = state.clubSummary.initialBudgetPaise;
  const approvedPaise = state.clubSummary.totalApprovedPaise;
  const remainingPaise = state.clubSummary.remainingBudgetPaise;

  const initialINR = Number(initialPaise) / 100;
  const approvedINR = Number(approvedPaise) / 100;
  const remainingINR = Number(remainingPaise) / 100;

  elements.clubHeading.textContent = `${state.clubSummary.name} Budget Overview`;
  elements.totalBudgetValue.textContent = formatINR(initialINR);
  elements.totalBudgetPaise.textContent = `${initialPaise.toLocaleString("en-IN")} paise total`;

  elements.approvedBudgetValue.textContent = formatINR(approvedINR);
  elements.approvedBudgetPaise.textContent = `${approvedPaise.toLocaleString("en-IN")} paise spent`;

  elements.remainingBudgetValue.textContent = formatINR(remainingINR);
  elements.remainingBudgetPaise.textContent = `${remainingPaise.toLocaleString("en-IN")} paise remaining`;

  // Calculate percentage used
  let pct = 0;
  if (initialPaise > 0n) {
    pct = Number((approvedPaise * 100n) / initialPaise);
  }
  elements.budgetProgressBar.style.width = `${Math.min(pct, 100)}%`;
  elements.budgetPercentText.textContent = `${pct.toFixed(1)}% Used`;
}

/**
 * 5. Silent Wallet Check (Page Load)
 * Checks for already-authorized accounts without triggering any popups or warnings.
 */
async function checkExistingConnectionSilently() {
  if (typeof window.ethereum === "undefined") return;

  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts && accounts.length > 0) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Only adopt if already on Sepolia or local testnet
      if (chainId === SEPOLIA_CHAIN_ID || chainId === LOCAL_CHAIN_ID) {
        state.provider = provider;
        state.signer = await provider.getSigner();
        state.userAddress = accounts[0];
        state.chainId = chainId;

        window.connectedSigner = state.signer;
        window.userAddress = state.userAddress;

        if (state.config?.contractAddress) {
          state.contract = new ethers.Contract(state.config.contractAddress, state.abi, state.signer);
        }

        updateWalletDisplay(state.userAddress);
        updateNetworkBadge(state.chainId);
        checkUserRole();
        renderExpenseTable();
        setupWalletListeners();
      }
    }
  } catch (err) {
    // Intentionally suppressed: zero popups or errors on page load
    console.debug("Silent account check:", err);
  }
}

/**
 * 6. Explicit Wallet Connection (Write Operations Only)
 * Triggered strictly when user clicks Connect Wallet or clicks Submit/Approve/Reject.
 */
async function ensureWalletConnected() {
  if (state.signer && state.contract && state.userAddress) {
    return true;
  }

  // 1. Attempt MetaMask connection
  if (typeof window.ethereum !== "undefined") {
    try {
      showNotification("Connecting to MetaMask for write access...", "pending");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });

      if (accounts && accounts.length > 0) {
        state.provider = provider;
        state.signer = await provider.getSigner();
        state.userAddress = accounts[0];

        window.connectedSigner = state.signer;
        window.userAddress = state.userAddress;

        // Verify and switch to Sepolia if needed
        const network = await provider.getNetwork();
        let chainId = Number(network.chainId);
        state.chainId = chainId;

        if (chainId !== SEPOLIA_CHAIN_ID && chainId !== LOCAL_CHAIN_ID) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
            });
            const updatedNetwork = await provider.getNetwork();
            state.chainId = Number(updatedNetwork.chainId);
          } catch (switchError) {
            if (switchError.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [
                  {
                    chainId: SEPOLIA_CHAIN_ID_HEX,
                    chainName: "Ethereum Sepolia Testnet",
                    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                    rpcUrls: [getRpcUrl()],
                    blockExplorerUrls: ["https://sepolia.etherscan.io"],
                  },
                ],
              });
              const updatedNetwork = await provider.getNetwork();
              state.chainId = Number(updatedNetwork.chainId);
            } else {
              throw switchError;
            }
          }
        }

        updateWalletDisplay(state.userAddress);
        updateNetworkBadge(state.chainId);

        // Bind write contract instance
        if (state.config?.contractAddress) {
          state.contract = new ethers.Contract(state.config.contractAddress, state.abi, state.signer);
        }

        checkUserRole();
        renderExpenseTable();
        setupWalletListeners();

        showNotification(`Wallet connected: ${formatAddress(state.userAddress, 4)}`, "success");
        return true;
      }
    } catch (err) {
      console.warn("MetaMask connection failed or cancelled:", err);
      if (err.code === 4001) {
        showNotification("MetaMask connection request was cancelled.", "error");
        return false;
      }
    }
  }

  // 2. Fallback: prompt for Sepolia private key
  return await connectWithPrivateKeyFallback();
}

/**
 * Fallback: Connect via browser prompt for Sepolia private key
 */
async function connectWithPrivateKeyFallback() {
  const privateKey = prompt("MetaMask not found or connection failed. Please enter your Sepolia private key for write operations:");
  if (!privateKey || !privateKey.trim()) {
    showNotification("Wallet connection cancelled.", "pending");
    return false;
  }

  try {
    let formattedKey = privateKey.trim();
    if (!formattedKey.startsWith("0x")) {
      formattedKey = "0x" + formattedKey;
    }

    const rpcUrl = getRpcUrl();
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(formattedKey, provider);
    const address = await wallet.getAddress();

    // Assign to required window properties
    window.connectedSigner = wallet;
    window.userAddress = address;

    // Update application state
    state.provider = provider;
    state.signer = wallet;
    state.userAddress = address;
    state.chainId = SEPOLIA_CHAIN_ID;

    // Bind write contract instance
    if (state.config?.contractAddress) {
      state.contract = new ethers.Contract(state.config.contractAddress, state.abi, wallet);
    }

    updateWalletDisplay(address);
    updateNetworkBadge(SEPOLIA_CHAIN_ID);
    checkUserRole();
    renderExpenseTable();

    showNotification(`Connected with Sepolia wallet: ${formatAddress(address, 4)}`, "success");
    return true;
  } catch (error) {
    console.error("Private key connection error:", error);
    showNotification(`Failed to connect with private key: ${error.message}`, "error");
    return false;
  }
}

function setupWalletListeners() {
  if (!window._listenersBound && window.ethereum) {
    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", () => window.location.reload());
    window._listenersBound = true;
  }
}

function handleAccountsChanged(accounts) {
  if (accounts.length === 0) {
    state.userAddress = null;
    state.signer = null;
    state.contract = null;
    elements.connectBtnText.textContent = "Connect Wallet";
    elements.roleBadge.classList.add("hidden");
    checkUserRole();
    renderExpenseTable();
    updateNetworkDisplay("Sepolia (Public RPC)", true);
    showNotification("Wallet disconnected. Reverted to public read-only mode.", "pending");
  } else {
    state.userAddress = accounts[0];
    updateWalletDisplay(state.userAddress);
    if (state.provider) {
      state.provider.getSigner().then((signer) => {
        state.signer = signer;
        window.connectedSigner = signer;
        window.userAddress = state.userAddress;
        if (state.config?.contractAddress) {
          state.contract = new ethers.Contract(state.config.contractAddress, state.abi, signer);
        }
        checkUserRole();
        renderExpenseTable();
      });
    }
  }
}

function updateWalletDisplay(address) {
  elements.connectBtnText.textContent = formatAddress(address, 4);
  elements.connectWalletBtn.title = `Connected: ${address}`;
}

function updateNetworkBadge(chainId) {
  const dot = elements.networkBadge.querySelector(".status-dot");
  dot.className = "status-dot";

  if (chainId === SEPOLIA_CHAIN_ID) {
    elements.networkName.textContent = "Sepolia Testnet";
    dot.classList.add("active");
  } else if (chainId === LOCAL_CHAIN_ID) {
    elements.networkName.textContent = "Localhost Hardhat";
    dot.classList.add("active");
  } else {
    elements.networkName.textContent = `Unsupported Network (${chainId})`;
    dot.classList.add("danger");
  }
}

function updateNetworkDisplay(name, isActive) {
  elements.networkName.textContent = name;
  const dot = elements.networkBadge.querySelector(".status-dot");
  dot.className = `status-dot ${isActive ? "active" : ""}`;
}

/**
 * 7. Submit Expense to Blockchain
 * Strictly prompts wallet connection upon user submission.
 */
async function handleSubmitExpense(e) {
  e.preventDefault();

  const amountINR = parseFloat(elements.expenseAmount.value);
  const purpose = elements.expensePurpose.value.trim();

  if (isNaN(amountINR) || amountINR <= 0) {
    showNotification("Please enter a valid expense amount greater than 0.", "error");
    return;
  }

  if (!purpose) {
    showNotification("Please provide a short purpose for the expense.", "error");
    return;
  }

  if (purpose.length > 120) {
    showNotification("Purpose cannot exceed 120 characters.", "error");
    return;
  }

  // Ensure wallet is connected when user explicitly clicks submit
  if (!state.signer || !state.contract) {
    const connected = await ensureWalletConnected();
    if (!connected) {
      return;
    }
  }

  // Convert INR to integer paise
  const amountPaise = BigInt(Math.round(amountINR * 100));

  try {
    setSubmitting(true);
    showNotification("Broadcasting transaction to Ethereum Sepolia... Confirm in MetaMask.", "pending");

    const tx = await state.contract.submitExpense(amountPaise, purpose);
    showNotification(`Transaction submitted! Waiting for block confirmation... (Tx: ${formatAddress(tx.hash, 6)})`, "pending");

    const receipt = await tx.wait(1);

    // Find ExpenseSubmitted event to extract expense ID
    let newExpenseId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = state.contract.interface.parseLog(log);
        if (parsed && parsed.name === "ExpenseSubmitted") {
          newExpenseId = Number(parsed.args[0]);
          break;
        }
      } catch {
        // ignore other logs
      }
    }

    showNotification(
      `🎉 Expense #${newExpenseId || ""} successfully confirmed on-chain! Syncing database mirror...`,
      "success"
    );

    // Reset Form
    elements.submitExpenseForm.reset();
    elements.paiseHelper.textContent = "Equivalent: 0 paise";
    elements.charCount.textContent = "0";

    // Trigger Serverless Database Sync
    if (newExpenseId) {
      await triggerDatabaseSync(receipt.hash, newExpenseId, "SUBMIT");
    }

    // Refresh UI using public read-only RPC or active contract
    await fetchContractData();
  } catch (err) {
    console.error("Submission failed:", err);
    const reason = err.reason || err.shortMessage || err.message;
    showNotification(`Expense submission failed: ${reason}`, "error");
  } finally {
    setSubmitting(false);
  }
}

/**
 * 8. Approver Actions: Approve or Reject
 * Strictly prompts wallet connection upon user interaction.
 */
async function handleDecision(expenseId, action) {
  // Ensure wallet is connected when user clicks Approve or Reject
  if (!state.signer || !state.contract) {
    const connected = await ensureWalletConnected();
    if (!connected) {
      return;
    }
  }

  if (!state.isApprover) {
    showNotification("Unauthorized: Only the club approver can approve or reject expenses.", "error");
    return;
  }

  const isApprove = action === "APPROVE";
  const actionName = isApprove ? "Approval" : "Rejection";

  try {
    showNotification(`Sending ${actionName} transaction to Sepolia... Confirm in MetaMask.`, "pending");

    const tx = isApprove
      ? await state.contract.approveExpense(expenseId)
      : await state.contract.rejectExpense(expenseId);

    showNotification(`Transaction pending... (Tx: ${formatAddress(tx.hash, 6)})`, "pending");
    const receipt = await tx.wait(1);

    showNotification(`Expense #${expenseId} ${isApprove ? "Approved" : "Rejected"} on-chain! Syncing database mirror...`, "success");

    // Trigger serverless sync
    await triggerDatabaseSync(receipt.hash, expenseId, action);

    // Refresh state
    await fetchContractData();
  } catch (err) {
    console.error(`Decision error:`, err);
    const reason = err.reason || err.shortMessage || err.message;
    showNotification(`Failed to ${action.toLowerCase()} expense #${expenseId}: ${reason}`, "error");
  }
}

/**
 * 9. Serverless Database Sync Endpoint (/api/sync)
 */
async function triggerDatabaseSync(txHash, expenseId, action) {
  try {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHash,
        expenseId,
        action,
        contractAddress: state.config?.contractAddress,
        rpcUrl: getRpcUrl(),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("Database sync result:", data);
      if (data.databaseSynced) {
        showNotification(`Confirmed on-chain & Synced to Supabase database mirror!`, "success");
      } else {
        console.info("Blockchain confirmed, database sync message:", data.message);
      }
    } else {
      const errData = await response.json().catch(() => ({}));
      console.warn("Sync endpoint returned error:", errData);
      if (errData.txConfirmedOnChain) {
        showNotification(
          `Notice: Confirmed on-chain, but database sync returned: ${errData.error || "Retry available"}`,
          "pending"
        );
      }
    }
  } catch (err) {
    console.warn("Could not reach /api/sync:", err);
  }
}

/**
 * 10. Render Expense Table
 */
function renderExpenseTable() {
  const tbody = elements.expenseTableBody;
  const searchTerm = elements.searchInput.value.toLowerCase().trim();
  const filterStatus = elements.statusFilter.value;

  const filtered = state.expenses.filter((exp) => {
    // Status filter
    if (filterStatus !== "ALL" && exp.status !== filterStatus) {
      return false;
    }
    // Search term
    if (searchTerm) {
      const matchesPurpose = exp.purpose.toLowerCase().includes(searchTerm);
      const matchesSubmitter = exp.submitter.toLowerCase().includes(searchTerm);
      const matchesId = exp.id.toString() === searchTerm;
      return matchesPurpose || matchesSubmitter || matchesId;
    }
    return true;
  });

  elements.recordCountText.textContent = `${filtered.length} of ${state.expenses.length} expenses`;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">
          ${state.expenses.length === 0 ? "No expenses recorded on-chain yet. Propose the first expense above!" : "No expenses match the current filter/search criteria."}
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((exp) => {
      const isPending = exp.status === "Pending";
      const isApproved = exp.status === "Approved";
      const isRejected = exp.status === "Rejected";

      const isOwnExpense =
        state.userAddress &&
        exp.submitter.toLowerCase() === state.userAddress.toLowerCase();

      // Action column logic
      let actionsHtml = "";

      if (isPending) {
        if (!state.userAddress) {
          actionsHtml = `<span class="action-hint">Connect wallet to act</span>`;
        } else if (!state.isApprover) {
          actionsHtml = `<span class="action-hint">Approver only</span>`;
        } else if (isOwnExpense) {
          // Self-approval guard
          actionsHtml = `<span class="action-hint" title="Approvers cannot self-approve their own expenses">Self-submission (Cannot self-approve)</span>`;
        } else {
          // Can approve or reject
          const exceedsRemaining = exp.amountPaise > state.clubSummary.remainingBudgetPaise;
          actionsHtml = `
            <div class="action-buttons">
              <button
                class="btn btn-approve"
                onclick="window.handleDecision(${exp.id}, 'APPROVE')"
                ${exceedsRemaining ? 'disabled title="Amount exceeds remaining budget"' : 'title="Approve expense"'}
              >
                Approve
              </button>
              <button
                class="btn btn-reject"
                onclick="window.handleDecision(${exp.id}, 'REJECT')"
                title="Reject expense"
              >
                Reject
              </button>
            </div>
          `;
        }
      } else {
        // Finalized
        const decidedDate = exp.decidedAt > 0 ? new Date(exp.decidedAt * 1000).toLocaleDateString() : "";
        actionsHtml = `<span class="action-hint">Finalized ${decidedDate}</span>`;
      }

      // Status pill styling
      let statusClass = "status-pending";
      let statusIcon = "⏳";
      if (isApproved) {
        statusClass = "status-approved";
        statusIcon = "✅";
      } else if (isRejected) {
        statusClass = "status-rejected";
        statusIcon = "❌";
      }

      const dateStr = exp.submittedAt > 0 ? new Date(exp.submittedAt * 1000).toLocaleDateString() : "-";

      return `
        <tr>
          <td><strong>#${exp.id}</strong></td>
          <td>
            <span class="address-chip" title="${exp.submitter}">
              ${formatAddress(exp.submitter, 4)}
            </span>
            ${isOwnExpense ? '<span class="self-tag">You</span>' : ""}
          </td>
          <td>
            <strong>${formatINR(exp.amountINR)}</strong>
            <br>
            <small class="helper-text">${exp.amountPaise.toLocaleString("en-IN")} p</small>
          </td>
          <td>
            <div>${escapeHtml(exp.purpose)}</div>
            <small class="helper-text">${dateStr}</small>
          </td>
          <td>
            <span class="status-pill ${statusClass}">
              <span>${statusIcon}</span>
              <span>${exp.status}</span>
            </span>
          </td>
          <td>
            <span class="tx-link" title="Recorded on Ethereum Sepolia block">On-chain</span>
          </td>
          <td>
            ${actionsHtml}
          </td>
        </tr>
      `;
    })
    .join("");
}

// Expose handleDecision globally for table inline button handlers
window.handleDecision = handleDecision;

/**
 * 11. Utilities & Helpers
 */
function parseStatus(code) {
  switch (code) {
    case 0:
      return "Pending";
    case 1:
      return "Approved";
    case 2:
      return "Rejected";
    default:
      return "Unknown";
  }
}

function formatINR(val) {
  return "₹" + Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAddress(addr, chars = 4) {
  if (!addr || addr.length < 10) return addr || "";
  return `${addr.substring(0, chars + 2)}...${addr.substring(addr.length - chars)}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showNotification(msg, type = "pending") {
  elements.notificationBanner.className = `notification ${type}`;
  elements.notifText.textContent = msg;

  if (type === "success") elements.notifIcon.textContent = "✅";
  else if (type === "error") elements.notifIcon.textContent = "⚠️";
  else elements.notifIcon.textContent = "⏳";

  elements.notificationBanner.classList.remove("hidden");

  if (type === "success") {
    setTimeout(() => {
      elements.notificationBanner.classList.add("hidden");
    }, 6000);
  }
}

function hideNotification() {
  elements.notificationBanner.classList.add("hidden");
}

function setSubmitting(isSubmitting) {
  elements.submitExpenseBtn.disabled = isSubmitting;
  if (isSubmitting) {
    elements.submitSpinner.classList.remove("hidden");
  } else {
    elements.submitSpinner.classList.add("hidden");
  }
}
