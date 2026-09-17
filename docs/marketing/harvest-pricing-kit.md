# Harvest pricing kit

Research, numbers, and copy for comparing Crops with Harvest. Every figure here is reproduced by [`web/src/harvestPricing.ts`](../../web/src/harvestPricing.ts) and checked in `tests/web.test.mjs`. If Harvest changes its prices, update that file first.

_Last checked: September 16, 2026._

## How Harvest charges now

After [Bending Spoons acquired Harvest on July 10, 2025](https://app.mergerlinks.com/transactions/2025-07-10-harvest/dealmakers), Harvest dropped flat per-seat pricing. A bill now has two parts:

1. **Seats.** Teams costs $108 per seat per year, or $11 per month billed monthly. Enterprise costs $168 per year, or $17.50 per month.
2. **Usage.** Billed every month, based on your activity over the last 365 days. Each resource is charged separately, and the charges add up.

The public [pricing page](https://www.getharvest.com/pricing) shows only seat prices. The usage rates below come from the **Compare subscription options → Simulate usage changes** tool inside a live Harvest account (Settings → Billing). We tested every tier and the totals matched our real renewal to the dollar.

### Usage tiers (yearly billing, per month)

| Monthly fee | Projects | Clients | Tasks |
| ---: | --- | --- | --- |
| $0 | up to 12 | up to 7 | up to 7 |
| $9 | 13–30 | 8–15 | 8–20 |
| $42 | 31–75 | 16–50 | 21–50 |
| $150 | 76–150 | 51–150 | 51–150 |
| $450 | 151–500 | 151–500 | 151–500 |
| $1,100 | 500+ | 500+ | 500+ |

| Monthly fee | Invoices created | Amount invoiced |
| ---: | --- | --- |
| $0 | up to 50 | up to $50K |
| $10 | 51–100 | $50K–$250K |
| $72 | 101–200 | $250K–$500K |
| $190 | 201–500 | $500K–$1M |
| $750 | 500+ | $1M+ |

Tiers are the same on Teams and Enterprise. Invoices with online payments enabled don't count toward invoice usage.

**The "Unlimited" option:** a fixed usage fee of **$19,000 per year** ($1,900 per month on monthly billing), plus seats. Harvest labels this pricing as personalized, so treat it as the price quoted to our account.

**Monthly billing is worse.** The thresholds are counted per month instead of per year. In our account, one month's activity (5 projects, 6 clients, 4 invoices, $15.1K invoiced) came to $75 a month in usage fees, compared with $51 a month on yearly billing.

### Receipt: Superfun Games renewal (effective February 16, 2027)

| Line | Amount |
| --- | ---: |
| Enterprise, $14 × 2 seats × 12 months | $336.00 |
| Flex usage, $51 × 12 months (21 projects $9 + 17 clients $42) | $612.00 |
| Sales tax (8%) | $60.67 |
| **Total** | **$1,008.67/yr** |
| Same account on "Unlimited" usage | $20,573.50/yr |

## What Harvest used to cost

The [2016 pricing page](https://web.archive.org/web/20160325173429/https://www.getharvest.com/pricing), captured on March 25, 2016:

| Plan | Price | Included |
| --- | --- | --- |
| Solo | $12/mo | 1 user, up to 3 |
| Basic | $49/mo | 5 users, up to 9 |
| Business | $99/mo | 10 users, unlimited |
| Extra users | $10/user/mo | |

Every paid plan included unlimited clients, projects, and invoices. Harvest's own FAQ presented this as an advantage over competitors that charged by client, project, or invoice.

Before the acquisition, Harvest charged a flat rate per seat of roughly $11 (Pro) or $14 (Premium), billed yearly, with no usage fees.

## Login page

The pricing slide rotates three Harvest bills against Crops at $0: the two-person studio ($948), the 20-person shop ($22,344), and the same two-person studio on the "Unlimited" plan ($19,336). All three come from the real-life scenarios below.

## Two team sizes

Harvest Teams, billed yearly, before tax. Crops costs $0 in both.

| | 5 clients · 10 projects | 20 clients · 50 projects |
| --- | --- | --- |
| Team | 3 people, 8 tasks | 10 people, 15 tasks |
| Invoicing | 60 invoices, $150K | 240 invoices, $900K |
| Seats | $324 | $1,080 |
| Projects | $0 | $504 |
| Clients | $0 | $504 |
| Tasks | $108 | $108 |
| Invoices | $120 | $2,280 |
| Amount invoiced | $120 | $2,280 |
| **Harvest per year** | **$672** | **$6,756** |
| Harvest, tracking time only | $432 | $2,196 |

## Real-life scenarios

These are yearly figures before tax. "Then" is Harvest's 2016 pricing for the same headcount.

| | Two-person studio | Boutique agency | 20-person shop |
| --- | --- | --- | --- |
| Profile | Our actual account: 21 projects, 17 clients, 3 tasks, 12 invoices, $37.6K | 8 people, 25 clients, 60 projects, 15 tasks, 150 invoices, $750K | 20 people, 60 clients, 180 projects, 25 tasks, 400 invoices, $2.4M, approvals |
| Plan | Enterprise | Teams | Enterprise |
| Seats | $336 | $864 | $3,360 |
| Usage | $612 | $4,260 | $18,984 |
| **Harvest now** | **$948** | **$5,124** | **$22,344** |
| Harvest in 2016 | $264 (Solo + 1 user) | $948 (Basic + 3 users) | $2,388 (Business + 10 users) |
| Increase | 3.6× | 5.4× | **9.4×** |
| "Unlimited" instead | $19,336 (73×) | $19,864 | $22,360 |
| **Crops** | **$0** | **$0** | **$0** |

## Copy blocks

- **Headline:** Harvest bills you for growing. Crops is free.
- **Sub:** Unlimited clients, projects, and teammates. Timers on the web, macOS, and Android. No usage meter.
- **Receipt hook:** A 10-person team with 20 clients and 50 projects pays Harvest $6,756 a year. With Crops, that's $0.
- **History hook:** In 2016, $99 a month covered 10 people and everything they tracked. Today, Harvest's fixed-price option is $19,000 a year before seats.
- **Proof line:** These rates come from Harvest's own billing simulator and match our renewal to the dollar.

## Keep it honest

- Crops tracks time, rates, budgets, and billing status (unbilled, invoiced, paid). It does not create invoice documents or process payments. When comparing with invoicing turned on, say so.
- Always say "billed yearly, before tax" next to Harvest totals. Yearly billing is Harvest's cheapest option.
- Bending Spoons is a Nasdaq-listed company (IPO July 1, 2026) that has been [widely described as applying a private-equity playbook to software](https://finance.yahoo.com/news/bending-spoons-everything-know-aol-011134961.html). It is not a PE fund. Write "private-equity playbook" rather than "a private equity firm".
- Don't use Harvest's logo or brand colors. Name it in plain text only.
