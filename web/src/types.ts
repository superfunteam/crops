export type Role = "admin" | "member";
export type BillingStatus = "unbilled" | "invoiced" | "paid";
export interface User {
  id: string;
  name: string;
  username: string;
}
export interface Team {
  id: string;
  name: string;
  role: Role;
}
export interface Member extends User {
  userId: string;
  role: Role;
  canManageAccount?: boolean;
}
export interface Client {
  id: string;
  teamId: string;
  name: string;
  email: string;
  archived: boolean;
}
export interface Project {
  id: string;
  teamId: string;
  clientId: string | null;
  name: string;
  code: string;
  color: string;
  billable: boolean;
  rate: number;
  budgetHours: number;
  archived: boolean;
}
export interface AgentUsage {
  tokens: number;
  cost: number;
  model: string | null;
}
export interface Entry {
  id: string;
  teamId: string;
  userId: string;
  projectId: string;
  task: string;
  notes: string;
  date: string;
  durationSeconds: number;
  startedAt: string | null;
  billable: boolean;
  status: BillingStatus;
  agent?: AgentUsage | null;
  version: number;
}
export interface Snapshot {
  user: User;
  teams: Team[];
  team: Team;
  members: Member[];
  formerMembers?: User[];
  clients: Client[];
  projects: Project[];
  entries: Entry[];
  runningEntry: Entry | null;
  serverTime: string;
}
export interface AccessKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
export type Page =
  "time" | "reports" | "projects" | "clients" | "team" | "billing" | "settings";
