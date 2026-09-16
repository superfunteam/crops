// Harvest pricing, as shown in Harvest's in-app billing simulator (September 2026).
// Usage fees are charged monthly and based on activity over the last 365 days
// when billed yearly. Each tier lists the highest count it covers.
export type Resource =
  "projects" | "clients" | "tasks" | "invoices" | "invoiced";
export type Usage = Record<Resource, number>;
export type Tier = [upTo: number, monthly: number];

export const HARVEST_SEAT_YEARLY = { teams: 108, enterprise: 168 } as const;
export const HARVEST_UNLIMITED_USAGE_YEARLY = 19000;

const upper: Tier[] = [
  [150, 150],
  [500, 450],
  [Infinity, 1100],
];
export const HARVEST_TIERS: Record<Resource, Tier[]> = {
  projects: [[12, 0], [30, 9], [75, 42], ...upper],
  clients: [[7, 0], [15, 9], [50, 42], ...upper],
  tasks: [[7, 0], [20, 9], [50, 42], ...upper],
  invoices: [
    [50, 0],
    [100, 10],
    [200, 72],
    [500, 190],
    [Infinity, 750],
  ],
  invoiced: [
    [50_000, 0],
    [250_000, 10],
    [500_000, 72],
    [1_000_000, 190],
    [Infinity, 750],
  ],
};

export const RESOURCE_LABELS: Record<Resource, string> = {
  projects: "Projects",
  clients: "Clients",
  tasks: "Tasks",
  invoices: "Invoices",
  invoiced: "Amount invoiced",
};

export function monthlyFee(resource: Resource, count: number) {
  return HARVEST_TIERS[resource].find(([upTo]) => count <= upTo)![1];
}

export type Scenario = {
  id: string;
  name: string;
  summary: string;
  plan: keyof typeof HARVEST_SEAT_YEARLY;
  seats: number;
  usage: Usage;
};

export type Bill = {
  seats: number;
  lines: { resource: Resource; count: number; yearly: number }[];
  usage: number;
  total: number;
};

// Yearly cost before tax. Pass invoicing=false for teams that only track time.
export function harvestYearly(scenario: Scenario, invoicing = true): Bill {
  const resources: Resource[] = invoicing
    ? ["projects", "clients", "tasks", "invoices", "invoiced"]
    : ["projects", "clients", "tasks"];
  const seats = HARVEST_SEAT_YEARLY[scenario.plan] * scenario.seats;
  const lines = resources.map((resource) => ({
    resource,
    count: scenario.usage[resource],
    yearly: monthlyFee(resource, scenario.usage[resource]) * 12,
  }));
  const usage = lines.reduce((sum, line) => sum + line.yearly, 0);
  return { seats, lines, usage, total: seats + usage };
}

// Login page comparison: the same year of work at two sizes.
export const LANDER_SCENARIOS: Scenario[] = [
  {
    id: "small",
    name: "5 clients · 10 projects",
    summary: "3 people, 60 invoices, $150K billed",
    plan: "teams",
    seats: 3,
    usage: {
      projects: 10,
      clients: 5,
      tasks: 8,
      invoices: 60,
      invoiced: 150_000,
    },
  },
  {
    id: "growing",
    name: "20 clients · 50 projects",
    summary: "10 people, 240 invoices, $900K billed",
    plan: "teams",
    seats: 10,
    usage: {
      projects: 50,
      clients: 20,
      tasks: 15,
      invoices: 240,
      invoiced: 900_000,
    },
  },
];

// Longer-form scenarios for the write-up. The first is a real Harvest bill.
export const STORY_SCENARIOS: (Scenario & {
  before: number;
  beforeLabel: string;
})[] = [
  {
    id: "studio",
    name: "The two-person studio",
    summary:
      "Superfun Games' actual renewal: 21 projects, 17 clients, 12 invoices",
    plan: "enterprise",
    seats: 2,
    usage: {
      projects: 21,
      clients: 17,
      tasks: 3,
      invoices: 12,
      invoiced: 37_600,
    },
    before: 264,
    beforeLabel: "Harvest Solo, 2016 ($12/mo + 1 user)",
  },
  {
    id: "agency",
    name: "The boutique agency",
    summary: "8 people, 25 clients, 60 projects, 150 invoices, $750K billed",
    plan: "teams",
    seats: 8,
    usage: {
      projects: 60,
      clients: 25,
      tasks: 15,
      invoices: 150,
      invoiced: 750_000,
    },
    before: 948,
    beforeLabel: "Harvest Basic, 2016 ($49/mo + 3 users)",
  },
  {
    id: "shop",
    name: "The 20-person shop",
    summary:
      "20 people, 60 clients, 180 projects, 400 invoices, $2.4M billed, approvals",
    plan: "enterprise",
    seats: 20,
    usage: {
      projects: 180,
      clients: 60,
      tasks: 25,
      invoices: 400,
      invoiced: 2_400_000,
    },
    before: 2388,
    beforeLabel: "Harvest Business, 2016 ($99/mo + 10 users)",
  },
];
