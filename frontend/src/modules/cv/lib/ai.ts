import type { CreditAction, UserSettings } from '../../../lib/types';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage, CareerStage } from '../types';
import { aiComplete } from '../../../lib/ai-client';

/**
 * Research-grounded CV guidance distilled from 60+ authoritative sources.
 * Every rule below traces to at least one of: Google recruiting (Laszlo Bock),
 * Harvard OCS, Stanford GSB, MIT CAPD, Harvard Law OPIA, UC Berkeley Law, LSE
 * Careers, Jobscan, Rezi, Teal, Enhancv, Workday/Greenhouse ATS docs, McKinsey
 * consulting resume guides, and recent (2023-2026) AI-screening research.
 *
 * Full citation list lives in the CV-research deliverable — if you change a
 * rule here, update the citation so future engineers can audit the claim.
 */
const CAREER_STAGE_GUIDANCE: Record<CareerStage, string> = {
  entry_level: `ENTRY-LEVEL (0-2 yrs, recent grad):
• Length: exactly 1 page (Harvard OCS; Bock/Google).
• Section order: Contact → (Summary) → EDUCATION → Experience → Projects → Skills → Leadership/Activities. Education leads until ~3 yrs out.
• GPA: include ONLY if ≥3.5 AND <3 yrs experience — omit otherwise (Indeed; Harvard OCS).
• Treat internships as real work experience with full STAR/X-Y-Z bullets.
• Emphasise: relevant coursework, capstone/thesis with measurable outcome, GitHub projects, extracurricular leadership, transferable skills from clubs/volunteering.
• Aim 3 bullets per role; capstone/major project gets its own sub-section.
• Summary optional — if included, 2-3 sentences lead with "graduating"/"recent graduate" + target role + top 3 academic/project skills.`,

  mid_career: `MID-CAREER (2-15 yrs):
• Length: 1 page for <10 yrs (Bock/Google "one page per decade" rule); 1-2 pages for 10+ yrs.
• Section order: Contact → Summary → Experience → Education → Skills → Certifications/Projects.
• Drop GPA — you've been out of school >3 yrs.
• Consolidate or drop roles >7 yrs old if entry-level-flavoured; keep senior prior roles with 2-3 bullets.
• Summary is now essential: 3-5 sentences, 50-80 words, front-load years + role + top 3 technical skills + signature metric.
• Most-recent 2-3 roles: 4-6 detailed bullets. Older roles: 2-3 bullets.
• Emphasise: scope (budget managed, team size, geography), promotions, cross-functional impact, business outcomes ($, %, cycle time).`,

  senior: `SENIOR (15-20 yrs):
• Length: 2 pages standard (Briefcase Coach; Executive Career Brand).
• Current role 6-8 bullets of strategic accomplishments; previous senior roles 3-5; "Early Career" consolidates older roles into one-line entries.
• Summary: 4-5 sentences — seniority + industry + P&L/scale + transformation signature.
• Add optional sections if substantial: Board/Advisory, Publications, Speaking, Patents.
• Quantify at strategic level: budget size (not individual line items), org size, multi-year outcomes, market-share shifts.
• Voice shifts from practitioner to leader — reduce tool/tactical depth, increase scope/influence signalling.`,

  executive: `EXECUTIVE / C-SUITE:
• Length: 2-3 pages acceptable (Briefcase Coach).
• Open with executive summary (4-5 sentences) + optional "Signature Achievements" block (3-5 bullets of headline-level outcomes).
• P&L responsibility, org size, geographic scope front and centre.
• Include board/advisory positions, industry recognition (awards, publications, keynotes).
• Quantify at board level: revenue managed, EBITDA impact, M&A transactions, turnaround metrics, multi-year TSR.
• Older roles (>15 yrs) condensed to one-line entries under "Early Career".
• Voice: strategic, decisive, outcome-framed. Avoid tactical/operational details.`,

  career_changer: `CAREER CHANGER:
• Length: 1-2 pages.
• Use a HYBRID format — NEVER pure functional. 90% of recruiters prefer chronological; functional-only is flagged by ATS as hiding gaps (Jobscan).
• Section order: Contact → Summary (addresses pivot explicitly) → Transferable Skills → Experience (chronological) → Education → Certifications/Training.
• Summary: 1 sentence on the "why" of the pivot + 3 sentences on transferable skills matched to target role.
• Re-frame every prior-industry bullet using target-industry keywords — mirror JD language (e.g., project management in retail → "cross-functional program management" for tech).
• Lead with recent training, certifications, bootcamps, portfolio projects that signal commitment to the new field.
• Never hide dates — the chronological spine must be visible to ATS.`,
};

