import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth.mjs';
import { productionEnvironment } from './db.mjs';

export async function seedDemo(db) {
  if (productionEnvironment()) throw new Error('Demo seeding is disabled in production.');
  await db.transaction(async (tx) => {
    await tx.query('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
    if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length) return;
    const userId = randomUUID();
    const teamId = randomUUID();
    await tx.query('INSERT INTO users(id,username,name,password_hash) VALUES($1,$2,$3,$4)', [userId, 'demo', 'Alex Morgan', await hashPassword('crops-demo-2026')]);
    await tx.query('INSERT INTO teams(id,name) VALUES($1,$2)', [teamId, 'Superfun Studio']);
    await tx.query('INSERT INTO memberships(id,team_id,user_id,role) VALUES($1,$2,$3,$4)', [randomUUID(), teamId, userId, 'admin']);
    const projects = [];
    for (const fixture of [
      { client: 'Daybreak', name: 'Brand & website', code: 'DAY', color: '#C56845', rate: 150, budget: 120 },
      { client: 'Meridian', name: 'Product design', code: 'MER', color: '#68785E', rate: 175, budget: 160 },
      { client: 'Superfun Studio', name: 'Studio operations', code: 'INT', color: '#B29154', rate: 0, budget: 40 },
    ]) {
      const clientId = randomUUID();
      const projectId = randomUUID();
      await tx.query('INSERT INTO clients(id,team_id,name,email) VALUES($1,$2,$3,$4)', [clientId, teamId, fixture.client, '']);
      await tx.query('INSERT INTO projects(id,team_id,client_id,name,code,color,rate,budget_hours,billable) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [projectId, teamId, clientId, fixture.name, fixture.code, fixture.color, fixture.rate, fixture.budget, fixture.rate > 0]);
      projects.push(projectId);
    }
    const tasks = ['Visual design', 'Development', 'Planning', 'Design review', 'Research'];
    for (let i = 0; i < 18; i++) {
      const when = new Date();
      when.setDate(when.getDate() - Math.floor(i / 3));
      const projectIndex = i % 3;
      await tx.query('INSERT INTO entries(id,team_id,user_id,project_id,task,notes,date,duration_seconds,billable,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [randomUUID(), teamId, userId, projects[projectIndex], tasks[i % tasks.length], ['Exploring the next direction', 'Bringing the details together', 'Weekly studio sync'][projectIndex], when.toISOString().slice(0, 10), [7200, 5400, 1800, 9000, 3600][i % 5], projectIndex !== 2, i > 11 && projectIndex !== 2 ? 'paid' : i > 8 && projectIndex !== 2 ? 'invoiced' : 'unbilled']);
    }
  });
}
