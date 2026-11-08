// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ClubExpenseTracker
 * @notice Academic mini-project smart contract for tracking college club expenditures.
 * @dev All monetary values are recorded in integer paise (1 INR = 100 paise).
 *      This contract serves purely as an immutable accounting ledger; no Ether
 *      or cryptocurrency payments are held, transferred, or reimbursed.
 *      NOTE: All purposes and amounts stored on-chain are publicly visible.
 *      Users should only input fictional, non-sensitive demo data.
 */
contract ClubExpenseTracker {
    // Expense lifecycle states
    enum ExpenseStatus {
        Pending,   // 0
        Approved,  // 1
        Rejected   // 2
    }

    struct Expense {
        uint256 id;
        address submitter;
        uint256 amount;       // in paise (e.g. 500 INR = 50,000 paise)
        string purpose;       // short description of expense
        ExpenseStatus status; // Pending, Approved, or Rejected
        uint256 submittedAt;  // block timestamp of submission
        uint256 decidedAt;    // block timestamp of approval/rejection (0 if pending)
    }

    // State variables
    string public clubName;
    address public immutable approver;
    uint256 public immutable initialBudget; // in paise
    uint256 public totalApprovedAmount;     // in paise
    uint256 public expenseCount;

    // Mapping from expense ID (1-indexed) to Expense record
    mapping(uint256 => Expense) public expenses;

    // Events
    event ExpenseSubmitted(
        uint256 indexed id,
        address indexed submitter,
        uint256 amount,
        string purpose,
        uint256 timestamp
    );

    event ExpenseApproved(
        uint256 indexed id,
        address indexed submitter,
        uint256 amount,
        uint256 remainingBudget,
        uint256 timestamp
    );

    event ExpenseRejected(
        uint256 indexed id,
        address indexed submitter,
        uint256 amount,
        uint256 timestamp
    );

    // Modifiers
    modifier onlyApprover() {
        require(msg.sender == approver, "Only approver can perform this action");
        _;
    }

    /**
     * @notice Initializes the college club expense tracker.
     * @param _clubName Name of the club (e.g. "Coding Club", "Robotics Club").
     * @param _initialBudgetInPaise Total starting budget in paise (e.g. 10,000 INR = 1,000,000 paise).
     */
    constructor(string memory _clubName, uint256 _initialBudgetInPaise) {
        require(_initialBudgetInPaise > 0, "Initial budget must be greater than zero");
        clubName = _clubName;
        approver = msg.sender;
        initialBudget = _initialBudgetInPaise;
        totalApprovedAmount = 0;
        expenseCount = 0;
    }

    /**
     * @notice Submits a new expense request. Any connected wallet can submit.
     * @param _amountInPaise Expense amount in paise (must be > 0).
     * @param _purpose Brief description of the expense (max 120 chars, non-empty).
     * @return newExpenseId The unique ID assigned to the new expense.
     */
    function submitExpense(uint256 _amountInPaise, string calldata _purpose)
        external
        returns (uint256 newExpenseId)
    {
        require(_amountInPaise > 0, "Amount must be greater than zero");
        require(bytes(_purpose).length > 0, "Purpose cannot be empty");
        require(bytes(_purpose).length <= 120, "Purpose cannot exceed 120 characters");

        expenseCount++;
        newExpenseId = expenseCount;

        expenses[newExpenseId] = Expense({
            id: newExpenseId,
            submitter: msg.sender,
            amount: _amountInPaise,
            purpose: _purpose,
            status: ExpenseStatus.Pending,
            submittedAt: block.timestamp,
            decidedAt: 0
        });

        emit ExpenseSubmitted(
            newExpenseId,
            msg.sender,
            _amountInPaise,
            _purpose,
            block.timestamp
        );
    }

    /**
     * @notice Approves a pending expense.
     * @dev Only the contract approver can approve. Approver cannot approve their own expenses.
     *      Approved amount cannot exceed the remaining budget.
     * @param _id The ID of the expense to approve.
     */
    function approveExpense(uint256 _id) external onlyApprover {
        require(_id > 0 && _id <= expenseCount, "Expense does not exist");
        Expense storage exp = expenses[_id];

        require(exp.status == ExpenseStatus.Pending, "Expense is already finalized");
        require(exp.submitter != approver, "Approver cannot self-approve expenses");

        uint256 remaining = getRemainingBudget();
        require(exp.amount <= remaining, "Expense amount exceeds remaining budget");

        exp.status = ExpenseStatus.Approved;
        exp.decidedAt = block.timestamp;
        totalApprovedAmount += exp.amount;

        emit ExpenseApproved(
            _id,
            exp.submitter,
            exp.amount,
            getRemainingBudget(),
            block.timestamp
        );
    }

    /**
     * @notice Rejects a pending expense.
     * @dev Only the contract approver can reject. Rejection does not reduce the remaining budget.
     * @param _id The ID of the expense to reject.
     */
    function rejectExpense(uint256 _id) external onlyApprover {
        require(_id > 0 && _id <= expenseCount, "Expense does not exist");
        Expense storage exp = expenses[_id];

        require(exp.status == ExpenseStatus.Pending, "Expense is already finalized");

        exp.status = ExpenseStatus.Rejected;
        exp.decidedAt = block.timestamp;

        emit ExpenseRejected(
            _id,
            exp.submitter,
            exp.amount,
            block.timestamp
        );
    }

    /**
     * @notice Returns the remaining unspent budget in paise.
     */
    function getRemainingBudget() public view returns (uint256) {
        if (totalApprovedAmount >= initialBudget) {
            return 0;
        }
        return initialBudget - totalApprovedAmount;
    }

    /**
     * @notice Returns single expense details.
     */
    function getExpense(uint256 _id) external view returns (Expense memory) {
        require(_id > 0 && _id <= expenseCount, "Expense does not exist");
        return expenses[_id];
    }

    /**
     * @notice Returns all expenses recorded so far.
     * @dev Convenient for small academic demo sizes (e.g. up to 100 expenses).
     */
    function getAllExpenses() external view returns (Expense[] memory) {
        Expense[] memory list = new Expense[](expenseCount);
        for (uint256 i = 1; i <= expenseCount; i++) {
            list[i - 1] = expenses[i];
        }
        return list;
    }

    /**
     * @notice Summary of overall club finances and parameters.
     */
    function getClubSummary()
        external
        view
        returns (
            string memory _clubName,
            address _approver,
            uint256 _initialBudget,
            uint256 _totalApproved,
            uint256 _remainingBudget,
            uint256 _expenseCount
        )
    {
        return (
            clubName,
            approver,
            initialBudget,
            totalApprovedAmount,
            getRemainingBudget(),
            expenseCount
        );
    }
}

