import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server, normalizeATSAnalysis, checkCVReadiness, toPlainText, createCVPDF;
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' });
  ({ normalizeATSAnalysis } = await server.ssrLoadModule('/src/modules/cv/lib/atsAnalysis.ts'));
  ({ checkCVReadiness } = await server.ssrLoadModule('/src/modules/cv/lib/readiness.ts'));
  ({ toPlainText } = await server.ssrLoadModule('/src/modules/cv/lib/plainText.ts'));
  ({ createCVPDF } = await server.ssrLoadModule('/src/modules/cv/lib/pdf.ts'));
});
after(async () => { await server?.close(); });

const profile = { full_name: 'Alex Rivera', email: 'alex@example.com', summary: 'Built reliable services.', job_title: 'Software Engineer' };
const exp = { id: 'role-1', role: 'Engineer', company: 'Example Ltd', start_date: '2022-01', end_date: '2024-06', is_current: false, technologies: ['React', 'C++'], achievements: ['Reduced latency by 20%.'], description: 'Built services.' };
const project = { name: 'Public project', description: 'Shared description', cv_description: 'CV-specific description', technologies: ['Rust'], highlights: ['Built **reliable** tooling'] };
const hidden = { ...project, name: 'Private project', show_on_cv: false, technologies: ['SecretTool'] };

test('analysis rejects malformed scores and normalizes optional model fields', () => {
  for (const value of [null, [], {}, { score: '90' }, { score: Infinity }]) assert.throws(() => normalizeATSAnalysis(value, [], []));
  const result = normalizeATSAnalysis({ score: 140, matched_keywords: ['React', ' react ', 3], missing_keywords: ['React', 'AWS'], gaps: [{}], suggestions: null }, [], []);
  assert.equal(result.score, 100);
  assert.deepEqual(result.matched_keywords, ['React']);
  assert.deepEqual(result.missing_keywords, ['AWS']);
  assert.deepEqual(result.gaps, []);
  assert.deepEqual(result.suggestions, []);
});

test('only explicit, visible technology evidence supports skill additions', () => {
  const result = normalizeATSAnalysis({ score: 50, skills_to_add: ['React', 'react', 'AWS', 'Rust', 'SecretTool', 'C++'] }, [exp], [{ name: 'C++' }], [project, hidden]);
  assert.deepEqual(result.skills_to_add, ['React', 'Rust']);
});

test('analysis rejects fabricated numbers, stale bullets, foreign IDs, and duplicate edits', () => {
  const valid = { experience_id: exp.id, current: exp.achievements[0], suggested: 'Cut latency by 20%.' };
  const result = normalizeATSAnalysis({ score: 70, summary_rewrite: 'Engineer with 15 years of experience.', achievements_to_enhance: [valid, valid, { ...valid, experience_id: 'wrong' }, { ...valid, current: 'old text' }, { ...valid, suggested: 'Cut latency by 80%.' }] }, [exp], [], [], 'Built services.');
  assert.deepEqual(result.achievements_to_enhance, [valid]);
  assert.equal(result.summary_rewrite, '');
});

test('readiness identifies contact, chronology, invalid dates, duplicates, and draft placeholders', () => {
  const findings = checkCVReadiness({ full_name: ' ', email: 'broken', summary: '[insert metric]' }, [{ ...exp, end_date: '2021-02', achievements: ['Built tools', ' built  tools '] }, { ...exp, start_date: '2024-02-30', end_date: null }]);
  for (const id of ['contact-name', 'contact-email-format', 'summary-placeholder', 'readiness-0-date-order', 'readiness-0-duplicate-1', 'readiness-1-start', 'readiness-1-end']) assert.ok(findings.some(f => f.id === id), id);
  assert.deepEqual(checkCVReadiness(profile, [exp], new Date('2026-09-22')), []);
});

test('career break needs dates and label but no employer', () => {
  assert.deepEqual(checkCVReadiness(profile, [{ ...exp, company: '', role: 'Career Break', gap_reason: 'other', achievements: [] }]), []);
});

