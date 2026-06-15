# User Stories

---

## Dashboard

**As a user, I want to select a custom date range so I can control the period reflected on the dashboard.**

- Defaults to current trimester
- All dashboard components update when range changes
  **As a user, I want to see total revenue for the period so I can understand my income.**
- Unreceived revenues counted at `revenue.value`
- Future recurrence instances within range: counted at `estimated_value` if variable, exact `value` if fixed
- Received revenues disconsidered
- Internal transfers excluded
  **As a user, I want to see total outcome for the period so I can understand my expenses.**
- Unpaid bills counted at `bill.value`
- Future recurrence instances within range: counted at `estimated_value` if variable, exact `value` if fixed
- Paid bills disconsidered
- Internal transfers excluded
  **As a user, I want to see net balance (revenue − outcome) so I can assess the period's financial health.**

**As a user, I want to see savings rate (net ÷ revenue %) so I can track financial efficiency.**

**As a user, I want to see a cash flow timeline so I can visualize money movement over the period.**

- Plots money in and out over the selected date range
  **As a user, I want to see total pending credit so I can understand my unsettled credit obligations.**
- Sum of `amount` for credit transactions where `settled = false` within the selected period

---

## Wallets

### Wallets List

**As a user, I want to see all my wallets with their current balances so I have an overview of my financial position.**

- Active and archived wallets both shown, visually distinguished
- Balance displayed per wallet
  **As a user, I want to see the total patrimony sum across all wallets.**

**As a user, I want to see how my total patrimony compares to the last 3 months so I can track its evolution.**

**As a user, I want to see per-wallet comparisons of current value vs average over the last 3 months so I can identify which wallets are growing or shrinking.**

**As a user, I want to create a wallet so I can track money across different accounts.**

- Name required; description optional
- Balance starts at 0
- Active on creation
  **As a user, I want to edit a wallet's name, description, and balance so I can keep it accurate.**
- Editing balance creates a Manual Adjustment transaction in the background for the delta
  **As a user, I want to archive and unarchive a wallet so I can hide inactive ones without losing history.**
- Archived wallets excluded from dashboard and selectors
- Still visible in wallets list, visually distinguished
- Transaction history preserved regardless of archive state
- Can be reactivated at any time

### Wallet Detail

**As a user, I want to select a period for this wallet's view.**

- Defaults to last 3 months
  **As a user, I want to see a chart of this wallet's balance over the selected period so I can track its evolution.**

**As a user, I want to see all transactions for this wallet in the selected period so I can audit its activity.**

- Reuses the transaction component from Transactions view
- Supports create, edit, and delete in context of this wallet

---

## Sources

### Sources List

**As a user, I want to see all sources with total income and outcome for the selected period.**

- Default period: last 3 months
- Per source: sum of income + sum of outcome
  **As a user, I want to create a source so I can link bills and revenues to their origin.**
- Name required; description optional
- Active on creation
  **As a user, I want to edit a source's name and description so I can keep it accurate.**

**As a user, I want to archive and unarchive a source so I can hide inactive ones without losing history.**

- Blocked if source has unpaid bills or unreceived revenues
- Still visible in sources list when archived, visually distinguished
- Can be reactivated at any time

### Source Detail

**As a user, I want to select a period for this source's view.**

- Defaults to last 3 months
  **As a user, I want to see all bills and revenues for this source in the selected period.**
- Supports create, edit, and delete inline
  **As a user, I want to see total income and outcome for this source in the selected period.**

---

## Categories

### Categories List

**As a user, I want to see all categories with total income and outcome for the selected period.**

- Default period: last 3 months
  **As a user, I want to create a category so I can classify my transactions.**
- Name required; description optional
- Active on creation
  **As a user, I want to edit a category's name and description so I can keep it accurate.**

**As a user, I want to archive and unarchive a category so I can hide unused ones.**

- No deletion — archived only
- Existing transactions that reference the category are unaffected
- Archived categories excluded from selectors
- Can be reactivated at any time

### Category Detail

**As a user, I want to select a period for this category's view.**

**As a user, I want to see a breakdown chart of this category's transactions over the selected period.**

**As a user, I want to see all transactions tagged with this category in the selected period.**

- Reuses the transaction component from Transactions view
- Supports create, edit, and delete

---

## Bills

### Bills List

**As a user, I want to see all bills for the selected period with summary stats so I can manage my obligations.**

- Shows total billed, total paid, total unpaid, total overdue
- Filterable by paid/unpaid and term date
- Flagged bills visually highlighted
  **As a user, I want to create a bill so I can track a payable obligation.**
- Name, value, term, and source required; description optional
- Unpaid by default
- Recurrence optional; if set, requires interval unit, interval value, recurrent day (+ month if yearly)
  **As a user, I want to edit a bill's fields so I can keep it accurate.**
