import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

/**
 * Corporate template — sans-serif, blue double-rule sections.
 *
 * Inspired by a popular recruiter-friendly layout: crisp Helvetica, blue
 * uppercase section titles bracketed by thin horizontal rules above and below.
 * Keeps the ATS-safe contract: single column, plain disc bullets, no tables /
 * floats / background fills / unicode icons.
 */

const ACCENT = '#2563eb';   // blue-600
const TEXT   = '#111827';
const BODY   = '#374151';
const MUTED  = '#6b7280';

export default function CVTemplateCorporate({
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

  const contactLine = [profile.location, profile.phone, profile.email].filter(Boolean).join('  |  ');
  const links = [profile.linkedin, profile.github, profile.website, profile.portfolio].filter(Boolean);

  const eduFirst = profile.career_stage === 'entry_level';

  // Flatten skill names for a single, readable list (ATS-safe: comma separated).
  // The visual "4-column grid" look is purely cosmetic via CSS multi-column.
  const allSkillNames = skills.map((s) => s.name);

  return (
    <div id="cv-template" style={{
      fontFamily: "Helvetica, Arial, 'Helvetica Neue', sans-serif",
      color: BODY,
      maxWidth: '794px',
      margin: '0 auto',
      padding: '40px 48px',
      fontSize: '10pt',
      lineHeight: 1.5,
      backgroundColor: '#ffffff',
    }}>

      {/* ── HEADER ──────────────────────────────── */}
      <div style={{ marginBottom: '6px' }}>
        <h1 style={{
          fontSize: '24pt', fontWeight: 800, margin: 0, color: ACCENT,
          letterSpacing: '1px', textTransform: 'uppercase', lineHeight: 1.1,
        }}>
          {profile.full_name}
        </h1>
        {profile.job_title && (
          <div style={{
            fontSize: '12pt', fontWeight: 700, color: TEXT,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px',
          }}>
            {profile.job_title}
          </div>
        )}
        {contactLine && (
          <div style={{ fontSize: '9.5pt', color: BODY, marginTop: '8px' }}>
            {contactLine}
          </div>
        )}
        {links.length > 0 && (
          <div style={{ fontSize: '9pt', color: ACCENT, marginTop: '2px' }}>
            {links.join('  |  ')}
          </div>
        )}
      </div>

      {/* ── SUMMARY ─────────────────────────────── */}
      {profile.summary && (
        <RuleSection title="Summary">
          <p style={{ margin: 0, color: BODY, fontSize: '10pt', lineHeight: 1.6 }}>{profile.summary}</p>
        </RuleSection>
      )}

      {/* ── EXPERIENCE + EDUCATION (order swaps for entry-level) ── */}
      {(() => {
        const expBlock = experience.length > 0 && (
          <RuleSection key="exp" title="Professional Experience">
            {experience.map((exp, i) => (
              <div key={exp.id || i} style={{ marginBottom: i < experience.length - 1 ? '12px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '10.5pt', color: TEXT, flex: 1 }}>
                    {exp.role}{exp.company ? `, ${exp.company}` : ''}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '9.5pt', color: TEXT, whiteSpace: 'nowrap' }}>
                    {exp.start_date} — {exp.is_current ? 'Present' : exp.end_date}
                  </div>
                </div>
                {exp.location && (
                  <div style={{ fontSize: '9pt', color: MUTED, fontStyle: 'italic', marginTop: '1px' }}>
                    {exp.location}
                  </div>
                )}
                {exp.achievements.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
                    {exp.achievements.map((a, j) => (
                      <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px', lineHeight: 1.5 }}>{a}</li>
                    ))}
                  </ul>
                )}
                {exp.technologies.length > 0 && (
                  <div style={{ fontSize: '9pt', color: BODY, marginTop: '4px' }}>
                    <strong style={{ color: TEXT }}>Tech:</strong> {exp.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </RuleSection>
        );
        const eduBlock = education.length > 0 && (
          <RuleSection key="edu" title="Education">
            {education.map((edu, i) => (
              <div key={edu.id || i} style={{ marginBottom: i < education.length - 1 ? '8px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '10.5pt', color: TEXT, flex: 1 }}>
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '9.5pt', color: TEXT, whiteSpace: 'nowrap' }}>
                    {edu.start_date && edu.end_date ? `${edu.start_date} — ${edu.end_date}` : edu.end_date || edu.start_date || ''}
                  </div>
                </div>
                {edu.institution && (
                  <div style={{ fontSize: '10pt', color: BODY, marginTop: '1px' }}>{edu.institution}</div>
                )}
                {edu.grade && (
                  <div style={{ fontSize: '9.5pt', color: BODY, marginTop: '2px' }}>• {edu.grade}</div>
                )}
              </div>
            ))}
          </RuleSection>
        );
        return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
      })()}

      {/* ── TECHNICAL SKILLS ────────────────────── */}
      {skills.length > 0 && (
        <RuleSection title="Technical Skills">
          {/* Always render as grouped category rows — ATS-safe single column. */}
          {Object.entries(groupedSkills).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: '3px', fontSize: '9.5pt' }}>
              <strong style={{ color: TEXT }}>{cat}:</strong>{' '}
              <span style={{ color: BODY }}>{items.map((s) => s.name).join(', ')}</span>
            </div>
          ))}
        </RuleSection>
      )}

      {/* ── PROJECTS ────────────────────────────── */}
      {projects.length > 0 && (
        <RuleSection title="Projects">
          {projects.map((p, i) => (
            <div key={p.id || i} style={{ marginBottom: i < projects.length - 1 ? '8px' : 0 }}>
              <div style={{ fontSize: '10pt' }}>
                <strong style={{ color: TEXT }}>{p.name}</strong>
                {p.url && <span style={{ color: ACCENT }}> — {p.url}</span>}
              </div>
              {p.description && (
                <p style={{ margin: '2px 0 0', fontSize: '9.5pt', color: BODY }}>{p.description}</p>
              )}
              {p.highlights.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: '18px', listStyleType: 'disc' }}>
                  {p.highlights.map((h, j) => (
                    <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px' }}>{h}</li>
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
        </RuleSection>
      )}

      {/* ── ADDITIONAL INFORMATION ──────────────── */}
      {(certifications.length > 0 || languages.length > 0) && (
        <RuleSection title="Additional Information">
          {languages.length > 0 && (
            <div style={{ fontSize: '9.5pt', color: BODY, marginBottom: '3px' }}>
              <strong style={{ color: TEXT }}>Languages:</strong>{' '}
              {languages.map((l) => `${l.language} (${capitalize(l.proficiency)})`).join(', ')}
            </div>
          )}
          {certifications.length > 0 && (
            <div style={{ fontSize: '9.5pt', color: BODY }}>
              <strong style={{ color: TEXT }}>Certifications:</strong>{' '}
              {certifications.map((c) => `${c.name}${c.issuer ? ` (${c.issuer})` : ''}`).join(', ')}
            </div>
          )}
        </RuleSection>
      )}
    </div>
  );
}

/** Blue uppercase title between two thin blue rules. */
function RuleSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '14px' }}>
      <div style={{ borderTop: `1px solid ${ACCENT}`, marginBottom: '6px' }} />
      <h2 style={{
        fontSize: '11pt', fontWeight: 700, color: ACCENT,
        textTransform: 'uppercase', letterSpacing: '1px',
        margin: '0 0 4px', lineHeight: 1.2,
      }}>
        {title}
      </h2>
      <div style={{ borderTop: `1px solid ${ACCENT}`, marginBottom: '8px' }} />
      {children}
    </div>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
