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
- `compass.onboarding.has-seen-shortcut-showcase`
- `compass.onboarding.first-event-done`
- `compass.shortcuts.tips-muted` (`STORAGE_KEYS.SHORTCUT_TIPS_MUTED`)
- `compass.billing.trial-card-banner-dismissed-for`
  (`STORAGE_KEYS.TRIAL_CARD_BANNER_DISMISSED_FOR`)

Automated coverage: `e2e/onboarding/welcome-mouse.spec.ts`,
`e2e/onboarding/shortcut-showcase.spec.ts`, and
`e2e/onboarding/billing-gate-hides-prompts.spec.ts`.

---

## Scenario 1: One Surface At A Time

### UX

`RootShell` owns an ordered list of teaching surfaces. Only the highest-priority
surface that wants the screen is mounted. Lower surfaces wait their turn.

Priority (highest first): billing gate, checkout celebration, welcome modal,
Shortcut Showcase, welcome guide, connect-calendar prompt, first-event prompt,
palette `PointerHint`.

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

- The **Start your 7-day trial** (or subscribe) billing dialog is visible.
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

The sidebar status bar rotates shortcut tips every five minutes. **Hide tips**
on the tip mutes sidebar tips and palette teaching hints via
`compass.shortcuts.tips-muted`. The command palette exposes **Hide shortcut
tips** / **Show shortcut tips**.

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

## Scenario 6: Trial Card Banner Dismissal Persists

### UX

When a trialing account needs a payment method and three or fewer days remain,
a non-blocking trial banner appears. **Dismiss** hides it for the current
`trialEndsAt` value in local storage.

### Steps

1. Sign in on an account with `subscriptionStatus: trialing`,
   `needsPaymentMethod: true`, and `trialEndsAt` within three days (see
   `e2e/billing/trial-card-banner.spec.ts` for mock shape).
2. Load `/week` and confirm the trial banner status line.
3. Click **Dismiss**.
4. Reload `/week`.

### Expected Results

- Step 2: banner visible; billing gate dialog is not open.
- Step 3: banner hides immediately.
- Step 4: banner stays hidden for the same `trialEndsAt`; changing the trial
  end date in billing status may show it again.
