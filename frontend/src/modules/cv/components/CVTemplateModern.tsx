import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * Modern template — single-column, ATS-safe, blue accent.
 *
 * The previous two-column Modern design broke ATS parsers (reading order,
 * pill backgrounds, unicode icons). This version keeps the "modern" vibe via
 * a coloured name underline and blue section rules, but the underlying
 * structure is the same single-column, plain-text layout every ATS-safe
 * template uses: standard uppercase headings, plain disc bullets, no icons,
 * no background blocks, no floats.
 */

const ACCENT = '#2563eb';   // blue-600
const TEXT   = '#1a1a1a';
const BODY   = '#3c3c3c';
const MUTED  = '#6b7280';

export default function CVTemplateModern({
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
      fontFamily: "Arial, Helvetica, 'Segoe UI', sans-serif",
      color: BODY,
      maxWidth: '794px',
      margin: '0 auto',
      padding: '36px 44px',
      fontSize: '10pt',
      lineHeight: 1.45,
      backgroundColor: '#ffffff',
    }}>

      {/* ── HEADER ─────────────────────────── */}
      <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: `3px solid ${ACCENT}` }}>
        <h1 style={{ fontSize: '22pt', fontWeight: 800, margin: 0, color: TEXT, letterSpacing: '0.2px' }}>
          {profile.full_name}
        </h1>
        {profile.job_title && (
          <div style={{ fontSize: '11.5pt', color: ACCENT, fontWeight: 600, marginTop: '3px' }}>
            {profile.job_title}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ fontSize: '9pt', color: BODY, marginTop: '7px' }}>
            {contacts.join('  |  ')}
          </div>
        )}
        {links.length > 0 && (
          <div style={{ fontSize: '9pt', color: ACCENT, marginTop: '2px' }}>
            {links.join('  |  ')}
          </div>
        )}
      </div>

      {/* ── SUMMARY ───────────────────────── */}
      {profile.summary && (
        <Section title="Professional Summary">
          <p style={{ margin: 0, color: BODY, fontSize: '9.5pt', lineHeight: 1.55 }}>{mdToReact(profile.summary)}</p>
        </Section>
      )}

      {/* ── EXPERIENCE + EDUCATION (order swaps for entry-level) ── */}
      {(() => {
        const expBlock = experience.length > 0 && (
          <Section key="exp" title="Work Experience">
            {experience.map((exp, i) => (
              <div key={exp.id || i} style={{ marginBottom: i < experience.length - 1 ? '10px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontWeight: 700, fontSize: '10.5pt', color: TEXT }}>
                    {exp.role}{exp.company ? `, ${exp.company}` : ''}
                  </div>
                  <div style={{ fontSize: '9pt', color: MUTED, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                    {exp.start_date} — {exp.is_current ? 'Present' : exp.end_date}
                  </div>
                </div>
                {exp.location && (
                  <div style={{ fontSize: '9pt', color: MUTED, fontStyle: 'italic' }}>{exp.location}</div>
                )}
                {exp.achievements.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
                    {exp.achievements.map((a, j) => (
                      <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px', lineHeight: 1.5 }}>{mdToReact(a)}</li>
                    ))}
                  </ul>
                )}
                {exp.technologies.length > 0 && (
                  <div style={{ fontSize: '9pt', color: BODY, marginTop: '3px' }}>
                    <strong style={{ color: TEXT }}>Tech:</strong> {exp.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </Section>
        );
        const eduBlock = education.length > 0 && (
          <Section key="edu" title="Education">
            {education.map((edu, i) => (
              <div key={edu.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <div style={{ fontSize: '9.5pt', color: BODY }}>
                  <strong style={{ color: TEXT }}>
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                  </strong>
                  {edu.institution && `, ${edu.institution}`}
                  {edu.grade && <span style={{ color: MUTED, fontStyle: 'italic' }}> — {edu.grade}</span>}
                </div>
                <div style={{ fontSize: '9pt', color: MUTED, whiteSpace: 'nowrap', marginLeft: '12px' }}>
                  {edu.end_date || edu.start_date || ''}
                </div>
              </div>
            ))}
          </Section>
        );
        return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
      })()}

      {/* ── SKILLS (single column, by category) ─ */}
      {skills.length > 0 && (
        <Section title="Skills">
          {Object.entries(groupedSkills).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: '3px', fontSize: '9.5pt' }}>
              <strong style={{ color: TEXT }}>{cat}:</strong>{' '}
              <span style={{ color: BODY }}>{items.map((s) => s.name).join(', ')}</span>
            </div>
          ))}
        </Section>
      )}

      {/* ── PROJECTS ──────────────────────── */}
      {projects.length > 0 && (
        <Section title="Projects">
          {projects.map((p, i) => (
            <div key={p.id || i} style={{ marginBottom: '6px' }}>
              <div style={{ fontSize: '9.5pt' }}>
                <strong style={{ color: TEXT }}>{p.name}</strong>
                {p.url && <span style={{ color: ACCENT }}> — {p.url}</span>}
              </div>
              {p.description && (
                <div style={{ fontSize: '9pt', color: BODY, marginTop: '1px' }}>{mdToReact(p.description)}</div>
              )}
              {p.highlights.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
                  {p.highlights.map((h, j) => (
                    <li key={j} style={{ fontSize: '9pt', color: BODY }}>{h}</li>
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
        </Section>
      )}

      {/* ── CERTIFICATIONS ────────────────── */}
      {certifications.length > 0 && (
        <Section title="Certifications">
          {certifications.map((c, i) => (
            <div key={c.id || i} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px' }}>
              <strong style={{ color: TEXT }}>{c.name}</strong>
              {c.issuer && `, ${c.issuer}`}
              {c.date_obtained && ` — ${c.date_obtained}`}
            </div>
          ))}
        </Section>
      )}

      {/* ── LANGUAGES ─────────────────────── */}
      {languages.length > 0 && (
        <Section title="Languages">
          <div style={{ fontSize: '9.5pt', color: BODY }}>
            {languages.map((l) => `${l.language} (${capitalize(l.proficiency)})`).join(', ')}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <h2 style={{
        fontSize: '10.5pt',
        fontWeight: 800,
        color: TEXT,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        borderBottom: `2px solid ${ACCENT}`,
        paddingBottom: '2px',
        marginBottom: '6px',
        marginTop: 0,
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
