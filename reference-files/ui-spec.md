# UI Specification — Finance App

**Status:** Draft for review
**Companion to:** `design-system.md` (visual tokens, components), `user_stories.md` (requirements), `entities.md` / `glossary.md` (data model)
**Scope:** Every screen in the application, described at the level needed to build component specs.

---

## How to read this document

- **Layout** — what sits where on the screen, top to bottom.
- **Data** — what each element shows and where it comes from (referencing entity fields).
- **Interactions** — what the user can do.
- **⚑ PROPOSAL** — a design decision that the source material left undefined. These are my suggested resolutions, not settled requirements. Each is marked so it can be accepted, changed, or rejected before build.
- **⚠ OPEN** — a question I could not resolve and did not want to guess on.

---

## 0. Shared Components

These appear on multiple screens and are specified once here.

### 0.1 App Shell

Persistent left sidebar (201px) + scrollable main area. The main area carries the ledger-line background; the sidebar does not.

Sidebar navigation, grouped:

- **Overview** — Dashboard
- **Money** — Transactions, Credit
- **Ledger** — Bills, Revenues, Recurrences
- **Structure** — Wallets, Sources, Categories
  The active item (including when a detail page is open) highlights its parent nav entry. Detail pages are not separate nav items.

### 0.2 Period Selector

A single reusable control used on the Dashboard and most list/detail views. It is the source of the custom-range gap you found, so it is specified carefully here.

Preset options: `Current trimester`, `Last 3 months`, `This month`, `This year`, `Custom range`.

**Default differs by context** (per user stories):

- Dashboard → `Current trimester`
- All list views and detail views → `Last 3 months`
  ⚑ **PROPOSAL — Custom range interaction.** Selecting `Custom range` from the dropdown does not close the panel. Instead, the panel expands to reveal two date inputs (`From` / `To`) and an `Apply` button. The selector trigger label only updates to the chosen date span (e.g. `12 Mar – 18 Jun`) once `Apply` is pressed. Until applied, the previously active period stays in effect. This keeps a single control responsible for both presets and custom ranges, rather than introducing a separate modal.

⚑ **PROPOSAL — Wallet detail "3 months" control.** The current wallet-detail prototype shows fixed `3 mo` / `4 mo` toggles. This was a prototype shortcut and is inconsistent with the rest of the app. Replace it with the standard Period Selector above (default `Last 3 months`), so custom range is available there too. Same applies to any other view that currently shows fixed-month toggles.

### 0.3 Stat Card

Per `design-system.md` §7.1. Label (9px uppercase) · value (21px serif, semantic colour) · note line (12px).

⚑ **PROPOSAL — Note line content rule.** The note line must state a _fact derived from data_, never an invented benchmark. The prototype's "Above 20% target" is removed (there is no target anywhere in the specs). Permitted note content: comparison vs prior period (we have this data), a plain descriptor of what the number is, or a count. If there is nothing factual to say, the note line is omitted rather than filled with filler.

### 0.4 Data Table

Used by every list view. Columns are left-aligned except monetary values, which are right-aligned with `tabular-nums`. Rows that navigate to a detail page show a hover state and are clickable across their full width. Status is shown via pills (see design system).

### 0.5 Create / Edit Modal

Centered modal over a scrim. Header (title + close), body (form fields), footer (Cancel + primary action). One field group per line; required fields marked. Used for all create and edit flows.

⚠ **OPEN — Form validation display.** The specs don't describe how field-level validation errors surface (inline under field vs. summary at top). Needs a decision before building forms.

---

## 1. Dashboard

**Route:** `/` · **Default period:** Current trimester

### Layout (top to bottom)

1. Page head: title "Dashboard", sub-line showing active period, Period Selector (right).
2. Stat row — 4 cards: Total Revenue, Total Outcome, Net Balance, Savings Rate.
3. Bottom row, two columns: Cash Flow chart (left, flexible width) · Pending Credit panel (right, fixed 279px).

### Data