const INDUSTRY_GUIDANCE: Record<string, string> = {
  technology: `TECHNOLOGY (Software Engineering / Data / Product):
• Metrics that matter: users served / QPS, p99/p95 latency, latency reduction (ms), uptime %, deploy frequency, MTTR, infra cost savings ($/mo), test coverage %, code-review velocity.
• Terminology (match JD verbatim — ATS uses literal matching): CI/CD, SDLC, microservices, REST/gRPC, event-driven, observability, IaC, SRE, blue-green/canary deploys, feature flags.
• Certifications worth listing: AWS Solutions Architect (Assoc/Pro), GCP Professional, Azure Solutions Architect, CKA/CKAD, Terraform Associate. For senior SWE roles, shipped projects outweigh certs.
• Projects section: 2+ projects with GitHub URL and measurable adoption (stars, users, downloads).
• Include GitHub, personal site, tech blog in contact links. Not LinkedIn alone.`,

  finance: `FINANCE / INVESTMENT BANKING / ACCOUNTING:
• Metrics: transaction values ("advised on $500M M&A", "$2B debt refinancing"), revenue/savings impact, returns (IRR, MOIC, NAV growth), AUM, audit findings resolved.
• Terminology: DCF, LBO, M&A, financial modeling, Bloomberg Terminal, Python, VBA, Excel, GAAP, IFRS, SOX, FP&A, covenant compliance, variance analysis.
• Certifications (list prominently): CFA (specify level), Series 7/63/79, CPA, FMVA, CAIA.
• Strict 1 page for analyst/associate. PDF only (formatting integrity).
• Education retains first position for early career — include target-school GPA ≥3.7 and relevant coursework.
• Emphasise bulge-bracket / boutique internships, deal roles, LBO/valuation modelling exposure.`,

  consulting: `CONSULTING (MBB / Strategy / Boutique):
• Section order: Education → Professional Experience → Leadership → Personal (Interests).
• McKinsey's 4 attributes to signal throughout: (1) personal impact, (2) entrepreneurial drive, (3) inclusive leadership, (4) problem solving.
• "Interests" line is NON-NEGOTIABLE and must be specific. ✓ "Backpacked solo through Patagonia" ✓ "Competitive chess (ELO 1800)"  ✗ "Travel" ✗ "Reading" — consultants report this line is often the only one remembered by the reviewer.
• Metrics: $ client savings, % efficiency gain, team-size led, engagement scope ("advised 3 Fortune 500 clients"), hypotheses tested, decks delivered to C-suite.
• Terminology: hypothesis-driven, structured problem solving, stakeholder management, change management, operating model, synergy capture.
• 1 page unless 15+ yrs experience. Submit PDF. No Overview/Summary unless 10+ yrs — entries speak for themselves.`,

  healthcare: `HEALTHCARE (Clinical / Nursing / Allied Health):
• Top of resume: Active licenses WITH expiration dates (employers verify) — e.g., "RN, CA #123456, exp 06/2027".
• Certifications section: BLS, ACLS, PALS, NCLEX, specialty certs (CCRN, CEN, etc.).
• Clinical rotations & patient population: specialty (Med-Surg, ICU, ER, L&D), patient volume, case complexity.
• EHR systems by name: Epic, Cerner, Meditech, Allscripts.
• Metrics: patient volume/day, complexity, outcomes (satisfaction scores, readmission rates), teaching counts.
• Date format: mm/yyyy (healthcare standard). Length 1-2 pages. Academic MD/PhD uses long-form CV with publications, grants, conference talks.`,

  marketing: `MARKETING / SALES:
• Metrics (marketing): ROAS, CAC, LTV, LTV:CAC ratio, MER, CPA, conversion rate, MQL/SQL volume, pipeline value $, email open/CTR, SEO rank gains.
• Metrics (sales): quota attainment %, win rate, ACV, new-logo count, TCV, ARR expansion/retention %, avg deal size, sales cycle days.
• Terminology: demand gen, ABM, lifecycle marketing, funnel stages, attribution modelling, cohort analysis, full-funnel.
• MarTech / CRM names (match JD verbatim): Salesforce, HubSpot, Marketo, Pardot, Braze, Iterable, Segment, Mixpanel, Amplitude, GA4, Looker.
• Certifications: HubSpot Inbound/Sales/Marketing, Google Ads, Salesforce Admin/Advanced Admin, Pardot Specialist, Marketo Certified Expert, Facebook Blueprint.
• Portfolio or campaign link if applicable.`,

  legal: `LEGAL (Associate / Transactional / Litigation):
• Top of resume: Bar admissions (state + year) — "admitted: California 2021, New York 2023".
• Education retains first position for 3-5 yrs post-JD; include Law Review, Moot Court, law journal, honors, Order of the Coif.
• Terminology (match JD): practice areas (M&A, litigation, IP, transactional, bankruptcy), court admissions, regulations (SEC, HIPAA, ERISA), case types, transaction values, clients represented (with permission).
• Length: strict 1 page at associate level; 2 pages acceptable for partner/counsel.
• No colour, no graphics, no photos — legal CVs are strictly conservative.
• Include pro bono and publications/speaking as separate sections if substantial.`,

  education: `EDUCATION / TEACHING:
• Licenses: teaching licenses and endorsements with state + expiry.
• Emphasise subject/grade level, curriculum frameworks (Common Core, IB, AP), assessment tools, student outcomes (AP pass rates, standardised test improvements, graduation rates).
• EdTech platforms by name: Canvas, PowerSchool, Google Classroom, Schoology, Seesaw, Clever.
• Include professional development, continuing education credits, publications.
• Academic roles (professor/researcher): long-form CV with Publications, Grants, Teaching Load, Advisees, Conference Talks, Service sections.`,

  creative: `CREATIVE / DESIGN:
• Portfolio URL is MANDATORY (Behance, Dribbble, personal site) — place in contact block alongside email.
• Visual/branded resume acceptable for design roles specifically, but submit BOTH: (1) branded visual version for direct applications, (2) ATS-safe plain version for automated pipelines.
• Tools by name (match JD): Figma, Adobe Creative Suite (Photoshop, Illustrator, After Effects, Premiere), Sketch, Framer, Principle, Cinema 4D, Webflow.
• Metrics: engagement lift, user-research participants, shipped design systems adopted across N products, awards, published work, impressions.
• Describe cross-functional collaboration (PMs, engineers) — signals team fit.`,

  manufacturing: `MANUFACTURING / OPERATIONS / SUPPLY CHAIN:
• Methodologies: Lean, Six Sigma (specify Green/Black Belt), Kaizen, 5S, SMED, Kanban, TPM, Theory of Constraints.
• Metrics: OEE (Overall Equipment Effectiveness), defect PPM, throughput, cost-per-unit reduction, yield improvement, safety incident rate (OSHA recordables), on-time delivery %, inventory turns.
• Certifications: Six Sigma Green/Black Belt, OSHA 10/30, APICS CPIM/CSCP, ISO 9001/14001 auditor.
• ERP/systems by name: SAP, Oracle, Dynamics 365, JD Edwards.
• Safety metrics prominent — this industry's hiring heavily weights safety track record.`,

  retail: `RETAIL / HOSPITALITY:
• Metrics: revenue, guest/customer volume, NPS/CSAT, shrinkage reduction, labour-cost control, cover counts, sell-through, inventory turnover.
• Highlight operational KPIs and team size managed.
• Certifications where relevant: ServSafe, TIPS, visual merchandising, loss prevention.`,

  non_profit: `NON-PROFIT / SOCIAL IMPACT:
• Metrics: $ raised (break out grant vs individual vs corporate), grant count and values, programme beneficiaries served (size + demographic), volunteer hours coordinated, donor retention/growth %.
• Emphasise mission alignment in summary — name issue areas and populations served explicitly.
• Stakeholder groups: board, major donors, government partners, community coalitions.
• Highlight programme launches, advocacy wins, policy influence, coalition building.
• Include board/advisory roles even for early-career candidates.`,

  government: `GOVERNMENT / PUBLIC SECTOR (esp. US federal):
• USAJOBS format is SIGNIFICANTLY LONGER than private sector — often 3-5 pages, occasionally more.
• Required fields per role: hours/week, GS level, supervisor name + contact + "may we contact?" flag, security clearance (level + status + last adjudication date).
• Address KSAs (Knowledge, Skills, Abilities) explicitly when specified in vacancy announcement.
• Quantify: grant/contract values, policy outcomes, constituencies served, compliance wins, legislative/regulatory changes driven.
• Terminology: appropriations, OMB, interagency coordination, congressional relations, regulatory framework.`,
};

/**
 * UNIVERSAL_CV_RULES — injected into every system prompt that produces or
 * reviews CV content. Distilled from the 60-source research deliverable, these
 * are the rules every major employer, ATS vendor, and elite university career
 * centre converges on. Keeping them in one constant avoids prompt drift and
 * ensures Rewriter, Tailor, Optimizer, and ATS-score all speak the same
 * dialect.
 *
 * Sources referenced (abridged): Laszlo Bock/Google, Harvard OCS, Stanford GSB,
 * MIT CAPD, Harvard Law OPIA, Jobscan, Rezi, Teal, Enhancv, Workday &
 * Greenhouse ATS docs, CNBC 2023, Ladders eye-tracking 2018, Built In & NYT
 * 2024 (hidden-text detection), GPTZero & Enhancv 2026 (AI-tell vocabulary).
 */
