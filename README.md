# 🎓 Blockchain-Based College Club Expense Tracker

> **Academic Mini-Project (20-Mark Demonstration)**  
> An immutable, transparent accounting ledger for college student clubs powered by **Ethereum Sepolia**, **Solidity**, **Ethers.js**, **Supabase PostgreSQL**, and **Vercel Serverless Functions**.

---

## 📌 Executive Summary & Architecture

In traditional college student clubs, budget tracking is often maintained on error-prone spreadsheets or centralized databases where records can be secretly modified or deleted.

This project solves that problem by introducing **dual-layer accounting**:
1. **Authoritative Blockchain Ledger (Ethereum Sepolia):** The smart contract enforces immutable budget calculations, strict role permissions, and permanent audit trails. All amounts are accounted using integer **paise** (1 INR = 100 paise) to prevent floating-point inaccuracies.
2. **High-Performance Database Mirror (Supabase PostgreSQL):** Acts as a searchable, fast query index for UI searching and filtering. Anonymous users have **read-only (`SELECT`)** access enforced by PostgreSQL **Row Level Security (RLS)**.
3. **Verified Serverless Sync Bridge (`/api/sync` on Vercel):** The serverless backend reads the authoritative event and state directly from the Ethereum Sepolia contract before writing to Supabase using the private server-side `SUPABASE_SERVICE_ROLE_KEY`.

```
                  +----------------------------------------------+
                  |         Vanilla JS Frontend (Browser)        |
                  |     - ethers.js v6                           |
                  |     - MetaMask Wallet Connection             |
                  +----------------------+-----------------------+
                                         |
                  +----------------------+-----------------------+
                  |                                              |
      (1) User signs tx                             (3) Sync request with txHash
                  |                                              |
                  v                                              v
      +------------------------+                     +------------------------+
      |    Ethereum Sepolia    |                     |   Vercel Serverless    |
      |     Smart Contract     | <================== |       /api/sync        |
      | (ClubExpenseTracker.sol)|  (4) Verify receipt |  - Node.js runtime     |
      |   * Authoritative *    |      & on-chain state|  - Reads RPC directly  |
      +------------------------+                     +-----------+------------+
                                                                 |
                                                    (5) Idempotent upsert
                                                        (Service Role)
                                                                 |
                                                                 v
                                                     +------------------------+
                                                     |  Supabase PostgreSQL   |
                                                     |   (Searchable Mirror)  |
                                                     |   * RLS: Public Read * |
                                                     +------------------------+
```

---

## 📂 Project Structure

```
Blockchain-Based College Club Expense Tracker/
├── contracts/
│   └── ClubExpenseTracker.sol      # Core Solidity smart contract (paise accounting, guards)
├── test/
│   └── ClubExpenseTracker.test.js  # 21 automated unit tests covering all edge cases
├── scripts/
│   └── deploy.js                   # Deployment script (exports address & ABI to frontend)
├── public/
│   ├── index.html                  # Responsive one-page UI (cards, forms, ledger table)
│   ├── style.css                   # Student-project styling, status badges, progress bar
│   ├── app.js                      # Web3 connection, MetaMask events, dynamic rendering
│   ├── contract-config.json        # Contract address and network metadata
│   └── contract-abi.json           # Contract interface for client-side interactions
├── api/
│   ├── sync.js                     # Serverless endpoint verifying chain transactions & updating DB
│   └── expenses.js                 # Helper endpoint to query mirrored database records
├── supabase/
│   └── schema.sql                  # PostgreSQL schema, indexes, and Row Level Security (RLS)
├── hardhat.config.js               # Hardhat compilation and Sepolia network setup
├── vercel.json                     # Routing configuration for static frontend and serverless API
├── .env.example                    # Environment variable template (no sensitive keys)
├── .gitignore                      # Git ignore rules for keys, node_modules, cache
└── README.md                       # Comprehensive guide and viva defense notes
```

---

## 🚀 Step-by-Step Setup Guide