- **Total Revenue** — unreceived revenues at `revenue.value`; future recurrence instances in range at `estimated_value` (variable) or exact `value` (fixed); received revenues excluded; internal transfers excluded.
- **Total Outcome** — symmetric to revenue, using bills.
- **Net Balance** — revenue − outcome.
- **Savings Rate** — net ÷ revenue, shown as %.
  - Note line: ⚑ **PROPOSAL** — show delta vs. prior period (e.g. "+1.8 pts vs prior"), not a target. If prior-period data is unavailable, omit the note.
- **Cash Flow** — area chart plotting money in and money out across the selected range.
- **Pending Credit** — sum of `amount` for credit transactions where `settled = false` in range.

### Interactions

- Changing the period updates every component on the page.
- ⚑ **PROPOSAL** — the per-card breakdown bars inside Pending Credit (per wallet) link to the Credit view filtered to that wallet. Currently they are static.

---

## 2. Transactions

**Route:** `/transactions` · **Default period:** Last 3 months

### Layout

1. Page head: title, period sub-line, Period Selector + "New transaction" button.
2. Stat row — 3 cards: Total In, Total Out, Net.
3. Filter bar: method segment (All / Debit / Credit) + Category, Wallet, Date filters.
4. Transactions table.

### Data

Table columns: Date · Description · Method (pill) · Category · From → To · Amount (signed) · Settlement status (credit only).

- Sign convention: `+` when money enters a wallet, `−` when it leaves, blank for internal transfers and adjustments.
- Period summary cards: total in, total out, net.

### Interactions

- Method segment filters the table live.
- ⚑ **PROPOSAL** — Category / Wallet / Date are dropdown filters that combine (AND) with the method segment. Date filter opens the same range control as the Period Selector.
- "New transaction" opens the create modal.

### Create transaction modal

- **Debit:** from + to required (valid combinations per glossary), amount + date required, category optional. Wallet balance updates on save.
- **Credit:** `from_type = wallet` required, to required, category optional, `term` defaults to the 15th of current month (editable), `settled` defaults false, installments optional.
  - ⚑ **PROPOSAL** — method is a toggle at the top of the modal; switching it swaps the relevant fields (the `from`/`to` options and the installment/term fields) rather than showing all fields at once.
- ⚠ **OPEN** — the valid `from`/`to` combination matrix should drive which options appear in each selector. Whether selectors filter dynamically (e.g. choosing Revenue as `from` restricts `to` to Wallet) or validate on submit is undecided.

---

## 3. Credit

**Route:** `/credit` · **Default period:** Last 3 months

### Layout

1. Page head: title, sub-line, Period Selector.
2. Stat row — 3 cards: Pending Credit, Open Statements (count), Settled in period.
3. Filter segment: Unsettled / Settled / All.
4. A card per statement group (wallet + term).

### Data

- Groups keyed by wallet + statement term. Per group: total value, list of member transactions.
- Each group card: wallet name, term date, total (serif), and either a "settled" pill or a "Settle group" button.
- Each row inside: date, description, amount, and per-row "Settle" (when unsettled).

### Interactions

- Filter segment switches which groups show.
- "Settle group" → confirm modal → sets `settled = true` for all transactions in the group.
- Per-row "Settle" → sets `settled = true` for that one transaction (partial settlement).

---

## 4. Bills

**Route:** `/bills` · **Default period:** Last 3 months

### Layout

1. Page head: title, period sub-line, Period Selector + "New bill".
2. Stat row — 4 cards: Total Billed, Total Paid, Total Unpaid, Overdue.
3. Filter segment: All / Unpaid / Paid / Overdue.
4. Bills table.

### Data

Columns: Bill name (with recurrence icon if recurring) · Source · Term · Status pill · Flag indicator · Value.

- **Flagged** when `paid = true` and no transaction references the bill, OR `paid = false` and `term < today`. Flagged rows show a `! flag` pill.

### Interactions

- Filter segment filters table.
- Row click → Bill Detail.
- "New bill" → create modal: name, value, term, source required; description optional; recurrence optional (if set: interval unit, interval value, recurrent day, + month if yearly).

### 4a. Bill Detail

