# Verification — Modules 4 & 5 (Customers, Invoices)

Everything that can be checked without a login has been. What is left needs a real
session as **both** an admin and a staff member on a warehouse-tier company.

```bash
npm run verify   # build + design-token lint + 103 tests
npm run dev      # http://localhost:5173 — already on the API's CORS allow-list
```

## Already verified

| Check | Result |
|---|---|
| `tsc -b && vite build` | passes |
| `check:tokens` (no hardcoded colour or type) | clean |
| 103 unit tests | pass |
| Totals engine, mutation-tested | removing the discount clamp, or taxing the post-discount base, each fails 2 tests |
| Every route exists on prod | `/customers`, `/customers/:id/statement`, `/invoices`, `/invoices/:id/pdf`, `/inventory/items`, `/approvals` all return 401, not 404 |
| Payload shapes vs the DTOs | asserted field by field in `src/serializers/__tests__/payloads.test.ts` |

---

## What needs your login

### 1. Customers — admin

- [ ] `/customers` lists real rows; the two summary tiles show company-wide totals
      (they come from the server's `summary`, not a count of the loaded page).
- [ ] Search finds a customer by name, company or email, and fires **one** request
      after you stop typing, not one per keystroke.
- [ ] Create a customer with a credit limit and Net 30 terms. It saves, and you land
      on its detail page.
- [ ] Open the same customer **in the mobile app**. The address, credit limit and
      payment terms all match. *(This is the real test of the `postalCode` rename, the
      string credit limit, and the `net_30 → net30` dialect — if any of the three were
      wrong, the save would have failed or the phone would show blanks.)*
- [ ] Detail → **Statement** tab: change the date range. Opening balance, the merged
      invoice/payment ledger, the running balance and the closing balance all render.
- [ ] Edit the customer directly via `/customers/:id/edit` in the URL bar (not by
      clicking through). The form is populated. *(It fetches by id; the app reads from
      its loaded list and shows a blank form here.)*

### 2. Invoices — admin

- [ ] `/invoices/new`: the customer picker contains the customer you just created.
- [ ] There is **no invoice-number field**, just "The invoice number is assigned when
      you save."
- [ ] Pick a customer → the due date jumps to match their payment terms.
- [ ] Add a line and link an **inventory item**: the description and rate auto-fill,
      and both stay editable.
- [ ] Enter a 10% discount on a taxed line. Check the summary panel against a
      calculator: **tax is charged on the pre-discount amount.** Subtotal − discount +
      tax = grand total.
- [ ] Enter a discount larger than the subtotal. The total floors at zero rather than
      going negative.
- [ ] **Save & Send.** The invoice posts immediately, appears in the list as `sent`,
      and the dashboard's AR tile moves.
- [ ] Compare that invoice against the same one on the phone — subtotal, discount, tax
      and grand total, **to the cent**.
- [ ] Download the PDF. It opens in a new tab with the server's real number
      (`INV-<year>-NNNN`), which will *not* be a number you typed.
- [ ] Void it, with a reason. The reason box refuses to submit under 3 characters.

### 3. The maker-checker loop — staff ⭐

This is the module's reason for existing.

- [ ] Sign in as **staff** and open `/invoices/new`. There is a warning note: *"This
      invoice will be sent to the owner for approval before it posts."*
- [ ] There is **one** submit button and it reads **"Send for approval"** — no
      "Save draft".
- [ ] Submit it. You land on **`/my-requests`** with a pending row naming the effect
      ("Creates the invoice and recognises the sale").
- [ ] **The invoice list does not contain it.** Neither do Reports, nor the ledger,
      nor stock. Nothing was created — the server filed a request and wrote nothing else.
- [ ] `/invoices` shows the amber "Waiting for approval" strip above the table,
      captioned "Sent to the owner · not an invoice yet".
- [ ] Approve it **on the phone** (the web inbox is Module 18). Reload the web app:
      the invoice now appears in the list, and the My Requests row flips to approved.
- [ ] Repeat, and **reject** it on the phone with a reason. The My Requests row shows
      the owner's reason back to the staff member.
- [ ] Submit another, then **Withdraw** it from My Requests. It disappears from the
      owner's queue and nothing posts.

### 4. Permissions — staff

- [ ] Customer detail has **no** Deactivate button. *(`toggle-active` is
      `@Roles('admin')`; the mobile app shows it to staff, who get a 403.)*
- [ ] Invoice detail has **no** Delete button.
- [ ] Invoice detail's Void button reads **"Send for approval"**.
- [ ] Typing `/accounts`, `/settings/users`, `/reconciliations` or `/budgets` into the
      URL bar redirects to the dashboard rather than rendering a 403 screen.

---

## Known gaps, by design

- **The invoice list shows only the first 50 rows** and its summary tiles are labelled
  "(loaded)". `GET /invoices` returns a bare array — `InvoicesService.list` returns a
  flat `{data, summary, pagination}` and the response envelope discards everything but
  `data`. There is no page count to page with. `GET /customers` nests one level deeper
  and keeps its metadata, which is why that list pages properly. Fixing this is a
  one-line backend change, listed in the plan's follow-ups.
- **Record Payment** on invoice detail is Module 8; the button is absent for now.
- **The owner's Approvals inbox** is Module 18 — approvals must be decided on the phone.
- **Tax rates are hardcoded** at 0/5/10/17% in both clients, while `GET /taxes/rates`
  is live. Worth switching both together so they cannot disagree.

---

# Modules 6 & 7 — Estimates and Sales Orders

## Already verified

| Check | Result |
|---|---|
| `npm run verify` | build + token lint + **140 tests** pass |
| Fulfilment arithmetic, mutation-tested | sending a delta instead of the cumulative total → 3 failures; a 0–1 progress fraction → 2; allowing line edits on a partial order → 1 |
| Invoice module unchanged by the shared-form refactor | all module-5 tests pass untouched; `InvoiceFormPage` went 485 → 307 lines |
| Estimate status route verb | `POST /estimates/:id/status` → **404**; `PATCH` → 401. The brief had the wrong verb |
| Every route exists on prod | estimates, sales-orders, both convert routes, fulfil, cancel — all 401, not 404 |

## What needs your login

### 1. Estimates — admin

- [ ] Create an estimate. Confirm there is **no estimate-number field** and that the
      saved record gets `EST-<year>-NNNN`.
- [ ] **Save draft** works — the mobile app cannot make a draft (it hardcodes `sent`),
      so this is web-only. Then use **Mark sent**, **Mark accepted**.
- [ ] Set a "valid until" date in the past on a sent estimate. The list shows an
      **expired** hint. Note the status itself never becomes `expired` — no server code
      ever writes it — and the estimate is still convertible. That is intended.
- [ ] Compare the estimate's totals against the same estimate on the phone, to the cent.

### 2. Converting — admin

- [ ] Convert an accepted estimate **to a sales order**. Nothing posts; you land on the
      new order; the estimate shows a link to what it became.
- [ ] Convert another estimate **to an invoice**. Read the dialog: it should say the
      invoice posts immediately and decrements stock. Confirm the resulting invoice is
      dated **today, not the estimate date**, and lands as `sent`.
- [ ] Convert an estimate whose line is short on stock. You should get
      **`INSUFFICIENT_STOCK`** naming the item and the shortfall — not a generic error.

### 3. Sales orders and fulfilment — admin ⭐

The fulfil dialog is net-new UI the mobile app does not have, so it has no counterpart to
check against. These four steps are the ones that matter.

- [ ] Create a sales order with three lines.
- [ ] **Record shipment**: ship part of line 1 and part of line 2, leave line 3 alone.
      Confirm the order becomes `partial` and each line's remaining quantity is right.
- [ ] **Record shipment again** on line 1. Confirm the figure **accumulates** — if line 1
      was at 3 and you ship 2 more it must read 5, not 2. *(The API takes a cumulative
      total, not a delta; this is the single most likely thing to be silently wrong.)*
- [ ] Try to ship more than was ordered. The dialog should refuse before sending, and
      explain that the server rejects the whole shipment if any one line is over.
- [ ] Open the partially-shipped order for edit. **Lines are locked**, with the reason
      shown; dates and notes still editable. *(Sending lines would reset every line's
      fulfilment to zero — the server does this silently.)*
- [ ] Convert the partially-shipped order to an invoice. The dialog must warn that it
      bills and decrements the **full ordered quantity** — there is no partial invoicing.
- [ ] Cancel a different order. It confirms destructively and says it cannot be undone.

### 4. The approval gate — staff ⭐

- [ ] As **staff**, open an estimate. **Convert to invoice is absent**; Convert to sales
      order is present. A note explains that invoicing is the owner's action.
- [ ] As **staff**, open a sales order. **Convert to invoice is absent**; Record shipment
      is present.
- [ ] As **staff**, create an estimate and a sales order. Both save **directly**, with no
      approval wording anywhere — `estimate.create` and `salesOrder.create` are `direct`.

> **Know what this gate is and is not.** `POST /estimates/:id/convert-to-invoice` and the
> sales-order equivalent have **no maker-checker branch** — they call
> `InvoicesService.create` with `status: 'sent'` regardless of role. Hiding the button
> closes the hole in this UI only; a staff token can still call the API directly. The
> real fix is the three-line branch the invoices controller already has, applied to both
> convert routes. It is the first item in the plan's follow-ups.

## Known gaps, by design

- Estimate and sales-order lists show the first 50 rows only — both endpoints return a
  bare array, their `pagination` and `summary` discarded by the response envelope.
- Sales orders are **warehouse-tier only** (`@RequiresFeature('salesOrders')`). The nav
  and the estimate's convert-to-sales-order button are both gated accordingly.
- Fulfilment moves **no stock**. It is a bookkeeping counter; nothing is reserved between
  order and invoice, which is why `INSUFFICIENT_STOCK` can only appear at conversion.

---

# Modules 8 & 9 — Receive Payments and Credit Memos

## Already verified

| Check | Result |
|---|---|
| `npm run verify` | build + token lint + **175 tests** pass |
| Allocation maths, mutation-tested | removing the per-row balance cap → 4 failures; letting unapplied go negative → 1; sending `applications` only when non-empty → 1; leaving Void available after a partial apply → 1 |
| Every route exists on prod | payments, outstanding, credit-memos, apply/refund/void, accounts — all 401, not 404 |
| Payload shapes vs the DTOs | asserted field by field in `src/serializers/__tests__/paymentPayloads.test.ts` |

## What needs your login

### 1. Receiving a payment — admin

- [ ] `/payments` lists received payments. Note there is **no status column and no
      payment number** — the API has neither; the reference (or a short id) is the handle.
- [ ] Receive a payment allocating across **two** invoices. Both balances drop; one fully
      covered becomes `paid`, a partly covered one becomes `partial` (or `overdue` if past
      due).
- [ ] Use **Pay in full** — every invoice ticks and the amount matches the total
      outstanding.
- [ ] Enter an amount **larger** than the allocations. The summary shows an
      **amber "Unapplied amount"**, and after saving the customer's balance has gone
      negative by that much (a credit).
- [ ] Try to allocate an invoice **more than it owes**. The row goes red and the form
      refuses before sending — the server would reject the whole payment otherwise.
- [ ] Leave **Deposit to** on *Automatic* with method `cash` → lands in account **1000
      Cash**. Repeat with `bank_transfer` → **1010 Business Checking**. Then pick an
      account explicitly and confirm it goes there instead.
- [ ] Set a payment date inside a closed period. The error should name
      **`PERIOD_LOCKED`**, not a generic failure.

### 2. Auto-apply vs manual ⭐

This is the one the mobile app gets wrong, so it is worth doing deliberately.

- [ ] With a customer who has **three** open invoices, choose **Apply automatically,
      oldest first** and pay enough to cover one and a half. Confirm the server settled
      the two oldest, oldest first, and held the rest as credit.
- [ ] Now repeat in **Allocate manually** mode, ticking only the *newest* invoice.
      Confirm **only that invoice** was settled — the older ones are untouched.

> On the phone, that second case is not achievable: leaving allocations empty omits the
> array, which the server reads as "apply it for me". The app's *Save as customer credit*
> toggle promises the money will be held and then applies it anyway. Web always sends the
> explicit array in manual mode, so what you tick is what happens.

### 3. Credit memos — admin

- [ ] Raise a memo with one **inventory-linked** line and one **free-text** line. Confirm
      the linked line put stock back and the free-text line credited money only.
- [ ] **Apply** part of the credit to one invoice — the amount is pre-filled with the
      maximum but is editable. Then apply the remainder to a second invoice. `Available`
      reaches zero and the status becomes `closed`.
- [ ] Confirm **Void disappears** as soon as any amount has been applied (the server
      refuses with `ALREADY_APPLIED`, so the button must not be there to press).
- [ ] On a fresh memo, use **Refund remaining**. The dialog should say it refunds the
      **whole** balance to Cash, dated today — there is no partial refund.
- [ ] Search the list by credit memo number. Note it searches **the number only** — not
      the reason, not the customer name.

### 4. Approvals — staff ⭐

- [ ] **Payment:** the button reads **"Send for approval"**. After submitting you land on
      My Requests, and **the invoices stay unpaid** until an admin approves on the phone.
- [ ] **Credit memo:** all four actions — Issue, Apply, Refund, Void — read "Send for
      approval" and each creates a pending request rather than acting. *(Broader than the
      brief assumed: apply and refund are gated too, and they return HTTP 200 rather than
      201, which is why the client checks for a pending body on every one.)*
