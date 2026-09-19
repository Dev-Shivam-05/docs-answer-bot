import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { ROOT } from '../src/config.ts';

type WfNode = {
  name: string;
  type: string;
  typeVersion: number;
  parameters: Record<string, unknown>;
  credentials?: Record<string, Record<string, unknown>>;
};
type Workflow = {
  name: string;
  nodes: WfNode[];
  connections: Record<string, { main: { node: string; type: string; index: number }[][] }>;
};

const raw = readFileSync(join(ROOT, 'n8n', 'telegram-rag-workflow.json'), 'utf8');
const wf = JSON.parse(raw) as Workflow;

// Real n8n node type names used by this workflow (n8n-nodes-base package).
const KNOWN_TYPES = new Set([
  'n8n-nodes-base.telegramTrigger',
  'n8n-nodes-base.httpRequest',
  'n8n-nodes-base.if',
  'n8n-nodes-base.telegram',
]);

test('every node has a unique name and a known n8n type', () => {
  const names = wf.nodes.map((n) => n.name);
  assert.equal(new Set(names).size, names.length);
  for (const n of wf.nodes) {
    assert.ok(KNOWN_TYPES.has(n.type), `unknown node type ${n.type}`);
    assert.equal(typeof n.typeVersion, 'number');
  }
});

test('connections only reference existing nodes', () => {
  const names = new Set(wf.nodes.map((n) => n.name));
  for (const [from, outputs] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), `connection from unknown node ${from}`);
    for (const branch of outputs.main) {
      for (const c of branch) assert.ok(names.has(c.node), `connection to unknown node ${c.node}`);
    }
  }
});

test('flow is Trigger -> HTTP /ask -> IF grounded -> answer | refusal', () => {
  const byType = (t: string) => wf.nodes.filter((n) => n.type === t);
  const node = (name: string) => wf.nodes.find((n) => n.name === name)!;
  const trigger = byType('n8n-nodes-base.telegramTrigger')[0];
  const http = byType('n8n-nodes-base.httpRequest')[0];
  const ifNode = byType('n8n-nodes-base.if')[0];

  assert.equal(wf.connections[trigger.name].main[0][0].node, http.name);
  assert.equal(wf.connections[http.name].main[0][0].node, ifNode.name);
  assert.equal(http.parameters.method, 'POST');
  assert.match(String(http.parameters.url), /\$env\.DOCS_BOT_URL.*\/ask/);

  const [trueBranch, falseBranch] = wf.connections[ifNode.name].main;
  assert.equal(node(trueBranch[0].node).type, 'n8n-nodes-base.telegram');
  assert.match(String(node(trueBranch[0].node).parameters.text), /\$json\.answer/);
  assert.equal(node(falseBranch[0].node).type, 'n8n-nodes-base.telegram');
  assert.equal(node(falseBranch[0].node).parameters.text, 'Not in the documents.');
});

test('credentials are referenced by name only and no secrets are embedded', () => {
  for (const n of wf.nodes) {
    for (const cred of Object.values(n.credentials ?? {})) assert.deepEqual(Object.keys(cred), ['name']);
  }
  // Telegram bot tokens look like 123456789:AA...; Google keys start with AIza; OpenAI-style with sk-.
  assert.doesNotMatch(raw, /\d{6,}:[A-Za-z0-9_-]{30,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/);
});
