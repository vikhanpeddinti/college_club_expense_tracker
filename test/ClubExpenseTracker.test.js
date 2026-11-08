import { expect } from "chai";
import hre from "hardhat";

describe("ClubExpenseTracker Smart Contract", function () {
  let tracker;
  let approver;
  let member1;
  let member2;
  const INITIAL_BUDGET_PAISE = 1000000n; // 10,000 INR = 1,000,000 paise
  const CLUB_NAME = "College Robotics Club";

  beforeEach(async function () {
    [approver, member1, member2] = await hre.ethers.getSigners();

    const TrackerFactory = await hre.ethers.getContractFactory("ClubExpenseTracker");
    tracker = await TrackerFactory.deploy(CLUB_NAME, INITIAL_BUDGET_PAISE);
    await tracker.waitForDeployment();
  });

  describe("1. Deployment & Initial State", function () {
    it("should set the deployer as approver and configure the initial budget", async function () {
      expect(await tracker.approver()).to.equal(approver.address);
      expect(await tracker.clubName()).to.equal(CLUB_NAME);
      expect(await tracker.initialBudget()).to.equal(INITIAL_BUDGET_PAISE);
      expect(await tracker.totalApprovedAmount()).to.equal(0n);
      expect(await tracker.getRemainingBudget()).to.equal(INITIAL_BUDGET_PAISE);
      expect(await tracker.expenseCount()).to.equal(0n);
    });

    it("should revert if initialized with zero budget", async function () {
      const TrackerFactory = await hre.ethers.getContractFactory("ClubExpenseTracker");
      await expect(
        TrackerFactory.deploy("Empty Club", 0n)
      ).to.be.revertedWith("Initial budget must be greater than zero");
    });
  });

  describe("2. Expense Submission", function () {
    it("should allow a member to submit a valid expense with positive amount and purpose", async function () {
      const amountPaise = 50000n; // ₹500
      const purpose = "Arduino Uno & Sensor Kit";

      const tx = await tracker.connect(member1).submitExpense(amountPaise, purpose);
      await expect(tx)
        .to.emit(tracker, "ExpenseSubmitted")
        .withArgs(1n, member1.address, amountPaise, purpose, (val) => val > 0n);

      expect(await tracker.expenseCount()).to.equal(1n);

      const exp = await tracker.getExpense(1n);
      expect(exp.id).to.equal(1n);
      expect(exp.submitter).to.equal(member1.address);
      expect(exp.amount).to.equal(amountPaise);
      expect(exp.purpose).to.equal(purpose);
      expect(exp.status).to.equal(0); // 0 = Pending
      expect(exp.decidedAt).to.equal(0n);
    });

    it("should revert if submitting with amount 0 (Invalid amount)", async function () {
      await expect(
        tracker.connect(member1).submitExpense(0n, "Free snacks")
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("should revert if purpose is empty", async function () {
      await expect(
        tracker.connect(member1).submitExpense(5000n, "")
      ).to.be.revertedWith("Purpose cannot be empty");
    });

    it("should revert if purpose exceeds 120 characters", async function () {
      const longPurpose = "A".repeat(121);
      await expect(
        tracker.connect(member1).submitExpense(5000n, longPurpose)
      ).to.be.revertedWith("Purpose cannot exceed 120 characters");
    });
  });

  describe("3. Authorization & Self-Approval Prevention", function () {
    beforeEach(async function () {
      // Member1 submits an expense of ₹500 (50,000 paise)
      await tracker.connect(member1).submitExpense(50000n, "Workshop printouts");
    });

    it("should revert if a non-approver tries to approve (Unauthorized approval)", async function () {
      await expect(
        tracker.connect(member2).approveExpense(1n)
      ).to.be.revertedWith("Only approver can perform this action");
    });

    it("should revert if a non-approver tries to reject (Unauthorized rejection)", async function () {
      await expect(
        tracker.connect(member2).rejectExpense(1n)
      ).to.be.revertedWith("Only approver can perform this action");
    });

    it("should prevent self-approval when the approver submits an expense", async function () {
      // Approver submits their own expense
      await tracker.connect(approver).submitExpense(20000n, "Lead travel reimbursement");
      const selfExpenseId = 2n;

      // Approver attempts to approve their own expense
      await expect(
        tracker.connect(approver).approveExpense(selfExpenseId)
      ).to.be.revertedWith("Approver cannot self-approve expenses");

      // Verify the expense remains Pending
      const exp = await tracker.getExpense(selfExpenseId);
      expect(exp.status).to.equal(0); // Pending
    });
  });

  describe("4. Expense Approval & Budget Calculations", function () {
    it("should successfully approve an expense and update total approved and remaining budget", async function () {
      const amountPaise = 50000n; // ₹500
      await tracker.connect(member1).submitExpense(amountPaise, "Cables & Breadboards");

      const remainingBefore = await tracker.getRemainingBudget();
      expect(remainingBefore).to.equal(INITIAL_BUDGET_PAISE);

      const tx = await tracker.connect(approver).approveExpense(1n);
      const expectedRemaining = INITIAL_BUDGET_PAISE - amountPaise; // 950,000 paise

      await expect(tx)
        .to.emit(tracker, "ExpenseApproved")
        .withArgs(1n, member1.address, amountPaise, expectedRemaining, (val) => val > 0n);

      const exp = await tracker.getExpense(1n);
      expect(exp.status).to.equal(1); // 1 = Approved
      expect(exp.decidedAt).to.be.gt(0n);

      expect(await tracker.totalApprovedAmount()).to.equal(amountPaise);
      expect(await tracker.getRemainingBudget()).to.equal(expectedRemaining);
    });

    it("should support multiple approvals and cumulative budget deductions", async function () {
      await tracker.connect(member1).submitExpense(200000n, "Raspberry Pi 4"); // ₹2,000
      await tracker.connect(member2).submitExpense(300000n, "Soldering Stations"); // ₹3,000

      await tracker.connect(approver).approveExpense(1n);
      await tracker.connect(approver).approveExpense(2n);

      expect(await tracker.totalApprovedAmount()).to.equal(500000n); // ₹5,000
      expect(await tracker.getRemainingBudget()).to.equal(500000n); // ₹5,000
    });
  });

  describe("5. Expense Rejection & Invariance of Budget", function () {
    it("should successfully reject an expense without reducing the remaining budget", async function () {
      const amountPaise = 40000n; // ₹400
      await tracker.connect(member1).submitExpense(amountPaise, "Unauthorized refreshments");

      const budgetBefore = await tracker.getRemainingBudget();

      const tx = await tracker.connect(approver).rejectExpense(1n);
      await expect(tx)
        .to.emit(tracker, "ExpenseRejected")
        .withArgs(1n, member1.address, amountPaise, (val) => val > 0n);

      const exp = await tracker.getExpense(1n);
      expect(exp.status).to.equal(2); // 2 = Rejected
      expect(exp.decidedAt).to.be.gt(0n);

      // Remaining budget and total approved must remain unchanged
      expect(await tracker.totalApprovedAmount()).to.equal(0n);
      expect(await tracker.getRemainingBudget()).to.equal(budgetBefore);
    });
  });

  describe("6. Duplicate Decisions Prevention", function () {
    beforeEach(async function () {
      await tracker.connect(member1).submitExpense(10000n, "Stickers");
      await tracker.connect(member1).submitExpense(15000n, "Badges");
    });

    it("should revert if attempting to re-approve an already approved expense", async function () {
      await tracker.connect(approver).approveExpense(1n);

      await expect(
        tracker.connect(approver).approveExpense(1n)
      ).to.be.revertedWith("Expense is already finalized");
    });

    it("should revert if attempting to reject an already approved expense", async function () {
      await tracker.connect(approver).approveExpense(1n);

      await expect(
        tracker.connect(approver).rejectExpense(1n)
      ).to.be.revertedWith("Expense is already finalized");
    });

    it("should revert if attempting to re-reject an already rejected expense", async function () {
      await tracker.connect(approver).rejectExpense(2n);

      await expect(
        tracker.connect(approver).rejectExpense(2n)
      ).to.be.revertedWith("Expense is already finalized");
    });

    it("should revert if attempting to approve an already rejected expense", async function () {
      await tracker.connect(approver).rejectExpense(2n);

      await expect(
        tracker.connect(approver).approveExpense(2n)
      ).to.be.revertedWith("Expense is already finalized");
    });
  });

  describe("7. Budget Limits & Over-Approval Prevention", function () {
    it("should revert if single expense exceeds total remaining budget", async function () {
      // Total budget is 1,000,000 paise (₹10,000). Member submits 1,000,100 paise (₹10,001).
      await tracker.connect(member1).submitExpense(1000100n, "High-end 3D Printer");

      await expect(
        tracker.connect(approver).approveExpense(1n)
      ).to.be.revertedWith("Expense amount exceeds remaining budget");
    });

    it("should revert if cumulative expenses exceed remaining budget", async function () {
      // First expense: ₹8,000 (800,000 paise)
      await tracker.connect(member1).submitExpense(800000n, "Projector");
      await tracker.connect(approver).approveExpense(1n);

      expect(await tracker.getRemainingBudget()).to.equal(200000n); // ₹2,000 left

      // Second expense: ₹3,000 (300,000 paise) -> Exceeds remaining ₹2,000
      await tracker.connect(member2).submitExpense(300000n, "Microcontroller Batch");

      await expect(
        tracker.connect(approver).approveExpense(2n)
      ).to.be.revertedWith("Expense amount exceeds remaining budget");
    });
  });

  describe("8. Non-Existent Expense & Helper Views", function () {
    it("should revert when querying, approving, or rejecting a non-existent expense", async function () {
      await expect(tracker.getExpense(999n)).to.be.revertedWith("Expense does not exist");
      await expect(tracker.connect(approver).approveExpense(999n)).to.be.revertedWith("Expense does not exist");
      await expect(tracker.connect(approver).rejectExpense(999n)).to.be.revertedWith("Expense does not exist");
    });

    it("should return the entire list of expenses via getAllExpenses", async function () {
      await tracker.connect(member1).submitExpense(10000n, "Item 1");
      await tracker.connect(member2).submitExpense(20000n, "Item 2");

      const all = await tracker.getAllExpenses();
      expect(all.length).to.equal(2);
      expect(all[0].purpose).to.equal("Item 1");
      expect(all[1].purpose).to.equal("Item 2");
    });

    it("should return accurate club summary from getClubSummary", async function () {
      await tracker.connect(member1).submitExpense(50000n, "Sensors");
      await tracker.connect(approver).approveExpense(1n);

      const summary = await tracker.getClubSummary();
      expect(summary._clubName).to.equal(CLUB_NAME);
      expect(summary._approver).to.equal(approver.address);
      expect(summary._initialBudget).to.equal(INITIAL_BUDGET_PAISE);
      expect(summary._totalApproved).to.equal(50000n);
      expect(summary._remainingBudget).to.equal(950000n);
      expect(summary._expenseCount).to.equal(1n);
    });
  });
});

