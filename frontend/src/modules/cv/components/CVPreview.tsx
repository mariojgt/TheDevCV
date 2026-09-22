import { useEffect, useRef, useState } from 'react';
import { Eye, FileText, X } from 'lucide-react';
import CVTemplate from './CVTemplate';
import CVTemplateModern from './CVTemplateModern';
import CVTemplateMinimal from './CVTemplateMinimal';
import CVTemplateProfessional from './CVTemplateProfessional';
import CVTemplateExecutive from './CVTemplateExecutive';
import CVTemplateCorporate from './CVTemplateCorporate';
import CVTemplateNeo from './CVTemplateNeo';
import CVTemplateNeoDark from './CVTemplateNeoDark';
import type { CVProfile, CVExperience, CVEducation, CVSkill, CVCertification, CVProject, CVLanguage } from '../types';

export type TemplateName = 'classic' | 'modern' | 'minimal' | 'professional' | 'executive' | 'corporate' | 'neo' | 'neo-dark';
export interface PreviewData {
  profile: CVProfile; experience: CVExperience[]; education: CVEducation[];
  skills: CVSkill[]; certifications: CVCertification[]; projects: CVProject[]; languages: CVLanguage[];
}
const templates = { classic: CVTemplate, modern: CVTemplateModern, minimal: CVTemplateMinimal, professional: CVTemplateProfessional, executive: CVTemplateExecutive, corporate: CVTemplateCorporate, neo: CVTemplateNeo, 'neo-dark': CVTemplateNeoDark };

export default function CVPreview({ template, data, onClose }: { template: TemplateName; data: PreviewData; onClose?: () => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [height, setHeight] = useState(1123);
  const [zoom, setZoom] = useState('fit');
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (viewport.current) setWidth(viewport.current.clientWidth);
      if (paper.current) setHeight(Math.max(1123, paper.current.offsetHeight));
    });
    if (viewport.current) observer.observe(viewport.current);
    if (paper.current) observer.observe(paper.current);
    return () => observer.disconnect();
  }, []);
  const scale = zoom === 'fit' ? Math.max(0.1, Math.min(1, (width - 32) / 794)) : Number(zoom);
  const Template = templates[template];
  return (
    <section className="studio-preview" aria-label="Live CV preview">
      <div className="studio-preview-toolbar">
        <span><Eye size={15} /><strong>Live preview</strong><span className="studio-live-dot" /></span>
        <div className="flex items-center gap-2">
          <select aria-label="Preview zoom" value={zoom} onChange={e => setZoom(e.target.value)}>
            <option value="fit">Fit to width</option><option value="0.75">75%</option><option value="1">100%</option>
          </select>
          {onClose && <button type="button" className="studio-icon-button" onClick={onClose} aria-label="Close preview"><X size={18} /></button>}
        </div>
      </div>
      <div ref={viewport} className="studio-preview-canvas">
        <div style={{ width: 794 * scale, height: height * scale, margin: '0 auto' }}>
          <div ref={paper} className="cv-preview" style={{ width: 794, minHeight: 1123, transform: `scale(${scale})`, transformOrigin: 'top left', background: template === 'neo-dark' ? '#0c1222' : '#fff' }}>
            {!data.profile.full_name?.trim() && !data.profile.summary?.trim() && !data.experience.length ? (
              <div className="studio-paper-empty">
                <FileText size={32} strokeWidth={1} />
                <h3>Your story takes shape here.</h3>
                <p>Add your details on the left to see your CV come together, one section at a time.</p>
                <span>Live preview · Your changes appear as you write</span>
              </div>
            ) : <Template {...data} />}
          </div>
        </div>
      </div>
      <div className="studio-preview-footer"><span>{template.replace('-', ' ')} template</span><span>PDF exports use a single column</span></div>
    </section>
  );
}

export function MobileCVPreview({ onClose, ...props }: { template: TemplateName; data: PreviewData; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = bodyOverflow; previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="studio-preview-dialog" aria-label="CV preview" onCancel={onClose}>
    <CVPreview {...props} onClose={onClose} />
  </dialog>;
}
