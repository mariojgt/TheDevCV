import type { UserSettings } from '../../../lib/types';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { aiComplete, extractJSON } from '../../../lib/ai-client';

export interface ExtractedCV {
  profile: Partial<CVProfile>;
  experience: Partial<CVExperience>[];
  education: Partial<CVEducation>[];
  skills: Partial<CVSkill>[];
  certifications: Partial<CVCertification>[];
  projects: Partial<CVProject>[];
  languages: Partial<CVLanguage>[];
}

export type ExtractSource = 'generic' | 'linkedin';

export interface ExtractOptions {
  source?: ExtractSource;
}

const LINKEDIN_EXTRA_RULES = `
LinkedIn PDF-specific guidance:
- LinkedIn exports typically follow this order: Contact block → Summary ("About") → Experience → Education → Licenses & certifications → Skills → Languages → Volunteer Experience → Projects → Publications → Honors & Awards → Courses.
- The first page has a "Contact" block with email, phone, and LinkedIn vanity URL — extract these into the profile.
- IGNORE "Recommendations", "People you may know", endorsement counts, and connection counts — these are not CV content.
- Each experience entry is formatted as: "Role\\nCompany · Employment Type\\nDate range · Duration\\nLocation · Location Type\\nDescription". Parse the Role/Company split carefully — LinkedIn sometimes puts multiple roles under one company (promotions); extract each role as a separate experience entry sharing the same company.
- If you see "Skills" as endorsed pills (e.g. "TypeScript · 32 endorsements"), strip the endorsement count and keep the skill name.
- If you see "Publications" treat the title as a project with description = publication venue/abstract, and url = publication link.
- If you see "Volunteer Experience" add it as experience entries — prefix the role with "Volunteer — " for clarity.
- If you see "Honors & Awards" add them as certifications with issuer = awarding body.
- Employment type ("Full-time", "Part-time", "Contract") should be appended to the role if not already obvious, e.g. "Senior Engineer (Contract)".
- Dates on LinkedIn are "Jun 2020 - Present" or "Jun 2020 - Apr 2023 · 2 yrs 11 mos" — drop the duration, keep the date range.
`;

/**
 * Use AI to extract structured CV data from raw text (OCR output).
 */