- [ ] Payment detail has **no Reverse payment** button for staff — that route is admin-only
      with no approval path, so staff cannot even request it.

### 5. The module 5 gap

- [ ] Open an invoice with a balance. It now has a **Record payment** button, and it
      opens the payment form with that customer selected and that invoice pre-ticked.

## Known gaps, by design

- Payments and credit-memo lists show the first 50 rows only — both endpoints return a
  bare array with their pagination discarded by the response envelope.
- `GET /payments` ignores a **From** date unless **To** is also set; the form says so.
- A customer who has open invoices cannot be given a zero-allocation prepayment — an
  empty `applications` array is the auto-apply signal, and there is no "apply nothing".
- Credit memos cannot be edited. There is no PATCH route: a memo is immutable once
  issued, so correcting one means voiding it and raising another.

---

# Modules 10–13 — Vendors, Bills, Pay Bills and Purchase Orders

The whole accounts-payable side. Everything built before this records money coming in;
nothing recorded money going out.

## Already verified

- `npm run verify` — build, design-token lint, **307 tests** across 12 files.
- **18 mutation tests, 18 killed.** Each asserts the mutation actually applied before
  running, so a stale find-string reports a failure rather than a false pass. The ones
  worth naming, because each is a mistake that produces no visible symptom:
  - sending today's **delta** rather than the cumulative `receivedQty` (would claw stock
    back off the shelf on the *second* delivery, silently);
  - including zero-arrival lines instead of omitting them (would reset a line to zero);
  - checking over-receipt against today's arrival alone rather than the running total;
  - relaxing the PO edit gate to what the server allows (would destroy the receipt record);
  - valuing a Convert-to-Bill at the **ordered** rather than the **received** quantity;
  - the four ways the `overdue` derivation can go wrong (drop the balance test, use `<=`
    so a bill due today reads late, include drafts, or trust the server's status);
  - letting a **draft** bill be paid;
  - taxing a bill line on the running subtotal rather than its own amount;
  - `name` instead of `companyName`, `zipCode` instead of `postalCode`, a blank
    `defaultExpenseAccountId` sent rather than omitted, `issueDate`/`notes` instead of
    `billDate`/`memo`, `quantity`/`unitPrice` instead of `orderedQty`/`unitCost`, a blank
    `expectedDate` sent rather than omitted;
  - reporting a payment's whole total on a bill instead of that bill's own share.
- The allocation-table generalisation was proved by the **existing module-8 tests passing
  untouched** — the payments refactor changed no behaviour.
- Both list contracts are pinned by test: `GET /vendors` **keeps** its pagination (it nests
  one level deeper), `GET /bills` and `GET /purchase-orders` **lose** theirs (they are
  flat, so the envelope discards it).

## Two bugs found and fixed while testing this pass

Both pre-existing, neither related to modules 10–13, both caught by the route-access test
once it was run against the current nav:

- **`/dashboard` was not a route.** Both nav maps point Dashboard at `/dashboard` while the
  router only defined the index route at `/`, so clicking Dashboard in the sidebar landed
  on the "module not built" placeholder. The dashboard is now served at both paths.
- **Staff were locked out of `/`.** `isPathAllowedForRole` correctly refuses to treat `/`
  as a *prefix* (as one it would allow every path there is), but that also refused it as an
  exact path — so a staff member arriving at the bare origin was redirected away from their
  own dashboard. `/` is now allowed as an exact match only.

## What needs your login

### 1. Vendors — admin

- [ ] Create a vendor. Confirm it then appears in the **bill** and **purchase-order**
      vendor pickers. *(Your stated check for module 10.)*
- [ ] Confirm the balance reads as **"You owe"** and is coloured **red** above zero —
      the inverse of a customer balance, which is money owed *to* you. Getting this
      backwards is the single easiest mistake on this screen.
- [ ] Set a **default expense account** on the vendor, then start a new bill for them.
      The first line should be pre-coded to that account.
- [ ] Open **Statement**, change the date range, and confirm bills and payments interleave
      into one running-balance ledger.
- [ ] Try **Delete permanently** on a vendor that has a bill. The server should refuse with
      a message telling you to deactivate instead — that message is shown verbatim.

### 2. Bills — admin

- [ ] Raise a bill as a **draft**. Confirm accounts payable does *not* move.
- [ ] **Post to books**, and confirm AP aging now picks up the balance. *(Your stated
      check for module 11 — the report itself is module 17.)*
- [ ] Confirm **Edit disappears** once the bill is posted, and that pasting the edit URL
      shows "This bill is posted" rather than a form that cannot save.
- [ ] Enter a bill number that **already exists for that vendor**. You should get a soft
      warning naming the existing bill and its date — and still be able to save, because
      `billNumber` carries no unique constraint and a supplier genuinely can reissue one.
- [ ] Check the **Overdue tab** counts and filters correctly. It filters locally on purpose:
      the status is derived on read and never stored, so `?status=overdue` can only ever
      return an empty list.

### 3. Pay bills — admin ⭐

- [ ] Confirm the **proof upload is required** and that **Submit stays disabled until the
      upload succeeds** — not merely until a file is chosen. The footer states which piece
      is missing.
- [ ] Pay a bill. Confirm the bill's balance and the cash account **both** move.
- [ ] Pay **part** of a bill by editing its Applied figure. The bill becomes `partial` and
      owes the rest; pay the remainder later and it flips to `paid`. A full payment and a
      part payment must both go through — every bill payment once failed with
      `applications.0.amount must be a number string` because the request sent the
      response's field name, `amountApplied`, instead of `amount`.
- [ ] Tick **two bills** and pay one in full and one in part, in one payment. Both bills
      update, and the payment posts **one** journal entry (Dr A/P, Cr the bank account) for
      the total.
- [ ] Confirm there is **no Memo box**. `bill_payments` has no memo column, so a memo typed
      here was silently dropped; **Reference** is the free-text field that persists.
- [ ] Confirm the **receipt screen** appears rather than a toast, and that pressing Back
      cannot re-post the payment.
- [ ] Try to pay **more than a bill owes** — refused before anything is sent.
- [ ] Confirm a **draft** bill never appears in the payable list (the server refuses one
      with `BILL_NOT_POSTED`).
- [ ] Confirm the "pay from" picker has **no Automatic option**. Unlike receiving a
      customer payment, there is no server-side default account for money going out.
- [ ] Choose an account with less than the payment total. It should **warn but not block** —
      an overdraft is legitimate.

### 4. Pay bills — staff ⭐

- [ ] The button reads **"Send for approval"**, submitting lands on My Requests, and
      **the bills stay unpaid** until an admin approves on the phone. *(Module 12's check.)*

### 5. Purchase orders — admin ⭐

- [ ] Raise a PO, **Send to vendor**, then **receive part of one line**. Status becomes
      `partial` and inventory rises by the received quantity. *(Module 13's check.)*
- [ ] **Receive the same line again** and confirm the figure **accumulates** — 3 then 2
      should leave the line at 5, not 2. This is the one that catches a delta-versus-
      cumulative mistake, and nothing in the UI looks wrong when it is wrong.
- [ ] Confirm **Edit is gone** the moment the order leaves draft, and that pasting the edit
      URL is refused. PATCH rebuilds every line with `receivedQty` zeroed while the stock
      and the GRNI entry stay posted.
- [ ] **Convert to bill.** Confirm the confirmation states the **received** value, not the
      order total, and that the bill raised matches it.
- [ ] Try converting a **second** time. You should be offered a link to the existing bill
      rather than shown an error.
- [ ] Open the item picker on a PO line and confirm it fills the item's **cost**, not its
      selling price.

### 6. Purchase orders — staff ⭐

- [ ] Create reads **"Send for approval"**, **Edit is absent entirely**, and Send and
      Receive work immediately. *(Module 13's check.)*

### 7. The known-broken one

- [ ] Open a payment's **proof** from a bill's payment history. If it will not display, the
      UI should say the server returned a JSON envelope instead of the file, and name the
      stored filename — **not** show a broken image. That is the backend bug in the
      follow-ups, not a client fault.

## Known gaps, by design

- **Bills and purchase orders show the first 50 rows only.** Both endpoints are flat
  (`{data, pagination}` at the top level), so the response envelope discards the pagination
  and there is no page count to page against. Vendors *do* have a real pager, because that
  service nests one level deeper.
- **The Overdue bill tab filters client-side**, so it can only see overdue bills within
  those 50 rows. The alternative — a server filter that always returns nothing — is worse.
- **Vendor credits cannot be applied when paying a bill.** That is module 14; the form
  pays cash only and says so where a credit would otherwise apply.
- **A bill cannot be raised against a PO that has received stock.** The server refuses it
  with `BILL_PO_VIA_RECEIPT` and points at the PO's own Convert-to-Bill, which is the route
  the UI offers.
- **PO status transitions are the client's invention.** The server enforces none at all —
  it assigns the column and returns, `received → draft` included. Only forward moves are
  offered, because stock and GRNI have already posted by the time an order is `partial`.
- **A payment proof cannot currently be displayed** — see follow-up 1.

---

# Modules 1A+, 1B.1 & 1C+ — Landing, Role Selection and Subscriptions

The public and onboarding surface: a marketing landing page at `/`, a role picker that
splits the owner and staff doors, and one subscription card system shared by the landing,
onboarding and renewal.

## What the live API actually says

Probed by `curl` before any code was written. Three things contradicted the brief, and
each changed the design:

| Assumed | Actual |
|---|---|
| Plans come in 3- and 6-month terms | **6 and 12 months** |
| `GET /billing/plans` with a public fallback | That route is **401**. `GET /super-admin/plans/public` is the only unauthenticated source — and the richer of the two |
| Plans carry a `highlighted` flag | No such field. It is derived |
| `POST /companies/subscribe` is the payment path | The live path is `bank-details` → `billing/submit` (multipart) → `companies/:id/submit` |

The catalogue is **6 plans, all `companyType: "warehouse"`** — Starter / Growth / Scale
(3 / 5 / 10 riders) × 6 months / 1 year, Rs 2,250–6,000 per month. `features[]` and
`maxUsers: 25` are **byte-identical across all six**, so `deliveryPersonnelLimit` is the
only real differentiator.

`POST /auth/signup` takes `role` of **`admin` or `delivery` only — it refuses `staff`**.
That is the server's own validation message, and it is why the staff portal has no signup,
no password reset and no verification: a staff account cannot be created, recovered or
verified from anywhere but an owner's Settings → Users.

## Already verified

| Check | Evidence |
|---|---|
| `npm run verify` green | `tsc -b && vite build`, `check:tokens` clean, **377 tests pass** (up from 307) |
| 6 plans collapse to 3 cards + a 2-term toggle | `src/models/__tests__/plan.test.ts`, fixture captured verbatim from the live response |
| "25% less / mo" is computed, never typed | `savingsPercent` asserted = 25 for every tier; returns `null` when the longer term is not cheaper |
| Both wire shapes normalise to one `Plan` | The public `id`/`name` shape and the authed `key`/`label` shape asserted to the same type; the authed one has no `features` and must not crash for want of them |
| Prices are the server's own strings | Asserted `monthlyLabel === 'Rs 3,000'` and **not** containing `.00`. `formatMoney` hardcodes 2 decimals, so re-formatting would print `Rs 3,000.00` where the phone prints `Rs 3,000` |
| The staff portal is login-only | `src/features/auth/__tests__/loginPortals.test.tsx` — 13 assertions, including that the rendered page contains **no `<a href>` at all** and no text matching `/forgot/i`, `/sign ?up/i`, `/invite/i`, `/join/i` |
| Validation fails open | `loginSchema.test.ts` — the owner door requires an email; staff, absent and unrecognised roles all accept any non-empty string, so a tampered stored preference can never lock anyone out |
| `selectedRole` grants nothing | `selectedRole: 'admin'` with `user.role: 'staff'` leaves `isPathAllowedForRole` refusing `/accounts` and `/settings/users` |
| Sign-out keeps the chosen portal | Pins a real bug: both reset reducers use `Object.assign(state, initialState)`, which captured `initialState` at module load — a plain reset handed a staff member the owner's email form after every sign-out |
| `/join` is gone and stays gone | `src/app/__tests__/publicRoutes.test.ts` walks `router.routes` and asserts no path matches `/join|invite/i`. Nothing was deleted — it never existed — so a guard against re-addition is the only deliverable a removal can have |
| The landing makes no claim we cannot back | `landingHonesty.test.tsx` — 14 banned patterns fail the build: FBR/tax compliance, competitor names, `N% cheaper`, "trusted by", user counts, "most popular", uptime and "bank-grade" |
| Live pricing reaches the grid | Fetched the real endpoint through the serializer path: 6 plans → terms `[6, 12]` → 3 cards → `25% less / mo` → Growth highlighted |
| Entry bundle cut 61% | 1,507 kB / 442 kB gzip → **546 kB / 173 kB gzip**, by deferring every page except the landing itself |
| CORS already allows local dev | Preflight from `http://localhost:5173` returns 204 with a matching `Access-Control-Allow-Origin` |

## Decisions worth knowing before you read the code

- **`/` is routed OUTSIDE `SessionGate`.** Inside it, `SessionGate`'s `BootSplash` would
  show a spinner on the public homepage to anyone carrying a stale token — seconds of it on
  a sleeping dyno. The cost is that Redux auth state is unusable there, so `LandingPage`
  reads `hasSession()` synchronously instead.
- **The dashboard moved from `/` to `/dashboard`**, and nine call sites moved with it.
- **Onboarding, renewal and `/account-status` sit outside `RequireActiveCompany`** — they
  are reached precisely when the company is `draft` or `inactive`, so inside that guard they
  would be unreachable exactly when needed. Which puts them outside `RequireRouteAccess`
  too, hence the new `RequireOwner`.
- **`/account/renew` needed an explicit staff deny.** `/account` *is* a staff nav path and
  matching is by prefix, so the renewal screen inherited permission from "My Account".
  `STAFF_DENY_PREFIXES` in `routeAccess.ts` is checked before the allow-list.
- **`RequireActiveCompany` gained a `companyId === null` clause.** A freshly registered
  owner has no company, so `companyStatus` is `null`, which the old check read as "nothing
  to gate on" — landing them on a dashboard where every request 403s.
- **The badge reads "25% less / mo", not "Save 25%".** The longer term is cheaper per month
  but costs *more* in total, because it buys more months: Rs 18,000 for 6 months against
  Rs 27,000 for a year. A bare "Save 25%" beside the larger figure is a claim any buyer can
  disprove by subtracting.
- **The highlighted plan says "Recommended", not "Most popular".** There are no usage
  figures to support a popularity claim.
- **No framer-motion.** `src/components/motion/Reveal.tsx` is an `IntersectionObserver` and
  a CSS transition; it renders children *visible* when it cannot observe, so a missing
  observer degrades to no animation rather than to a blank page.
- **The hero chart is hand-drawn SVG, not recharts.** `ResponsiveContainer` measures on
  mount, so it paints nothing on the first frame and then reflows — a layout shift on the
  largest element of the page that most needs to be fast, for a chart with no data to bind.

## What needs your login

Everything below is `401` without credentials and therefore **ships unverified against a
real account**. That is a disclosure, not a defect — but work through it on your first
signed-in run.

### 1. Owner signup → company → plan → payment

- [ ] `/register` with a weak password. The four rules should tick green live, and the
      server should never be the first to tell you the password is short.
- [ ] Complete signup. You should land on `/verify-email`, **not** the dashboard — signup
      issues no token.
- [ ] Sign in before verifying. You should be sent back to `/verify-email`.
- [ ] After verifying, sign in. With no company yet you should land on
      `/onboarding/company` — **not** on a dashboard of failed panels. *(This is the
      `companyId === null` clause; if it regressed you will see the broken dashboard.)*
- [ ] Create the company. Confirm `@finmatrix/companyId` appears in localStorage
      **before** the plan step fetches — every later request is scoped by it.
- [ ] On `/onboarding/plan`, confirm the grid shows **3 cards and a 6 months / 1 year
      toggle**, that the toggle swaps the prices, and that Growth is marked Recommended.
- [ ] Choose a plan. **Confirm `GET /billing/bank-details?plan=<id>` accepts the id from
      the public catalogue** (e.g. `warehouse_growth_1yr`). This is the one unproven
      assumption in the whole flow: the plan keys are confirmed from
      `/super-admin/plans/public`, but that the *same* keys are honoured by `?plan=` is
      inferred from the mobile app, not observed. If it 404s, the authed `/billing/plans`
      uses different keys and the pay step needs to resolve them from there.
- [ ] Upload a receipt. Confirm the multipart field is named `screenshot`, that the plan is
      sent in both the query string and the body, and that `POST /companies/:id/submit`
      fires **after** the proof, not before.
- [ ] Confirm you land on `/account-status` reading "Waiting for approval".

### 2. Renewal, and the double-payment guard

- [ ] With an expired company, sign in. `/account-status` should read "Subscription
      expired" and offer **Renew subscription** — the old copy sent you to the mobile app.
- [ ] On `/account/renew`, submit a receipt. The page should then show "Your payment is
      being verified", the pay button should be **disabled**, and the plan cards should
      refuse selection. ⚠️ **This is the one that costs real money if it regresses** — a
      buyer who cannot see a pending submission will transfer twice.
- [ ] Leave the tab open. It should re-poll every 20 s and update itself without a reload.

### 3. Role selection and the two doors

- [ ] From `/`, click **Sign in** → `/get-started`. Operate both cards **by keyboard only**
      (Tab, then Enter and Space). Both must activate, with a visible focus ring.
- [ ] **Team member** → the page shows a Username field, a Password field, Sign in, and the
      owner switch. **Nothing else.** No Forgot password, no Create account, no links at
      all. The accent is teal and it says "Team member portal".
- [ ] **Business owner** → Email, Password, Forgot password, and Create a business account,
      all on one screen. Navy.
- [ ] Use the portal switch both ways, reload, and confirm the chosen door comes back.
- [ ] Sign out and return — the door should still be the one you chose.
- [ ] Sign in as staff with a username. Confirm it reaches the app, and that
      `/account/renew` and `/onboarding/plan` bounce you to `/dashboard`.

### 4. The landing page

- [ ] Pricing renders **live** figures. Kill your network and confirm you get a retry
      panel, never a hardcoded price.
- [ ] At 320 px wide: no horizontal scroll anywhere, and the mobile drawer traps focus and
      closes on Escape.
- [ ] With OS "reduce motion" on, nothing animates and **nothing is invisible**.
- [ ] Signed in, visit `/` — you should be sent to `/dashboard` with no flash of marketing.
- [ ] Lighthouse on `/` after `npm run build && npm run preview`: target ≥ 90 on
      Performance, Best Practices and Accessibility.

## Known gaps, by design

- **The plan keys are unproven against `?plan=`** — see check 1. Everything else in the
  billing flow is shape-verified; this one is inferred from the mobile client.
- **The landing ships no testimonials.** There are no real customer quotes yet, and a
  placeholder quote on a public page is worse than an empty slot. The use-case panel holds
  the position; drop a `Testimonials` section in when you have real ones.
- **The footer's contact address is carried over from the reference project**
  (`waleedhassansfd@gmail.com`), as the only address on record. Swap it for a support inbox
  before launch — a footer address that bounces is worse than no address.
- **Only warehouse plans exist**, so the landing is positioned for warehouse and
  distribution. If small-business or large-org plans are published, the grid picks them up
  with no code change, but the copy will need revisiting.
- **`POST /companies/subscribe` is called best-effort and its failure is swallowed.** What
  actually starts a subscription is an approved payment proof; the mobile app's live flow
  reaches the pay step regardless. Blocking on an advisory call would strand a buyer trying
  to pay.
- **No public 404.** A mistyped public URL falls into the authenticated layout's `*` route
  and an anonymous visitor is redirected to `/login` rather than shown a not-found page.
- **`isPathAllowedForRole('/')` still returns `true` for staff.** Harmless — `/` is public
  and never passes through `RequireRouteAccess` — but the special case is now dead code and
  its comment describes `/` as the staff dashboard, which it no longer is.

---

# Visual overhaul — landing, auth and onboarding surfaces

The first pass was functionally complete and tested but read as a wireframe: flat
`#f4f6f9` on every section, a ~190px void above the hero headline, 48px section padding,
white plan cards on a white section, and every auth screen a 440px card marooned on flat
grey. This pass changes the visual layer only — no routing, data, copy-claim or test
contract changed, and no existing test was edited.

## Already verified

| Check | Evidence |
|---|---|
| Gate green | `tsc -b` clean, `check:tokens` clean, **408 tests** across 19 files (384 before; the 24 added pin the `cn` fix below) |
| New utilities reach the CSS | Built CSS grepped for every new utility and variant — `surface-mesh-navy/teal`, `glow-primary`, `pattern-grid(-dark)`, `pattern-dots`, `texture-grain`, `glass-dark/light`, `fade-mask-b/radial`, `gradient-text-light`, `text-display-xl`, `py-section`, `lg:py-section-lg`, `motion-safe:animate-float` — all emitted, plus `@keyframes float` and the `forced-colors` fallback |
| Bundle | JS entry 546 kB / 173 kB gzip → **567 kB / 178 kB gzip** (+2.8%). CSS 46 kB / 8.9 kB → **69 kB / 12.2 kB gzip**. All texture is CSS; the grain tile is an inline SVG under 500 bytes |
| Rendered and reviewed, desktop | Headless Chrome at 1440px: `/` (hero and full page), `/get-started`, `/login?role=admin`, `/login?role=staff`, `/register`, and the pricing note, FAQ and CTA below the fold |
| Rendered and reviewed, phone | DevTools device emulation at 390×844 (headless windows cannot go below ~500px): every landing section, `/get-started`, both sign-in doors, `/register` |
| No horizontal scroll on phones | `document.documentElement.scrollWidth` is exactly **390** at a 390px viewport on `/`, `/get-started`, `/login?role=staff`, `/login?role=admin` and `/register` |
| Scroll reveals actually reveal | Hidden `Reveal` nodes counted before and after jumping to the pricing note, FAQ and CTA: **29 → 18** at 1440px, **27 → 17** at 390px. The difference is exactly the elements in those regions; the rest are in sections the jump skipped |
| Smooth scrolling is scoped | `document.documentElement.style.scrollBehavior` reads `smooth` on `/` and is empty again on `/get-started` |

## Bugs found and fixed

1. **tailwind-merge was deleting the type scale — pre-existing and app-wide.** It only
   knows Tailwind's default scales, so it filed `text-label-lg`, `text-overline` and
   every other role as a text *colour* and removed it whenever a real colour followed.
   Every `Button` lost its 600 weight and 20px leading; every `cn('text-overline', …)`
   eyebrow rendered as sentence-case body text (visible in the role picker before this
   pass). `src/lib/cn.ts` now extends the merger with this project's `text`, `shadow` and
   `spacing` scales; `src/lib/__tests__/cn.test.ts` fails if a role is dropped again.
2. **`Reveal` made on-screen content flicker and delayed LCP.** It decided in `useEffect`,
   after paint, so above-the-fold content painted, was hidden a frame later and faded back
   in — holding the hero headline, the page's largest paint, behind a 500ms transition. It
   now decides in a layout effect, and anything already on screen is never animated.
3. **`Reveal` never showed content resting in the last 60px of the screen at load** until
   the visitor scrolled, because of a `-60px` bottom root margin. Now `0px`.
4. **The floating hero card overlapped the hero paragraph** at 1440px (a −48px offset
   against a 40px column gap) and hid the "Recent invoices" label. Repositioned.
5. **The role-picker cards had unequal heights**: the signup link lived inside the owner
   column, so the staff card stretched taller. Now an explicit grid places both cards in
   row 1; the link keeps its DOM position under the owner card, so it still sits beneath
   it on a phone, and the page still has exactly one link.
6. **The recommended plan card overhung its gutter** by ~10px per side (`lg:scale-105`
   inside an equal-height grid). Replaced with a ring, a top rule and a deeper shadow.

## Decisions worth knowing before you read the code

- **Depth, not photographs.** No stock photos or video. Gradient meshes, line and dot
  grids, grain, glass and masks — all as `@utility` blocks in `src/index.css`, which the
  token gate never scans. Glows are radial gradients, not `filter: blur()` on large
  elements, so there is no filter pass for a phone to pay for.
- **New tokens, mirrored into `tokens.ts` and the `/dev/tokens` proof sheet:** a real
  navy ramp `primary-50 … primary-950` (the old `primary-light/-lighter/-tint` are all one
  value), `success-bright` and `accent-teal-950` for dark grounds, `--spacing-section`
  (88px) and `--spacing-section-lg` (120px), and a 56px `display-xl` hero role.
- **Utility names avoid anything Tailwind or tailwind-merge owns** — `surface-mesh-`,
  `pattern-`, `texture-`, `glass-`, `fade-mask-`, `gradient-text-`. None starts with
  `text-`, which the merger would file as a colour.
- **Page rhythm:** dark hero and proof strip → light sections → dark pricing → inset CTA
  panel → darkest footer. The inset panel removes the old seam where the `#1f4e79` CTA
  butted straight into the `#111d28` footer.
- **`AuthShell` has two layouts.** `width="sm"` is a split screen: a navy (owner) or teal
  (staff) brand panel beside the form, replaced on phones by a dark band behind the card.
  `width="lg"` (the role picker) stays centred on a full-bleed dark ground, because it
  needs its full width for two cards. None of the six calling pages changed.
- **The brand panel contains no links and none of the staff door's banned phrases.** jsdom
  applies no CSS, so the `hidden lg:flex` panel's text is still in the DOM the tests read —
  the existing `loginPortals` and `roleSelect` tests enforce this unmodified.
- **`PlanGrid` / `PlanCard` gained `tone`**, which changes only the highlight, the ribbon
  and the loading/error surfaces. The card body is identical on the landing page,
  onboarding and renewal.
- **Onboarding and renewal share one dark-header frame.** `/account/renew` now uses
  `OnboardingShell`, with a back link instead of a step rail.
- **Smooth anchor scrolling is on only while the landing page is mounted**, and never
  under reduced motion. A rule on `html` would reach the whole ERP; nothing there scrolls
  programmatically today, so this guards future code rather than fixing a visible bug.

## What needs a human

- [ ] **Lighthouse on `/`**, target ≥ 90 for Performance, Best Practices and Accessibility.
      `npm run preview` serves on 4173, which the API's CORS does not allow, so pricing
      shows its error state there. For a run with live pricing, stop the dev server and
      use `npm run preview -- --port 5173 --strictPort`.
- [ ] **Safari, macOS and iOS**: `backdrop-filter` on the scrolled nav and glass chips,
      `background-clip: text` on the hero phrase, and the pattern fades (`mask-image` is
      emitted both prefixed and unprefixed).
- [ ] **Exactly 1280px wide**: the floating hero cards first appear at `xl`. Confirm the
      approval card clears the paragraph at the narrowest width it shows.
- [ ] **OS reduce-motion on**: nothing animates, nothing stays hidden, anchor links jump.
- [ ] **Windows high contrast**: the hero's gradient phrase falls back to plain text.
- [ ] **Contrast on dark grounds**: the `white/55`–`white/65` small text (the proof-strip
      overline, footer legal lines) reads in captures but has not been measured.

## Known gaps, by design

- **Two headless capture artifacts that are not bugs:** a light strip along the bottom of
  desktop captures (headless Chrome's hidden 87px toolbar), and pages clipped on the right
  at phone width (its ~500px minimum window) — which is why phone checks used DevTools
  device emulation instead.
- **Figures in the hero picture and the auth brand panel are illustrations**, not customer
  data. The hero picture is exposed to assistive technology as one image with a
  description rather than as rows of invoice text.
- **`pattern-dots-dark` is defined but unused**, so Tailwind does not emit it.
- **The contact address is still the placeholder** carried over from the reference
  project (see the previous section).