**Route:** `/bills/:id`

Layout: back link · page head (name, source, recurring/one-time, action buttons: Edit / Mark paid·unpaid / Delete) · 3 stat cards (Value, Status, Linked Txn) · flag notice if flagged · instance-history table.

- **Instance history:** recurring → past instances + 3 ahead (1 ahead if yearly); non-recurring → single record.
- Delete is blocked when `paid = true` (button present but action prevented, with explanation).
- Editing an instance that belongs to a recurrence affects only that instance.
- Toggling paid is independent of transaction linking.

---

## 5. Revenues

**Route:** `/revenues` · **Default period:** Last 3 months

Structurally identical to Bills, with revenue semantics.

### Data

- Stat cards: Total Expected, Total Received, Total Pending, Overdue.
- Filter segment: All / Pending / Received / Overdue.
- Table: Revenue name · Source · Term · Status (received/pending) · Flag · Value.
- **Flagged** when `received = true` and no transaction references it, OR `received = false` and `term < today`.

### 5a. Revenue Detail

**Route:** `/revenues/:id` — mirrors Bill Detail (Edit / Mark received·unreceived / Delete, instance history, linked-transaction indicator). Delete blocked when `received = true`.

---

## 6. Recurrences

**Route:** `/recurrences` · **Default period:** Last 3 months

### Layout

1. Page head: title, sub-line, Period Selector.
2. Stat row — 3 cards: Recurring Outflow (monthly bill commitment), Active Schedules (count), Inactive (count).
3. Recurrences table.

### Data

Shows both recurring bills and revenues. Columns: Item (name from most recent instance) · Type pill (bill/revenue) · Frequency · Next instance date · variable/inactive markers · Estimated value.

