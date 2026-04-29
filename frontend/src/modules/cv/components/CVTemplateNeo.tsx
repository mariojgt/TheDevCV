import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * Neo template — website-brand inspired.
 *
 * Visual DNA matches thedevcv.com's own design system: white background (ATS-
 * safe), 6 pt brand-green header bar, extrabold uppercase section labels with
 * a 3 px left green accent bar, and a strong typographic hierarchy.
 *
 * Underlying structure is identical to every other ATS-safe template:
 * single column, plain disc bullets, no floats, no background fills in the
 * body, standard heading text the parser can read.
 */

const BRAND  = '#0d9668';  // brand green
const TEXT   = '#0a0f1e';  // near-black
const BODY   = '#2d3748';
const MUTED  = '#6b7280';
const RULE   = '#e2e8f0';

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export default function CVTemplateNeo({
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
  const links    = [profile.linkedin, profile.github, profile.website, profile.portfolio].filter(Boolean);

  const eduFirst = profile.career_stage === 'entry_level';

  return (
    <div id="cv-template" style={{
      fontFamily: "Arial, Helvetica, 'Segoe UI', sans-serif",
      color: BODY,
      maxWidth: '794px',
      margin: '0 auto',
      fontSize: '10pt',
      lineHeight: 1.45,
      backgroundColor: '#ffffff',
    }}>

      {/* ── TOP BRAND BAR ─────────────────── */}
      <div style={{ height: '7px', backgroundColor: BRAND }} />

      {/* ── HEADER ────────────────────────── */}
      {/* Single-column: name → title → contacts → links. No flex split so
          ATS parsers read all contact info in document order. */}
      <div style={{
        padding: '22px 44px 18px',
        borderBottom: `1px solid ${RULE}`,
      }}>
        <h1 style={{
          fontSize: '24pt',
          fontWeight: 900,
          margin: 0,
          color: TEXT,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          lineHeight: 1.05,
        }}>
          {profile.full_name}
        </h1>
        {profile.job_title && (
          <div style={{ fontSize: '11.5pt', color: BRAND, fontWeight: 700, marginTop: '4px', letterSpacing: '0.3px' }}>
            {profile.job_title}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ fontSize: '8.5pt', color: BODY, marginTop: '6px' }}>
            {contacts.join('  ·  ')}
          </div>
        )}
        {links.length > 0 && (
          <div style={{ fontSize: '8.5pt', color: BRAND, marginTop: '2px' }}>
            {links.join('  ·  ')}
          </div>
        )}
      </div>

      {/* ── BODY ──────────────────────────── */}
      <div style={{ padding: '0 44px 32px' }}>

        {/* ── AREAS OF EXPERIENCE (relocated above Summary) ── */}
        {skills.length > 0 && (
          <NeoSection title="Areas of Experience">
            {Object.entries(groupedSkills).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: '3px', fontSize: '9.5pt' }}>
                <span style={{ fontWeight: 800, color: TEXT }}>{cat}: </span>
                <span style={{ color: BODY }}>{items.map((s) => s.name).join(', ')}</span>
              </div>
            ))}
          </NeoSection>
        )}

        {/* ── SUMMARY ─────────────────────── */}
        {profile.summary && (
          <NeoSection title="Summary">
            <p style={{ margin: 0, color: BODY, fontSize: '9.5pt', lineHeight: 1.6 }}>{mdToReact(profile.summary)}</p>
          </NeoSection>
        )}

        {/* ── EXPERIENCE + EDUCATION (order swaps for entry-level) ── */}
        {(() => {
          const expBlock = experience.length > 0 && (
            <NeoSection key="exp" title="Work Experience">
              {experience.map((exp, i) => (
                <div key={exp.id || i} style={{ marginBottom: i < experience.length - 1 ? '12px' : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '10.5pt', color: TEXT }}>
                      {exp.role}
                      {exp.company && (
                        <span style={{ color: BRAND }}>{` · ${exp.company}`}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '8.5pt', color: MUTED, whiteSpace: 'nowrap' }}>
                      {exp.start_date}{(exp.start_date || exp.end_date || exp.is_current) ? ' — ' : ''}{exp.is_current ? 'Present' : exp.end_date}
                    </div>
                  </div>
                  {exp.location && (
                    <div style={{ fontSize: '8.5pt', color: MUTED, marginTop: '1px' }}>{exp.location}</div>
                  )}
                  {exp.achievements.length > 0 && (
                    <ul style={{ margin: '5px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                      {exp.achievements.map((a, j) => (
                        <li key={j} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px', lineHeight: 1.5 }}>{mdToReact(a)}</li>
                      ))}
                    </ul>
                  )}
                  {exp.technologies.length > 0 && (
                    <div style={{ fontSize: '8.5pt', color: BODY, marginTop: '4px' }}>
                      <span style={{ fontWeight: 700, color: TEXT }}>Tech: </span>
                      {exp.technologies.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </NeoSection>
          );

          const eduBlock = education.length > 0 && (
            <NeoSection key="edu" title="Education">
              {education.map((edu, i) => (
                <div key={edu.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                  <div style={{ fontSize: '9.5pt', color: BODY }}>
                    <strong style={{ color: TEXT, fontWeight: 800 }}>
                      {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                    </strong>
                    {edu.institution && <span style={{ color: BRAND }}>{`, ${edu.institution}`}</span>}
                    {edu.grade && <span style={{ color: MUTED, fontStyle: 'italic' }}> — {edu.grade}</span>}
                  </div>
                  <div style={{ fontSize: '8.5pt', color: MUTED, whiteSpace: 'nowrap' }}>
                    {edu.end_date || edu.start_date || ''}
                  </div>
                </div>
              ))}
            </NeoSection>
          );
          return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
        })()}

        {/* ── PROJECTS ────────────────────── */}
        {projects.length > 0 && (
          <NeoSection title="Projects">
            {projects.map((p, i) => (
              <div key={p.id || i} style={{ marginBottom: '7px' }}>
                <div style={{ fontWeight: 800, fontSize: '9.5pt', color: TEXT }}>
                  {p.name}
                  {p.url && <span style={{ fontWeight: 400, color: BRAND }}> — {p.url}</span>}
                </div>
                {(p.cv_description || p.description) && (
                  <div style={{ fontSize: '9pt', color: BODY, marginTop: '1px' }}>{mdToReact(p.cv_description || p.description || '')}</div>
                )}
                {p.highlights.length > 0 && (
                  <ul style={{ margin: '3px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                    {p.highlights.map((h, j) => (
                      <li key={j} style={{ fontSize: '9pt', color: BODY }}>{h}</li>
                    ))}
                  </ul>
                )}
                {p.technologies.length > 0 && (
                  <div style={{ fontSize: '8.5pt', color: BODY, marginTop: '2px' }}>
                    <span style={{ fontWeight: 700, color: TEXT }}>Tech: </span>
                    {p.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </NeoSection>
        )}

        {/* ── CERTIFICATIONS ──────────────── */}
        {certifications.length > 0 && (
          <NeoSection title="Certifications">
            {certifications.map((c, i) => (
              <div key={c.id || i} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '2px' }}>
                <span style={{ fontWeight: 800, color: TEXT }}>{c.name}</span>
                {c.issuer && <span style={{ color: BRAND }}>{`, ${c.issuer}`}</span>}
                {c.date_obtained && <span style={{ color: MUTED }}>{` — ${c.date_obtained}`}</span>}
              </div>
            ))}
          </NeoSection>
        )}

        {/* ── LANGUAGES ───────────────────── */}
        {languages.length > 0 && (
          <NeoSection title="Languages">
            <div style={{ fontSize: '9.5pt', color: BODY }}>
              {languages.map((l) => `${l.language} (${capitalize(l.proficiency)})`).join('  ·  ')}
            </div>
          </NeoSection>
        )}
      </div>

      {/* ── BOTTOM BRAND BAR ──────────────── */}
      <div style={{ height: '4px', backgroundColor: BRAND }} />
    </div>
  );
}

function NeoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '18px' }}>
      {/* Section label row: left accent bar + uppercase bold title */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '8px',
      }}>
        <div style={{ width: '4px', height: '16px', backgroundColor: BRAND, flexShrink: 0 }} />
        <h2 style={{
          fontSize: '8.5pt',
          fontWeight: 900,
          color: TEXT,
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          margin: 0,
          flexGrow: 1,
        }}>
          {title}
        </h2>
        <div style={{ height: '1px', backgroundColor: RULE, flexGrow: 20 }} />
      </div>
      {children}
    </div>
  );
}