export const UNIVERSAL_CV_RULES = `CV CRAFT — UNIVERSAL RULES (apply to every section you produce or review):

STRUCTURE & FORMAT
• Single-column, reverse-chronological. Never tables, text boxes, multi-column sidebars, or images inside content sections — Workday/Greenhouse parsers mangle them.
• Standard section headers VERBATIM — "Summary", "Work Experience" (or "Professional Experience"), "Education", "Skills", "Certifications", "Languages". Creative names like "Where I've Been" get skipped by ATS.
• Dates as "Month Year" (e.g., "March 2023") consistently across all entries.
• Contact on the first 3 body lines — never in a document header/footer (parsers strip those). City + State only, never full street address.
• Bullet character: • or - only. No ➤ ✓ ★ — they render but parse unreliably.

LENGTH BY STAGE
• <10 yrs experience → 1 page (Bock/Google "1 page per decade" rule).
• 10-20 yrs → 1-2 pages.
• 20+ yrs or executive → 2-3 pages.
• Strict 1 page for: consulting/MBB, investment-banking analyst, legal associate (early-career).

SUMMARY SECTION
• 3-5 sentences, 50-80 words. Recruiters spend ~6 seconds on first scan (Ladders eye-tracking) — anything past 80 words goes unread.
• Sentence 1: [years of experience] + [role keyword from JD] + [domain/seniority signal].
• Sentence 2: top 3 technical/domain skills using the EXACT terminology from the job description.
• Sentence 3: biggest quantifiable achievement.
• Implied first person — never write "I", "My", "We", "Our".
• Front-load keywords — ATS and LLMs weight earlier words more heavily.

BULLETS / ACHIEVEMENTS (the single highest-leverage section)
• Google X-Y-Z formula (canonical): "Accomplished [X] as measured by [Y] by doing [Z]." — Laszlo Bock.
• Or STAR: Situation → Task → Action → Result. Or PAR: Problem → Action → Result (MIT CAPD).
• 3-5 bullets per role; up to 7 for the current/most-recent senior role.
• ≥60% of bullets MUST contain a number (%, $, time, scale, count, ratio). Bullets without numbers are the #1 reject signal from recruiters.
• When exact numbers aren't available, use: ranges ("40-60% reduction"), approximations ("~$2M budget"), affected population ("200+ users across 3 departments"), before/after ("reduced deploy time from 45min to 8min"), ratios ("1 of 3 engineers on the launch team").
• Max 2 lines / ~150 characters per bullet. Readers skim the first line.
• Past tense for previous roles; present tense for the current role. One bullet = one accomplishment.

POWER VERBS — use these freely
Led · Spearheaded · Architected · Engineered · Orchestrated · Delivered · Shipped · Launched · Built · Developed · Implemented · Designed · Negotiated · Secured · Generated · Accelerated · Reduced · Increased · Scaled · Streamlined · Overhauled · Pioneered · Transformed · Championed · Consolidated · Modernised · Galvanised · Catalysed · Owned · Drove · Founded.

BANISH these weak openers — explicitly flagged by recruiters (Harvard Law OPIA; CNBC 2023):
✗ "Responsible for" / "Responsibilities include" → use: Led / Owned / Managed / Delivered
✗ "Duties included" / "Tasks included" → use: Led / Executed / Delivered
✗ "Helped" / "Helped with" / "Assisted" / "Assisted in" → use: Enabled / Accelerated / Advised / Partnered
✗ "Worked on" / "Worked with" → use: Built / Developed / Shipped / Implemented
✗ "Involved in" / "Participated in" → use: Led / Contributed to / Delivered

KEYWORDS
• Target 65-75% keyword match against the job description (Jobscan + Talent Board benchmark).
• The JD's exact job title should appear at least once in the body — candidates with exact-title match have 10.6× the interview rate (Jobscan).
• Use exact JD terminology: "CI/CD pipelines" not "deployment automation", "React.js" not "React framework". ATS uses literal matching; LLMs also reward exact match.
• Never repeat a keyword more than 3 times — stuffing is detected and penalised.
• Skills section: 8-12 focused skills. Don't dump 30+ generic items.

TRUTHFULNESS — NON-NEGOTIABLE
• Never invent companies, roles, dates, tools, certifications, metrics, team sizes, or transaction values.
• You MAY rephrase to mirror JD language ("deployment pipelines" → "CI/CD pipelines" if they used one).
• You MAY expose implicit metrics with ranges drawn from context ("managed a team" → "managed a team of 4-6") when the candidate can confirm.
• You MAY NOT fabricate precise numbers — "Reduced costs by 23.7%" invented out of nothing fails in the interview.

AI-ERA VOCABULARY — recruiter AI-detection tools (GPTZero, Enhancv 2026) flag CVs heavy in these words. Avoid:
✗ delve · realm · tapestry · pivotal · intricate · foster · comprehensive · showcasing · adept · tech-savvy · cutting-edge · spearhead (overused) · leverage (overapplied) · robust (overused).
✗ Unquantified filler phrases: "results-driven", "team player", "dynamic individual", "proven track record", "excellent communicator", "strong analytical skills" — only use these if backed by a specific metric in the same bullet.
Prefer concrete verbs and domain-specific nouns.

NEVER-EVERS
• No hidden text (white font, 1pt, zero opacity). 41% of US job seekers try this; ATS detects it; recruiters reject on sight (Built In, Entrepreneur 2024).
• No photos, DOB, age, marital status, nationality (US/UK/CA/AU/IE default — different in DE/FR where photos are expected).
• No pure functional format — ATS and 90% of recruiters flag it as hiding gaps.`;

/**
 * Builds the system-prompt addendum injected into every AI call. Always
 * includes UNIVERSAL_CV_RULES; appends stage/industry specifics when the
 * candidate has set them. Centralising this ensures every feature (ATS score,
 * Tailor, Optimise, Rewriter) speaks the same research-grounded dialect.
 */
export function buildCandidateContext(profile: Pick<CVProfile, 'career_stage' | 'industry' | 'target_role'>): string {
  const extras: string[] = [];
  if (profile.career_stage && CAREER_STAGE_GUIDANCE[profile.career_stage]) {
    extras.push(CAREER_STAGE_GUIDANCE[profile.career_stage]);
  }
  if (profile.industry && INDUSTRY_GUIDANCE[profile.industry]) {
    extras.push(INDUSTRY_GUIDANCE[profile.industry]);
  }
  const extrasBlock = extras.length
    ? `\n\nCANDIDATE CONTEXT — also apply this stage/industry guidance:\n${extras.join('\n\n')}`
    : '';
  return `\n\n${UNIVERSAL_CV_RULES}${extrasBlock}`;
}

/**
 * `settings` is kept for call-site compatibility — the Anthropic key lives
 * server-side in the Edge Function. `action` is the billable action name used
 * by the server to deduct credits and by the UI to show "costs N credits" hints.
 */
async function callAI(
  system: string,
  user: string,
  _settings: UserSettings,
  action: CreditAction = 'ai_improve',
  maxTokens = 4096,
): Promise<string> {
  return aiComplete(user, { system, maxTokens, action });
}

/**
 * Robust JSON extractor for LLM responses.
 *
 * Production LLM responses for "return only JSON" prompts still leak prose
 * envelopes ("Here is the JSON:\n```json\n[...]\n```"), and occasionally
 * truncate mid-structure when maxTokens is hit. This helper:
 *   1. Strips markdown code fences.
 *   2. Finds the first `[` or `{` and tries to parse from there.
 *   3. On failure, walks back closing brackets to find the longest valid prefix.
 *
 * Returns the parsed value, or `null` if nothing recoverable.
 */
function extractJson<T = unknown>(raw: string, kind: 'array' | 'object'): T | null {
  if (!raw) return null;
  // Strip ```json ... ``` or ``` ... ``` fences.
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  // If fences weren't at the start/end, try to extract between them.
  const fenceMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) s = fenceMatch[1];

  const open = kind === 'array' ? '[' : '{';
  const close = kind === 'array' ? ']' : '}';
  const startIdx = s.indexOf(open);
  if (startIdx < 0) return null;

  // Try parsing the full tail first.
  const tail = s.slice(startIdx);
  try { return JSON.parse(tail) as T; } catch { /* fall through */ }

  // Walk closing brackets from longest to shortest to recover a partial.
  let lastCloseIdx = tail.lastIndexOf(close);
  while (lastCloseIdx > 0) {
    const candidate = tail.slice(0, lastCloseIdx + 1);
    try { return JSON.parse(candidate) as T; } catch { /* keep trying */ }
    // If we're recovering an array, also try closing off a trailing partial object.
    if (kind === 'array') {
      const trimmed = candidate.replace(/,\s*\{[^{}]*$/, '');
      if (trimmed !== candidate) {
        try { return JSON.parse(trimmed + ']') as T; } catch { /* keep trying */ }
      }
    }
    lastCloseIdx = tail.lastIndexOf(close, lastCloseIdx - 1);
  }
  return null;
}

