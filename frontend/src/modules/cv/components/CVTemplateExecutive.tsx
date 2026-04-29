import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * Executive template — serif, navy accent, left accent bar on the name block.
 *
 * Inspired by classic executive-resume layouts: Georgia serif body, deep navy
 * headings in title case (not uppercase), bold sub-headings for each entry, a
 * "Selected Achievements" lead section before the experience block. Keeps the
 * ATS-safe contract: single column, plain disc bullets, no tables / floats /
 * background fills / unicode icons.
 */

const ACCENT = '#1e4e8c';   // navy
const BODY   = '#333333';
const MUTED  = '#6b6b6b';

export default function CVTemplateExecutive({
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

  const contacts = [profile.email, profile.phone].filter(Boolean);
  const locationBits = [profile.linkedin, profile.location].filter(Boolean);

  const eduFirst = profile.career_stage === 'entry_level';

  // Pull the first 4 achievements across all experience entries for the lead
  // "Selected Achievements" block — the signature feature of this template.
  const selectedAchievements = experience
    .flatMap((e) => e.achievements || [])
    .slice(0, 4);

  return (
    <div id="cv-template" style={{
      fontFamily: "Georgia, 'Times New Roman', Times, serif",
      color: BODY,
      maxWidth: '794px',
      margin: '0 auto',
      padding: '40px 48px',
      fontSize: '10pt',
      lineHeight: 1.5,
      backgroundColor: '#ffffff',
    }}>

      {/* ── HEADER with left accent bar ─────────── */}
      {/* Single-column layout: accent bar sits to the left of a stacked name
          block. Contact info is rendered below the name in DOM order so every
          ATS parser reads: name → title → contacts → links → body. */}
      <div style={{ display: 'flex', gap: '18px', marginBottom: '18px' }}>
        <div style={{ width: '6px', backgroundColor: ACCENT, alignSelf: 'stretch', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: '26pt', fontWeight: 700, margin: 0, color: ACCENT,
            letterSpacing: '0.2px', lineHeight: 1.1,
          }}>
            {profile.full_name}
          </h1>
          {profile.job_title && (
            <div style={{ fontSize: '13pt', color: ACCENT, fontWeight: 400, marginTop: '4px' }}>
              {profile.job_title}
            </div>
          )}
          {contacts.length > 0 && (
            <div style={{ fontSize: '9pt', color: BODY, marginTop: '6px' }}>
              {contacts.join('  •  ')}
            </div>
          )}
          {locationBits.length > 0 && (
            <div style={{ fontSize: '9pt', color: MUTED, marginTop: '2px' }}>
              {locationBits.join('  •  ')}
            </div>
          )}
        </div>
      </div>

      {/* ── AREAS OF EXPERIENCE (relocated above Summary) ── */}
      {skills.length > 0 && (
        <SerifSection title="Areas of Experience">
          {Object.entries(groupedSkills).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: '4px', fontSize: '10pt' }}>
              <strong style={{ color: ACCENT }}>{cat}:</strong>{' '}
              <span style={{ color: BODY }}>{items.map((s) => s.name).join(', ')}</span>
            </div>
          ))}
        </SerifSection>
      )}

      {/* ── SUMMARY (no heading, lead paragraph) ── */}
      {profile.summary && (
        <p style={{
          margin: '0 0 20px', color: BODY, fontSize: '10pt', lineHeight: 1.6,
        }}>
          {mdToReact(profile.summary)}
        </p>
      )}

      {/* ── SELECTED ACHIEVEMENTS ───────────────── */}
      {selectedAchievements.length > 0 && (
        <SerifSection title="Selected Achievements">
          <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc' }}>
            {selectedAchievements.map((a, i) => (
              <li key={i} style={{ fontSize: '10pt', color: BODY, marginBottom: '4px', lineHeight: 1.55 }}>{mdToReact(a)}</li>
            ))}
          </ul>
        </SerifSection>
      )}

      {/* ── EXPERIENCE + EDUCATION (order swaps for entry-level) ── */}
      {(() => {
        const expBlock = experience.length > 0 && (
          <SerifSection key="exp" title="Professional Experience">
            {experience.map((exp, i) => (
              <div key={exp.id || i} style={{ marginBottom: i < experience.length - 1 ? '14px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '11pt', color: ACCENT, flex: 1 }}>
                    {exp.role}{exp.company ? `, ${exp.company}` : ''}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '10pt', color: ACCENT, whiteSpace: 'nowrap' }}>
                    {exp.start_date} — {exp.is_current ? 'Present' : exp.end_date}
                  </div>
                </div>
                {exp.location && (
                  <div style={{ fontSize: '9.5pt', color: MUTED, fontStyle: 'italic', marginTop: '1px' }}>
                    {exp.location}
                  </div>
                )}
                {exp.description && (
                  <p style={{ margin: '6px 0 0', fontSize: '10pt', color: BODY, lineHeight: 1.55 }}>
                    {mdToReact(exp.description)}
                  </p>
                )}
                {exp.achievements.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: '20px', listStyleType: 'disc' }}>
                    {exp.achievements.map((a, j) => (
                      <li key={j} style={{ fontSize: '10pt', color: BODY, marginBottom: '3px', lineHeight: 1.55 }}>{mdToReact(a)}</li>
                    ))}
                  </ul>
                )}
                {exp.technologies.length > 0 && (
                  <div style={{ fontSize: '9.5pt', color: BODY, marginTop: '5px' }}>
                    <strong style={{ color: ACCENT }}>Tech:</strong> {exp.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </SerifSection>
        );
        const eduBlock = education.length > 0 && (
          <SerifSection key="edu" title="Education and Credentials">
            {education.map((edu, i) => (
              <div key={edu.id || i} style={{ marginBottom: i < education.length - 1 ? '8px' : 0 }}>
                <div style={{ fontWeight: 700, fontSize: '10.5pt', color: ACCENT }}>
                  {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                </div>
                <div style={{ fontSize: '10pt', color: BODY, marginTop: '1px' }}>
                  {edu.institution}
                  {edu.location && `, ${edu.location}`}
                  {edu.grade && <span style={{ color: MUTED, fontStyle: 'italic' }}> — {edu.grade}</span>}
                  {(edu.end_date || edu.start_date) && (
                    <span style={{ color: MUTED }}>  ({edu.end_date || edu.start_date})</span>
                  )}
                </div>
                {edu.description && (
                  <p style={{ margin: '3px 0 0', fontSize: '9.5pt', color: BODY, lineHeight: 1.5 }}>{mdToReact(edu.description)}</p>
                )}
              </div>
            ))}
          </SerifSection>
        );
        return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
      })()}


      {/* ── PROJECTS ────────────────────────────── */}
      {projects.length > 0 && (
        <SerifSection title="Projects">
          {projects.map((p, i) => (
            <div key={p.id || i} style={{ marginBottom: i < projects.length - 1 ? '8px' : 0 }}>
              <div style={{ fontSize: '10pt' }}>
                <strong style={{ color: ACCENT }}>{p.name}</strong>
                {p.url && <span style={{ color: MUTED }}> — {p.url}</span>}
              </div>
              {(p.cv_description || p.description) && (
                <p style={{ margin: '2px 0 0', fontSize: '9.5pt', color: BODY, lineHeight: 1.55 }}>{mdToReact(p.cv_description || p.description || '')}</p>
              )}
              {p.highlights.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: '20px', listStyleType: 'disc' }}>
                  {p.highlights.map((h, j) => (
                    <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px' }}>{h}</li>
                  ))}
                </ul>
              )}
              {p.technologies.length > 0 && (
                <div style={{ fontSize: '9.5pt', color: BODY, marginTop: '3px' }}>
                  <strong style={{ color: ACCENT }}>Tech:</strong> {p.technologies.join(', ')}
                </div>
              )}
            </div>
          ))}
        </SerifSection>
      )}

      {/* ── CERTIFICATIONS ──────────────────────── */}
      {certifications.length > 0 && (
        <SerifSection title="Certifications">
          {certifications.map((c, i) => (
            <div key={c.id || i} style={{ fontSize: '10pt', color: BODY, marginBottom: '3px' }}>
              <strong style={{ color: ACCENT }}>{c.name}</strong>
              {c.issuer && `, ${c.issuer}`}
              {c.date_obtained && <span style={{ color: MUTED }}> — {c.date_obtained}</span>}
            </div>
          ))}
        </SerifSection>
      )}

      {/* ── LANGUAGES ───────────────────────────── */}
      {languages.length > 0 && (
        <SerifSection title="Languages">
          <div style={{ fontSize: '10pt', color: BODY }}>
            {languages.map((l) => `${l.language} (${capitalize(l.proficiency)})`).join(', ')}
          </div>
        </SerifSection>
      )}
    </div>
  );
}

/** Large serif accent-coloured heading, title case, no rule. */
function SerifSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <h2 style={{
        fontSize: '15pt', fontWeight: 700, color: ACCENT,
        margin: '0 0 8px', lineHeight: 1.2,
        fontFamily: "Georgia, 'Times New Roman', Times, serif",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