- Total recurring commitment for the period is surfaced in the stat row.
- A recurrence with no remaining instances is auto-deleted (won't appear).

### Interactions

- Row click → Recurrence Detail.
- ⚑ **PROPOSAL** — there is no "create recurrence" entry point here, because recurrences are created from within a Bill or Revenue. This view is management-only (edit / deactivate). Worth confirming this is the intended model.

### 6a. Recurrence Detail

**Route:** `/recurrences/:id`

Layout: back link · page head (name, frequency, type, actions: Edit config / Deactivate) · 3 stat cards (Estimated Value, Next Instance, Type) · two-column row: estimated-vs-actual line chart (left) + instances table (right, past + 3 ahead / 1 if yearly).

- Edit config: changes apply to **future instances only**.
- Deactivate: preserves current instance, detaches config, generates no future instances.
- Variance chart: estimated vs actual values over time, to track drift.

---

## 7. Wallets

**Route:** `/wallets` · **Note:** this view is _not_ period-scoped at the list level (patrimony is current); the comparison windows are fixed at "last 3 months" per the user stories.

### Layout

1. Page head: title, sub-line, "New wallet".
2. Stat row — 3 cards: Total Patrimony, Active Wallets (count), Archived (count).
   - Total Patrimony note: comparison vs last-3-months average.
3. Two-column row: Patrimony trend line chart (left) + current-vs-3-month-average diverging bars (right).
4. Wallets table (active + archived, archived visually dimmed).

### Data

- Table: Wallet name · Description · vs-average delta (coloured ±) · archived pill · Balance (serif).
- Per-wallet comparison: current value vs average over last 3 months — drives both the diverging bar chart and the table delta column.

### Interactions

- Row click → Wallet Detail.
- "New wallet" → create modal: name required, description optional; balance starts at 0; active on creation.

### 7a. Wallet Detail

**Route:** `/wallets/:id`

Layout: back link · page head (name, description, actions: Edit / Archive·Unarchive, **Period Selector** — see §0.2 proposal replacing the fixed toggles) · 3 stat cards (Current Balance, 3-mo Average, Status) · balance-over-period line chart · transactions table (reuses the Transactions table component, scoped to this wallet, with create/edit/delete in context).

- Editing balance creates a Manual Adjustment transaction for the delta (background; surfaced in the transaction list).
- Archive: excluded from dashboard and selectors when archived; still listed here, dimmed; history preserved; reversible.

---

## 8. Sources

**Route:** `/sources` · **Default period:** Last 3 months

### Layout

1. Page head: title, sub-line, Period Selector + "New source".
2. Sources table.
   ⚑ **PROPOSAL** — Sources list has no stat row in the user stories, unlike Bills/Revenues. Kept lean here. If a period total (sum income / sum outcome across all sources) is wanted, add a 2-card stat row. Flagged for decision.

### Data

- Table: Source name · Description · status pill (archived / "open items") · Income · Outcome (per source, summed over period).

### Interactions

- Row click → Source Detail.
- "New source" → create modal: name required, description optional; active on creation.
- Archive is **blocked** when the source has unpaid bills or unreceived revenues. ⚑ **PROPOSAL** — surface this by disabling the Archive control and showing the reason inline, rather than letting the user attempt it and fail.

### 8a. Source Detail

**Route:** `/sources/:id`

Layout: back link · page head (name, description, actions: Edit / Archive [disabled if open items] · Period Selector) · 2 stat cards (Total Income, Total Outcome) · archive-blocked notice when applicable · two-column row: Bills (left) and Revenues (right) for this source, each with inline add and create/edit/delete.

---

## 9. Categories

**Route:** `/categories` · **Default period:** Last 3 months

### Layout

1. Page head: title, sub-line, Period Selector + "New category".
2. Categories table.
   ⚑ **PROPOSAL** — same as Sources: no stat row defined; kept lean. Add a 2-card total row only if wanted.

### Data

- Table: Category name · Description · archived pill · Income · Outcome (summed over period).

### Interactions

- Row click → Category Detail.
- "New category" → create modal: name required, description optional; active on creation.
- Archive only (no deletion). Archived categories excluded from selectors; existing transactions referencing them are unaffected.

### 9a. Category Detail

**Route:** `/categories/:id`

Layout: back link · page head (name, description, actions: Edit / Archive·Unarchive · Period Selector) · 2 stat cards (Total Income, Total Outcome) · breakdown chart · transactions table (reuses Transactions component, scoped to category).

- Breakdown chart: this category's transactions over the period.
- ⚠ **OPEN** — "breakdown" dimension isn't specified. By time (per week/month), by wallet, or by source? Prototype assumed by time. Needs a decision.

---

## 10. Cross-cutting open items

Collected here so nothing is buried:

1. ⚠ **Custom range** — interaction model proposed in §0.2; needs sign-off as it touches every view.
2. ⚠ **Form validation display** — §0.5.
3. ⚠ **Transaction from/to combination enforcement** — §2 (dynamic filtering vs submit-time validation).
4. ⚠ **Category breakdown dimension** — §9a.
5. ⚑ **Savings-rate note** — confirm replacing target with prior-period delta (§1).
6. ⚑ **Stat rows on Sources / Categories** — add totals or keep lean (§8, §9).
7. ⚑ **Recurrence creation entry point** — confirm recurrences are created only from Bills/Revenues, not directly (§6).

---

## 11. Note-line audit (the "fake target" issue)

Every stat-card note line currently in the prototype, and its corrected content under the §0.3 rule:

| View · Card               | Prototype note      | Corrected                                                     |
| :------------------------ | :------------------ | :------------------------------------------------------------ |
| Dashboard · Savings Rate  | "Above 20% target"  | Delta vs prior period, or omit                                |
| Dashboard · Net Balance   | "Healthy surplus"   | ⚑ Judgement phrase — replace with net delta vs prior, or omit |
| Bills · Overdue           | "Past term, unpaid" | OK (factual descriptor)                                       |
| Wallets · Total Patrimony | "+4.2% vs 3-mo avg" | OK (real comparison)                                          |

⚑ **PROPOSAL** — apply the §0.3 rule across all views: any note that is a subjective judgement ("Healthy surplus", "Above target") is replaced with a data-derived figure or removed. Descriptive notes that merely restate what the number is ("Money into wallets", "Past term, unpaid") are acceptable.