- All fields editable
- If the bill belongs to a recurrence, editing only affects this instance
  **As a user, I want to delete a bill so I can remove incorrect or cancelled obligations.**
- Cannot be deleted if `paid = true`
  **As a user, I want to toggle a bill's paid status so I can track settlement manually.**
- `paid` is independent of transaction linking
- Flagged if `paid = true` and no transaction references this bill
- Flagged if `paid = false` and `term < today`

### Bill Detail

**As a user, I want to see the full instance history of a bill so I can track its lifecycle.**

- Recurring bills show past instances + 3 ahead (1 ahead if yearly)
- Non-recurring bills show only their single record
  **As a user, I want to see whether a transaction is linked to this bill.**

**As a user, I want to edit, delete, and toggle paid on this bill from the detail view.**

---

## Revenues

### Revenues List

**As a user, I want to see all revenues for the selected period with summary stats so I can manage my expected income.**

- Shows total expected, total received, total pending, total overdue
- Filterable by received/unreceived and term date
- Flagged revenues visually highlighted
  **As a user, I want to create a revenue so I can track expected incoming money.**
- Name, value, term, and source required; description optional
- Unreceived by default
- Recurrence optional
  **As a user, I want to edit a revenue's fields so I can keep it accurate.**
- If the revenue belongs to a recurrence, editing only affects this instance
  **As a user, I want to delete a revenue so I can remove incorrect or cancelled entries.**
- Cannot be deleted if `received = true`
  **As a user, I want to toggle a revenue's received status so I can track receipt manually.**
- `received` is independent of transaction linking
- Flagged if `received = true` and no transaction references this revenue
- Flagged if `received = false` and `term < today`

### Revenue Detail

**As a user, I want to see the full instance history of a revenue so I can track its lifecycle.**

- Recurring revenues show past instances + 3 ahead (1 ahead if yearly)
- Non-recurring revenues show only their single record
  **As a user, I want to see whether a transaction is linked to this revenue.**

**As a user, I want to edit, delete, and toggle received on this revenue from the detail view.**

---

## Recurrences

### Recurrences List

**As a user, I want to see all recurring items in one place so I can manage my scheduled obligations and income.**

- Shows both recurring bills and revenues
- Name pulled from most recent instance
- Per item: frequency, estimated value, next instance date
- Shows total recurring commitment for the period
- A recurrence with no remaining instances is automatically deleted
  **As a user, I want to edit a recurrence config so I can adjust the schedule.**
- Changes apply to future instances only; existing instances are unaffected
  **As a user, I want to deactivate a recurrence so no new instances are generated.**
- Current instance preserved
- Recurrence config is detached; no future instances created

### Recurrence Detail

**As a user, I want to see all instances of a recurring item so I can review its history and upcoming occurrences.**

- Shows past instances + 3 ahead (1 ahead if yearly)
  **As a user, I want to see a variance chart comparing estimated vs actual values over time so I can track value drift.**

**As a user, I want to edit the recurrence config and deactivate from the detail view.**

---

## Transactions

**As a user, I want to see all transactions for the selected period so I can audit my financial activity.**

- Period summary: total in, total out, net
- Filterable by date, method, category, and wallet
  **As a user, I want to record a debit transaction so I can track actual money movement.**
- `from` and `to` required (valid combinations per glossary)
- Category optional; date and amount required
- Wallet balance updated for involved wallet(s)
  **As a user, I want to record a credit transaction so I can track credit card purchases.**
- `from_type = wallet` required for tracking; `to` required
- Category optional
- `term` defaults to the 15th of the current month; editable
- `settled` defaults to false
- If `installment_total > 1`: N transactions generated, linked by `credit_group_id`, each dated one month apart
- Wallet balance not affected
  **As a user, I want to edit a transaction so I can correct mistakes.**
- All fields editable
- Editing an installment only affects that instance
- `paid`/`received` status on linked bill/revenue unaffected (manually managed)
- If method = debit: wallet balance adjusted for the delta
  **As a user, I want to delete a transaction so I can remove incorrect entries.**
- `paid`/`received` status on linked bill/revenue unaffected (manually managed)
- If method = debit: wallet balance reversed
- Deleting one installment does not affect others in the group

---

## Credit

**As a user, I want to see all credit transactions grouped by wallet and term so I can manage my credit card obligations.**

- Filterable by settled/unsettled
- Per group: total value and list of transactions
  **As a user, I want to bulk settle a group so I can quickly mark a full credit card statement as paid.**
- Sets `settled = true` for all transactions in the group
  **As a user, I want to settle individual credit transactions so I can track partial settlement.**
- Sets `settled = true` for that transaction only