export async function aiExtractCV(
  text: string,
  _settings: UserSettings,
  opts: ExtractOptions = {},
): Promise<ExtractedCV> {
  const source = opts.source ?? 'generic';
  const sourceHeader = source === 'linkedin'
    ? 'You are a LinkedIn profile PDF parser. The text below was OCR\'d from a LinkedIn "Save as PDF" export. Extract ALL structured CV information.'
    : 'You are a CV/resume parser. Extract ALL structured information from the text of a CV/resume.';
  const sourceRules = source === 'linkedin' ? LINKEDIN_EXTRA_RULES : '';

  const systemPrompt = `${sourceHeader}

Return ONLY valid JSON with this structure:
{
  "profile": {
    "full_name": "John Smith",
    "job_title": "Senior Software Engineer",
    "email": "john@example.com",
    "phone": "+44 7700 900000",
    "location": "London, UK",
    "website": null,
    "linkedin": "linkedin.com/in/johnsmith",
    "github": "github.com/johnsmith",
    "summary": "Experienced engineer with 10+ years..."
  },
  "experience": [
    {
      "company": "Acme Corp",
      "role": "Senior Engineer",
      "location": "London",
      "start_date": "Jan 2020",
      "end_date": null,
      "is_current": true,
      "achievements": ["Led team of 8 engineers delivering...", "Reduced deployment time by 60%..."],
      "technologies": ["React", "Node.js", "PostgreSQL"]
    }
  ],
  "education": [
    {
      "institution": "University of London",
      "degree": "BSc Computer Science",
      "field": "Computer Science",
      "start_date": "2010",
      "end_date": "2014",
      "grade": "First Class Honours"
    }
  ],
  "skills": [
    {"name": "TypeScript", "category": "Technical", "proficiency": "expert"},
    {"name": "Leadership", "category": "Soft Skills", "proficiency": "advanced"}
  ],
  "certifications": [
    {"name": "AWS Solutions Architect", "issuer": "Amazon", "date_obtained": "2023"}
  ],
  "projects": [
    {"name": "Open Source Tool", "description": "...", "url": "github.com/...", "technologies": ["Go", "Docker"]}
  ],
  "languages": [
    {"language": "English", "proficiency": "native"},
    {"language": "Spanish", "proficiency": "professional"}
  ]
}

Rules:
- Extract EVERYTHING you can find — be thorough
- Return COMPACT JSON: no pretty-printing, no trailing commas, single-line strings
- For experience: extract each role separately, parse bullet points into achievements array
- For skills: categorize as Technical, Soft Skills, Tools, Frameworks, Languages, Databases, Cloud, Other
- Proficiency: beginner, intermediate, advanced, expert (infer from context/years)
- Language proficiency: native, fluent, professional, intermediate, basic
- Keep dates as they appear (e.g. "Jan 2020", "2020", "2020-01")
- Set is_current=true if end date says "Present", "Current", "Now", or is missing for the most recent role
- If a section is not found in the CV, return an empty array
- Clean up OCR artifacts (broken words, garbage characters) but preserve the meaning
${sourceRules}`;

  const userPrompt = `Extract all CV information from this text:\n\n${text.slice(0, 20000)}`;

  const response = await aiComplete(userPrompt, { system: systemPrompt, maxTokens: 16000 });

  const parsed = extractJSON<ExtractedCV>(response);
  if (!parsed || typeof parsed !== 'object') throw new Error('AI could not extract CV data');

  return {
    profile: {
      full_name: parsed.profile?.full_name || '',
      job_title: parsed.profile?.job_title || null,
      email: parsed.profile?.email || null,
      phone: parsed.profile?.phone || null,
      location: parsed.profile?.location || null,
      website: parsed.profile?.website || null,
      linkedin: parsed.profile?.linkedin || null,
      github: parsed.profile?.github || null,
      summary: parsed.profile?.summary || null,
      version_name: source === 'linkedin' ? 'LinkedIn import' : 'Imported CV',
      is_default: true,
    },
    experience: (parsed.experience || []).map((e: any, i: number) => ({
      company: e.company || '',
      role: e.role || '',
      location: e.location || null,
      start_date: e.start_date || '',
      end_date: e.end_date || null,
      is_current: e.is_current || false,
      achievements: Array.isArray(e.achievements) ? e.achievements : [],
      technologies: Array.isArray(e.technologies) ? e.technologies : [],
      sort_order: i,
    })),
    education: (parsed.education || []).map((e: any, i: number) => ({
      institution: e.institution || '',
      degree: e.degree || '',
      field: e.field || null,
      start_date: e.start_date || null,
      end_date: e.end_date || null,
      grade: e.grade || null,
      sort_order: i,
    })),
    skills: (parsed.skills || []).map((s: any, i: number) => ({
      name: s.name || '',
      category: s.category || 'Technical',
      proficiency: s.proficiency || 'intermediate',
      sort_order: i,
    })),
    certifications: (parsed.certifications || []).map((c: any, i: number) => ({
      name: c.name || '',
      issuer: c.issuer || null,
      date_obtained: c.date_obtained || null,
      sort_order: i,
    })),
    projects: (parsed.projects || []).map((p: any, i: number) => ({
      name: p.name || '',
      description: p.description || null,
      url: p.url || null,
      technologies: Array.isArray(p.technologies) ? p.technologies : [],
      highlights: Array.isArray(p.highlights) ? p.highlights : [],
      sort_order: i,
    })),
    languages: (parsed.languages || []).map((l: any, i: number) => ({
      language: l.language || '',
      proficiency: l.proficiency || 'professional',
      sort_order: i,
    })),
  };
}
