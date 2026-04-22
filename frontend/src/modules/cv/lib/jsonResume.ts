import type {
  CVProfile, CVExperience, CVEducation, CVSkill,
  CVCertification, CVProject, CVLanguage,
} from '../types';

/**
 * JSON Resume v1.0.0 (jsonresume.org/schema) — the de-facto portable resume
 * format consumed by Chrome autofill extensions, LinkedIn importers, and
 * most ATS tools. Exporting this unlocks application autofill without us
 * having to build a browser extension.
 *
 * We emit only fields we can populate truthfully — no empty scaffolding.
 */
export interface JSONResume {
  $schema: string;
  basics: {
    name: string;
    label?: string;
    email?: string;
    phone?: string;
    url?: string;
    summary?: string;
    location?: { city?: string };
    profiles?: { network: string; username?: string; url: string }[];
  };
  work?: {
    name: string;       // company
    position: string;   // role
    location?: string;
    startDate?: string;
    endDate?: string;
    summary?: string;
    highlights?: string[];
    keywords?: string[];
  }[];
  education?: {
    institution: string;
    area?: string;
    studyType?: string;
    startDate?: string;
    endDate?: string;
    score?: string;
  }[];
  skills?: {
    name: string;
    level?: string;
    keywords?: string[];
  }[];
  projects?: {
    name: string;
    description?: string;
    highlights?: string[];
    keywords?: string[];
    url?: string;
    startDate?: string;
    endDate?: string;
  }[];
  certificates?: {
    name: string;
    issuer?: string;
    date?: string;
    url?: string;
  }[];
  languages?: {
    language: string;
    fluency?: string;
  }[];
  meta: {
    version: string;
    canonical: string;
    lastModified: string;
  };
}

function clean<T extends object>(o: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

export function toJSONResume(
  profile: CVProfile,
  experience: CVExperience[],
  education: CVEducation[],
  skills: CVSkill[],
  certifications: CVCertification[],
  projects: CVProject[],
  languages: CVLanguage[],
): JSONResume {
  const profiles: { network: string; url: string }[] = [];
  if (profile.linkedin)  profiles.push({ network: 'LinkedIn',  url: profile.linkedin });
  if (profile.github)    profiles.push({ network: 'GitHub',    url: profile.github });
  if (profile.portfolio) profiles.push({ network: 'Portfolio', url: profile.portfolio });

  return {
    $schema: 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json',
    basics: clean({
      name: profile.full_name,
      label: profile.job_title ?? undefined,
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      url: profile.website ?? undefined,
      summary: profile.summary ?? undefined,
      location: profile.location ? { city: profile.location } : undefined,
      profiles: profiles.length ? profiles : undefined,
    }),
    work: experience.map(e => clean({
      name: e.company,
      position: e.role,
      location: e.location ?? undefined,
      startDate: e.start_date || undefined,
      endDate: e.is_current ? undefined : (e.end_date ?? undefined),
      summary: e.description ?? undefined,
      highlights: e.achievements.length ? e.achievements : undefined,
      keywords: e.technologies.length ? e.technologies : undefined,
    })),
    education: education.map(ed => clean({
      institution: ed.institution,
      area: ed.field ?? undefined,
      studyType: ed.degree || undefined,
      startDate: ed.start_date || undefined,
      endDate: ed.end_date || undefined,
      score: ed.grade ?? undefined,
    })),
    skills: skills.map(s => clean({
      name: s.name,
      level: s.proficiency,
    })),
    projects: projects.map(p => clean({
      name: p.name,
      description: p.description ?? undefined,
      highlights: p.highlights.length ? p.highlights : undefined,
      keywords: p.technologies.length ? p.technologies : undefined,
      url: p.url ?? undefined,
      startDate: p.start_date || undefined,
      endDate: p.end_date || undefined,
    })),
    certificates: certifications.map(c => clean({
      name: c.name,
      issuer: c.issuer ?? undefined,
      date: c.date_obtained || undefined,
      url: c.url ?? undefined,
    })),
    languages: languages.map(l => clean({
      language: l.language,
      fluency: l.proficiency,
    })),
    meta: {
      version: 'v1.0.0',
      canonical: 'https://jsonresume.org/schema/',
      lastModified: new Date().toISOString(),
    },
  };
}

/** Trigger a browser download of the JSON Resume payload. */
export function downloadJSONResume(resume: JSONResume, filename = 'resume.json') {
  const blob = new Blob([JSON.stringify(resume, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
