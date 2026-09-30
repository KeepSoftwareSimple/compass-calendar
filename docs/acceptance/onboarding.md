# Onboarding And Teaching Surfaces

This runbook covers welcome, Block Party practice, sidebar tips, billing
gates, and the rule that at most one onboarding card or modal is on screen at
a time. Keyboard shortcut bindings themselves live in
[Shortcuts](./shortcuts.md).

Teaching surfaces and their coordinator are documented in
[Frontend Runtime Flow](../frontend/frontend-runtime-flow.md#welcome-showcase-and-first-event-handoff).

## Scope

Use this guide to validate:

- only one onboarding card or modal at a time (`RootShell` surface priority)
- the billing gate and checkout celebration hiding lower-priority prompts
- the welcome flow with the mouse (every control responds to clicks)
- opt-in Block Party practice (`?play=1`, command palette, welcome footer)
- sidebar tip mute and five-minute rotation
- trial card banner dismissal persisting for the current trial end date
- palette **Next time, press …** teaching (see [Shortcuts scenario 25](./shortcuts.md#scenario-25-the-palette-teaches-its-shortcuts))

The sidebar tip and the `?` legend are not onboarding cards and may appear
alongside a card when the coordinator allows it.

Do not use this guide for full shortcut parity (see `shortcuts.md`) or auth
flows (see `auth.md`).

## Setup

1. Start the app with `bun run dev:web` (anonymous IndexedDB is enough for
   most scenarios).
2. Use a fresh browser profile or clear cookies and local storage unless a
   scenario needs persisted flags.
3. Use a desktop viewport (onboarding overlays are skipped on mobile OSes).

Helpful storage keys:

- `compass.onboarding.has-seen-welcome`
- `compass.onboarding.welcome-exit` (`STORAGE_KEYS.WELCOME_EXIT`, explore vs
  signup CTA)
- `compass.onboarding.has-seen-shortcut-showcase`
- `compass.onboarding.shortcut-showcase-outcome` (`finished` or `skipped`)
- `compass.onboarding.first-event-done`
- `compass.shortcuts.tips-muted` (`STORAGE_KEYS.SHORTCUT_TIPS_MUTED`)
- `compass.shortcuts.personalization` (shortcut usage / Explorer retirement)
- `compass.billing.trial-card-banner-dismissed-for`
  (`STORAGE_KEYS.TRIAL_CARD_BANNER_DISMISSED_FOR`)

Automated coverage: `e2e/onboarding/welcome-mouse.spec.ts`,
`e2e/onboarding/shortcut-showcase.spec.ts`,
`e2e/onboarding/billing-gate-hides-prompts.spec.ts`, and
`e2e/billing/signup-trial-step.spec.ts`.

---

## Scenario 1: One Surface At A Time

### UX

`RootShell` owns an ordered list of teaching surfaces. Only the highest-priority
surface that wants the screen is mounted. Lower surfaces wait their turn.

Priority (highest first): billing gate, checkout celebration, welcome modal,
Shortcut Showcase, welcome guide, connect-calendar prompt, first-event prompt,
palette `PointerHint`. While `?auth=trial` keeps the signup trial step open,
`RootShell` suppresses the billing gate and calendar onboarding so Checkout
owns the screen (same app-lock behavior as the gate).

### Steps

1. Open `/week` as a first-time anonymous visitor.
2. Confirm the welcome dialog is visible.
3. Dismiss welcome with **Explore without an account**.
4. Open the command palette and start **Play Block Party**.
5. While Block Party is open, confirm no first-event card stacks on top.

### Expected Results

- Step 2: only the welcome dialog is an onboarding card; no connect-calendar
  or first-event card appears underneath.
- Step 5: the practice region is the sole onboarding card; the first-event
  complementary card stays hidden until practice closes.

---

## Scenario 2: Billing Gate Hides Prompts

### UX

When the signed-in account cannot write (`awaiting_checkout`, expired, or
canceled), the billing gate owns the screen. Welcome, practice, connect
calendar, first-event, sidebar teaching copy, and palette `PointerHint` do
not appear above or beside the gate.

### Steps

1. Sign in on an account that is read-only with status `awaiting_checkout`
   (or use the e2e mock in `billing-gate-hides-prompts.spec.ts`).
2. Clear welcome and showcase flags so a fresh visitor would normally see them.
3. Load `/week`.
4. Optionally append `?play=1` and reload.

### Expected Results

- The **Finish starting your trial** billing dialog is visible (or the
  subscribe variant for expired/canceled accounts).
- No welcome dialog, Block Party region, connect-calendar prompt, or
  first-event card is present.
- `?play=1` does not open Block Party while the gate is up.

---

## Scenario 3: Welcome Flow With The Mouse

### UX

Every welcome control works with the mouse. No screen refuses clicks or shows
"No clicks allowed".

### Steps

1. Open `/week` in a fresh profile.
2. Click **Get started for free**.
3. Expand each FAQ row by clicking its question button.
4. Click **Next**, then click **Practice the shortcuts** in the footer.
5. On Block Party, click **Start practicing**.

### Expected Results

- Each click advances or toggles state; focus and `aria-expanded` update on
  FAQ rows.
- Block Party opens from the footer link without requiring keyboard shortcuts.
- Covered by `e2e/onboarding/welcome-mouse.spec.ts`.

---

## Scenario 4: Block Party Is Opt-In

### UX

Block Party does not auto-start when welcome closes or after signup. Entry
points are the welcome footer link, `?play=1`, and the command palette
(**Play Block Party**).

### Steps

1. Fresh profile on `/week`; complete welcome with **Explore without an account**.
2. Confirm Block Party is closed.
3. Open `/week?play=1`.
4. Open the command palette and run **Play Block Party** after closing practice.

### Expected Results

- Step 2: no Shortcut practice region.
- Step 3: Block Party how-to card opens; `play=` is stripped from the URL.
- Step 4: practice reopens from the palette.
- Covered by `e2e/onboarding/shortcut-showcase.spec.ts`.

---

## Scenario 5: Sidebar Tip Mute

### UX

The sidebar status bar rotates shortcut tips every five minutes for most
browsers. **Newcomer** browsers (shortcut level 1) rotate every **60 seconds**
and rank tips that match pointer intents detected this session first. **Hide
tips** on the tip mutes sidebar tips, pointer-intent pills, and palette
teaching hints via `compass.shortcuts.tips-muted`. The command palette exposes
**Hide shortcut tips** / **Show shortcut tips**.

### Steps

1. Load `/week` after welcome and showcase flags are set (signed-in or
   explore-without-account with sample events).
2. Open the sidebar if collapsed; note the tip in the status bar.
3. Click **Hide tips** on the tip (or Tab to it and press Enter).
4. Open the command palette, run **Create event**, and confirm no **Next time,
   press …** pill appears.
5. Open the palette and run **Show shortcut tips**.
6. Run **Create event** again.

### Expected Results

- Step 3: the sidebar tip disappears and stays hidden after reload.
- Step 4: no palette `PointerHint` pill.
- Step 6: the pill returns after tips are shown again.

---

## Scenario 6: Trial Step After Signup

### UX

On hosted billing, email or OAuth signup finishes with a read-only account in
`awaiting_checkout`, then the auth modal shows the **Start your 7-day free
trial** step: charge-date copy and embedded Checkout (`trial_period_days: 7`).
Closing the step without paying opens **Finish starting your trial**
(`BillingGateModal`) with **Add card** and **Look around first**. Completing
Checkout runs anonymous event migration once billing becomes writable.

### Steps

1. On staging (or `e2e/billing/signup-trial-step.spec.ts` mocks), sign up a
   fresh hosted account with billing enforcement on, or open `/week?auth=trial`
   while signed in with `awaiting_checkout`.
2. Confirm the trial step dialog title and the sentence that the card will not
   be charged until a date seven days out.
3. Press Escape (or **Back**) to leave Checkout without paying.
4. Confirm the billing gate dialog **Finish starting your trial** is visible.
5. Optional on staging: complete Checkout with a test card, wait for the
   celebration, and confirm writes succeed and local-only events synced.

### Expected Results

- Step 2: only the trial step auth dialog is a full-screen lock; calendar
  onboarding cards stay hidden.
- Step 4: gate copy matches **Finish starting your trial**; **Look around
  first** returns to read-only calendar preview.
- Step 5: status becomes `trialing` with a Stripe subscription id; anonymous
  IndexedDB events migrate once (see `complete-checkout-session.ts`).
- Covered by `e2e/billing/signup-trial-step.spec.ts` for steps 1 to 4.
