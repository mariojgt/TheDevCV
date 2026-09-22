import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * ATS-compliant, compact CV template.
 * Designed to fit on 1-2 pages max with tight but readable spacing.
 * Inspired by modern resume builders (Resume.io, Novoresume, Resumio).
 *
 * ATS rules followed:
 * - No tables, no columns, no float layouts
 * - Standard section headings (uppercase)
 * - Simple bullet points
 * - Machine-readable dates
 * - No images or icons
 */
export default function CVTemplate({
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
    (acc[s.category] = acc[s.category] || []).push(s);
    return acc;
  }, {} as Record<string, CVSkill[]>);

  // Entry-level CVs lead with Education — resume-builder skill guidance.
  const eduFirst = profile.career_stage === 'entry_level';

  // Contact items as a single line
  const contacts = [
    profile.email, profile.phone, profile.location,
    profile.linkedin, profile.github, profile.website, profile.portfolio,
  ].filter(Boolean);

  return (
    <div id="cv-template" style={{
      fontFamily: "Arial, Helvetica, 'Helvetica Neue', sans-serif",
      color: '#2d2d2d',
      maxWidth: '794px', // A4 width in px at 96dpi
      margin: '0 auto',
      padding: '32px 40px',
      fontSize: '9.5pt',
      lineHeight: 1.45,
      backgroundColor: '#ffffff',
    }}>

      {/* ── HEADER ─────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: '14px', paddingBottom: '10px', borderBottom: '2px solid #333' }}>
        <h1 style={{ fontSize: '22pt', fontWeight: 700, margin: 0, letterSpacing: '1px', color: '#1a1a1a' }}>
          {profile.full_name?.toUpperCase()}
        </h1>
        {profile.job_title && (
          <div style={{ fontSize: '11pt', color: '#555', marginTop: '2px', fontWeight: 500 }}>
            {profile.job_title}
          </div>
        )}
        {contacts.length > 0 && (
          <div style={{ fontSize: '8.5pt', color: '#666', marginTop: '6px', wordSpacing: '2px' }}>
            {contacts.join('  |  ')}
          </div>
        )}
      </div>

      {/* ── AREAS OF EXPERIENCE (relocated above Summary) ──── */}
      {skills.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <SectionTitle>Skills</SectionTitle>
          {Object.entries(groupedSkills).map(([category, items]) => (
            <div key={category} style={{ marginBottom: '2px', fontSize: '9pt' }}>
              <strong style={{ color: '#1a1a1a' }}>{category}:</strong>{' '}
              <span style={{ color: '#444' }}>{items.map(s => s.name).join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── SUMMARY ────────────────────────────── */}
      {profile.summary && (
        <div style={{ marginBottom: '12px' }}>
          <SectionTitle>Professional Summary</SectionTitle>
          <p style={{ margin: 0, color: '#444', fontSize: '9pt', lineHeight: 1.5 }}>
            {mdToReact(profile.summary)}
          </p>
        </div>
      )}

      {/* ── EXPERIENCE + EDUCATION (order swaps for entry-level) ── */}
      {(() => {
        const expBlock = experience.length > 0 && (
          <div key="exp" style={{ marginBottom: '12px' }}>
            <SectionTitle>Work Experience</SectionTitle>
            {experience.map((exp, i) => (
              <div key={exp.id || i} style={{ marginBottom: i < experience.length - 1 ? '10px' : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '10pt', color: '#1a1a1a' }}>{exp.role}</span>
                    <span style={{ color: '#555', fontSize: '9.5pt' }}> | {exp.company}</span>
                    {exp.location && <span style={{ color: '#888', fontSize: '8.5pt' }}> — {exp.location}</span>}
                  </div>
                  <span style={{ fontSize: '8.5pt', color: '#888', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                    {exp.start_date} — {exp.is_current ? 'Present' : exp.end_date}
                  </span>
                </div>
                {exp.achievements.length > 0 && (
                  <ul style={{ margin: '3px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                    {exp.achievements.map((a, j) => (
                      <li key={j} style={{ marginBottom: '1px', color: '#444', fontSize: '9pt', lineHeight: 1.4 }}>{mdToReact(a)}</li>
                    ))}
                  </ul>
                )}
                {exp.technologies.length > 0 && (
                  <div style={{ fontSize: '8pt', color: '#888', marginTop: '2px' }}>
                    <strong style={{ color: '#666' }}>Tech:</strong> {exp.technologies.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
        const eduBlock = education.length > 0 && (
          <div key="edu" style={{ marginBottom: '12px' }}>
            <SectionTitle>Education</SectionTitle>
            {education.map((edu, i) => (
              <div key={edu.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: '9.5pt', color: '#1a1a1a' }}>
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                  </span>
                  <span style={{ color: '#555' }}> — {edu.institution}</span>
                  {edu.grade && <span style={{ color: '#888', fontSize: '8.5pt' }}> ({edu.grade})</span>}
                </div>
                <span style={{ fontSize: '8.5pt', color: '#888', whiteSpace: 'nowrap', marginLeft: '8px' }}>
                  {edu.end_date || edu.start_date || ''}
                </span>
              </div>
            ))}
          </div>
        );
        return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
      })()}

      {/* ── PROJECTS ───────────────────────────── */}
      {projects.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <SectionTitle>Projects</SectionTitle>
          {projects.map((p, i) => (
            <div key={p.id || i} style={{ marginBottom: '6px' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '9.5pt', color: '#1a1a1a' }}>{p.name}</span>
                {p.url && <span style={{ fontSize: '8pt', color: '#888' }}> — {p.url}</span>}
              </div>
              {(p.cv_description || p.description) && (
                <div style={{ fontSize: '9pt', color: '#444', marginTop: '1px' }}>{mdToReact(p.cv_description || p.description || '')}</div>
              )}
              {p.highlights.length > 0 && (
                <ul style={{ margin: '2px 0 0', paddingLeft: '16px', listStyleType: 'disc' }}>
                  {p.highlights.map((h, j) => (
                    <li key={j} style={{ fontSize: '8.5pt', color: '#444' }}>{h}</li>
                  ))}
                </ul>
              )}
              {p.technologies.length > 0 && (
                <div style={{ fontSize: '8pt', color: '#888', marginTop: '1px' }}>
                  <strong style={{ color: '#666' }}>Tech:</strong> {p.technologies.join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── CERTIFICATIONS ─────────────────────── */}
      {certifications.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <SectionTitle>Certifications</SectionTitle>
          {certifications.map((c, i) => (
            <div key={c.id || i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px', fontSize: '9pt' }}>
              <div>
                <strong style={{ color: '#1a1a1a' }}>{c.name}</strong>
                {c.issuer && <span style={{ color: '#555' }}> — {c.issuer}</span>}
              </div>
              {c.date_obtained && <span style={{ color: '#888', fontSize: '8.5pt' }}>{c.date_obtained}</span>}
            </div>
          ))}
        </div>
      )}

      {/* ── LANGUAGES ──────────────────────────── */}
      {languages.length > 0 && (
        <div>
          <SectionTitle>Languages</SectionTitle>
          <div style={{ fontSize: '9pt', color: '#444' }}>
            {languages.map(l => `${l.language} (${capitalize(l.proficiency)})`).join('  |  ')}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 style={{
      fontSize: '10pt',
      fontWeight: 700,
      color: '#1a1a1a',
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      borderBottom: '1px solid #ccc',
      paddingBottom: '2px',
      marginBottom: '6px',
      marginTop: 0,
    }}>
      {children}
    </h2>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
