import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * Professional template — recruiter-friendly, single-column, ATS-safe.
 *
 * Visual identity comes from the labelled section rule (small-caps label
 * followed by a horizontal line extending to the right margin). Content below
 * flows in a plain single column so ATS reads it in the expected order. We
 * removed the previous two-column date gutter, float-right location, and
 * two-column skills grid — each of those was a known ATS-parsing trap.
 */

const TEXT  = '#1a1a1a';
const BODY  = '#3c3c3c';
const MUTED = '#6b6b6b';
const RULE  = '#cccccc';

export default function CVTemplateProfessional({
  profile, experience, education, skills, certifications, projects, languages,
}: {
  profile: CVProfile;
  experience: CVExperience[];
  education: CVEducation[];
  skills: CVSkill[];
  certifications: CVCertification[];
  projects: CVProject[];
  languages: CVLanguage[];
}) {
  const groupedSkills = skills.reduce((acc, s) => {
    (acc[s.category || 'Other'] = acc[s.category || 'Other'] || []).push(s);
    return acc;
  }, {} as Record<string, CVSkill[]>);

  const contacts = [profile.email, profile.phone, profile.location].filter(Boolean);
  const links = [profile.linkedin, profile.github, profile.website, profile.portfolio].filter(Boolean);

  // Entry-level CVs lead with Education — resume-builder skill guidance.
  const eduFirst = profile.career_stage === 'entry_level';

  return (
    <div id="cv-template" style={{
      fontFamily: "Arial, Helvetica, 'Helvetica Neue', sans-serif",
      color: BODY,
      maxWidth: '794px',
      margin: '0 auto',
      padding: '44px 52px',
      fontSize: '10pt',
      lineHeight: 1.5,
      backgroundColor: '#ffffff',
    }}>

      {/* ── HEADER ─────────────────────────────── */}
      <div style={{ marginBottom: '8px' }}>
        <h1 style={{
          fontSize: '22pt', fontWeight: 700, margin: 0,
          color: TEXT, letterSpacing: '0.2px',
        }}>
          {profile.full_name}{profile.job_title ? `, ${profile.job_title}` : ''}
        </h1>
        {contacts.length > 0 && (
          <div style={{ fontSize: '9.5pt', color: BODY, marginTop: '6px' }}>
            {contacts.join('  |  ')}
          </div>
        )}
        {links.length > 0 && (
          <div style={{ fontSize: '9pt', color: MUTED, marginTop: '2px' }}>
            {links.join('  |  ')}
          </div>
        )}
      </div>

      {/* ── AREAS OF EXPERIENCE (relocated above Profile) ── */}
      {skills.length > 0 && (
        <LabeledSection label="Skills">
          {Object.entries(groupedSkills).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: '3px', fontSize: '9.5pt' }}>
              <strong style={{ color: TEXT }}>{cat}:</strong>{' '}
              <span style={{ color: BODY }}>{items.map((s) => s.name).join(', ')}</span>
            </div>
          ))}
        </LabeledSection>
      )}

      {/* ── PROFILE ────────────────────────────── */}
      {profile.summary && (
        <LabeledSection label="Profile">
          <p style={{ margin: 0, color: BODY, fontSize: '9.5pt', lineHeight: 1.6 }}>
            {mdToReact(profile.summary)}
          </p>
        </LabeledSection>
      )}

      {/* ── EMPLOYMENT + EDUCATION (order swaps for entry-level) ── */}
      {(() => {
        const expBlock = experience.length > 0 && (
          <LabeledSection key="exp" label="Employment History">
            {experience.map((exp, i) => (
              <div key={exp.id || i} style={{ marginBottom: i < experience.length - 1 ? '14px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '10.5pt', color: TEXT, flex: 1 }}>
                    {exp.role}{exp.company ? `, ${exp.company}` : ''}
                  </div>
                  <div style={{ fontSize: '9pt', color: MUTED, whiteSpace: 'nowrap' }}>
                    {exp.start_date} — {exp.is_current ? 'Present' : exp.end_date}
                  </div>
                </div>
                {exp.location && (
                  <div style={{ fontSize: '9pt', color: MUTED, fontStyle: 'italic' }}>{exp.location}</div>
                )}
                {exp.description && (
                  <p style={{ margin: '4px 0 0', fontSize: '9.5pt', color: BODY, lineHeight: 1.5 }}>
                    {mdToReact(exp.description)}
                  </p>
                )}
                {exp.achievements.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
                    {exp.achievements.map((a, j) => {
                      // If the user hasn't applied any inline markdown, keep the
                      // template's signature "Label: rest" auto-bold heuristic.
                      // Otherwise, defer entirely to the user's own formatting.
                      const hasMarkdown = /\*\*|\*|\[[^\]]+\]\(/.test(a);
                      if (!hasMarkdown) {
                        const colonIdx = a.indexOf(':');
                        if (colonIdx > 0 && colonIdx < 50) {
                          const label = a.slice(0, colonIdx);
                          const rest = a.slice(colonIdx + 1);
                          return (
                            <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '3px', lineHeight: 1.5 }}>
                              <strong style={{ color: TEXT }}>{label}:</strong>{rest}
                            </li>
                          );
                        }
                      }
                      return (
                        <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '3px', lineHeight: 1.5 }}>{mdToReact(a)}</li>
                      );
                    })}
                  </ul>
                )}
                {exp.technologies.length > 0 && (
                  <div style={{ fontSize: '9pt', color: BODY, marginTop: '5px' }}>
                    <strong style={{ color: TEXT }}>Tech Stack:</strong> {exp.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </LabeledSection>
        );
        const eduBlock = education.length > 0 && (
          <LabeledSection key="edu" label="Education">
            {education.map((edu, i) => (
              <div key={edu.id || i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px',
                marginBottom: i < education.length - 1 ? '6px' : 0,
              }}>
                <div style={{ fontSize: '9.5pt', flex: 1 }}>
                  <strong style={{ color: TEXT }}>
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                  </strong>
                  {edu.institution && <span style={{ color: BODY }}>, {edu.institution}</span>}
                  {edu.grade && <span style={{ color: MUTED, fontStyle: 'italic' }}> — {edu.grade}</span>}
                  {edu.location && <span style={{ color: MUTED }}> · {edu.location}</span>}
                </div>
                <div style={{ fontSize: '9pt', color: MUTED, whiteSpace: 'nowrap' }}>
                  {edu.end_date || edu.start_date || ''}
                </div>
              </div>
            ))}
          </LabeledSection>
        );
        return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
      })()}

      {/* ── PROJECTS ───────────────────────────── */}
      {projects.length > 0 && (
        <LabeledSection label="Projects">
          {projects.map((p, i) => (
            <div key={p.id || i} style={{ marginBottom: i < projects.length - 1 ? '8px' : 0 }}>
              <div style={{ fontSize: '9.5pt' }}>
                <strong style={{ color: TEXT }}>{p.name}</strong>
                {p.url && <span style={{ color: MUTED }}> — {p.url}</span>}
              </div>
              {(p.cv_description || p.description) && (
                <p style={{ margin: '2px 0 0', fontSize: '9pt', color: BODY }}>{mdToReact(p.cv_description || p.description || '')}</p>
              )}
              {p.highlights.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
                  {p.highlights.map((h, j) => (
                    <li key={j} style={{ fontSize: '9pt', color: BODY, marginBottom: '2px' }}>{h}</li>
                  ))}
                </ul>
              )}
              {p.technologies.length > 0 && (
                <div style={{ fontSize: '9pt', color: BODY, marginTop: '2px' }}>
                  <strong style={{ color: TEXT }}>Tech:</strong> {p.technologies.join(', ')}
                </div>
              )}
            </div>
          ))}
        </LabeledSection>
      )}

      {/* ── CERTIFICATIONS ─────────────────────── */}
      {certifications.length > 0 && (
        <LabeledSection label="Certifications">
          {certifications.map((c, i) => (
            <div key={c.id || i} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px' }}>
              <strong style={{ color: TEXT }}>{c.name}</strong>
              {c.issuer && `, ${c.issuer}`}
              {c.date_obtained && <span style={{ color: MUTED }}> — {c.date_obtained}</span>}
            </div>
          ))}
        </LabeledSection>
      )}

      {/* ── LANGUAGES ──────────────────────────── */}
      {languages.length > 0 && (
        <LabeledSection label="Languages">
          <div style={{ fontSize: '9.5pt', color: BODY }}>
            {languages.map((l) => `${l.language} (${capitalize(l.proficiency)})`).join(', ')}
          </div>
        </LabeledSection>
      )}
    </div>
  );
}

/** Small-caps label + horizontal rule extending to the right margin. */
function LabeledSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
        <div style={{
          fontSize: '8.5pt', fontWeight: 700, color: TEXT,
          textTransform: 'uppercase', letterSpacing: '2px',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
        <div style={{ flex: 1, height: '1px', backgroundColor: RULE }} />
      </div>
      <div>{children}</div>
    </div>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
