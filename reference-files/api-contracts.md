# Tech Spec — API Contracts

**Style:** REST · **Backend:** custom Node.js (TypeScript) · **DB:** PostgreSQL (Supabase)
**Companion to:** `db-schema.md`, `user_stories.md`, `ui-spec.md`

---

## Conventions

- **Base path:** `/api`. All bodies and responses are JSON.
- **Auth:** `Authorization: Bearer <supabase-jwt>` on every request. Auth flow itself is out of scope for this spec.
- **Casing:** responses and request bodies are **camelCase**. The BE maps to/from snake_case at the DB layer.
- **Money:** decimal **strings** (`"1234.56"`), never JSON numbers. Parse on the FE for display/formatting.
- **Dates:** `date` fields are `YYYY-MM-DD`; timestamps are RFC 3339. **Period filters (`from`/`to`) are concrete dates** — the FE resolves presets ("current trimester", "last 3 months") to dates before calling.
- **Pagination:** only `GET /transactions` paginates (cursor-based). All other lists are bounded by the period and returned whole.

### Shared scalar types

```ts
type UUID = string;
type ISODate = string; // 'YYYY-MM-DD'
type ISODateTime = string; // RFC 3339
type Money = string; // decimal string, e.g. '1234.56'
```

### Error envelope

```ts
interface ApiError {
  error: {
    code: string; // machine-readable, e.g. 'DELETE_BLOCKED'
    message: string; // human-readable fallback
    fields?: Record<string, string>; // field -> message, for inline form errors
  };
}
```

| Status | When                                                                                 |
| :----- | :----------------------------------------------------------------------------------- |
| `400`  | Malformed request                                                                    |
| `401`  | Missing/invalid token                                                                |
| `404`  | Resource not found                                                                   |
| `409`  | Action blocked by a business rule (delete paid bill, archive source with open items) |
| `422`  | Validation failure — `fields` populated, drives inline-under-field errors (§0.5)     |

---

## Read shapes (entities as returned)

Computed fields (absent from the DB, added by the BE) are marked `// computed`.

```ts
interface Wallet {
  id: UUID;
  name: string;
  description: string | null;
  balance: Money;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Source {
  id: UUID;
  name: string;
  description: string | null;
  archived: boolean;
  hasOpenItems: boolean; // computed: unpaid bills or unreceived revenues exist
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Category {
  id: UUID;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Recurrence {
  id: UUID;
  isVariable: boolean;
  intervalUnit: "day" | "week" | "month" | "year";
  intervalValue: number;
  recurrentDay: number; // 1–31, intended day (unclamped)
  recurrentMonth: number | null; // required when intervalUnit = 'year'
  estimatedValue: Money | null;
  active: boolean; // computed: false once deactivated/detached
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Bill {
  id: UUID;
  name: string;
  description: string | null;
  value: Money;
  term: ISODate;
  paid: boolean;
  sourceId: UUID;
  recurrenceId: UUID | null;
  hasLinkedTransaction: boolean; // computed
  flagged: boolean; // computed: (paid && !linked) || (!paid && term < today)
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Revenue {
  // mirror of Bill
  id: UUID;
  name: string;
  description: string | null;
  value: Money;
  term: ISODate;
  received: boolean;
  sourceId: UUID;
  recurrenceId: UUID | null;
  hasLinkedTransaction: boolean; // computed
  flagged: boolean; // computed: (received && !linked) || (!received && term < today)
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// Expanded counterparty for display ('From → To' column). name is null when external.
interface TxnEndpoint {
  type: "wallet" | "external" | "revenue" | "bill";
  id: UUID | null;
  name: string | null;
}

type TxnKind =
  | "moneyIn"
  | "moneyOut"
  | "revenueRealized"
  | "billPaid"
  | "internalTransfer"
  | "manualAdjustment";

interface Transaction {
  id: UUID;
  amount: Money;
  date: ISODate;
  description: string | null;
  method: "debit" | "credit";
  category: { id: UUID; name: string } | null;
  from: TxnEndpoint;
  to: TxnEndpoint;
  installmentNumber: number | null;
  installmentTotal: number | null;
  creditGroupId: UUID | null;
  settled: boolean;
  term: ISODate | null;
  kind: TxnKind; // computed from from/to combination
  sign: "+" | "-" | null; // computed; null for transfers & adjustments
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
```

---

## Dashboard

```
GET /dashboard?from&to
```

```ts
interface DashboardResponse {
  revenue: Money;
  outcome: Money;
  net: Money;
  savingsRate: number; // percent
  savingsRateDelta: number | null; // pts vs prior equal-length period; null if no prior data
  netDelta: Money | null; // vs prior period; null if unavailable
  cashFlow: Array<{ date: ISODate; in: Money; out: Money }>;
  pendingCredit: {
    total: Money;
    perWallet: Array<{ walletId: UUID; walletName: string; total: Money }>;
  };
}
```