function buildCVText(
  profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[],
  certifications: CVCertification[] = [], projects: CVProject[] = [], languages: CVLanguage[] = []
): string {
  let text = `${profile.full_name}\n${profile.job_title || ''}\n${profile.location || ''}\n\n`;
  if (profile.summary) text += `SUMMARY:\n${profile.summary}\n\n`;
  if (experience.length) {
    text += 'EXPERIENCE:\n';
    for (const e of experience) {
      text += `${e.role} at ${e.company} (${e.start_date} - ${e.end_date || 'Present'})\n`;
      if (e.location) text += `Location: ${e.location}\n`;
      if (e.achievements.length) text += e.achievements.map(a => `- ${a}`).join('\n') + '\n';
      if (e.technologies.length) text += `Technologies: ${e.technologies.join(', ')}\n`;
      text += '\n';
    }
  }
  if (education.length) {
    text += 'EDUCATION:\n';
    for (const e of education) {
      text += `${e.degree}${e.field ? ` in ${e.field}` : ''} - ${e.institution} (${e.end_date || ''})\n`;
      if (e.grade) text += `Grade: ${e.grade}\n`;
    }
    text += '\n';
  }
  if (skills.length) {
    text += 'SKILLS:\n';
    const grouped = skills.reduce((acc, s) => { (acc[s.category] = acc[s.category] || []).push(`${s.name} (${s.proficiency})`); return acc; }, {} as Record<string, string[]>);
    for (const [cat, names] of Object.entries(grouped)) text += `${cat}: ${names.join(', ')}\n`;
    text += '\n';
  }
  if (certifications.length) {
    text += 'CERTIFICATIONS:\n';
    for (const c of certifications) text += `- ${c.name}${c.issuer ? ` (${c.issuer})` : ''}${c.date_obtained ? ` - ${c.date_obtained}` : ''}\n`;
    text += '\n';
  }
  if (projects.length) {
    text += 'PROJECTS:\n';
    for (const p of projects) {
      text += `${p.name}${p.url ? ` (${p.url})` : ''}\n`;
      if (p.description) text += `${p.description}\n`;
      if (p.technologies.length) text += `Tech: ${p.technologies.join(', ')}\n`;
      if (p.highlights.length) text += p.highlights.map(h => `- ${h}`).join('\n') + '\n';
      text += '\n';
    }
  }
  if (languages.length) {
    text += 'LANGUAGES:\n';
    text += languages.map(l => `${l.language} (${l.proficiency})`).join(', ') + '\n';
  }
  return text;
}

/**
 * Score a CV against a job description for ATS compatibility.
 */
export interface ATSGapAnalysis {
  score: number;
  missing_keywords: string[];
  matched_keywords: string[];
  suggestions: string[];
  strengths: string[];
  gaps: { area: string; severity: 'critical' | 'important' | 'nice_to_have'; description: string; fix: string }[];
  summary_rewrite: string;
  skills_to_add: string[];
  achievements_to_enhance: { experience_id: string; current: string; suggested: string }[];
}

export async function atsScore(
  profile: CVProfile, experience: CVExperience[], education: CVEducation[], skills: CVSkill[],
  jobDescription: string, settings: UserSettings
): Promise<ATSGapAnalysis> {
  const cvText = buildCVText(profile, experience, education, skills);

  const response = await callAI(
    `You are an ATS (Applicant Tracking System) optimization expert trained on the resume-tailoring discipline. Your analysis must be truthful — never invent experience, metrics, or responsibilities that aren't in the source CV. Flag gaps honestly rather than papering over them.

Perform a DETAILED gap analysis between a CV and job description. Your goal is to help the candidate reach 100% ATS match honestly.${buildCandidateContext(profile)}

Return ONLY valid JSON:
{
  "score": 75,
  "missing_keywords": ["keyword NOT in CV but required by job"],
  "matched_keywords": ["keyword found in BOTH CV and job"],
  "strengths": ["what the CV does well for this role"],
  "suggestions": ["specific actionable improvement to increase score"],
  "gaps": [
    {
      "area": "Skills Gap / Experience Gap / Summary / Keywords / etc.",
      "severity": "critical|important|nice_to_have",
      "description": "What's missing",
      "fix": "Exact text to add or change to close this gap"
    }
  ],
  "summary_rewrite": "A fully rewritten professional summary optimized for this specific job (3-4 sentences)",
  "skills_to_add": ["specific skills from job not in CV"],
  "achievements_to_enhance": [
    {
      "experience_id": "id of the experience entry",
      "current": "current bullet text",
      "suggested": "enhanced bullet that better matches job requirements"
    }
  ]
}

Rules:
- TRUTHFULNESS FIRST — never invent experience, metrics, or responsibilities. Only re-frame what exists.
- Score 0-100: 90+ = excellent match, 70-89 = good, 50-69 = needs work, <50 = poor
- gaps: be SPECIFIC — tell them EXACTLY what text to add/change, not vague advice
- gaps severity: critical = will likely cause ATS rejection, important = significantly hurts score, nice_to_have = minor improvement
- summary_rewrite: 3-4 sentences (50-80 words), reference the company's industry/tech/challenges, front-load the role keyword + years of experience + top technical skills
- achievements_to_enhance: pick the 3-5 weakest bullets. Every rewritten bullet must follow STAR (Situation→Task→Action→Result), start with a strong action verb, contain at least one quantifiable metric (%, $, time, scale, team size), be 80-150 characters, and mirror job-description terminology verbatim where truthful
- skills_to_add: only skills genuinely mentioned in the job AND inferrable from their experience — never fabricate
- missing_keywords: every important term from job description not found anywhere in the CV`,

    `CV:\n${cvText}\n\nExperience IDs:\n${experience.map(e => `${e.id}: ${e.role} at ${e.company}`).join('\n')}\n\nJOB DESCRIPTION:\n${jobDescription}`,
    settings,
    'ats_score',
    8192,
  );

  const parsed = extractJson<ATSGapAnalysis>(response, 'object');
  if (!parsed) throw new Error('AI did not return valid JSON for ATS analysis');
  return parsed;
}

/**
 * Generate a tailored professional summary for a specific job.
 */
export async function tailorSummary(
  profile: CVProfile, experience: CVExperience[], skills: CVSkill[],
  jobDescription: string, settings: UserSettings
): Promise<string> {
  const cvText = buildCVText(profile, experience, [], skills);

  const response = await callAI(
    `You write professional CV summaries.
${UNIVERSAL_CV_RULES}

TASK: Write a 3-5 sentence professional summary (50-80 words) tailored to the job description. Follow the SUMMARY SECTION rules above verbatim. Return ONLY the summary text, no JSON, no quotes.`,
    `MY CV:\n${cvText}\n\nJOB DESCRIPTION:\n${jobDescription}`,
    settings,
    'ai_improve'
  );

  return response.trim();
}

/**
 * Generate an ATS-optimized cover letter.
 */
export async function generateCoverLetter(
  profile: CVProfile, experience: CVExperience[], skills: CVSkill[],
  jobDescription: string, company: string | undefined, position: string | undefined,
  settings: UserSettings
): Promise<string> {
  const cvText = buildCVText(profile, experience, [], skills);

  const contextLines = [
    company ? `COMPANY: ${company}` : null,
    position ? `POSITION: ${position}` : null,
    `JOB DESCRIPTION:\n${jobDescription}`,
  ].filter(Boolean).join('\n');

  const response = await callAI(
    `You write professional cover letters. The candidate's CV is provided — use only its facts.
${UNIVERSAL_CV_RULES}

TASK: Write a concise, compelling cover letter (3-4 paragraphs).
Rules:
- Address to "Hiring Manager" unless a name is provided.
- Opening: Hook + why this specific role at this company (use the company name if provided, otherwise refer to "your team" or "your company").
- Middle: 2-3 specific achievements from the CV that match the job requirements — include the actual numbers.
- Closing: Enthusiasm + call to action.
- Professional but human tone — avoid the AI-tell vocabulary listed above.
- Return ONLY the letter text.`,
    `MY CV:\n${cvText}\n\n${contextLines}`,
    settings,
    'ai_improve'
  );

  return response.trim();
}

