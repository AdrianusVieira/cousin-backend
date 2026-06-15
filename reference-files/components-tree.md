# Tech Spec — Frontend Component Tree

**Stack:** React + TypeScript · **Companion to:** `ui-spec.md`, `design-system.md`, `api-contracts.md`

---

## Stack choices

| Concern               | Choice                           | Rationale                                                                                               |
| :-------------------- | :------------------------------- | :------------------------------------------------------------------------------------------------------ |
| Server state          | **TanStack Query**               | Caching, refetch-on-key-change, mutation invalidation. The period/filter URL params are the query keys. |
| Routing               | **React Router**                 | Routes map 1:1 to `ui-spec.md`.                                                                         |
| Period & filter state | **URL search params**            | Shareable, refresh-safe, back-button works; doubles as the query key. No store needed.                  |
| Forms                 | **react-hook-form + Zod**        | Zod schema validates client-side; API `422 fields` maps onto RHF `setError` for inline display (§0.5).  |
| Charts                | **Recharts**                     | `design-system.md` §7.3 already specifies Recharts config.                                              |
| Theme                 | **React context + localStorage** | The only truly global client state. `data-theme` on `<html>` per design system §9.                      |

**No global state store.** Server data lives in the Query cache; period/filters live in the URL; the rest is local component state. Theme is the lone exception.

---

## State model

### Server state — query keys & ownership

One query hook per aggregate endpoint. Page components own the query for their screen; presentational components receive data via props.

```
useDashboard(period)            useTransactions(filters)        useCredit(period, status)
useBills(period, status)        useBill(id)                     useRevenues / useRevenue(id)
useRecurrences(period)          useRecurrence(id)               useWallets()
useWallet(id, period)           useSources(period)              useSource(id, period)
useCategories(period)           useCategory(id, period)
```

Key shape: `['transactions', filters]`, `['wallet', id, period]`, etc. Period objects are normalized to `{ from, to }` before keying so equal ranges hit the cache.

### Mutation invalidation map

Money mutations fan out. The non-obvious ones:

| Mutation                                  | Invalidates                                                                            |
| :---------------------------------------- | :------------------------------------------------------------------------------------- |
| Create/edit/delete **debit** txn          | `transactions`, `wallet(involved)`, `wallets`, `dashboard`; `bill`/`revenue` if linked |
| Edit wallet balance (→ manual adjustment) | `wallet(id)`, `wallets`, `transactions`, `dashboard`                                   |
| Settle credit                             | `credit`, `transactions`, `dashboard`                                                  |
| Toggle bill paid / revenue received       | `bill`/`revenue`(id), list, `sources`(may flip `hasOpenItems`), `dashboard`            |
| Archive source/wallet/category            | that list, `dashboard`, relevant selectors                                             |
| Create bill/revenue with recurrence       | list, `recurrences`, `dashboard`                                                       |

### URL state

```
/transactions?from=2026-03-12&to=2026-06-18&method=debit&category=<uuid>&wallet=<uuid>
```

`PeriodSelector` and `FilterSegment`/filter dropdowns write to the URL; hooks read from it. Detail-view periods use the same params.

### Local state

Modal open/close, dropdown panel open, custom-range draft dates before `Apply`, form field state (owned by RHF). Never lifted to global.

---

## Routing

```
/                    Dashboard
/transactions        Transactions
/credit              Credit
/bills               Bills          /bills/:id        BillDetail
/revenues            Revenues       /revenues/:id     RevenueDetail
/recurrences         Recurrences    /recurrences/:id  RecurrenceDetail
/wallets             Wallets        /wallets/:id      WalletDetail
/sources             Sources        /sources/:id      SourceDetail
/categories          Categories     /categories/:id   CategoryDetail
```

Detail routes are not nav items; they highlight their parent nav entry (§0.1).

---

## Component tree

```
<App>
└─ <ThemeProvider>
   └─ <QueryClientProvider>
      └─ <AppShell>
         ├─ <Sidebar>                  nav groups: Overview · Money · Ledger · Structure
         └─ <MainArea>                 ledger-line background, scroll container
            └─ <Routes> → one page component per route
```

### Design-system primitives (presentational, props-only)

Direct from `design-system.md`; no data fetching, no business logic.

```
<StatCard label value note accent>         §7.1
<DataCard>                                  §7.2  general container
<DataTable columns rows onRowClick>         §0.4  right-aligns money, tabular-nums
<Dropdown trigger options value onChange>   §7.4
<ProgressBar value accent>                  §7.5
<Notice>                                     §7.6  '!'-prefixed
<Pill kind>                                  status pills
<Value>                                      Playfair ≥21px, tabular-nums, money formatting
<AreaChart> <LineChart> <DivergingBars> <VarianceChart>   §7.3 Recharts wrappers
```

### Shared composite components

```
<PageHead title periodLabel actions>        title + period sub-line + actions slot
<PeriodSelector value onChange>              presets + inline From→To custom range (per image)
<FilterSegment options value onChange>       All / Debit / Credit, etc.
<CreateEditModal>                            scrim + header/body/footer (§0.5)

<TransactionsTable filters>        ◀ SMART: owns useTransactions(filters) + create/edit/delete
   └─ <TransactionForm>                      dynamic from/to (§2)

<BillForm> / <RevenueForm>
   └─ <RecurrenceFields>                     optional recurrence sub-form (shared by both)
```

