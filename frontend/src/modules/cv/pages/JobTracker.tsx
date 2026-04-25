import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Search, ExternalLink, Trash2, Brain, Loader2,
  Edit3, X, Calendar, User, Mail, Download, ChevronDown, ChevronUp,
  BarChart3, Clock, Check, TrendingUp, AlertCircle, Shield, DollarSign,
  MessageSquare, Sparkles, Copy, AlertTriangle,
} from 'lucide-react';
import { useJobs, JOB_SOURCES } from '../hooks/useJobs';
import { useCV } from '../hooks/useCV';
import { useApp } from '../../../contexts/AppContext';
import { atsScore, generateCoverLetter } from '../lib/ai';
import {
  generateInterviewPrep, generateFollowUpEmail, analyzeJobRedFlags,
  generateSalaryIntel, type InterviewPrep, type JobRedFlags, type SalaryIntel, type EmailType,
} from '../lib/jobAI';
import { JOB_STATUSES, type JobStatus, type JobApplication } from '../types';
import type { CVExperience, CVEducation, CVSkill } from '../types';
import { supabase } from '../../../lib/supabase';
import { PageHeader, Card, Badge, EmptyState, ConfirmDialog } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import RichTextEditor from '../components/RichTextEditor';
import { mdToReact } from '../lib/markdown';

const INTERVIEW_TYPES = ['Phone Screen', 'Video Call', 'Technical', 'Onsite', 'Panel', 'Culture Fit', 'Final Round', 'Other'];

