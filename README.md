# 🎓 Blockchain-Based College Club Expense Tracker

> An immutable, transparent accounting ledger for college student clubs powered by **Ethereum Sepolia**, **Solidity**, **Ethers.js v6**, **Supabase PostgreSQL**, and **Vercel Serverless Functions**.

---

## 📌 Live Deployed Contract (Ethereum Sepolia)

| Parameter | Value |
| :--- | :--- |
| **Network** | Ethereum Sepolia Testnet (Chain ID: `11155111`) |
| **Contract Address** | [`0x96a9d4B3eD9ca573c53bb7066437D0278133DB12`](https://sepolia.etherscan.io/address/0x96a9d4B3eD9ca573c53bb7066437D0278133DB12) |
| **Contract Approver** | `0x39FC53B8827AaE4aEF84Fd925d8B65952c88273E` |
| **Initial Club Budget** | ₹10,000.00 (`1,000,000` integer paise) |
| **Public Sepolia RPC** | `https://ethereum-sepolia-rpc.publicnode.com` |

---

## 🏛️ System Architecture

Traditional club expense tracking relies on error-prone spreadsheets or centralized databases where balances and receipts can be edited or deleted. This dApp provides **verifiable, audit-proof accounting** through a **Three-Lane Decoupled Architecture**:

```
+----------------------------------------------------------------------------------------------------+
|                                    VANILLA JS CLIENT (BROWSER)                                     |
+---------------------------------+----------------------------------+-------------------------------+
                                  |                                  |
              [LANE 1: READ-ONLY] |              [LANE 2: WRITE OPS] |           [LANE 3: DB SYNC]
           Immediate On Page Load |           User Clicks Submit/Act |      Post-Confirmation Trigger
                                  |                                  |                               |
                                  v                                  v                               v
           +------------------------------+   +------------------------------+   +-----------------------+
           | Public Sepolia JSON-RPC      |   | MetaMask Web3 Provider       |   | Vercel Serverless     |
           | (ethereum-sepolia-rpc...)    |   | (or Private-Key Fallback)    |   | /api/sync Endpoint    |
           +--------------+---------------+   +--------------+---------------+   +-----------+-----------+
                          |                                  |                               |
                          | (Queries Summary & Expenses)     | (Signs & Broadcasts Tx)       | (Validates Tx Receipt
                          v                                  v                               |  & Contract State)
           +-----------------------------------------------------------------+               |
           |                      ETHEREUM SEPOLIA BLOCKCHAIN                | <-------------+
           |                 ClubExpenseTracker.sol Smart Contract           |
           |                      * Authoritative Truth *                    |
           +-----------------------------------------------------------------+
                                                                                             |
                                                                             (Idempotent     |
                                                                              Service Role)  v
                                                                             +-----------------------+
                                                                             | Supabase PostgreSQL   |
                                                                             | Searchable Read Mirror|
                                                                             | * RLS: SELECT-Only *  |
                                                                             +-----------------------+
```

### The Three Architectural Lanes:

1. **Lane 1: Public Sepolia RPC Read-Only Provider (Page Load)**
   - On `DOMContentLoaded`, the frontend initializes an `ethers.JsonRpcProvider` with `https://ethereum-sepolia-rpc.publicnode.com`.
   - Immediately queries `getClubSummary()` and `getAllExpenses()` without touching MetaMask.
   - **Key Benefit:** Any visitor (even without MetaMask installed or on a different network) sees the live budget cards, progress bar, and complete expense ledger instantly with **zero popups, zero connection errors, and zero network mismatch warnings**.

2. **Lane 2: Explicit User-Gated Write Lane (MetaMask & Fallback Signer)**
   - MetaMask is invoked **strictly upon user action**: clicking *"Submit to Blockchain"*, *"Approve"*, *"Reject"*, or *"Connect Wallet"*.
   - Automatically detects network and prompts switching to Sepolia (Chain ID `11155111`) only when a transaction is about to be sent.
   - Includes a fallback browser prompt for Sepolia private-key signing (for headless demo environments or testing without MetaMask).

3. **Lane 3: Verified Serverless Sync Engine (`/api/sync` on Vercel)**
   - After an on-chain transaction confirms, the frontend passes `{ txHash, expenseId, action }` to `/api/sync`.
   - The serverless backend queries the Sepolia RPC to independently verify that `receipt.status === 1` and reads the authoritative state directly from the smart contract (`getExpense(id)`).
   - Idempotently upserts the verified record into Supabase PostgreSQL using the server-side `SUPABASE_SERVICE_ROLE_KEY`.

---

## 📂 Project Structure

```
Blockchain-Based College Club Expense Tracker/
├── contracts/
│   └── ClubExpenseTracker.sol      # Solidity smart contract (paise accounting, role guards)
├── test/
│   └── ClubExpenseTracker.test.js  # 21 automated unit tests covering all edge cases
├── scripts/
│   └── deploy.js                   # Deployment script (exports address & ABI to frontend)
├── public/
│   ├── index.html                  # Responsive one-page UI (cards, form, ledger table)
│   ├── style.css                   # Modern CSS design, status badges, progress bar
│   ├── app.js                      # Dual-provider Web3 logic, MetaMask events, table rendering
│   ├── contract-config.json        # Contract address, RPC URL, and network configuration
│   └── contract-abi.json           # Compiled contract interface for frontend interaction
├── api/
│   ├── sync.js                     # Serverless function verifying on-chain events & updating DB
│   └── expenses.js                 # Helper endpoint to query mirrored database records
├── supabase/
│   └── schema.sql                  # PostgreSQL schema, indexes, and Row Level Security (RLS)
├── hardhat.config.js               # Hardhat compilation and Sepolia network setup
├── vercel.json                     # Routing configuration for static frontend and serverless API
├── .env.example                    # Environment variable template (no sensitive keys)
├── .gitignore                      # Git ignore rules for keys, node_modules, cache
└── README.md                       # Comprehensive documentation and viva notes
```

---

## 🚀 Step-by-Step Setup Guide

### 1. Prerequisites
- **Node.js** (v18, v20, or v22)
- **MetaMask Browser Extension**
- A free **Supabase** account ([supabase.com](https://supabase.com))
- Free **Sepolia Testnet ETH** (from [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/) or [Google Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia))

---

### 2. Install Dependencies & Run Automated Tests

Install dependencies:
```bash
npm install
```

Run the Hardhat unit test suite:
```bash
npm test
```

> **Test Results:** **21/21 passing tests** covering valid submissions, zero-amount rejection, unauthorized approval/rejection, self-approval prevention, budget calculations, budget overflow protection, and duplicate decision prevention.

---

### 3. Smart Contract Deployment

The smart contract is already deployed to Sepolia at [`0x96a9d4B3eD9ca573c53bb7066437D0278133DB12`](https://sepolia.etherscan.io/address/0x96a9d4B3eD9ca573c53bb7066437D0278133DB12).

If you want to redeploy your own contract instance:
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your test wallet's `SEPOLIA_PRIVATE_KEY` and set `INITIAL_BUDGET_PAISE=1000000` (₹10,000 = 1,000,000 paise).
3. Run the deployment script:
   ```bash
   npm run deploy:sepolia
   ```
   *(The script deploys to Sepolia, writes `public/contract-config.json`, and exports `public/contract-abi.json` automatically).*

---

### 4. Supabase Database Mirror Setup

1. Log in to [Supabase](https://supabase.com) and create a project.
2. In the **SQL Editor**, paste and run the contents of [`supabase/schema.sql`](supabase/schema.sql).
3. This creates:
   - The `expenses` table with computed `amount_inr` and query indexes.
   - The `sync_logs` table for audit tracking.
   - **Row Level Security (RLS)** granting public `SELECT-only` access while restricting writes exclusively to the backend service role.
4. From **Project Settings -> API**, copy your `Project URL`, `anon public key`, and `service_role secret key` into your `.env` file.

---

### 5. Running the Frontend Locally

Serve the `public/` directory using any static web server:

```bash
npx serve public
# or
python -m http.server 3000 -d public
```

Open `http://localhost:3000` in your browser. All budget cards and existing expenses will populate instantly via the public Sepolia RPC.

---

## 🌐 Vercel Deployment Instructions

1. Push your repository to GitHub.
2. In [Vercel](https://vercel.com), click **"Add New Project"** -> **"Import Git Repository"**.
3. Under **Environment Variables**, configure:
   - `CONTRACT_ADDRESS`: `0x96a9d4B3eD9ca573c53bb7066437D0278133DB12`
   - `SEPOLIA_RPC_URL`: `https://ethereum-sepolia-rpc.publicnode.com`
   - `SUPABASE_URL`: Your Supabase Project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service_role secret key
4. Click **Deploy**. Vercel will host your static frontend and serverless API at a live `.vercel.app` URL.

---

## 🎬 Demonstration Walkthrough Script (For Viva & Presentation)

Use this step-by-step scenario to demonstrate the application:

### Scenario Setup
- **Club:** College Tech Club
- **Initial Budget:** ₹10,000.00 (1,000,000 paise)
- **Approver Wallet (Wallet A):** `0x39FC53B8827AaE4aEF84Fd925d8B65952c88273E` (Deployer)
- **Member Wallet (Wallet B):** Any other student wallet with Sepolia ETH

```
Step 1: Open Application (Read-Only Mode)
  ├── Page loads instantly without any MetaMask popups.
  ├── Budget Cards show:
  │     Total Budget: ₹10,000.00  |  Approved: ₹0.00  |  Remaining: ₹10,000.00
  └── Network badge displays "Sepolia (Public RPC)".

Step 2: Member Submits ₹500 Expense Proposal
  ├── In form, enter Amount: 500 (helper shows "Equivalent: 50,000 paise")
  ├── Enter Purpose: "Arduino Uno & Sensor Kit for Robotics Workshop"
  ├── Click "Submit to Blockchain"
  │     └── MetaMask opens for the first time, requesting connection & signature.
  └── Once mined:
        ├── Expense #1 appears with status "Pending ⏳"
        └── KEY VIVA POINT: Remaining budget is STILL ₹10,000.00!
            Pending expenses do not reduce available funds until approved.

Step 3: Self-Approval Prevention Demonstration
  ├── Switch MetaMask to Approver Wallet A (0x39FC...)
  ├── Submit an expense as Approver: ₹200 for "Faculty conveyance"
  └── Expense #2 appears with action: "Self-submission (Cannot self-approve)"
      └── KEY VIVA POINT: Approvers cannot approve their own financial claims.

Step 4: Approver Approves Member's ₹500 Expense
  ├── As Wallet A, click green "Approve" button on Expense #1 -> Sign in MetaMask
  └── Once mined:
        ├── Status updates to "Approved ✅"
        ├── Budget Cards immediately update:
        │     Approved Expenditure: ₹500.00 (50,000 paise)
        │     Remaining Available Budget: ₹9,500.00 (950,000 paise)
        │     Progress Bar: 5.0% Used
        └── Serverless endpoint /api/sync updates Supabase mirror with txHash.

Step 5: Budget Overflow Guard Demonstration
  ├── Member B proposes an expense of ₹12,000 (exceeds ₹9,500 remaining)
  ├── Approver A observes the "Approve" button is automatically disabled
  │   with note: "Amount exceeds remaining budget"
  └── Approver clicks "Reject" instead -> Status becomes "Rejected ❌"
      └── Remaining budget remains untouched at ₹9,500.00.
```

---

## 🎓 Viva Q&A & Technical Defense Guide

| Question | Examiner's Expectation | Recommended Answer |
| :--- | :--- | :--- |
| **Why decouple read operations to a public RPC rather than using MetaMask?** | UX optimization & Web3 best practices | "Querying `window.ethereum` on page load triggers invasive connection popups, throws warnings if the user is on another chain, and completely breaks the page if MetaMask is not installed. By routing read-only calls through a public Sepolia JSON-RPC provider, any visitor can inspect the live club budget immediately with zero popups, reserving MetaMask strictly for authorized write operations." |
| **Why use integer paise instead of Ether or float INR?** | Precision & Accounting distinction | "Solidity does not support floating-point arithmetic. To represent Indian Rupees without rounding errors, we account in integer paise ($1\text{ INR} = 100\text{ paise}$). Furthermore, these are purely accounting values for auditability, not cryptocurrency transfers or reimbursements." |
| **Why have both a Blockchain and Supabase PostgreSQL?** | Separation of concerns (State vs Search) | "The blockchain is the single authoritative source of truth. However, querying, filtering, and searching data on public RPCs is slow and costly. Supabase acts as a read-optimized query mirror. Even if Supabase went down, the blockchain ledger remains completely intact and recoverable." |
| **How do you prevent malicious clients from inserting fake data into Supabase?** | Access control & RLS | "Supabase Row Level Security (RLS) is configured with `SELECT-only` policies for anonymous users. Inserts and updates can only be executed by the backend serverless `/api/sync` function using the secret `SUPABASE_SERVICE_ROLE_KEY` after verifying the transaction receipt and on-chain contract state." |
| **How is self-approval prevented?** | Smart contract modifier / guard | "In `ClubExpenseTracker.sol`, the `approveExpense()` function includes `require(exp.submitter != approver)`. If an approver submits an expense, they cannot approve it, preventing financial conflicts of interest." |
| **What happens if a database sync fails?** | Idempotency & Fault Isolation | "The frontend and serverless bridge clearly isolate blockchain confirmation from database sync. If the network drops during DB sync, the transaction is already safely on the Ethereum ledger. The `/api/sync` endpoint is idempotent using PostgreSQL `upsert (on conflict do update)`, allowing safe retries." |

---

## 🔒 Security & Privacy Notice
- **Public Blockchain:** All transactions, addresses, and purposes stored on Ethereum Sepolia are publicly visible. Users must enter only fictional demo data.
- **Private Keys:** Never commit `.env` files or share wallet private keys.
- **No Cryptocurrency Transfers:** This project is strictly an accounting system; no real money or cryptocurrency is transferred or staked.