/**
 * Suggest improvements to bullet points for a specific experience entry.
 */
export async function improveAchievements(
  role: string, company: string, currentAchievements: string[],
  jobDescription: string | null, settings: UserSettings
): Promise<string[]> {
  const response = await callAI(
    `You are an ATS optimisation expert specialising in CV achievement bullets.
${UNIVERSAL_CV_RULES}

TASK: Rewrite each bullet following the BULLETS / ACHIEVEMENTS + POWER VERBS + TRUTHFULNESS rules above. Specifically:
- Apply Google X-Y-Z ("Accomplished [X] as measured by [Y] by doing [Z]") or STAR.
- Every bullet must contain at least one number. If the original has no metric, use the ranges/approximations/before-after/ratio techniques from the rules — NEVER invent a precise number.
- Mirror industry-standard terminology (e.g., "CI/CD pipeline" not "deployment process").
${jobDescription ? '- CRITICAL: Use the EXACT keywords and phrases from the target job description wherever truthfully applicable.' : ''}
- Keep each bullet 80-150 characters (max 2 lines).
- Return ONLY a JSON array of strings: ["improved bullet 1", "improved bullet 2"].
- Return the SAME number of bullets as the input — one improved version per original.`,
    `ROLE: ${role} at ${company}\n\nCURRENT BULLETS:\n${currentAchievements.map((a, i) => `${i + 1}. ${a}`).join('\n')}${jobDescription ? `\n\nTARGET JOB DESCRIPTION (mirror these keywords):\n${jobDescription}` : ''}`,
    settings,
    'ai_improve'
  );

  const parsed = extractJson<string[]>(response, 'array');
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) return currentAchievements;
  // If AI returned fewer than input, pad with originals to preserve indexing.
  return currentAchievements.map((orig, i) => parsed[i] || orig);
}

/**
 * Full job-match: AI analyzes a job description and tailors the entire CV.
 * Returns a complete tailored CV structure ready to save as a new version.
 */
export interface TailoredCV {
  company: string;
  position: string;
  location: string | null;
  summary: string;
  keywords: string[];
  ats_score: number;
  original_score: number;
  experience: { id: string; achievements: string[]; technologies: string[] }[];
  skills_to_add: { name: string; category: string; proficiency: string }[];
  skills_to_highlight: string[];
  projects_to_highlight: string[];
  certs_to_highlight: string[];
  match_reasons: { strength: string; detail: string }[];
  gaps_remaining: { area: string; suggestion: string }[];
  cover_letter: string;
}

export async function tailorCVToJob(
  profile: CVProfile,
  experience: CVExperience[],
  education: CVEducation[],
  skills: CVSkill[],
  jobDescription: string,
  settings: UserSettings,
  certifications: CVCertification[] = [],
  projects: CVProject[] = [],
  languages: CVLanguage[] = [],
): Promise<TailoredCV> {
  const cvText = buildCVText(profile, experience, education, skills, certifications, projects, languages);

  const response = await callAI(
    `You are an elite CV optimization and ATS expert trained on the resume-tailoring discipline. Analyze the job description and tailor the CV to maximize ATS match and interview chances — WITHOUT fabricating experience.

Core principle: TRUTHFULNESS. Every rewritten bullet must be traceable to something the candidate already did. You may:
- Re-phrase to mirror job-description language (e.g. "deployment pipelines" → "CI/CD pipelines" if they used one)
- Expose implicit metrics with realistic estimates drawn from context ("managed a team" → "managed a team of 5")
- Promote relevant skills, reorder sections, and surface transferable experience${buildCandidateContext(profile)}

You may NOT:
- Invent companies, roles, dates, tools, or technologies that don't appear in the source
- Invent precise numbers (revenue, users, headcount) that aren't in or clearly implied by the source
- Claim certifications or degrees the candidate hasn't listed

Your analysis must be THOROUGH:
1. Extract EVERY requirement from the job description (hard skills, soft skills, tools, frameworks, methodologies, years of experience, industry terms)
2. Map each requirement to evidence in the CV (or identify it as a gap — be honest in gaps_remaining)
3. Rewrite content to mirror the exact language the job description uses (ATS systems match keywords literally)
4. Quantify achievements wherever possible using metrics traceable to the source (%, $, time, team size, scale)

Return ONLY valid JSON:
{
  "company": "detected company name",
  "position": "detected job title",
  "location": "detected location or null",
  "original_score": 55,
  "ats_score": 87,
  "summary": "new professional summary tailored to this specific job (3-4 sentences — mirror their exact terminology, reference their tech stack, domain, and key challenges)",
  "keywords": ["keyword1", "keyword2", "...up to 20 most important ATS keywords from the job"],
  "match_reasons": [
    {"strength": "short label", "detail": "why this candidate is a strong match for this specific requirement"}
  ],
  "gaps_remaining": [
    {"area": "what's still missing after tailoring", "suggestion": "how to address this in interview or future experience"}
  ],
  "experience": [
    {
      "id": "keep the original experience id",
      "achievements": ["rewritten bullet tailored to job requirements using STAR method with metrics", "..."],
      "technologies": ["reordered tech list — job-relevant technologies first, remove irrelevant ones"]
    }
  ],
  "skills_to_add": [
    {"name": "Skill from job not in CV", "category": "Technical|Soft Skills|Tools|Frameworks|Cloud|Databases", "proficiency": "intermediate|advanced"}
  ],
  "skills_to_highlight": ["existing skill names that directly match job requirements"],
  "projects_to_highlight": ["names of existing projects most relevant to this job — order by relevance"],
  "certs_to_highlight": ["names of existing certifications relevant to this job"],
  "cover_letter": "3-4 paragraph cover letter: (1) compelling hook mentioning company by name and why you're drawn to the role, (2-3) specific achievements that directly address their top requirements with metrics, (4) enthusiastic close with call to action"
}

Critical rules:
- "original_score": Estimate the ATS match BEFORE your changes (how the current CV would score against this job).
- "ats_score": Estimate after your tailoring changes. Must be realistic — don't inflate.
- "summary": 3-4 sentences, 50-80 words. Front-load role keyword + years of experience + 2-3 top technical skills. Use EXACT terminology from the job description (if they say "CI/CD pipelines" don't write "deployment automation"). Reference the company's domain/tech/challenges.
- "experience": For EACH experience entry, rewrite ALL achievements using STAR (Situation→Task→Action→Result). Every bullet must: start with a strong action verb (Led, Architected, Spearheaded, Engineered, Optimised, Automated, Delivered, Reduced, Scaled — never "Responsible for", "Worked on", "Helped with"), include at least one quantifiable metric (%, $, time, users, scale), fit 80-150 characters, mirror job-description phrasing verbatim where truthful. Reorder bullets so most relevant come first. NEVER fabricate — only enhance and reframe what exists.
- "experience[].id": MUST match the original experience IDs exactly.
- "match_reasons": 3-5 strongest selling points — specific, not generic. Reference actual experience.
- "gaps_remaining": Be honest about what's missing. 0-3 items. These help the candidate prepare for interview questions about gaps.
- "skills_to_add": Only skills genuinely mentioned in the job AND plausibly inferable from their background. Include correct category.
- "skills_to_highlight": Existing skills that the job explicitly requires — these get promoted to "expert" visibility.
- "projects_to_highlight": Which of their projects are most relevant to this role? Order by relevance. Empty array if no projects.
- "certs_to_highlight": Which certifications matter for this role? Empty array if none relevant.
- "keywords": Extract up to 20 important ATS terms from the job description — include exact phrases the ATS will scan for.
- "cover_letter": NEVER generic. Must reference company name, specific role, and real achievements with numbers.`,

    `MY CURRENT CV:\n${cvText}\n\nExperience IDs:\n${experience.map(e => `${e.id}: ${e.role} at ${e.company}`).join('\n')}\n\nProject names:\n${projects.map(p => p.name).join('\n')}\n\nCertification names:\n${certifications.map(c => c.name).join('\n')}\n\nJOB DESCRIPTION:\n${jobDescription}`,
    settings,
    'ai_tailor',
    8192,
  );

  const parsed = extractJson<TailoredCV & Partial<{ projects_to_highlight: string[]; certs_to_highlight: string[]; match_reasons: { strength: string; detail: string }[]; gaps_remaining: { area: string; suggestion: string }[] }>>(response, 'object');
  if (!parsed) throw new Error('AI did not return valid JSON for tailoring');
  return {
    ...parsed,
    projects_to_highlight: parsed.projects_to_highlight || [],
    certs_to_highlight: parsed.certs_to_highlight || [],
    match_reasons: parsed.match_reasons || [],
    gaps_remaining: parsed.gaps_remaining || [],
    original_score: parsed.original_score || 0,
  };
}