export default function JobTracker() {
  const {
    jobs, loading, fetchJobs, saveJob, updateStatus, deleteJob,
    addInterview, removeInterview, stats, exportJobsCSV,
  } = useJobs();
  const { profiles, fetchProfiles } = useCV();
  const { settings } = useApp();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<JobStatus | ''>('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Edit state
  const [editingJob, setEditingJob] = useState<JobApplication | null>(null);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Interview form
  const [showInterviewForm, setShowInterviewForm] = useState<string | null>(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', type: 'Video Call', notes: '' });

  // New job form
  const emptyForm: Partial<JobApplication> = {
    company: '', position: '', location: '', job_type: 'full_time', job_url: '', job_description: '',
    status: 'saved', salary_min: null, salary_max: null, salary_currency: 'GBP',
    notes: '', recruiter_name: '', recruiter_email: '', hiring_manager: '', tags: [],
  };
  const [form, setForm] = useState<Partial<JobApplication>>(emptyForm);

  useEffect(() => { fetchJobs(); fetchProfiles(); }, [fetchJobs, fetchProfiles]);

  const filtered = jobs.filter(j => {
    if (statusFilter && j.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return j.company.toLowerCase().includes(q) || j.position.toLowerCase().includes(q) ||
        (j.location || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ── Save new job ──
  const handleSaveJob = async () => {
    if (!form.company?.trim() || !form.position?.trim()) {
      toast('Company and position are required', 'warning');
      return;
    }
    const { error } = await saveJob(form);
    if (error) toast(`Failed: ${error}`, 'error');
    else {
      toast('Job tracked', 'success');
      setForm(emptyForm);
      setShowForm(false);
    }
  };

  // ── Edit existing job ──
  const openEdit = (job: JobApplication) => {
    setEditingJob(job);
    setForm({
      ...job,
      tags: job.tags || [],
    });
  };

  const handleUpdateJob = async () => {
    if (!editingJob || !form.company?.trim() || !form.position?.trim()) {
      toast('Company and position are required', 'warning');
      return;
    }
    const { error } = await saveJob({ ...form, id: editingJob.id });
    if (error) toast(`Failed: ${error}`, 'error');
    else {
      toast('Job updated', 'success');
      setEditingJob(null);
      setForm(emptyForm);
    }
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await deleteJob(deleteTarget);
    if (error) toast(`Failed: ${error}`, 'error');
    else toast('Job deleted', 'success');
    setDeleteTarget(null);
  };

  // ── Status change ──
  const handleStatusChange = async (id: string, status: JobStatus) => {
    const { error } = await updateStatus(id, status);
    if (error) toast(`Failed: ${error}`, 'error');
    else toast(`Status updated to ${JOB_STATUSES.find(s => s.value === status)?.label}`, 'success');
  };

  // ── Add interview ──
  const handleAddInterview = async (jobId: string) => {
    if (!interviewForm.date) { toast('Interview date is required', 'warning'); return; }
    const { error } = await addInterview(jobId, interviewForm);
    if (error) toast(`Failed: ${error}`, 'error');
    else {
      toast('Interview added', 'success');
      setShowInterviewForm(null);
      setInterviewForm({ date: '', type: 'Video Call', notes: '' });
    }
  };

  // ── AI actions ──
  const handleATSMatch = async (job: JobApplication) => {
    if (!settings?.encrypted_api_key || !job.job_description) return;
    const defaultProfile = profiles.find(p => p.is_default) || profiles[0];
    if (!defaultProfile) { toast('Create a CV first', 'warning'); return; }
    setAiLoading(job.id);
    try {
      const [exp, edu, sk] = await Promise.all([
        supabase.from('cv_experience').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
        supabase.from('cv_education').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
        supabase.from('cv_skills').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
      ]);
      const result = await atsScore(defaultProfile, exp as CVExperience[], edu as CVEducation[], sk as CVSkill[], job.job_description, settings);
      await saveJob({ ...job, ats_match_score: result.score, ai_suggestions: result.suggestions });
      toast(`ATS Score: ${result.score}%`, 'success');
    } catch (err: any) {
      toast(err.message || 'ATS analysis failed', 'error');
    }
    setAiLoading(null);
  };

  const handleCoverLetter = async (job: JobApplication) => {
    if (!settings?.encrypted_api_key || !job.job_description) return;
    const defaultProfile = profiles.find(p => p.is_default) || profiles[0];
    if (!defaultProfile) { toast('Create a CV first', 'warning'); return; }
    setAiLoading(job.id + '-cl');
    try {
      const [exp, sk] = await Promise.all([
        supabase.from('cv_experience').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
        supabase.from('cv_skills').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
      ]);
      const letter = await generateCoverLetter(defaultProfile, exp as CVExperience[], sk as CVSkill[], job.job_description, job.company, job.position, settings);
      await saveJob({ ...job, ai_cover_letter: letter });
      toast('Cover letter generated', 'success');
    } catch (err: any) {
      toast(err.message || 'Cover letter failed', 'error');
    }
    setAiLoading(null);
  };

  // ── Job form (shared between create and edit) ──
  const renderJobForm = (isEdit: boolean) => (
    <div className="neo-card p-4 mb-4 space-y-3">
      <h3 className="font-display text-base font-extrabold uppercase tracking-wide text-white">{isEdit ? 'Edit Job Application' : 'Track New Job'}</h3>
      <div className="grid grid-cols-2 gap-3">
        <input type="text" value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
          placeholder="Company *" className="neo-input px-3 py-2.5" />
        <input type="text" value={form.position || ''} onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
          placeholder="Position *" className="neo-input px-3 py-2.5" />
        <input type="text" value={form.location || ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          placeholder="Location" className="neo-input px-3 py-2.5" />
        <input type="text" value={form.job_url || ''} onChange={e => setForm(f => ({ ...f, job_url: e.target.value }))}
          placeholder="Job URL" className="neo-input px-3 py-2.5" />
        <select value={form.job_type || 'full_time'} onChange={e => setForm(f => ({ ...f, job_type: e.target.value as any }))}
          className="neo-input px-3 py-2.5">
          <option value="full_time">Full Time</option>
          <option value="part_time">Part Time</option>
          <option value="contract">Contract</option>
          <option value="freelance">Freelance</option>
          <option value="remote">Remote</option>
          <option value="internship">Internship</option>
        </select>
        <select value={(form.tags as string[])?.[0] || ''} onChange={e => setForm(f => ({ ...f, tags: e.target.value ? [e.target.value] : [] }))}
          className="neo-input px-3 py-2.5">
          <option value="">Source (where found)</option>
          {JOB_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" value={form.salary_min || ''} onChange={e => setForm(f => ({ ...f, salary_min: parseFloat(e.target.value) || null }))}
          placeholder="Salary min" className="neo-input px-3 py-2.5" />
        <input type="number" value={form.salary_max || ''} onChange={e => setForm(f => ({ ...f, salary_max: parseFloat(e.target.value) || null }))}
          placeholder="Salary max" className="neo-input px-3 py-2.5" />
      </div>

      {/* Recruiter / Hiring Manager */}
      <div className="grid grid-cols-3 gap-3">
        <input type="text" value={form.recruiter_name || ''} onChange={e => setForm(f => ({ ...f, recruiter_name: e.target.value }))}
          placeholder="Recruiter name" className="neo-input px-3 py-2.5" />
        <input type="email" value={form.recruiter_email || ''} onChange={e => setForm(f => ({ ...f, recruiter_email: e.target.value }))}
          placeholder="Recruiter email" className="neo-input px-3 py-2.5" />
        <input type="text" value={form.hiring_manager || ''} onChange={e => setForm(f => ({ ...f, hiring_manager: e.target.value }))}
          placeholder="Hiring manager" className="neo-input px-3 py-2.5" />
      </div>

      <textarea value={form.job_description || ''} onChange={e => setForm(f => ({ ...f, job_description: e.target.value }))}
        rows={3} placeholder="Paste the full job description here (for AI matching & cover letter)"
        className="neo-input w-full px-3 py-2.5 resize-none" />
      <RichTextEditor
        mode="paragraph"
        value={form.notes || ''}
        onChange={(v) => setForm(f => ({ ...f, notes: v }))}
        placeholder="Personal notes…"
        minHeight={64}
        ariaLabel="Personal notes"
      />

      <div className="flex gap-2">
        <button onClick={() => { isEdit ? setEditingJob(null) : setShowForm(false); setForm(emptyForm); }}
          className="neo-btn neo-btn-ghost px-5 py-2.5 text-sm">Cancel</button>
        <button onClick={isEdit ? handleUpdateJob : handleSaveJob}
          disabled={!form.company?.trim() || !form.position?.trim()}
          className="neo-btn neo-btn-primary px-5 py-2.5 text-sm">
          {isEdit ? 'Update Job' : 'Save Job'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <ConfirmDialog open={!!deleteTarget} title="Delete job application?" description="This will remove all data including interviews, cover letter, and AI suggestions."
        confirmLabel="Delete" variant="danger" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />

      <PageHeader title="Job Applications" description={`${filtered.length} job${filtered.length !== 1 ? 's' : ''} tracked`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowAnalytics(!showAnalytics)}
              className="neo-btn neo-btn-ghost px-3 py-2.5 text-xs flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5" /> Stats
            </button>
            <button onClick={exportJobsCSV}
              className="neo-btn neo-btn-ghost px-3 py-2.5 text-xs flex items-center gap-2">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <button onClick={() => { setEditingJob(null); setForm(emptyForm); setShowForm(!showForm); }}
              className="neo-btn neo-btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Track Job
            </button>
          </div>
        }
      />

      {/* Analytics panel */}
      {showAnalytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <Card padding="sm"><div className="text-xs text-[var(--color-text-secondary)]">Total</div><div className="text-xl font-bold">{stats.total}</div></Card>
          <Card padding="sm"><div className="text-xs text-[var(--color-text-secondary)]">Active</div><div className="text-xl font-bold text-blue-400">{stats.active}</div></Card>
          <Card padding="sm"><div className="text-xs text-[var(--color-text-secondary)]">Interviews</div><div className="text-xl font-bold text-emerald-400">{stats.interviews}</div></Card>
          <Card padding="sm"><div className="text-xs text-[var(--color-text-secondary)]">Offers</div><div className="text-xl font-bold text-emerald-400">{stats.offers}</div></Card>
          <Card padding="sm"><div className="text-xs text-[var(--color-text-secondary)]">Response Rate</div><div className="text-xl font-bold text-amber-400">{stats.responseRate}%</div></Card>
          <Card padding="sm"><div className="text-xs text-[var(--color-text-secondary)]">Avg. Response</div><div className="text-xl font-bold">{stats.avgDaysToResponse}d</div></Card>
        </div>
      )}

      {/* New job form */}
      {showForm && !editingJob && renderJobForm(false)}

      {/* Edit job form */}
      {editingJob && renderJobForm(true)}

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, position, location…"
            className="neo-input w-full pl-10 pr-4 py-2.5" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
          className="neo-select px-3 py-2.5 text-xs">
          <option value="">All statuses</option>
          {JOB_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Job list */}
      {loading ? (
        <div className="text-center py-16 text-sm text-[var(--color-text-secondary)]">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="w-6 h-6" />}
          title={jobs.length === 0 ? 'No jobs tracked yet' : 'No jobs match your filters'}
          description={jobs.length === 0 ? 'Start tracking your job applications to see them here.' : 'Try adjusting your search or status filter.'}
          action={jobs.length === 0 ? { label: 'Track Job', onClick: () => setShowForm(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map(job => {
            const statusDef = JOB_STATUSES.find(s => s.value === job.status);
            const isExpanded = expandedJob === job.id;
            const source = job.tags?.[0];
            const upcomingInterviews = (job.interview_dates || []).filter(i => new Date(i.date) >= new Date());

            return (
              <Card key={job.id} padding="none" className="overflow-hidden">
                {/* Main row */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedJob(isExpanded ? null : job.id)}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{job.position}</span>
                        {job.ats_match_score != null && (
                          <Badge variant={job.ats_match_score >= 80 ? 'success' : job.ats_match_score >= 60 ? 'warning' : 'danger'}>
                            {job.ats_match_score}% match
                          </Badge>
                        )}
                        {source && <Badge variant="purple">{source}</Badge>}
                        {upcomingInterviews.length > 0 && (
                          <Badge variant="info" icon={<Calendar className="w-3 h-3" />}>
                            {upcomingInterviews.length} upcoming
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)]">
                        {job.company}{job.location ? ` · ${job.location}` : ''}
                        {job.salary_max && ` · ${job.salary_currency} ${job.salary_min?.toLocaleString() || '?'}–${job.salary_max.toLocaleString()}`}
                        {job.applied_date && ` · Applied ${job.applied_date}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <select value={job.status} onChange={e => handleStatusChange(job.id, e.target.value as JobStatus)}
                        className={`px-2 py-1 rounded text-xs font-medium border-0 cursor-pointer ${statusDef?.color || ''}`}>
                        {JOB_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <button onClick={() => openEdit(job)} className="p-1 text-[var(--color-text-secondary)] hover:text-emerald-400" title="Edit">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {job.job_url && (
                        <a href={job.job_url} target="_blank" rel="noopener noreferrer" className="p-1 text-[var(--color-text-secondary)] hover:text-emerald-400" title="Open URL">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button onClick={() => setDeleteTarget(job.id)} className="p-1 text-[var(--color-text-secondary)] hover:text-red-400" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setExpandedJob(isExpanded ? null : job.id)} className="p-1 text-[var(--color-text-secondary)]">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* AI actions */}
                  {job.job_description && (
                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[var(--color-border)]">
                      <button onClick={() => handleATSMatch(job)} disabled={!!aiLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 disabled:opacity-50 transition-colors">
                        {aiLoading === job.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                        ATS Score
                      </button>
                      <button onClick={() => handleCoverLetter(job)} disabled={!!aiLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 disabled:opacity-50 transition-colors">
                        {aiLoading === job.id + '-cl' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                        Cover Letter
                      </button>
                      <button onClick={async () => {
                        setAiLoading(job.id + '-prep');
                        try {
                          const defaultProfile = profiles.find(p => p.is_default) || profiles[0];
                          if (!defaultProfile) { toast('Create a CV first', 'warning'); return; }
                          const [exp, sk] = await Promise.all([
                            supabase.from('cv_experience').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
                            supabase.from('cv_skills').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
                          ]);
                          const prep = await generateInterviewPrep(defaultProfile, exp as CVExperience[], sk as CVSkill[], job, settings!);
                          // Store as JSON in notes for now (persisted)
                          await saveJob({ ...job, notes: (job.notes ? job.notes + '\n\n' : '') + '--- INTERVIEW PREP ---\n' + JSON.stringify(prep, null, 2) });
                          toast('Interview prep generated! Check expanded view.', 'success');
                        } catch (err: any) { toast(err.message || 'Failed', 'error'); }
                        setAiLoading(null);
                      }} disabled={!!aiLoading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 disabled:opacity-50">
                        {aiLoading === job.id + '-prep' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Interview Prep
                      </button>
                      <button onClick={async () => {
                        setAiLoading(job.id + '-flags');
                        try {
                          const flags = await analyzeJobRedFlags(job.job_description!, job.company, job.position, job.salary_min, job.salary_max, settings!);
                          await saveJob({ ...job, notes: (job.notes ? job.notes + '\n\n' : '') + '--- JOB ANALYSIS ---\nScore: ' + flags.score + '/100\nVerdict: ' + flags.verdict + '\nRed flags: ' + flags.red_flags.map(f => f.flag).join(', ') + '\nGreen flags: ' + flags.green_flags.join(', ') });
                          toast(`Job score: ${flags.score}/100 — ${flags.verdict}`, flags.score >= 70 ? 'success' : flags.score >= 40 ? 'warning' : 'error');
                        } catch (err: any) { toast(err.message || 'Failed', 'error'); }
                        setAiLoading(null);
                      }} disabled={!!aiLoading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50">
                        {aiLoading === job.id + '-flags' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                        Red Flags
                      </button>
                      <button onClick={async () => {
                        setAiLoading(job.id + '-salary');
                        try {
                          const defaultProfile = profiles.find(p => p.is_default) || profiles[0];
                          if (!defaultProfile) { toast('Create a CV first', 'warning'); return; }
                          const [exp, sk] = await Promise.all([
                            supabase.from('cv_experience').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
                            supabase.from('cv_skills').select('*').eq('profile_id', defaultProfile.id).order('sort_order').then(r => r.data || []),
                          ]);
                          const intel = await generateSalaryIntel(defaultProfile, exp as CVExperience[], sk as CVSkill[], job, settings!);
                          await saveJob({ ...job, notes: (job.notes ? job.notes + '\n\n' : '') + '--- SALARY INTEL ---\nRange: ' + intel.estimated_range.currency + ' ' + intel.estimated_range.low + '-' + intel.estimated_range.high + '\nYour position: ' + intel.your_position + '\nNegotiation points: ' + intel.negotiation_points.join('; ') });
                          toast(`Salary range: ${intel.estimated_range.currency} ${intel.estimated_range.low.toLocaleString()}-${intel.estimated_range.high.toLocaleString()}`, 'success');
                        } catch (err: any) { toast(err.message || 'Failed', 'error'); }
                        setAiLoading(null);
                      }} disabled={!!aiLoading}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 disabled:opacity-50 transition-colors">
                        {aiLoading === job.id + '-salary' ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
                        Salary Intel
                      </button>
                      <button onClick={async () => {
                        setAiLoading(job.id + '-email');
                        try {
                          const defaultProfile = profiles.find(p => p.is_default) || profiles[0];
                          if (!defaultProfile) { toast('Create a CV first', 'warning'); return; }
                          const email = await generateFollowUpEmail(defaultProfile, job, 'thank_you', '', settings!);
                          navigator.clipboard.writeText(email);
                          toast('Thank-you email copied to clipboard', 'success');
                        } catch (err: any) { toast(err.message || 'Failed', 'error'); }
                        setAiLoading(null);
                      }} disabled={!!aiLoading}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50">
                        {aiLoading === job.id + '-email' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                        Thank-You Email
                      </button>
                      {job.ai_cover_letter && (
                        <button onClick={() => { navigator.clipboard.writeText(job.ai_cover_letter!); toast('Copied to clipboard', 'success'); }}
                          className="px-2.5 py-1 rounded-md border-2 border-brand bg-brand/10 text-brand-light text-[10px] font-bold uppercase tracking-wide hover:bg-brand/20 transition-colors">
                          <Copy className="w-3 h-3 inline mr-1" />Cover Letter
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-[var(--color-border)] p-4 bg-[var(--color-bg)]/30 space-y-3">
                    {/* Contacts */}
                    {(job.recruiter_name || job.recruiter_email || job.hiring_manager) && (
                      <div className="flex flex-wrap gap-4 text-xs">
                        {job.recruiter_name && (
                          <span className="flex items-center gap-1 text-[var(--color-text-secondary)]">
                            <User className="w-3 h-3" /> Recruiter: {job.recruiter_name}
                          </span>
                        )}
                        {job.recruiter_email && (
                          <a href={`mailto:${job.recruiter_email}`} className="flex items-center gap-1 text-emerald-400 hover:underline">
                            <Mail className="w-3 h-3" /> {job.recruiter_email}
                          </a>
                        )}
                        {job.hiring_manager && (
                          <span className="flex items-center gap-1 text-[var(--color-text-secondary)]">
                            <User className="w-3 h-3" /> HM: {job.hiring_manager}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Interviews */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Interviews</span>
                        <button onClick={() => setShowInterviewForm(showInterviewForm === job.id ? null : job.id)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>

                      {showInterviewForm === job.id && (
                        <div className="flex gap-2 mb-2">
                          <input type="datetime-local" value={interviewForm.date} onChange={e => setInterviewForm(f => ({ ...f, date: e.target.value }))}
                            className="px-2 py-1.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs" />
                          <select value={interviewForm.type} onChange={e => setInterviewForm(f => ({ ...f, type: e.target.value }))}
                            className="px-2 py-1.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs">
                            {INTERVIEW_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input type="text" value={interviewForm.notes} onChange={e => setInterviewForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="Notes…" className="flex-1 px-2 py-1.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs" />
                          <button onClick={() => handleAddInterview(job.id)}
                            className="neo-btn neo-btn-primary px-3 py-1.5 text-[10px]">Add</button>
                        </div>
                      )}

                      {(job.interview_dates || []).length > 0 ? (
                        <div className="space-y-1">
                          {(job.interview_dates || []).map((iv, i) => {
                            const past = new Date(iv.date) < new Date();
                            return (
                              <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-md text-xs border-2 ${past ? 'bg-surface border-neo-border text-muted' : 'bg-brand/10 border-brand text-brand-light'}`}>
                                <Calendar className={`w-3.5 h-3.5 ${past ? 'text-[var(--color-text-secondary)]' : 'text-emerald-400'}`} />
                                <span className="font-medium">{new Date(iv.date).toLocaleString()}</span>
                                <Badge variant={past ? 'default' : 'info'}>{iv.type}</Badge>
                                {iv.notes && <span className="text-[var(--color-text-secondary)] truncate flex-1">{iv.notes}</span>}
                                <button onClick={() => removeInterview(job.id, i)} className="text-[var(--color-text-secondary)] hover:text-red-400">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-secondary)]">No interviews scheduled.</p>
                      )}
                    </div>

                    {/* Notes */}
                    {job.notes && (
                      <div>
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Notes</span>
                        <p className="text-sm text-[var(--color-text-secondary)] mt-1 whitespace-pre-wrap">{mdToReact(job.notes)}</p>
                      </div>
                    )}

                    {/* AI suggestions */}
                    {job.ai_suggestions && job.ai_suggestions.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">AI Suggestions</span>
                        <div className="mt-1 text-xs text-[var(--color-text-secondary)] space-y-0.5">
                          {(job.ai_suggestions as string[]).map((s, i) => <div key={i}>• {s}</div>)}
                        </div>
                      </div>
                    )}

                    {/* Cover letter preview */}
                    {job.ai_cover_letter && (
                      <div>
                        <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">Cover Letter</span>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1 whitespace-pre-wrap line-clamp-6">{job.ai_cover_letter}</p>
                      </div>
                    )}

                    {/* Dates */}
                    <div className="flex gap-4 text-xs text-[var(--color-text-secondary)]">
                      {job.applied_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Applied: {job.applied_date}</span>}
                      {job.response_date && <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Response: {job.response_date}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created: {new Date(job.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
