import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * Neo Dark template — deep navy + brand-green.
 *
 * Visual DNA pulled directly from thedevcv.com's dark design system:
 *   background #0c1222 · elevated panels #131d33 · border #3a506e
 *   text #ffffff · muted #8594b0 · accent #0d9668 (brand green)
 *
 * Structure is identical to every other ATS-safe template (single column,
 * plain disc bullets, no floats) — only paint changes. Dark mode CVs work
 * well as digital portfolio links and high-contrast print.
 */

const BG        = '#0c1222';   // surface
const BG_RAISED = '#131d33';   // surface-light
const BORDER    = '#3a506e';   // neo-border
const BRAND     = '#0d9668';   // brand green
const BRAND_LT  = '#2bb885';   // brand-light
const TEXT      = '#ffffff';   // headings
const BODY      = '#c8d6e8';   // readable body (~slate-300)
const MUTED     = '#8594b0';   // secondary

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

export default function CVTemplateNeoDark({
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
      backgroundColor: BG,
    }}>

      {/* ── TOP BRAND BAR ─────────────────── */}
      <div style={{ height: '6px', background: `linear-gradient(90deg, ${BRAND} 0%, ${BRAND_LT} 100%)` }} />

      {/* ── HEADER ────────────────────────── */}
      {/* Single-column layout so ATS reads: name → title → contacts → links. */}
      <div style={{
        padding: '24px 44px 20px',
        backgroundColor: BG_RAISED,
        borderBottom: `3px solid ${BORDER}`,
      }}>
        <h1 style={{
          fontSize: '24pt',
          fontWeight: 900,
          margin: 0,
          color: TEXT,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          lineHeight: 1.05,
        }}>
          {profile.full_name}
        </h1>
        {profile.job_title && (
          <div style={{
            fontSize: '11pt',
            color: BRAND_LT,
            fontWeight: 700,
            marginTop: '5px',
            letterSpacing: '0.4px',
          }}>
            {profile.job_title}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ fontSize: '8.5pt', color: MUTED, marginTop: '6px' }}>
            {contacts.join('  ·  ')}
          </div>
        )}
        {links.length > 0 && (
          <div style={{ fontSize: '8.5pt', color: BRAND_LT, marginTop: '2px' }}>
            {links.join('  ·  ')}
          </div>
        )}
      </div>

      {/* ── BODY ──────────────────────────── */}
      <div style={{ padding: '0 44px 32px' }}>

        {/* ── SUMMARY ─────────────────────── */}
        {profile.summary && (
          <DarkSection title="Summary">
            <p style={{ margin: 0, color: BODY, fontSize: '9.5pt', lineHeight: 1.65 }}>{mdToReact(profile.summary)}</p>
          </DarkSection>
        )}

        {/* ── EXPERIENCE + EDUCATION ──────── */}
        {(() => {
          const expBlock = experience.length > 0 && (
            <DarkSection key="exp" title="Work Experience">
              {experience.map((exp, i) => (
                <div
                  key={exp.id || i}
                  style={{
                    marginBottom: i < experience.length - 1 ? '14px' : 0,
                    paddingBottom: i < experience.length - 1 ? '14px' : 0,
                    borderBottom: i < experience.length - 1 ? `1px solid ${BORDER}` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
                    <div style={{ fontWeight: 800, fontSize: '10.5pt', color: TEXT }}>
                      {exp.role}
                      {exp.company && (
                        <span style={{ color: BRAND_LT, fontWeight: 700 }}>{` · ${exp.company}`}</span>
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
            </DarkSection>
          );

          const eduBlock = education.length > 0 && (
            <DarkSection key="edu" title="Education">
              {education.map((edu, i) => (
                <div key={edu.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
                  <div style={{ fontSize: '9.5pt', color: BODY }}>
                    <strong style={{ color: TEXT, fontWeight: 800 }}>
                      {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                    </strong>
                    {edu.institution && <span style={{ color: BRAND_LT }}>{`, ${edu.institution}`}</span>}
                    {edu.grade && <span style={{ color: MUTED, fontStyle: 'italic' }}> — {edu.grade}</span>}
                  </div>
                  <div style={{ fontSize: '8.5pt', color: MUTED, whiteSpace: 'nowrap' }}>
                    {edu.end_date || edu.start_date || ''}
                  </div>
                </div>
              ))}
            </DarkSection>
          );

          return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
        })()}

        {/* ── SKILLS ──────────────────────── */}
        {skills.length > 0 && (
          <DarkSection title="Skills">
            {Object.entries(groupedSkills).map(([cat, items]) => (
              <div key={cat} style={{ marginBottom: '4px', fontSize: '9.5pt' }}>
                <span style={{ fontWeight: 800, color: TEXT }}>{cat}: </span>
                <span style={{ color: BODY }}>{items.map((s) => s.name).join(', ')}</span>
              </div>
            ))}
          </DarkSection>
        )}

        {/* ── PROJECTS ────────────────────── */}
        {projects.length > 0 && (
          <DarkSection title="Projects">
            {projects.map((p, i) => (
              <div key={p.id || i} style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 800, fontSize: '9.5pt', color: TEXT }}>
                  {p.name}
                  {p.url && <span style={{ fontWeight: 400, color: BRAND_LT }}> — {p.url}</span>}
                </div>
                {p.description && (
                  <div style={{ fontSize: '9pt', color: BODY, marginTop: '1px' }}>{mdToReact(p.description)}</div>
                )}
                {p.highlights.length > 0 && (
                  <ul style={{ margin: '3px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                    {p.highlights.map((h, j) => (
                      <li key={j} style={{ fontSize: '9pt', color: BODY }}>{h}</li>
                    ))}
                  </ul>
                )}
                {p.technologies.length > 0 && (
                  <div style={{ fontSize: '8.5pt', color: BODY, marginTop: '3px' }}>
                    <span style={{ fontWeight: 700, color: TEXT }}>Tech: </span>
                    {p.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </DarkSection>
        )}

        {/* ── CERTIFICATIONS ──────────────── */}
        {certifications.length > 0 && (
          <DarkSection title="Certifications">
            {certifications.map((c, i) => (
              <div key={c.id || i} style={{ fontSize: '9.5pt', color: BODY, marginBottom: '3px' }}>
                <span style={{ fontWeight: 800, color: TEXT }}>{c.name}</span>
                {c.issuer && <span style={{ color: BRAND_LT }}>{`, ${c.issuer}`}</span>}
                {c.date_obtained && <span style={{ color: MUTED }}>{` — ${c.date_obtained}`}</span>}
              </div>
            ))}
          </DarkSection>
        )}

        {/* ── LANGUAGES ───────────────────── */}
        {languages.length > 0 && (
          <DarkSection title="Languages">
            <div style={{ fontSize: '9.5pt', color: BODY }}>
              {languages.map((l) => `${l.language} (${capitalize(l.proficiency)})`).join('  ·  ')}
            </div>
          </DarkSection>
        )}
      </div>

      {/* ── BOTTOM BRAND BAR ──────────────── */}
      <div style={{ height: '4px', background: `linear-gradient(90deg, ${BRAND_LT} 0%, ${BRAND} 100%)` }} />
    </div>
  );
}

function DarkSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '20px' }}>
      {/* Section label: left accent bar + uppercase label + full-width rule */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
      }}>
        <div style={{ width: '4px', height: '16px', background: `linear-gradient(180deg, ${BRAND_LT} 0%, ${BRAND} 100%)`, flexShrink: 0 }} />
        <h2 style={{
          fontSize: '8pt',
          fontWeight: 900,
          color: BRAND_LT,
          textTransform: 'uppercase',
          letterSpacing: '2px',
          margin: 0,
        }}>
          {title}
        </h2>
        <div style={{ height: '1px', backgroundColor: BORDER, flexGrow: 1 }} />
      </div>
      {children}
    </div>
  );
}