test('plain text preserves Unicode, standard headings, project visibility and CV-specific wording', () => {
  const text = toPlainText({ ...profile, full_name: 'José Rivera' }, [exp], [], [{ name: 'React', category: 'Technical' }], [], [project, hidden], []);
  assert.match(text, /JOSÉ RIVERA/);
  assert.match(text, /SKILLS\n/);
  assert.match(text, /WORK EXPERIENCE\n/);
  assert.match(text, /CV-specific description/);
  assert.match(text, /Built reliable tooling/);
  assert.doesNotMatch(text, /Private project|Shared description|\*\*/);
});

test('every PDF style exports extractable headings, contact and achievements without hidden projects', async () => {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = { profile, experience: [exp], education: [], skills: [{ name: 'React', category: 'Technical' }], projects: [project, hidden], certifications: [], languages: [] };
  for (const template of ['classic', 'modern', 'minimal', 'professional', 'executive', 'corporate', 'neo', 'neo-dark']) {
    const doc = createCVPDF(data, template);
    const pdf = await getDocument({ data: new Uint8Array(doc.output('arraybuffer')), useSystemFonts: true }).promise;
    let text = '';
    for (let n = 1; n <= pdf.numPages; n++) text += (await (await pdf.getPage(n)).getTextContent()).items.map(i => i.str || '').join(' ');
    assert.match(text, /alex@example.com/, template);
    assert.match(text, /skills/i, template);
    assert.match(text, /experience/i, template);
    assert.match(text, /Reduced latency by 20%/, template);
    assert.match(text, /CV-specific description/, template);
    assert.doesNotMatch(text, /Private project|S K I L L S/, template);
    assert.ok(text.toLowerCase().indexOf('skills') < text.indexOf('Reduced latency'), template);
    await pdf.destroy();
  }
});

test('AI analysis includes visible projects and qualifications, and validates the provider response', async t => {
  const { supabase } = await server.ssrLoadModule('/src/lib/supabase.ts');
  const { atsScore, improveSection, tailorCVToJob } = await server.ssrLoadModule('/src/modules/cv/lib/ai.ts');
  let request;
  let answer = JSON.stringify({ score: 80, skills_to_add: ['React', 'Rust', 'AWS'] });
  t.mock.method(supabase.functions, 'invoke', async (_name, options) => {
    request = options.body;
    return { data: { text: answer }, error: null };
  });
  const result = await atsScore(profile, [exp], [], [], 'React developer', {}, [{ name: 'Example Certificate' }], [project, hidden], [{ language: 'English', proficiency: 'fluent' }]);
  assert.deepEqual(result.skills_to_add, ['React', 'Rust']);
  assert.match(request.prompt, /Example Certificate|English/);
  assert.match(request.prompt, /CV-specific description/);
  assert.doesNotMatch(request.prompt, /Private project/);
  assert.match(request.system, /Never guess numbers/);
  answer = 'Reduced latency by 95%.';
  await assert.rejects(improveSection('achievements', exp.achievements[0], '', {}), /unsupported number/);
  answer = 'Reduced latency by 20%.';
  assert.equal(await improveSection('achievements', exp.achievements[0], '', {}), answer);
  answer = JSON.stringify({ company: 'Employer', position: 'Engineer', summary: 'Built services.', cover_letter: 'Hello', ats_score: 75, original_score: 60, experience: [{ id: exp.id, achievements: ['Cut latency by 95%.'], technologies: ['AWS'] }], skills_to_add: [{ name: 'AWS' }, { name: 'React' }] });
  const tailored = await tailorCVToJob(profile, [exp], [], [], 'React engineer', {});
  assert.deepEqual(tailored.experience[0].achievements, exp.achievements);
  assert.deepEqual(tailored.experience[0].technologies, exp.technologies);
  assert.deepEqual(tailored.skills_to_add.map(s => s.name), ['React']);
});