`TransactionsTable` is the only shared component that fetches. It encapsulates query + mutations + its own form modal so it drops unchanged into Transactions, WalletDetail, and CategoryDetail — the host passes `filters` (`{}`, `{ wallet }`, or `{ category }`).

### Pages

Each page owns its aggregate query and composes primitives. Layouts are in `ui-spec.md`; this is the composition.

```
<Dashboard>          useDashboard
   ├─ <PageHead> + <PeriodSelector>
   ├─ StatCard ×4 (Revenue, Outcome, Net, SavingsRate)
   └─ <DataCard><AreaChart></>  +  <DataCard> PendingCredit (per-wallet <ProgressBar>s → Credit)

<Transactions>       (TransactionsTable owns the data)
   ├─ <PageHead> + <PeriodSelector> + "New transaction"
   ├─ StatCard ×3 (In, Out, Net)
   ├─ <FilterSegment> + category/wallet/date filters
   └─ <TransactionsTable filters={fromUrl} />

<Credit>             useCredit
   ├─ <PageHead> + <PeriodSelector>
   ├─ StatCard ×3 (Pending, Open Statements, Settled)
   ├─ <FilterSegment> Unsettled/Settled/All
   └─ <CreditGroupCard>×n  → Settle group / per-row Settle (useSettleCredit)

<Bills>              useBills              <BillDetail>        useBill
   ├─ PageHead + PeriodSelector + New      ├─ back link + PageHead + actions
   ├─ StatCard ×4                          ├─ StatCard ×3 (Value, Status, Linked Txn)
   ├─ <FilterSegment>                      ├─ <Notice> if flagged
   └─ <DataTable> rows→detail              └─ instance-history <DataTable>
        New → <CreateEditModal><BillForm>       Delete blocked (409) when paid → <Notice>

<Revenues> / <RevenueDetail>              mirror Bills with received semantics

<Recurrences>        useRecurrences       <RecurrenceDetail>  useRecurrence
   ├─ PageHead + PeriodSelector            ├─ back link + PageHead + Edit config/Deactivate
   ├─ StatCard ×3                          ├─ StatCard ×3
   └─ <DataTable> rows→detail              └─ <VarianceChart> + instances <DataTable>
        (no create entry point, §6)             config edits → future instances only

<Wallets>            useWallets           <WalletDetail>      useWallet
   ├─ PageHead + New (NOT period-scoped)   ├─ back link + PageHead + PeriodSelector + Edit/Archive
   ├─ StatCard ×3 (Patrimony, Active,      ├─ StatCard ×3 (Balance, 3-mo Avg, Status)
   │   Archived)                           ├─ <LineChart> balance over period
   ├─ <LineChart> trend + <DivergingBars>  └─ <TransactionsTable filters={{ wallet: id }} />
   └─ <DataTable> (active+archived dimmed)      edit balance → manual adjustment (background)

<Sources>            useSources           <SourceDetail>      useSource
   ├─ PageHead + PeriodSelector + New      ├─ back link + PageHead + Edit/Archive(disabled if open)
   │   (no stat row, §8)                   ├─ StatCard ×2 (Income, Outcome)
   └─ <DataTable> rows→detail              ├─ <Notice> archive-blocked when applicable
                                           └─ Bills (left) + Revenues (right), inline CRUD

<Categories>         useCategories        <CategoryDetail>    useCategory
   ├─ PageHead + PeriodSelector + New      ├─ back link + PageHead + Edit/Archive
   │   (no stat row, §9)                   ├─ StatCard ×2 (Income, Outcome)
   └─ <DataTable> rows→detail              ├─ <AreaChart> breakdown by time (week/month)
                                           └─ <TransactionsTable filters={{ category: id }} />
```

---

## Forms & validation

`react-hook-form` per form; Zod resolver mirrors the request types in `api-contracts.md`. Errors surface **inline under each field** (§0.5): client-side from the Zod schema, server-side by mapping the `422` `fields` map onto `setError`.

### TransactionForm — dynamic from/to (§2)

- A method toggle (Debit/Credit) at the top swaps the relevant field set (§2 proposal).
- The six legal `fromType → toType` combinations are a FE constant. Selecting `fromType` **filters** the `toType` options live; selecting a type populates its id dropdown from the matching `active=true` list query.
- `fromId`/`toId` selectors hidden when their type is `external`.
- Credit: `fromType` locked to `wallet`; `term` defaults to the 15th (editable); `installmentTotal` optional.

### RecurrenceFields

Shared sub-form inside `BillForm`/`RevenueForm`. Renders when "recurring" is toggled on; requires interval unit, interval value, recurrent day, and recurrent month when unit is `year`. Edits to an instance that belongs to a recurrence affect only that instance (the form targets the instance, not the config).

---

## Theme

`ThemeProvider` sets `data-theme` on `<html>`, initialized from localStorage, falling back to `prefers-color-scheme` (§9). Components read tokens only — zero theme logic below the provider.
