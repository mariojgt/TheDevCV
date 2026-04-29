import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';
import { mdToReact } from '../lib/markdown';

/**
 * Minimal CV template — ultra-clean, lots of whitespace, elegant typography.
 * Inspired by Swiss/Bauhaus design. Single column, no decorations.
 */

export default function CVTemplateMinimal({
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

  const contacts = [profile.email, profile.phone, profile.location, profile.linkedin, profile.github, profile.website].filter(Boolean);

  // Entry-level CVs lead with Education — resume-builder skill guidance.
  const eduFirst = profile.career_stage === 'entry_level';

  return (
    <div id="cv-template" style={{
      fontFamily: "Georgia, 'Times New Roman', Times, serif",
      color: '#222',
      maxWidth: '794px',
      margin: '0 auto',
      padding: '48px 56px',
      fontSize: '10pt',
      lineHeight: 1.5,
      backgroundColor: '#ffffff',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28pt', fontWeight: 400, margin: 0, color: '#111', letterSpacing: '-0.5px' }}>
          {profile.full_name}
        </h1>
        {profile.job_title && (
          <div style={{ fontSize: '12pt', color: '#666', marginTop: '4px', fontStyle: 'italic' }}>{profile.job_title}</div>
        )}
        {contacts.length > 0 && (
          <div style={{ fontSize: '8.5pt', color: '#999', marginTop: '8px', letterSpacing: '0.3px' }}>
            {contacts.join('  ·  ')}
          </div>
        )}
      </div>

      {/* Thin rule */}
      <hr style={{ border: 'none', borderTop: '0.5px solid #ccc', margin: '0 0 20px' }} />

      {/* Areas of Experience (relocated above Summary) */}
      {skills.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <MinimalHeading>Areas of Experience</MinimalHeading>
          {Object.entries(groupedSkills).map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: '3px', fontSize: '9.5pt' }}>
              <span style={{ fontWeight: 700 }}>{cat}:</span>{' '}
              <span style={{ color: '#555' }}>{items.map(s => s.name).join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {profile.summary && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ margin: 0, color: '#444', fontStyle: 'italic', fontSize: '9.5pt', lineHeight: 1.6 }}>{mdToReact(profile.summary)}</p>
        </div>
      )}

      {/* Experience + Education (order swaps for entry-level) */}
      {(() => {
        const expBlock = experience.length > 0 && (
          <div key="exp" style={{ marginBottom: '20px' }}>
            <MinimalHeading>Experience</MinimalHeading>
            {experience.map((exp, i) => (
              <div key={exp.id || i} style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: '10pt' }}>{exp.role}</span>
                  <span style={{ fontSize: '8.5pt', color: '#999' }}>{exp.start_date} — {exp.is_current ? 'Present' : exp.end_date}</span>
                </div>
                <div style={{ fontSize: '9.5pt', color: '#666', fontStyle: 'italic' }}>
                  {exp.company}{exp.location ? `, ${exp.location}` : ''}
                </div>
                {exp.achievements.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                    {exp.achievements.map((a, j) => (
                      <li key={j} style={{ fontSize: '9pt', color: '#444', marginBottom: '1px' }}>{mdToReact(a)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );
        const eduBlock = education.length > 0 && (
          <div key="edu" style={{ marginBottom: '20px' }}>
            <MinimalHeading>Education</MinimalHeading>
            {education.map((edu, i) => (
              <div key={edu.id || i} style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>{edu.degree}</span>
                  <span style={{ color: '#666', fontStyle: 'italic' }}> — {edu.institution}</span>
                  {edu.grade && <span style={{ color: '#999', fontSize: '8.5pt' }}> ({edu.grade})</span>}
                </div>
                <span style={{ fontSize: '8.5pt', color: '#999' }}>{edu.end_date || ''}</span>
              </div>
            ))}
          </div>
        );
        return eduFirst ? <>{eduBlock}{expBlock}</> : <>{expBlock}{eduBlock}</>;
      })()}

      {/* Projects */}
      {projects.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <MinimalHeading>Projects</MinimalHeading>
          {projects.map((p, i) => (
            <div key={p.id || i} style={{ marginBottom: '6px' }}>
              <span style={{ fontWeight: 700 }}>{p.name}</span>
              {p.url && <span style={{ fontSize: '8pt', color: '#999' }}> — {p.url}</span>}
              {(p.cv_description || p.description) && <div style={{ fontSize: '9pt', color: '#555' }}>{mdToReact(p.cv_description || p.description || '')}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Certifications + Languages on one line each */}
      {(certifications.length > 0 || languages.length > 0) && (
        <div>
          {certifications.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <MinimalHeading>Certifications</MinimalHeading>
              <div style={{ fontSize: '9.5pt', color: '#555' }}>
                {certifications.map(c => `${c.name}${c.issuer ? ` (${c.issuer})` : ''}`).join('  ·  ')}
              </div>
            </div>
          )}
          {languages.length > 0 && (
            <div>
              <MinimalHeading>Languages</MinimalHeading>
              <div style={{ fontSize: '9.5pt', color: '#555' }}>
                {languages.map(l => `${l.language} (${l.proficiency})`).join('  ·  ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MinimalHeading({ children }: { children: string }) {
  // Slightly larger heading (10pt) with lighter tracking makes the section
  // unambiguous to ATS parsers that look for boundary markers. Keeps the
  // minimalist feel without hiding the label.
  return (
    <h2 style={{
      fontSize: '10pt',
      fontWeight: 700,
      color: '#1a1a1a',
      textTransform: 'uppercase',
      letterSpacing: '1.5px',
      marginBottom: '8px',
      marginTop: 0,
    }}>
      {children}
    </h2>
  );
}