/**
 * AI Optimize: Analyze the entire CV and return actionable suggestions.
 * Each suggestion can be accepted or rejected individually.
 */
export interface CVSuggestion {
  id: string;
  type: 'summary' | 'experience' | 'skill' | 'general' | 'missing' | 'improvement';
  section: string;        // "Summary", "Experience: Patchstack", "Skills", etc.
  title: string;          // Short title for the suggestion
  description: string;    // What to change and why
  ats_impact: string;     // How this change improves ATS parsing/scoring
  current?: string;       // Current value (if replacing)
  suggested?: string;     // Suggested new value
  action: 'replace' | 'add' | 'remove' | 'rewrite';
  priority: 'high' | 'medium' | 'low';
  // For experience suggestions
  experience_id?: string;
  achievement_index?: number;
}

export async function optimizeCV(
  profile: CVProfile,
  experience: CVExperience[],
  education: CVEducation[],
  skills: CVSkill[],
  settings: UserSettings,
  targetRole?: string,
  certifications: CVCertification[] = [],
  projects: CVProject[] = [],
  languages: CVLanguage[] = [],
): Promise<CVSuggestion[]> {
  const cvText = buildCVText(profile, experience, education, skills, certifications, projects, languages);

  const response = await callAI(
    `You are an ATS (Applicant Tracking System) optimization expert and professional CV reviewer trained on the resume-tailoring discipline. Your primary goal is to make this CV pass ATS filters and rank highly, while also being compelling to human reviewers.

Truthfulness is non-negotiable: suggestions must reframe/enhance real experience, never invent companies, tools, metrics, or responsibilities. When a metric would strengthen a bullet but none exists in the source, mark it as a rewrite hint (e.g. "Led team (add size)") rather than fabricating a number.
${targetRole ? `The target role is: ${targetRole}. Optimize keywords and phrasing for this specific role.` : 'Provide general ATS optimization suggestions.'}${buildCandidateContext(profile)}

ATS systems work by:
1. Parsing CV sections (header, summary, experience, education, skills) — poor formatting breaks parsing
2. Matching exact keywords from the job description — synonyms often DON'T match
3. Scoring keyword density, recency, and placement — skills in the summary score higher than skills buried in bullet points
4. Penalizing: graphics/tables/columns (can't parse), missing dates, gaps, generic phrases, spelling errors

Return ONLY a JSON array of suggestion objects:
[
  {
    "id": "unique_id",
    "type": "summary|experience|skill|general|missing|improvement",
    "section": "which section this applies to",
    "title": "short title (max 60 chars)",
    "description": "detailed explanation of what to change and why (max 200 chars)",
    "ats_impact": "how this specific change improves ATS scoring (max 100 chars)",
    "current": "current text being replaced (if applicable, EXACT text from CV)",
    "suggested": "suggested replacement text (if applicable)",
    "action": "replace|add|remove|rewrite",
    "priority": "high|medium|low",
    "experience_id": "experience entry id if applicable",
    "achievement_index": null
  }
]

Generate 10-15 suggestions with HEAVY focus on ATS compliance:

**HIGH PRIORITY — ATS deal-breakers:**
- Summary must contain target role keywords, years of experience, and top 3-5 technical skills. If it's vague or generic, rewrite it.
- Every achievement bullet MUST start with a strong action verb and include a quantifiable metric (%, $, time, scale, team size). Bullets like "Responsible for..." or "Worked on..." are ATS-weak — rewrite them.
- Skills section must use industry-standard terminology exactly as it appears in job postings (e.g., "CI/CD" not "continuous integration", "React.js" not "React", "AWS" not "Amazon cloud").
- Missing critical keywords: compare the CV against common requirements for the target role and flag any standard keywords that are absent.

**MEDIUM PRIORITY — ATS score boosters:**
- Achievement bullets should mirror common job description phrasing for the target role. If companies say "cross-functional collaboration" and the CV says "worked with other teams", rewrite to match.
- Skills should be categorized correctly (Technical, Tools, Frameworks, Cloud, etc.) for ATS section parsing.
- Each experience entry should list technologies used — ATS scanners pick up tech names from these lists.
- Project descriptions should include relevant technical keywords.
- Certifications should include the issuing body and date for ATS credibility parsing.

**LOW PRIORITY — polish:**
- Consistency in date formats, bullet style, and tense
- Remove outdated or irrelevant skills that dilute keyword density
- Ensure every experience entry has at least 3-5 achievement bullets

Rules:
- Be SPECIFIC — quote actual text from the CV in "current" field
- "suggested" must be ready-to-use replacement text, not a description of what to write
- Every "suggested" text must use ATS-friendly language: industry-standard terms, strong action verbs, quantifiable metrics
- "ats_impact" must explain the specific ATS benefit (e.g., "Adds missing keyword 'Kubernetes' that appears in 80% of DevOps job postings")
- For experience bullets, include the experience_id and achievement_index (0-based)
- Don't suggest adding false information — only enhance and reframe what exists
- If a bullet already has good metrics, focus on keyword alignment instead`,

    `CV TO OPTIMIZE:\n\n${cvText}\n\nExperience IDs for reference:\n${experience.map(e => `${e.id}: ${e.role} at ${e.company}`).join('\n')}`,
    settings,
    'ai_optimize',
    8192,
  );

  const suggestions = extractJson<CVSuggestion[]>(response, 'array');
  if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
    throw new Error('AI did not return suggestions');
  }

  return suggestions.map((s, i) => ({
    ...s,
    id: s.id || `suggestion_${i}`,
    ats_impact: s.ats_impact || '',
  }));
}

/**
 * AI improve a specific section of the CV.
 */
export async function improveSection(
  sectionType: 'summary' | 'achievements',
  currentText: string,
  context: string,
  settings: UserSettings
): Promise<string> {
  const prompt = sectionType === 'summary'
    ? `Rewrite this professional summary for MAXIMUM ATS score and recruiter impact.

Requirements:
- 3-4 sentences, 50-80 words (ATS optimal length)
- First sentence: years of experience + core expertise + target role keyword
- Second sentence: 2-3 key technical skills using industry-standard terms (exact names ATS scans for)
- Third sentence: biggest quantifiable achievement (%, $, scale)
- Optional fourth: differentiator or domain expertise
- Use implied first person (no "I")
- Front-load keywords — ATS weights words appearing earlier in the summary

Current summary:\n${currentText}\n\nContext: ${context}`
    : `Rewrite this CV bullet point for MAXIMUM ATS score.

Requirements:
- Start with a power verb (Led, Architected, Spearheaded, Engineered, Optimized, Automated, Delivered, Reduced, Scaled — NEVER "Responsible for", "Worked on", "Helped")
- Include at least one quantifiable metric (%, $, time, users, scale)
- Use industry-standard technical terminology exactly as it appears in job postings
- Follow pattern: [Action verb] + [what you did] + [using what technology/method] + [resulting in what measurable outcome]
- Keep under 150 characters
- Past tense for previous roles, present for current

Current bullet:\n${currentText}\n\nContext: ${context}`;

  const response = await callAI(
    `You are an ATS optimisation expert.
${UNIVERSAL_CV_RULES}

${sectionType === 'summary' ? 'Rewrite the professional summary following the SUMMARY SECTION rules above.' : 'Rewrite the achievement bullet following the BULLETS / ACHIEVEMENTS + POWER VERBS + TRUTHFULNESS rules above.'} Return ONLY the improved text — no JSON, no quotes, no explanation.`,
    prompt,
    settings,
    'ai_improve'
  );

  return response.trim();
}

