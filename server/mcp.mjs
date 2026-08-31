/**
 * MCP endpoint — exposes CV editing tools over Streamable HTTP at /mcp.
 * Requires authentication via session cookie or Bearer MCP token (Settings page).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as store from './store.mjs';
import * as access from './access.mjs';
import { SECTION_TABLES, getFullCV, duplicateCV } from './cv.mjs';

const SECTIONS = Object.keys(SECTION_TABLES);

const PROFILE_FIELDS = {
  version_name: z.string().optional().describe('Internal name of this CV version, e.g. "Main CV" or "Backend — Senior"'),
  full_name: z.string().optional(),
  job_title: z.string().optional().describe('Headline title shown under the name'),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  website: z.string().optional(),
  linkedin: z.string().optional(),
  github: z.string().optional(),
  portfolio: z.string().optional(),
  summary: z.string().optional().describe('Professional summary paragraph (markdown supported)'),
  target_role: z.string().optional().describe('Role this CV is tailored for — drives ATS/keyword guidance'),
  keywords: z.array(z.string()).optional().describe('ATS keywords to weave into the CV'),
  career_stage: z.enum(['entry_level', 'mid_career', 'senior', 'executive', 'career_changer']).optional(),
  industry: z.string().optional(),
  relevant_coursework: z.string().optional(),
  capstone_project: z.string().optional(),
};

const SECTION_ITEM_HINT = `Fields by section:
- experience: company*, role*, start_date* ("YYYY-MM"), end_date, is_current (bool), location, description (markdown), achievements (string[]), technologies (string[])
- education: institution*, degree*, field, location, start_date, end_date, grade, description
- skills: name*, category (e.g. "Technical"), proficiency (beginner|intermediate|advanced|expert), years (int)
- certifications: name*, issuer, date_obtained, expiry_date, credential_id, url
- projects: name*, description, url, github_url, technologies (string[]), highlights (string[])
- languages: name*, level (e.g. "Native", "C1")
All sections support sort_order (int) for ordering.`;

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
}

function buildServer(userId) {
  const server = new McpServer({ name: 'thedevcv', version: '1.1.0' });

  server.registerTool('list_cvs', {
    title: 'List CVs',
    description: 'List every CV owned by the signed-in user with id, version name, owner name, target role and last-updated time. Start here to find the CV the user wants to work on.',
    inputSchema: {},
  }, async () => {
    const profiles = await access.listForUser('cv_profiles', userId, {
      order: [{ column: 'is_default', ascending: false }],
    });
    return ok(profiles.map((p) => ({
      id: p.id,
      version_name: p.version_name,
      full_name: p.full_name,
      job_title: p.job_title,
      target_role: p.target_role,
      is_default: p.is_default,
      ats_score: p.ats_score,
      updated_at: p.updated_at,
    })));
  });

  server.registerTool('get_cv', {
    title: 'Get full CV',
    description: 'Fetch one CV with every section (experience, education, skills, certifications, projects, languages) including item ids needed for updates.',
    inputSchema: { cv_id: z.string().describe('CV profile id from list_cvs') },
  }, async ({ cv_id }) => {
    if (!(await access.userOwnsProfile(userId, cv_id))) return fail(`No CV with id ${cv_id}`);
    const cv = await getFullCV(cv_id);
    return cv ? ok(cv) : fail(`No CV with id ${cv_id}`);
  });

  server.registerTool('create_cv', {
    title: 'Create CV',
    description: 'Create a new CV profile. Add sections afterwards with add_cv_item.',
    inputSchema: { ...PROFILE_FIELDS, full_name: z.string().describe('Candidate full name') },
  }, async (fields) => {
    const row = {
      version_name: 'Main CV',
      is_default: false,
      user_id: userId,
      ...fields,
    };
    await access.assertCanWriteRows('cv_profiles', userId, row);
    const [created] = await store.insert('cv_profiles', row);
    return ok(created);
  });

  server.registerTool('update_cv', {
    title: 'Update CV profile fields',
    description: 'Update top-level CV fields (summary, job title, keywords, target role, contact info, …). Only the fields you pass change. Section items are edited with update_cv_item instead.',
    inputSchema: { cv_id: z.string(), ...PROFILE_FIELDS },
  }, async ({ cv_id, ...fields }) => {
    if (!Object.keys(fields).length) return fail('Pass at least one field to update');
    if (!(await access.userOwnsProfile(userId, cv_id))) return fail(`No CV with id ${cv_id}`);
    const [updated] = await store.update('cv_profiles', { id: cv_id }, fields);
    return updated ? ok(updated) : fail(`No CV with id ${cv_id}`);
  });

  server.registerTool('duplicate_cv', {
    title: 'Duplicate CV',
    description: 'Copy a CV (with all sections) into a new version, optionally retargeted at a different role — useful for iterating on variants without touching the original.',
    inputSchema: {
      cv_id: z.string(),
      target_role: z.string().optional().describe('Role the copy should be tailored for'),
      version_name: z.string().optional(),
    },
  }, async ({ cv_id, target_role, version_name }) => {
    if (!(await access.userOwnsProfile(userId, cv_id))) return fail(`No CV with id ${cv_id}`);
    const copy = await duplicateCV(cv_id, { targetRole: target_role, versionName: version_name, userId });
    return copy ? ok(copy) : fail(`No CV with id ${cv_id}`);
  });

  server.registerTool('delete_cv', {
    title: 'Delete CV',
    description: 'Permanently delete a CV and all of its sections. Irreversible — confirm with the user first.',
    inputSchema: { cv_id: z.string() },
  }, async ({ cv_id }) => {
    if (!(await access.userOwnsProfile(userId, cv_id))) return fail(`No CV with id ${cv_id}`);
    const { removed } = await store.remove('cv_profiles', { id: cv_id });
    return removed ? ok({ deleted: cv_id }) : fail(`No CV with id ${cv_id}`);
  });

  server.registerTool('add_cv_item', {
    title: 'Add section item',
    description: `Add an item to a CV section. ${SECTION_ITEM_HINT}`,
    inputSchema: {
      cv_id: z.string(),
      section: z.enum(SECTIONS),
      item: z.record(z.string(), z.any()).describe('Item fields for the chosen section (see tool description)'),
    },
  }, async ({ cv_id, section, item }) => {
    if (!(await access.userOwnsProfile(userId, cv_id))) return fail(`No CV with id ${cv_id}`);
    const table = SECTION_TABLES[section];
    const existing = await store.list(table, { where: { profile_id: cv_id } });
    const row = { sort_order: existing.length, ...item, profile_id: cv_id };
    await access.assertCanWriteRows(table, userId, row);
    const [created] = await store.insert(table, row);
    return ok(created);
  });

  server.registerTool('update_cv_item', {
    title: 'Update section item',
    description: `Update fields on an existing section item (get item ids from get_cv). Only passed fields change. ${SECTION_ITEM_HINT}`,
    inputSchema: {
      section: z.enum(SECTIONS),
      item_id: z.string(),
      fields: z.record(z.string(), z.any()),
    },
  }, async ({ section, item_id, fields }) => {
    if (!Object.keys(fields).length) return fail('Pass at least one field to update');
    const table = SECTION_TABLES[section];
    const existing = await store.getById(table, item_id);
    if (!existing) return fail(`No ${section} item with id ${item_id}`);
    await access.assertCanReadRow(table, userId, existing);
    const { profile_id: _p, ...safe } = fields;
    const [updated] = await store.update(table, { id: item_id }, safe);
    return updated ? ok(updated) : fail(`No ${section} item with id ${item_id}`);
  });

  server.registerTool('delete_cv_item', {
    title: 'Delete section item',
    description: 'Remove one item from a CV section.',
    inputSchema: { section: z.enum(SECTIONS), item_id: z.string() },
  }, async ({ section, item_id }) => {
    const table = SECTION_TABLES[section];
    const existing = await store.getById(table, item_id);
    if (!existing) return fail(`No ${section} item with id ${item_id}`);
    await access.assertCanReadRow(table, userId, existing);
    const { removed } = await store.remove(table, { id: item_id });
    return removed ? ok({ deleted: item_id }) : fail(`No ${section} item with id ${item_id}`);
  });

  return server;
}

/** Handle one HTTP request against a fresh stateless server instance. */
export async function handleMcpRequest(req, res, body, user) {
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized', detail: 'Sign in or pass your MCP token as Authorization: Bearer <token>.' }));
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed — stateless MCP server, POST only.' },
      id: null,
    }));
    return;
  }
  const server = buildServer(user.id);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
