# Quote expiration extensions — what each group sees (2026-11-06)

One feature, three audiences. Where it lives in the code: `src/features/quote-extension.js`; Make scenario 06.08;
the full technical reference is the quote-extension section of `CLAUDE.md` and `docs/quote-extension-make.md`.
Status on 2026-11-09: live for everyone (the preview list was emptied).

---

## For Sales (account executives)

**What changed.** You can ask for a quote extension yourself, from the Build SOW page, and the system asks the
subcontractor directly. Before, the Published Proposal box said "coordinate an extension with Ops" and the ask
left the system as a Slack message.

**Where.** The Published Proposal box in the Totals panel of the Build SOW page (and the same box in the card at
the bottom of the page). When a proposal is published you see **Request extension**.

**How it works.**
1. Click Request extension. The new date is prefilled 30 days past the current expiration; give a one-line reason.
2. If the date is still inside the sub's bid validity, the quote is extended on the spot. The proposal and SOW
   expiration dates move, nothing else happens.
3. If the date is past the sub's bid expiration, the sub is asked to hold their bid until then. The box reads
   **Extension pending · awaiting SVS** with **Cancel request** and **Nudge**. If the SOW has no basis bid, the
   request goes to Ops instead.

**What comes back.**
- The sub extends: the quote is extended to the sub's date, which may be earlier than you asked for.
- The sub can't extend: the quote keeps its current expiration.
- The sub asks for the bid to be reopened for re-pricing: if the quote has already expired, the bid reopens and
  the box reads **Re-pricing**; a re-published proposal follows. If the quote is still running, the bid stays
  locked and Ops decides whether to reopen it or hold the price and close before the expiration. The box reads
  **Re-price requested**. Tell Ops if the client will close before the quote expires.

**One block.** If the SOW carries discontinued products the box reads **Extension unavailable** and names them.
Swap each one to a current product on the worksheet below, then request the extension.

**Paper trail.** Every step lands as a comment on the sub's ClickUp task and is mirrored to the deal task. While a
request is pending both tasks sit in Waiting on Bid; they return to Final Bid Submitted when it resolves.

---

## For Ops

**Where.** A row under every Published Proposal block on the Reconcile Bids page and the Preview Proposal page.

**Requesting.** **Request extension from sub** opens the same modal Sales has. With no basis bid on the SOW there
is no sub to ask and the row says so; use the pencils as before. With discontinued products on the SOW the row
warns, and the click opens a red risk dialog you must acknowledge before the request goes out. The request text
and the sub's task comment carry that warning.

**While pending.** The row reads Extension pending with Cancel request and Nudge. The sub's card on the Reconcile
page shows "Bid expires <date>" and an "Extension pending" chip once the bid columns are on view_3573.

**The held re-price.** When the sub asks for the bid to be reopened while the quote still runs, Make leaves the
bid locked and sets the SOW to **Re-Price Requested**. The row offers two exits:
- **Keep quote as is**: status cleared, the sub is told, tasks back to Final Bid Submitted.
- **Reopen bid for re-pricing**: the bid goes to Draft with its lines unlocked, the SOW reads Re-Pricing, tasks stay
  in Waiting on Bid. The sub resubmits, you reconcile and re-publish as usual. The native Reopen Bid button on
  the Reconcile page closes a held request the same way.
If the quote had already expired, the sub's answer reopens the bid at once with no decision needed.

**Behind it.** One Make scenario, 06.08, handles every click: it writes the SOW status and requested date
(`field_3314` / `field_3315`), the bid flag and date (`field_3316` / `field_3317`), moves the proposal and SOW
expirations on an extension, comments on the SVS task only (the mirror automation copies to the deal task), and
mentions the AE in the deal's Slack thread. Both ClickUp tasks move to Waiting on Bid only when the SCW task was in
Final Bid Submitted; any other status gets a comment and no move.

**Builder still to do.** The Re-Price Requested option on `field_3314`; the SOW status columns on view_3918 and
view_3861; the bid flag columns on view_3552 and view_3573; the SOW's expiration (`field_2135` through the bid's
Matching SOW) on view_3552 so the sub's card can say which re-price outcome applies.

---

## For our subcontracting partner

**What it is.** SCW's client sometimes needs more time on a quote that rests on your bid. Instead of a phone call
or a Slack message, you now get the ask inside the portal, with three one-click answers.

**Where you see it.** On the survey's dashboard a banner reads **Action needed · SCW has asked you to extend a bid
on this survey**, and the flagged bid in the BIDs list carries an "Extension requested" tag. Both link to
**Preview bid to answer**. Nothing changes on your bid until you answer.

**On the bid page.** A card reads "SCW asks you to hold this bid until <date>", shows when your bid currently
expires, and offers:
- **Extend bid to <date>**: your price still stands. You can shorten the date; the quote follows your date.
- **Request bid be reopened**: you cannot extend without repricing. SCW reviews and reopens. If the quote has
  already expired the bid reopens for re-pricing right away; the button then reads **Re-price instead**.
- **Can't extend**: the quote keeps its current expiration.
An optional note travels with any answer, and you get a comment on your ClickUp task confirming what happened.

**If the bid is reopened.** It goes back to Draft with its lines unlocked. Re-price, then submit it again the usual
way; SCW reconciles and re-publishes the quote from there.

**Reminders.** SCW can nudge an open request; that arrives as a task comment.