export interface DraftedExperience {
  role: string;
  company: string;
  location: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  description: string;
  achievements: string[];
  technologies: string[];
}

export interface DraftedProject {
  name: string;
  description: string;
  url: string;
  technologies: string[];
  highlights: string[];
  start_date: string;
  end_date: string;
}

/**
 * Turn a rough free-text description into a structured Experience or Project
 * entry ready to drop into the editor. Used by the empty-state draft prompt:
 * the user types "Backend engineer at Acme 2021-now, shipped payments…" and
 * the draft arrives as a fully populated card. NEVER fabricate — leave fields
 * blank when the source doesn't contain them.
 */
export async function draftEntryFromText(
  kind: 'experience' | 'project',
  rawText: string,
  context: string,
  settings: UserSettings,
): Promise<DraftedExperience | DraftedProject | null> {
  if (!rawText.trim()) return null;

  if (kind === 'experience') {
    const response = await callAI(
      `You are an ATS CV drafting assistant.
${UNIVERSAL_CV_RULES}

TASK: Turn the user's free-text description of a role into a structured JSON experience entry. Extract only what the source contains — leave fields blank ("") if the source is silent. NEVER invent companies, dates, tools, or numbers. For achievements: rewrite each into a power-verb bullet with ≥1 number when the source gives you one (or an honest range/approximation per TRUTHFULNESS rules). 3–5 bullets max.

Return ONLY JSON in this exact shape:
{
  "role": "", "company": "", "location": "", "start_date": "", "end_date": "", "is_current": false,
  "description": "", "achievements": [], "technologies": []
}`,
      `USER-PROVIDED DESCRIPTION:\n${rawText}\n\nCONTEXT:\n${context}`,
      settings,
      'ai_improve',
    );
    const parsed = extractJson<DraftedExperience>(response, 'object');
    return parsed;
  }

  const response = await callAI(
    `You are an ATS CV drafting assistant.
${UNIVERSAL_CV_RULES}

TASK: Turn the user's free-text description of a project into a structured JSON project entry. Extract only what the source contains — leave fields blank ("") if the source is silent. NEVER invent names, URLs, tools, or numbers. For highlights: rewrite each into a power-verb bullet showing impact. 3–5 highlights max.

Return ONLY JSON in this exact shape:
{
  "name": "", "description": "", "url": "", "technologies": [], "highlights": [], "start_date": "", "end_date": ""
}`,
    `USER-PROVIDED DESCRIPTION:\n${rawText}\n\nCONTEXT:\n${context}`,
    settings,
    'ai_improve',
  );
  const parsed = extractJson<DraftedProject>(response, 'object');
  return parsed;
}

/**
 * Polish a block of existing text — keep the user's facts but tighten the
 * structure and flow. Used by the "Beautify" inline buttons on the Summary
 * and Project description fields. Returns plain text with `\n\n` paragraph
 * breaks where natural, which the portfolio renderer turns into real `<p>`
 * tags for visually structured output. No markdown syntax is introduced, so
 * the same string stays ATS-safe when reused in CV exports.
 *
 * Costs 1 `ai_improve` credit per call. TRUTHFULNESS: the prompt forbids
 * inventing facts — only restructuring what's already there.
 */
export async function beautifyText(
  text: string,
  kind: 'summary' | 'project_description',
  context: string,
  settings: UserSettings,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing to beautify — add some text first.');

  const kindPrompt = kind === 'summary'
    ? `Rewrite this professional summary for maximum clarity, recruiter impact, and ATS compatibility.

Requirements:
- 3–4 sentences, 50–80 words total.
- First sentence: years of experience + core expertise + target role keyword (verbatim where present in context).
- Second sentence: 2–3 key technical skills using industry-standard terms.
- Third sentence: biggest quantifiable achievement drawn from the source text.
- Optional fourth: differentiator (domain, scale, leadership).
- Active voice. Implied first person (never "I").`
    : `Rewrite this project description for clarity and impact.

Requirements:
- 2–4 short sentences OR one short sentence + a short paragraph — whichever fits the facts best.
- Lead with the problem the project solves or what it is (one-line hook).
- Follow with how it works / key technical choices.
- Close with quantifiable impact or scale when the source provides one (users, downloads, stars, revenue). Skip if absent — never fabricate.
- If the source contains two clear ideas, separate them with a blank line (\\n\\n) so the portfolio renders them as distinct paragraphs.`;

  return callAI(
    `You are an editor that restructures CV / portfolio text for clarity and impact.
${UNIVERSAL_CV_RULES}

${kindPrompt}

NEVER invent facts, tools, metrics, companies, or outcomes the source text doesn't contain. If a field would be stronger with a number but none is given, omit it rather than fabricate.

Return ONLY the rewritten plain text — no JSON, no quotes, no explanation, no preamble. Use \\n\\n between paragraphs when the content naturally splits into more than one.`,
    `CURRENT TEXT:\n${trimmed}\n\nCONTEXT:\n${context || '(none)'}`,
    settings,
    'ai_improve',
    512,
  ).then(s => s.trim());
}

/**
 * One-click professional summary drafter. Synthesises a fresh 50–80-word
 * summary from the candidate's *existing* Experience + Skills + Profile data
 * — no free-text input needed from the user.
 *
 * Distinct from `improveSection('summary', …)` (which rewrites a summary the
 * user already typed) and from the full-CV `optimizeCV` flow (which returns
 * many suggestions for 3 credits). This is the empty-state / "I don't know
 * how to start" entry point, costing 1 `ai_improve` credit like the project
 * URL importer.
 *
 * TRUTHFULNESS: the prompt instructs the model to synthesise only from the
 * provided CV data. No invented roles, tools, or metrics.
 */
