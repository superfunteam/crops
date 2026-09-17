# The Harvest Has Gone Bad

## How a private-equity playbook raised my timesheet pricing by 10x

I've used Harvest for years. It was the rare piece of software I never thought about: start a timer, stop a timer, send an invoice, get paid. The price was fine. The product was fine. That was the point.

Then I opened my renewal notice.

My two-person studio is due to pay **$1,008.67** next year. That isn't the headline number, though. The headline is on the same page, where Harvest offers a "fixed price" option so you never have to worry about usage. For the same two people it costs **$20,573.50 a year**.

That's twenty thousand dollars a year to track time for two people.

## What changed

In July 2025, Harvest was acquired by Bending Spoons, the company that also owns Evernote, Vimeo, and WeTransfer. The Yahoo Finance profile of Bending Spoons calls its approach a private-equity playbook for software: buy a beloved subscription product, cut staff, and re-price the customer base.

Harvest's re-pricing works like this. You still pay per seat: $108 a year on Teams, $168 on Enterprise. On top of that, you now pay monthly **usage fees** for five separate things:

- Projects
- Clients
- Tasks
- Invoices you create
- The total dollar amount you invoice

Each one is billed on its own tiered ladder, and the charges add up. The public pricing page doesn't list the rates. I only found them inside my account, under a "Simulate usage changes" tool. I moved every slider through every tier, and here's the ladder for projects:

| Active projects in a year | Monthly fee |
| --- | ---: |
| Up to 12 | $0 |
| 13–30 | $9 |
| 31–75 | $42 |
| 76–150 | $150 |
| 151–500 | $450 |
| 500+ | $1,100 |

Clients and tasks use a similar ladder that starts charging sooner, once you pass 7 of either. Invoices get their own ladder, and so does the amount you bill. Earning more money through the product raises your fee on its own line.

Those numbers aren't guesses. Plugged into my account's actual activity (21 projects and 17 clients), they produce exactly the $51 a month Harvest will charge me.

## It used to be the opposite

In 2016, Harvest's pricing page had three paid plans. **Business was $99 a month for ten people**, and extra users were $10 each. The FAQ made the pitch directly:

> "All Harvest paid plans include unlimited clients, projects, and invoices."

It went on to warn that competitors might charge by client, project, or invoice. Harvest now does all three, plus tasks, plus the dollars you bill.

## Three real-life bills

I priced three businesses using Harvest's own rates, on yearly billing (the cheapest option) and before tax. "2016" means Harvest's old plans for the same headcount.

### 1. The two-person studio (my actual account)

21 projects, 17 clients, 3 tasks, 12 invoices, $37.6K invoiced.

| | Per year |
| --- | ---: |
| Enterprise seats (2) | $336 |
| Usage | $612 |
| **Harvest today** | **$948** |
| Harvest in 2016 (Solo + 1 user) | $264 |
| Harvest's "Unlimited" option | $19,336 |

That's **3.6× the old price**, or **73×** if you choose predictability.

### 2. The boutique agency

8 people, 25 clients, 60 projects, 15 tasks, 150 invoices, $750K billed.

| | Per year |
| --- | ---: |
| Teams seats (8) | $864 |
| Projects ($42/mo) | $504 |
| Clients ($42/mo) | $504 |
| Tasks ($9/mo) | $108 |
| Invoices ($72/mo) | $864 |
| Amount invoiced ($190/mo) | $2,280 |
| **Harvest today** | **$5,124** |
| Harvest in 2016 (Basic + 3 users) | $948 |

**5.4× the old price.** More than half the bill is a tax on the fact that they send invoices and get paid.

### 3. The 20-person shop

20 people, 60 clients, 180 projects, 25 tasks, 400 invoices, $2.4M billed. They need timesheet approvals, so they're on Enterprise.

| | Per year |
| --- | ---: |
| Enterprise seats (20) | $3,360 |
| Usage | $18,984 |
| **Harvest today** | **$22,344** |
| Harvest in 2016 (Business + 10 users) | $2,388 |

**9.4× the old price.** Here the "Unlimited" package ($22,360 with seats) costs almost exactly the same as paying by usage. It's less an option than a ceiling.

Pay monthly instead and it gets worse. The thresholds reset every month, so the same activity lands in higher tiers. For my studio, one ordinary month would cost $75 in usage fees instead of $51.

## What I did about it

I build software for a living, so I built the thing I actually needed. It's called **Crops**: time tracking for small teams.

- One running timer per person, synced across the web, a native macOS menu-bar app, and a native Android app with a live notification
- Teams with admins and members, and a view of who's tracking right now
- Clients, projects, hourly rates, and hour budgets
- Billing status on every entry: unbilled, invoiced, or paid, with locks so billed time doesn't change
- Reports with filters and CSV export

What it costs:

| | Two-person studio | Boutique agency | 20-person shop |
| --- | ---: | ---: | ---: |
| Harvest | $948 | $5,124 | $22,344 |
| **Crops** | **$0** | **$0** | **$0** |

No seat fee and no usage meter. Adding a client doesn't cost you anything.

To be fair about what Crops doesn't do: it doesn't generate invoice PDFs or collect payments. It tracks what's billable and what's been paid, and your invoices go out through whatever accounting tool or bank you already use. For many small teams that's already how it works, and it's certainly not worth $19,000.

## The quiet part

Usage-based pricing isn't evil on its own terms. But look at what Harvest chose to meter: clients, projects, invoices, and revenue. Those are exactly the signs that your business is working. The better your year goes, the more you pay, and not because you used more of Harvest's servers.

Harvest used to promise that growth was free. That promise was the product.

**Crops is at [crops.wims.vc](https://crops.wims.vc).** Free time tracking. Room to grow.

---

_Methodology: Harvest usage rates were read from the "Compare subscription options" simulator in a live Harvest account on September 16, 2026, with every tier checked by hand, and they match that account's real renewal to the cent. Seat prices are from [getharvest.com/pricing](https://www.getharvest.com/pricing). 2016 prices are from the [Internet Archive capture of Harvest's pricing page](https://web.archive.org/web/20160325173429/https://www.getharvest.com/pricing) (March 25, 2016). All figures are before sales tax unless noted. Harvest's "Unlimited" usage price is labeled personalized and may differ for your account. Acquisition details are from [MergerLinks](https://app.mergerlinks.com/transactions/2025-07-10-harvest/dealmakers) and [Yahoo Finance](https://finance.yahoo.com/news/bending-spoons-everything-know-aol-011134961.html)._
