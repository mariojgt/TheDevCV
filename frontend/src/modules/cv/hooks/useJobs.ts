import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import type { JobApplication, JobStatus } from '../types';

export const JOB_SOURCES = [
  'LinkedIn', 'Indeed', 'Company Website', 'Referral', 'Recruiter',
  'AngelList', 'Glassdoor', 'Stack Overflow', 'Hacker News', 'Twitter/X', 'Other',
] as const;

export function useJobs() {
  const [jobs, setJobs] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const fetchJobs = useCallback(async (status?: JobStatus) => {
    setLoading(true);
    setError(null);
    let query = supabase.from('job_applications').select('*').order('updated_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error: err } = await query;
    if (err) setError(err.message);
    setJobs((data as JobApplication[]) || []);
    setLoading(false);
  }, []);

  const saveJob = async (job: Partial<JobApplication>): Promise<{ data: JobApplication | null; error: string | null }> => {
    if (!userId) return { data: null, error: 'Not authenticated' };
    if (job.id) {
      const { id, user_id, created_at, updated_at, ...rest } = job as JobApplication;
      const { data, error: err } = await supabase.from('job_applications').update(rest).eq('id', id).select().single();
      if (!err) await fetchJobs();
      return { data: data as JobApplication | null, error: err?.message || null };
    } else {
      const { id, user_id, created_at, updated_at, ...rest } = job as JobApplication;
      const { data, error: err } = await supabase.from('job_applications').insert({ ...rest, user_id: userId }).select().single();
      if (!err) await fetchJobs();
      return { data: data as JobApplication | null, error: err?.message || null };
    }
  };

  const updateStatus = async (id: string, status: JobStatus): Promise<{ error: string | null }> => {
    const updates: Record<string, unknown> = { status };
    if (status === 'applied' || status === 'screening') updates.applied_date = new Date().toISOString().split('T')[0];
    if (status === 'rejected' || status === 'offer' || status === 'accepted') updates.response_date = new Date().toISOString().split('T')[0];
    const { error: err } = await supabase.from('job_applications').update(updates).eq('id', id);
    if (!err) await fetchJobs();
    return { error: err?.message || null };
  };

  const deleteJob = async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase.from('job_applications').delete().eq('id', id);
    if (!err) await fetchJobs();
    return { error: err?.message || null };
  };

  const addInterview = async (jobId: string, interview: { date: string; type: string; notes: string }) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return { error: 'Job not found' };
    const interviews = [...(job.interview_dates || []), interview];
    const { error: err } = await supabase.from('job_applications').update({ interview_dates: interviews }).eq('id', jobId);
    if (!err) await fetchJobs();
    return { error: err?.message || null };
  };

  const removeInterview = async (jobId: string, index: number) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return { error: 'Job not found' };
    const interviews = (job.interview_dates || []).filter((_, i) => i !== index);
    const { error: err } = await supabase.from('job_applications').update({ interview_dates: interviews }).eq('id', jobId);
    if (!err) await fetchJobs();
    return { error: err?.message || null };
  };

  // Stats
  const stats = useMemo(() => ({
    total: jobs.length,
    active: jobs.filter(j => !['rejected', 'withdrawn', 'ghosted', 'accepted'].includes(j.status)).length,
    interviews: jobs.filter(j => ['interview', 'technical', 'final_round'].includes(j.status)).length,
    offers: jobs.filter(j => j.status === 'offer').length,
    rejected: jobs.filter(j => j.status === 'rejected').length,
    responseRate: jobs.length > 0
      ? Math.round(jobs.filter(j => !['saved', 'applied', 'ghosted'].includes(j.status)).length / Math.max(jobs.filter(j => j.status !== 'saved').length, 1) * 100)
      : 0,
    avgDaysToResponse: (() => {
      const withResponse = jobs.filter(j => j.applied_date && j.response_date);
      if (withResponse.length === 0) return 0;
      const total = withResponse.reduce((sum, j) => {
        return sum + (new Date(j.response_date!).getTime() - new Date(j.applied_date!).getTime()) / 86400000;
      }, 0);
      return Math.round(total / withResponse.length);
    })(),
  }), [jobs]);

  const exportJobsCSV = () => {
    const header = 'Company,Position,Location,Status,Applied Date,Salary Min,Salary Max,Currency,ATS Score,Source,Notes\n';
    const rows = jobs.map(j =>
      [
        `"${j.company}"`,
        `"${j.position}"`,
        `"${j.location || ''}"`,
        j.status,
        j.applied_date || '',
        j.salary_min || '',
        j.salary_max || '',
        j.salary_currency,
        j.ats_match_score || '',
        (j.tags?.[0]) || '',
        `"${(j.notes || '').replace(/"/g, '""')}"`,
      ].join(',')
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-applications-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return {
    jobs, loading, error, fetchJobs, saveJob, updateStatus, deleteJob,
    addInterview, removeInterview, stats, exportJobsCSV,
  };
}