export async function draftSummaryFromCV(
  profile: Pick<CVProfile, 'target_role' | 'career_stage' | 'industry' | 'job_title' | 'full_name'>,
  experience: CVExperience[],
  skills: CVSkill[],
  settings: UserSettings,
): Promise<string> {
  const recentRoles = experience.slice(0, 4).map(e => {
    const dates = [e.start_date, e.is_current ? 'Present' : e.end_date].filter(Boolean).join(' – ');
    const bullets = (e.achievements || []).slice(0, 3).filter(Boolean).map(a => `    • ${a}`).join('\n');
    const techs = e.technologies?.length ? `  Stack: ${e.technologies.join(', ')}` : '';
    return `- ${e.role || 'Role'} at ${e.company || 'Company'}${dates ? ` (${dates})` : ''}${techs ? `\n${techs}` : ''}${bullets ? `\n${bullets}` : ''}`;
  }).join('\n');

  const topSkills = skills.slice(0, 12).map(s => s.name).filter(Boolean).join(', ');

  const contextLines = [
    profile.target_role ? `Target role (weave in verbatim): ${profile.target_role}` : '',
    profile.job_title ? `Current job title: ${profile.job_title}` : '',
    profile.career_stage ? `Career stage: ${profile.career_stage}` : '',
    profile.industry ? `Industry: ${profile.industry}` : '',
    topSkills ? `Top skills: ${topSkills}` : '',
    recentRoles ? `Recent roles:\n${recentRoles}` : '',
  ].filter(Boolean).join('\n\n');

  if (!contextLines.trim()) {
    throw new Error('Add at least a target role, one skill, or one experience entry before drafting.');
  }

  return callAI(
    `You are an ATS-optimised professional summary drafter.
${UNIVERSAL_CV_RULES}

TASK: Write a FRESH professional summary (3–4 sentences, 50–80 words) synthesised from the candidate's actual work history, technologies, and skills below. Follow SUMMARY SECTION rules strictly:
- Sentence 1: years of experience (estimate from role dates) + core expertise + TARGET ROLE keyword VERBATIM where provided
- Sentence 2: 2–3 key technical skills using industry-standard terms (exact names ATS scans for)
- Sentence 3: biggest quantifiable achievement drawn from the candidate's actual bullets — preserve the metric verbatim
- Optional 4th: differentiator (domain, scale, leadership)
- Implied first person (never write "I")
- Front-load keywords

NEVER invent companies, tools, metrics, or experience the candidate doesn't have. Only synthesise from the provided data. If key facts are missing (e.g. no target role, no metrics), write the best honest summary with what's there — don't pad.

Return ONLY the summary text — no JSON, no quotes, no explanation, no preamble.`,
    contextLines,
    settings,
    'ai_improve',
    512,
  ).then(s => s.trim());
}

// ─── Project import from URL ───────────────────────────────────────────────
// Strategy: GitHub URLs are the 90% case for dev CVs, and GitHub's public API
// is CORS-friendly so we can fetch repo metadata + README directly from the
// browser without a proxy. Anything else falls back to URL-only drafting —
// the AI has no web access via our edge proxy, so results are weaker, but we
// still surface a structured skeleton the user can complete.

/** `github.com/owner/repo` (plus optional path/query) → `{owner, repo}`. */
export function parseGitHubRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#]|$)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Pull a compact plain-text digest of a public GitHub repo: name, description,
 * topics, primary language, star/fork counts, homepage, and the first ~2k
 * chars of the README. The digest is what we feed to the drafting prompt.
 */
async function fetchGitHubRepoDigest(owner: string, repo: string): Promise<string> {
  const base = 'https://api.github.com';
  const headers = { Accept: 'application/vnd.github+json' } as const;
  const metaRes = await fetch(`${base}/repos/${owner}/${repo}`, { headers });
  if (metaRes.status === 404) throw new Error(`GitHub repo ${owner}/${repo} not found or private.`);
  if (metaRes.status === 403) throw new Error('GitHub rate limit hit — try again in a minute.');
  if (!metaRes.ok) throw new Error(`GitHub error ${metaRes.status}`);
  const meta = await metaRes.json() as {
    name?: string; full_name?: string; description?: string | null; homepage?: string | null;
    language?: string | null; topics?: string[]; stargazers_count?: number; forks_count?: number;
    default_branch?: string; pushed_at?: string; created_at?: string;
  };

  // README is optional — swallow errors rather than fail the whole import.
  let readmeExcerpt = '';
  try {
    const branch = meta.default_branch || 'main';
    for (const name of ['README.md', 'readme.md', 'README', 'readme']) {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`);
      if (r.ok) {
        const txt = await r.text();
        readmeExcerpt = txt.slice(0, 2000);
        break;
      }
    }
  } catch { /* ignore */ }

  const parts = [
    `Project: ${meta.name || `${owner}/${repo}`}`,
    meta.description ? `Description: ${meta.description}` : '',
    meta.homepage ? `Homepage: ${meta.homepage}` : '',
    `Repo URL: https://github.com/${owner}/${repo}`,
    meta.language ? `Primary language: ${meta.language}` : '',
    meta.topics?.length ? `Topics: ${meta.topics.join(', ')}` : '',
    typeof meta.stargazers_count === 'number' ? `Stars: ${meta.stargazers_count}` : '',
    typeof meta.forks_count === 'number' ? `Forks: ${meta.forks_count}` : '',
    meta.pushed_at ? `Last push: ${meta.pushed_at.slice(0, 10)}` : '',
    readmeExcerpt ? `\nREADME (excerpt):\n${readmeExcerpt}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

/**
 * Drop-in wrapper around `draftEntryFromText('project', …)` that accepts a
 * URL. For GitHub URLs we fetch rich metadata + README first; for anything
 * else we just pass the URL string (degraded: the AI can only guess from the
 * URL itself). The returned project's `url` is always overridden with the
 * user's original link so AI hallucinations can't silently swap it.
 *
 * Costs 1 credit (ai_improve) — same as free-text drafting.
 */
export async function draftProjectFromUrl(
  url: string,
  settings: UserSettings,
): Promise<{ project: DraftedProject | null; source: 'github' | 'url-only' }> {
  const trimmed = url.trim();
  if (!trimmed) return { project: null, source: 'url-only' };

  const gh = parseGitHubRepoUrl(trimmed);
  let rawText: string;
  let source: 'github' | 'url-only' = 'url-only';

  if (gh) {
    rawText = await fetchGitHubRepoDigest(gh.owner, gh.repo);
    source = 'github';
  } else {
    rawText = `Project URL: ${trimmed}\n\n(No content fetched — infer only from the URL itself; leave fields blank if uncertain.)`;
  }

  const drafted = (await draftEntryFromText('project', rawText, '', settings)) as DraftedProject | null;
  if (!drafted) return { project: null, source };
  // Anchor the URL to what the user actually pasted — never trust the model
  // to echo it back verbatim, especially for non-GitHub inputs.
  drafted.url = trimmed;
  return { project: drafted, source };
}

/**
 * Generate interview preparation questions based on a job description and the
 * candidate's CV. Returns role-specific behavioural, technical, and situational
 * questions with suggested approach angles so the user can rehearse before
 * submitting their application.
 */
export interface InterviewQuestion {
  question: string;
  type: 'behavioral' | 'technical' | 'situational';
  angle: string;   // How to frame the answer using the candidate's background
}

export async function generateInterviewQuestions(
  profile: CVProfile,
  experience: CVExperience[],
  skills: CVSkill[],
  jobDescription: string,
  settings: UserSettings,
): Promise<InterviewQuestion[]> {
  const cvText = buildCVText(profile, experience, [], skills);

  const response = await callAI(
    `You are an expert interview coach with deep knowledge of technical and behavioural hiring processes. Your task is to generate targeted interview questions for a specific job application.

RULES:
- Generate exactly 10 questions: 4 behavioural, 3 technical/role-specific, 3 situational.
- Every question must be directly tied to either (a) a requirement from the job description, or (b) a gap between the CV and the JD.
- The "angle" field must reference specific achievements or skills from THE CANDIDATE'S ACTUAL CV — not generic advice.
- Behavioural: past experience ("Tell me about a time..."). Use STAR framework.
- Technical: knowledge/skill demos relevant to this exact role.
- Situational: hypotheticals mirroring real challenges in this specific job.
- Do NOT generate generic questions like "Where do you see yourself in 5 years?" or "Tell me about yourself."

Return ONLY valid JSON array:
[
  {
    "question": "The exact interview question",
    "type": "behavioral|technical|situational",
    "angle": "How to frame your answer using your specific background from this CV (reference actual roles/achievements/skills)"
  }
]`,
    `MY CV:\n${cvText}\n\nJOB DESCRIPTION:\n${jobDescription}`,
    settings,
    'ai_improve',
    4096,
  );

  const parsed = extractJson<InterviewQuestion[]>(response, 'array');
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AI did not return valid interview questions');
  }
  return parsed;
}
