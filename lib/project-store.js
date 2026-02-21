const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE,
  '.researchlab',
  'projects'
);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function projectDir(id) {
  return path.join(PROJECTS_DIR, id);
}

function projectFile(id) {
  return path.join(projectDir(id), 'project.json');
}

function graphFile(id) {
  return path.join(projectDir(id), 'graph.json');
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function create(topic) {
  ensureDir(PROJECTS_DIR);
  const id = generateId();
  const dir = projectDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const project = {
    id,
    topic,
    status: 'pending',
    phase: null,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    workers: [],
  };
  fs.writeFileSync(projectFile(id), JSON.stringify(project, null, 2));
  return project;
}

function getAll() {
  ensureDir(PROJECTS_DIR);
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = projectFile(entry.name);
    if (!fs.existsSync(file)) continue;
    try {
      projects.push(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch (_) {
      // skip corrupted entries
    }
  }
  projects.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return projects;
}

function get(id) {
  const file = projectFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function update(id, data) {
  const existing = get(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, id, updated: new Date().toISOString() };
  fs.writeFileSync(projectFile(id), JSON.stringify(merged, null, 2));
  return merged;
}

function remove(id) {
  const dir = projectDir(id);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function getGraph(id) {
  const file = graphFile(id);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = { create, getAll, get, update, remove, getGraph, PROJECTS_DIR };