Revenue/outcome aggregation rules (unreceived/unpaid at `value`, future recurrence instances at `estimatedValue` if variable else exact `value`, settled items excluded, internal transfers excluded) are computed server-side per `user_stories.md`.

---

## Transactions

```
GET /transactions?from&to&method&category&wallet&cursor&limit
```

`method` ∈ `all|debit|credit`. `category`, `wallet` are UUIDs. Summary reflects the active filters.

```ts
interface TransactionListResponse {
  summary: { totalIn: Money; totalOut: Money; net: Money };
  items: Transaction[];
  nextCursor: string | null;
}
```

```
POST /transactions
```

```ts
// Debit
interface CreateDebitTransaction {
  method: "debit";
  amount: Money;
  date: ISODate;
  description?: string;
  categoryId?: UUID;
  fromType: "wallet" | "external" | "revenue";
  fromId?: UUID; // omit iff fromType = 'external'
  toType: "wallet" | "external" | "bill";
  toId?: UUID; // omit iff toType = 'external'
}

// Credit — fromType is always 'wallet'
interface CreateCreditTransaction {
  method: "credit";
  amount: Money;
  date: ISODate;
  description?: string;
  categoryId?: UUID;
  fromId: UUID; // wallet
  toType: "wallet" | "external" | "bill";
  toId?: UUID;
  term?: ISODate; // defaults to the 15th of current month
  installmentTotal?: number; // > 1 → expands into a linked group
}
```

**Returns `201` with `Transaction[]`** — one element normally, N when `installmentTotal > 1` (the generated group, dated one month apart, sharing `creditGroupId`). The BE validates the `from`/`to` pair against the six legal combinations and that referenced entities exist; invalid pairs → `422`.

```
GET    /transactions/:id        -> Transaction
PATCH  /transactions/:id         // partial; editing one installment affects only that row
DELETE /transactions/:id         // 204
```

Debit create/edit/delete adjusts the involved wallet balance(s) server-side (apply / reverse-then-reapply delta / reverse). `paid`/`received` on any linked bill/revenue is never touched.

---

## Credit

```
GET /credit?from&to&status
```

`status` ∈ `unsettled|settled|all`. Groups are keyed by **wallet + term** (read-side only).

```ts
interface CreditResponse {
  summary: {
    pendingCredit: Money;
    openStatements: number;
    settledInPeriod: Money;
  };
  groups: Array<{
    walletId: UUID;
    walletName: string;
    term: ISODate;
    total: Money;
    settled: boolean; // true iff every member is settled
    transactions: Transaction[];
  }>;
}
```

```
POST /credit/settle
```

```ts
interface SettleRequest {
  transactionIds: UUID[];
} // one id = row settle, many = group settle
```

Sets `settled = true` for the given transactions. Returns the updated `Transaction[]`.

---

## Bills

```
GET /bills?from&to&status
```

`status` ∈ `all|unpaid|paid|overdue`.

```ts
interface BillListResponse {
  summary: {
    totalBilled: Money;
    totalPaid: Money;
    totalUnpaid: Money;
    overdue: Money;
  };
  items: Bill[];
}
```

```
POST /bills
```

```ts
interface CreateBill {
  name: string;
  value: Money;
  term: ISODate;
  sourceId: UUID;
  description?: string;
  recurrence?: {
    isVariable: boolean;
    intervalUnit: "day" | "week" | "month" | "year";
    intervalValue: number;
    recurrentDay: number;
    recurrentMonth?: number; // required when intervalUnit = 'year'
  };
}
```

When `recurrence` is present the BE creates the recurrence and **synchronously materializes the initial window** (current + lookahead: 3 for sub-yearly, 1 for yearly). The scheduled job only maintains the window thereafter.

```
GET /bills/:id
```

```ts
interface BillDetailResponse {
  bill: Bill;
  instances: Bill[]; // recurring: past + window; non-recurring: [bill]
  linkedTransaction: Transaction | null;
}
```

```
PATCH  /bills/:id     // editing a recurrence instance affects only that instance
DELETE /bills/:id     // 409 DELETE_BLOCKED when paid = true
```

`paid` is toggled via `PATCH /bills/:id { "paid": boolean }` — independent of transaction linking.

---

## Revenues

Structurally identical to Bills (`received` in place of `paid`).