### 1. Prerequisites
- **Node.js** (v18, v20, or v22 recommended)
- **MetaMask Browser Extension** installed on your browser
- A free **Supabase** account ([supabase.com](https://supabase.com))
- Free **Sepolia Testnet ETH** (obtainable from [Sepolia PoW Faucet](https://sepolia-faucet.pk910.de/) or [Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia))

---

### 2. Install Dependencies & Run Tests

Open your terminal in the project directory:

```bash
npm install
```

Run the automated test suite:

```bash
npm test
```

> **Test Suite Output:** 21 passing tests verifying valid submissions, zero-amount rejection, unauthorized approval, self-approval prevention, budget calculations, and budget overflow protection.

---

### 3. Smart Contract Deployment

#### Option A: Deploy to Ethereum Sepolia Testnet (For Final Submission)

1. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```
2. In `.env`, fill in:
   - `SEPOLIA_RPC_URL` (Use `https://ethereum-sepolia-rpc.publicnode.com` or your Alchemy/Infura URL)
   - `SEPOLIA_PRIVATE_KEY` (Your test wallet's private key with Sepolia ETH — **never use a mainnet wallet!**)
   - `INITIAL_BUDGET_PAISE=1000000` (₹10,000 = 1,000,000 paise)
3. Deploy the contract:
   ```bash
   npm run deploy:sepolia
   ```
4. The deployment script will automatically print the deployed contract address and update `public/contract-config.json` and `public/contract-abi.json`.

#### Option B: Deploy Locally (For Fast Local Testing)

In terminal 1, start the local Hardhat node:
```bash
npx hardhat node
```
In terminal 2, deploy to localhost:
```bash
npm run deploy:local
```

---

### 4. Supabase Database Setup

1. Log in to [Supabase](https://supabase.com) and click **New Project**.
2. Go to the **SQL Editor** tab in your Supabase dashboard.
3. Open the file [`supabase/schema.sql`](supabase/schema.sql), copy its entire content, paste it into the Supabase SQL Editor, and click **Run**.
4. This creates:
   - The `expenses` table with computed `amount_inr` and indexes.
   - The `sync_logs` table for audit tracking.
   - **Row Level Security (RLS)** policies granting public `SELECT` and restricting `INSERT`/`UPDATE` to the serverless `service_role`.
5. Retrieve your project credentials from **Project Settings -> API**:
   - `Project URL` (e.g., `https://xyzcompany.supabase.co`)
   - `anon public key` (used on frontend)
   - `service_role secret key` (used in serverless backend `/api/sync`)
6. Add these to your `.env` file.

---

### 5. Running the Frontend Locally

You can serve the frontend using any static HTTP server:

```bash
npx serve public
# or
python -m http.server 3000 -d public
```

Open `http://localhost:3000` in your browser with MetaMask installed.

---

## 🌐 Vercel Deployment Instructions

1. Push your repository to your personal GitHub account (see Git commands below).
2. Log in to [Vercel](https://vercel.com) and click **"Add New Project"** -> **"Import Git Repository"**.
3. Select your repository.
4. Set the **Framework Preset** to **"Other"**.
5. In **Environment Variables**, add the following keys:
   - `CONTRACT_ADDRESS`: The deployed Sepolia contract address (e.g., `0x...`)
   - `SEPOLIA_RPC_URL`: `https://ethereum-sepolia-rpc.publicnode.com`
   - `SUPABASE_URL`: Your Supabase Project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service_role secret key
6. Click **Deploy**.
7. Once deployed, Vercel will provide a live production URL (e.g., `https://college-club-expense-tracker.vercel.app`).

---

## 🐙 Git Setup & Push Instructions

Follow these exact commands to prepare and push the project to your GitHub account:

```bash
# 1. Initialize git repository
git init

# 2. Check status (verify that .env, node_modules, and cache are excluded)
git status

# 3. Stage all source files
git add .

# 4. Make initial commit
git commit -m "feat: complete blockchain-based college club expense tracker mini-project"

# 5. Set main branch
git branch -M main

# 6. Link to your personal GitHub repository (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git

# 7. Push code to GitHub
git push -u origin main
```

---

## 🎬 20-Mark Demonstration Walkthrough Script

Use this script during your practical exam / viva demonstration:

### Step 1: Initial Setup
- **Club:** College Robotics Club
- **Initial Budget:** ₹10,000 (1,000,000 paise)
- **Two MetaMask Wallets:**
  - **Wallet A (Approver):** The account that deployed the contract (Faculty / Club President).
  - **Wallet B (Member):** Any other student wallet with a few Sepolia testnet ETH.

### Step 2: Member Wallet Submits Demo Expense (₹500)
1. In MetaMask, switch to **Wallet B (Member)**.
2. Notice the UI displays: `Role: Club Member`.
3. Fill out the expense form:
   - **Amount:** `500` (UI shows helper: *Equivalent: 50,000 paise*).
   - **Purpose:** `Arduino Uno & Sensors Kit for Workshop`.
4. Click **"Submit to Blockchain"** and confirm the transaction in MetaMask.
5. Once confirmed:
   - The table displays expense **#1** with status **Pending ⏳**.
   - **Key Viva Point to Highlight:** Notice that the **Total Approved Expenditure is still ₹0.00** and the **Remaining Budget is still ₹10,000.00**. Pending expenses do *not* consume the budget until authorized!
   - Notice the Action column for Wallet B shows *"Approver only"* (disabled buttons).

### Step 3: Self-Approval Prevention Demonstration
1. Switch MetaMask to **Wallet A (Approver)**.
2. In the form, submit an expense from Wallet A:
   - **Amount:** `200`
   - **Purpose:** `Faculty mentor local conveyance`.
3. Once mined as expense **#2**, look at the Action column:
   - It displays: **"Self-submission (Cannot self-approve)"**.
   - **Key Viva Point to Highlight:** The smart contract explicitly checks `msg.sender != exp.submitter` to prevent approvers from approving their own financial claims!

### Step 4: Approver Approves the Member's Expense
1. As **Wallet A (Approver)**, locate expense **#1** submitted by Member B.
2. Click the green **"Approve"** button and confirm in MetaMask.
3. Once mined:
   - Status updates to **Approved ✅**.
   - Budget Cards immediately update:
     - **Approved Expenditure:** ₹500.00 (50,000 paise)
     - **Remaining Available Budget:** ₹9,500.00 (950,000 paise)
     - **Progress Bar:** 5.0% Used.
   - The `/api/sync` serverless endpoint verifies the transaction and updates Supabase.

### Step 5: Budget Over-Approval Guard Demonstration
1. Switch back to **Wallet B (Member)**.
2. Propose an expense exceeding the remaining budget:
   - **Amount:** `12000` (₹12,000 exceeds ₹9,500).
   - **Purpose:** `Industrial Robotic Arm`.
3. Switch to Approver Wallet A.
4. The "Approve" button is automatically disabled with tooltip: *"Amount exceeds remaining budget"*.
5. Click **"Reject"** instead:
   - Status transitions to **Rejected ❌**.
   - Remaining budget remains unchanged at ₹9,500.00.

---

## 🎓 Viva Q&A & Technical Defense Guide

| Question | Examiner's Expectation | Recommended Answer |
| :--- | :--- | :--- |
| **Why use integer paise instead of Ether or float INR?** | Precision & Accounting distinction | "Solidity does not support floating-point arithmetic. To represent Indian Rupees without rounding errors, we account in integer paise ($1\text{ INR} = 100\text{ paise}$). Furthermore, these are purely accounting values for auditability, not cryptocurrency transfers or reimbursements." |
| **Why have both a Blockchain and Supabase PostgreSQL?** | Separation of concerns (State vs Search) | "The blockchain is the single authoritative source of truth. However, querying, filtering, and searching data on public RPCs is slow and costly. Supabase acts as a read-optimized query mirror. Even if Supabase went down, the blockchain ledger remains completely intact and recoverable." |
| **How do you prevent malicious clients from inserting fake data into Supabase?** | Access control & RLS | "Supabase Row Level Security (RLS) is configured with `SELECT-only` policies for anonymous users. Inserts and updates can only be executed by the backend serverless `/api/sync` function using the secret `SUPABASE_SERVICE_ROLE_KEY` after verifying the transaction receipt and on-chain contract state." |
| **How is self-approval prevented?** | Smart contract modifier / guard | "In `ClubExpenseTracker.sol`, the `approveExpense()` function includes `require(exp.submitter != approver)`. If an approver submits an expense, they cannot approve it, preventing financial conflicts of interest." |
| **What happens if a database sync fails?** | Idempotency & Fault Isolation | "The frontend and serverless bridge clearly isolate blockchain confirmation from database sync. If the network drops during DB sync, the transaction is already safely on the Ethereum ledger. The `/api/sync` endpoint is idempotent using PostgreSQL `upsert (on conflict do update)`, allowing safe retries." |

---

## 🔒 Security & Privacy Notice
- **Public Blockchain:** All transactions, addresses, and purposes stored on Ethereum Sepolia are publicly visible. Users must enter only fictional academic demo data.
- **Private Keys:** Never commit `.env` files or share wallet private keys.
- **No Cryptocurrency Transfers:** This project is strictly an accounting system; no real money or cryptocurrency is transferred or staked.

