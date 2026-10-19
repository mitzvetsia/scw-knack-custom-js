# SOW-Centric Pipeline Change — Slack Announcement

Slack-ready articulation of the proposed final-bid-prep process change,
framed as an idea being floated (Ben + Micah brainstorm). Core: Sales owns
Review Bid with a mandate to sync with the client on survey results and the
proposed solution (sans pricing); the sub's first bid auto-syncs into our
SOW; revision requests move the project to To Do where Ops polishes the
solution and releases numbers; new projects flip from To Do to Create
Preliminary so pre-survey SOW requests don't intermingle with bids/revisions.

---

**Ben and I were batting around some ideas this afternoon RE: how to more efficiently handle the final bid prep process.** Here's an idea for how it could work:

**The idea:** Sales takes ownership of the **Review Bid** column, with the required deliverable being a sync with the client to review the survey results and proposed solution — **sans pricing** — and align on the direction the Final Bid should take. The moment a bid first returns from the sub, it goes straight to Sales: Sales and the customer review the survey findings and the initially proposed solution on their own — is this the right design, the right coverage, the right direction? Only after that direction is confirmed does Ops polish the solution and release pricing.

How it would work:

**1. SVS returns a bid and it moves to Review Bid as usual.**
Our SOW syncs to the sub's bid automatically (this auto-sync only happens on the very first bid submission), and Sales is automatically tagged to review it. No Ops polish pass first — Sales takes the freshly synced solution to the customer and reviews the survey findings and proposed design together. A scope-and-direction conversation, not a pricing one.

**2. Sales uses the existing revision-request workflow to send back explicit direction.**
Out of that review, Sales submits either a go-ahead or a revision request spelling out how the SOW should change. The solution gets locked in (or reshaped) while it's still just a solution.

**3. That moves the project to To Do, where Ops polishes and releases numbers.**
Go-aheads and revision requests land in **To Do**, which becomes the production queue where Ops refines the solution and produces the client-facing final proposal (that work moves out of Review Bid).

**NOTE:** we don't want to intermingle pre-survey initial SOW requests with bids/revisions in the same column — so to do this with minimal additional dev work, I'd flip new projects from dumping into "To Do" to dumping into **Create Preliminary**.