```
GET    /revenues?from&to&status        // status: all|pending|received|overdue
POST   /revenues                        // CreateRevenue mirrors CreateBill
GET    /revenues/:id                    // { revenue, instances, linkedTransaction }
PATCH  /revenues/:id
DELETE /revenues/:id                    // 409 when received = true
```

```ts
interface RevenueListResponse {
  summary: {
    totalExpected: Money;
    totalReceived: Money;
    totalPending: Money;
    overdue: Money;
  };
  items: Revenue[];
}
```

---

## Recurrences

No create endpoint — recurrences are born from a Bill/Revenue (§6 confirmed).

```
GET /recurrences?from&to
```

```ts
interface RecurrenceListResponse {
  summary: {
    recurringOutflow: Money;
    activeCount: number;
    inactiveCount: number;
  };
  items: Array<
    Recurrence & {
      name: string; // from most recent instance
      type: "bill" | "revenue";
      nextInstance: ISODate | null;
    }
  >;
}
```

```
GET /recurrences/:id
```

```ts
interface RecurrenceDetailResponse {
  recurrence: Recurrence;
  name: string;
  type: "bill" | "revenue";
  instances: Array<Bill | Revenue>; // past + window
  variance: Array<{ date: ISODate; estimated: Money; actual: Money | null }>;
}
```

```
PATCH /recurrences/:id              // config changes apply to FUTURE instances only
POST  /recurrences/:id/deactivate   // preserves current instance, detaches config, no future instances
```

---

## Wallets

List is **not** period-scoped (patrimony is current); comparison windows are fixed at last 3 months.

```
GET /wallets
```

```ts
interface WalletListResponse {
  summary: {
    totalPatrimony: Money;
    activeCount: number;
    archivedCount: number;
    patrimonyVs3moAvg: { delta: Money; pct: number };
  };
  trend: Array<{ date: ISODate; total: Money }>; // patrimony trend chart
  items: Array<Wallet & { vsAverageDelta: Money }>; // drives table delta + diverging bars
}
```

```
POST /wallets                       // { name, description? } — balance starts at 0
GET  /wallets/:id?from&to           // detail
```

```ts
interface WalletDetailResponse {
  wallet: Wallet;
  summary: { currentBalance: Money; threeMonthAverage: Money };
  balanceSeries: Array<{ date: ISODate; balance: Money }>;
}
```

The wallet-detail transactions table reuses `GET /transactions?wallet=:id&from&to` — no dedicated endpoint.

```
PATCH /wallets/:id                  // name/description/balance; editing balance generates a Manual Adjustment txn for the delta
POST  /wallets/:id/archive          // excluded from dashboard & selectors; history preserved
POST  /wallets/:id/unarchive
```

---

## Sources

No stat row (kept lean, §8).

```
GET /sources?from&to
```

```ts
interface SourceListResponse {
  items: Array<Source & { income: Money; outcome: Money }>;
}
```

```
POST  /sources                      // { name, description? }
GET   /sources/:id?from&to
```

```ts
interface SourceDetailResponse {
  source: Source;
  summary: { totalIncome: Money; totalOutcome: Money };
  bills: Bill[];
  revenues: Revenue[];
}
```

```
PATCH /sources/:id                  // name/description
POST  /sources/:id/archive          // 409 ARCHIVE_BLOCKED when hasOpenItems = true
POST  /sources/:id/unarchive
```

The FE disables the Archive control when `hasOpenItems` is true (§8 proposal); the `409` is the backstop.

---

## Categories

No stat row (kept lean, §9).

```
GET /categories?from&to
```

```ts
interface CategoryListResponse {
  items: Array<Category & { income: Money; outcome: Money }>;
}
```

```
POST  /categories                   // { name, description? }
GET   /categories/:id?from&to
```

```ts
interface CategoryDetailResponse {
  category: Category;
  summary: { totalIncome: Money; totalOutcome: Money };
  breakdown: Array<{ bucket: ISODate; income: Money; outcome: Money }>; // grouped by time (week/month)
}
```

Bucket granularity (week vs month) is chosen by the BE from the period length; transactions table reuses `GET /transactions?category=:id&from&to`.

```
PATCH /categories/:id               // name/description
POST  /categories/:id/archive       // excluded from selectors; existing txns unaffected
POST  /categories/:id/unarchive
```

---

## Selector population

The create/edit transaction modal needs active entities to populate id selectors once a type is picked (dynamic from/to filtering, §2). Reuse the list endpoints with an `active=true` filter rather than adding bespoke endpoints:

```
GET /wallets?active=true
GET /revenues?active=true       // referenceable as 'from'
GET /bills?active=true          // referenceable as 'to'
GET /categories?active=true
```

The legal `fromType → toType` map (six combinations) is a FE constant; these calls only fill the id dropdown for the chosen type.
