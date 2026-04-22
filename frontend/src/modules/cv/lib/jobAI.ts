import type { UserSettings } from '../../../lib/types';
import type { CVProfile, CVExperience, CVSkill, JobApplication } from '../types';
import { aiComplete } from '../../../lib/ai-client';

async function callAI(system: string, user: string, _settings: UserSettings): Promise<string> {
  return aiComplete(user, { system, maxTokens: 4096 });
}

function buildCVSummary(profile: CVProfile, experience: CVExperience[], skills: CVSkill[]): string {
  let text = `${profile.full_name} — ${profile.job_title || 'Professional'}\n`;
  if (profile.summary) text += `Summary: ${profile.summary}\n`;
  text += `\nExperience:\n`;
  for (const e of experience.slice(0, 5)) {
    text += `- ${e.role} at ${e.company} (${e.start_date}–${e.end_date || 'Present'})\n`;
    text += `  Achievements: ${e.achievements.slice(0, 3).join('; ')}\n`;
    if (e.technologies.length) text += `  Tech: ${e.technologies.join(', ')}\n`;
  }
  text += `\nSkills: ${skills.map(s => `${s.name} (${s.proficiency})`).join(', ')}\n`;
  return text;
}

// ════════════════════════════════════════════════════════════
// 1. INTERVIEW PREPARATION
// ════════════════════════════════════════════════════════════

export interface InterviewPrep {
  likely_questions: {
    question: string;
    type: 'behavioral' | 'technical' | 'situational' | 'culture_fit' | 'role_specific';
    why_asked: string;
    suggested_answer: string; // STAR-format answer using candidate's actual experience
  }[];
  company_talking_points: string[]; // Things to mention that show you researched the company
  questions_to_ask: { question: string; why: string }[]; // Smart questions for the interviewer
  red_flags_to_avoid: string[]; // Things NOT to say
  opening_pitch: string; // 60-second "tell me about yourself"
}

export async function generateInterviewPrep(
  profile: CVProfile, experience: CVExperience[], skills: CVSkill[],
  job: JobApplication, settings: UserSettings
): Promise<InterviewPrep> {
  const cv = buildCVSummary(profile, experience, skills);

  const response = await callAI(
    `You are an elite interview coach who has prepared 10,000+ candidates. Generate a COMPLETE interview preparation package.

Return ONLY valid JSON:
{
  "likely_questions": [
    {
      "question": "the exact question they'll likely ask",
      "type": "behavioral|technical|situational|culture_fit|role_specific",
      "why_asked": "what the interviewer is really evaluating with this question",
      "suggested_answer": "A detailed STAR-format answer (Situation, Task, Action, Result) using the candidate's ACTUAL experience from their CV. Must be specific and authentic — NOT generic."
    }
  ],
  "company_talking_points": ["specific things to say that show you researched the company/role"],
  "questions_to_ask": [
    { "question": "smart question for the interviewer", "why": "what this reveals and why it impresses" }
  ],
  "red_flags_to_avoid": ["things that would hurt your chances if you say them"],
  "opening_pitch": "A 60-second 'tell me about yourself' answer tailored to this role"
}

Rules:
- Generate 10-15 likely questions covering ALL types
- suggested_answer MUST reference the candidate's actual companies, projects, and achievements — never make up fake experience
- questions_to_ask: 5 questions that show strategic thinking about the role
- company_talking_points: specific to THIS company and role, not generic
- opening_pitch: concise, flows naturally, ends with why you're excited about THIS role
- red_flags_to_avoid: 5 specific things related to this role/industry`,

    `CANDIDATE CV:\n${cv}\n\nJOB APPLICATION:\nCompany: ${job.company}\nPosition: ${job.position}\nLocation: ${job.location || 'Not specified'}\n\nJOB DESCRIPTION:\n${job.job_description || 'No job description available — generate based on job title and company.'}`,
    settings
  );

  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to generate interview prep');
  return JSON.parse(match[0]);
}

// ════════════════════════════════════════════════════════════
// 2. FOLLOW-UP EMAIL GENERATOR
// ════════════════════════════════════════════════════════════

export type EmailType = 'thank_you' | 'follow_up' | 'check_in' | 'accept_offer' | 'decline_offer' | 'withdraw';

export async function generateFollowUpEmail(
  profile: CVProfile, job: JobApplication,
  emailType: EmailType, context: string,
  settings: UserSettings
): Promise<string> {
  const typeInstructions: Record<EmailType, string> = {
    thank_you: 'Write a thank-you email to send within 24 hours after an interview. Reference specific topics discussed. Be warm but professional.',
    follow_up: 'Write a follow-up email to check on application status. Be polite, show continued interest, add new value (recent achievement, article, idea).',
    check_in: 'Write a brief check-in after no response for 1-2 weeks. Keep it short, re-express interest, offer flexibility.',
    accept_offer: 'Write an offer acceptance email. Express genuine enthusiasm, confirm key details (start date, salary), ask about next steps.',
    decline_offer: 'Write a professional offer decline. Be gracious, keep the door open, give a brief reason without burning bridges.',
    withdraw: 'Write a professional withdrawal from the application process. Be brief, thank them for their time, keep the relationship positive.',
  };

  const response = await callAI(
    `You write professional job-search emails. ${typeInstructions[emailType]}

Rules:
- Short and focused — max 150 words for the body
- Professional but human (not robotic)
- Include a clear subject line at the top: "Subject: ..."
- Sign off with the candidate's name
- Return ONLY the email text (subject + body + signature)`,

    `CANDIDATE: ${profile.full_name}\nCOMPANY: ${job.company}\nPOSITION: ${job.position}\nRECRUITER: ${job.recruiter_name || 'Hiring Manager'}\n\nADDITIONAL CONTEXT:\n${context || 'None provided'}`,
    settings
  );

  return response.trim();
}

// ════════════════════════════════════════════════════════════
// 3. JOB RED FLAG DETECTOR
// ════════════════════════════════════════════════════════════

export interface JobRedFlags {
  score: number; // 0-100 (100 = great opportunity, 0 = avoid)
  red_flags: { flag: string; severity: 'high' | 'medium' | 'low'; explanation: string }[];
  green_flags: string[];
  salary_assessment: string;
  culture_signals: string[];
  verdict: string; // One sentence recommendation
}

export async function analyzeJobRedFlags(
  jobDescription: string, company: string, position: string,
  salaryMin?: number | null, salaryMax?: number | null,
  settings?: UserSettings
): Promise<JobRedFlags> {
  if (!settings?.encrypted_api_key) throw new Error('No API key configured');

  const response = await callAI(
    `You are a job market analyst who helps candidates avoid bad opportunities. Analyze this job posting for red flags and green flags.

Return ONLY valid JSON:
{
  "score": 75,
  "red_flags": [
    { "flag": "short, clear name", "severity": "high|medium|low", "explanation": "why this is concerning" }
  ],
  "green_flags": ["positive signals about this opportunity"],
  "salary_assessment": "assessment of the salary range — is it fair, below market, competitive?",
  "culture_signals": ["what the job description reveals about company culture"],
  "verdict": "One clear sentence: should the candidate apply or skip?"
}

Red flags to look for:
- Unrealistic requirements (10 years experience for junior role, unicorn skillset)
- Vague responsibilities ("other duties as assigned", "wear many hats")
- No salary listed / below market rate
- Excessive hours or "hustle culture" language
- High turnover signals (always hiring, urgently hiring)
- No benefits mentioned
- "Fast-paced environment" (could mean understaffed)
- Requiring cover letter + references upfront (overly demanding)
- "Competitive salary" with no range (usually means it's not competitive)

Green flags to look for:
- Specific, reasonable requirements
- Clear growth path mentioned
- Salary transparency
- Benefits listed
- Diversity/inclusion commitment
- Learning/development budget
- Remote/flexible work
- Specific tech stack (they know what they need)`,

    `COMPANY: ${company}\nPOSITION: ${position}\nSALARY: ${salaryMin && salaryMax ? `${salaryMin}-${salaryMax}` : 'Not listed'}\n\nJOB DESCRIPTION:\n${jobDescription}`,
    settings
  );

  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to analyze job');
  return JSON.parse(match[0]);
}

// ════════════════════════════════════════════════════════════
// 4. SALARY INTELLIGENCE
// ════════════════════════════════════════════════════════════

export interface SalaryIntel {
  estimated_range: { low: number; mid: number; high: number; currency: string };
  your_position: string; // Where candidate likely falls based on experience
  negotiation_points: string[]; // Specific leverage points from the candidate's background
  script: string; // Word-for-word negotiation script
  counter_offer_template: string;
  benefits_to_negotiate: string[]; // Beyond salary — equity, remote, vacation, etc.
}

export async function generateSalaryIntel(
  profile: CVProfile, experience: CVExperience[], skills: CVSkill[],
  job: JobApplication, settings: UserSettings
): Promise<SalaryIntel> {
  const cv = buildCVSummary(profile, experience, skills);
  const yearsExp = experience.length > 0
    ? Math.max(...experience.map(e => {
        const start = new Date(e.start_date).getFullYear();
        const end = e.end_date ? new Date(e.end_date).getFullYear() : new Date().getFullYear();
        return end - start;
      }))
    : 0;

  const response = await callAI(
    `You are a salary negotiation expert. Provide data-driven salary intelligence and a negotiation strategy.

Return ONLY valid JSON:
{
  "estimated_range": { "low": 50000, "mid": 65000, "high": 80000, "currency": "EUR" },
  "your_position": "where the candidate falls in this range and why",
  "negotiation_points": ["specific leverage points from their background"],
  "script": "A word-for-word script for the salary conversation. Include: opening, anchoring high, handling pushback, and closing.",
  "counter_offer_template": "Template for countering a low offer with specific numbers and justification",
  "benefits_to_negotiate": ["specific benefits to ask for beyond base salary"]
}

Rules:
- estimated_range: realistic for this role + location + experience level
- negotiation_points: reference the candidate's SPECIFIC achievements, certifications, rare skills
- script: natural conversation flow, not robotic. Include what to say if they say "that's above our range"
- benefits_to_negotiate: practical items (signing bonus, remote days, learning budget, equity, extra PTO)`,

    `CANDIDATE:\n${cv}\nTotal years experience: ~${yearsExp}\n\nJOB:\nCompany: ${job.company}\nPosition: ${job.position}\nLocation: ${job.location || 'Not specified'}\nListed salary: ${job.salary_min && job.salary_max ? `${job.salary_currency} ${job.salary_min}-${job.salary_max}` : 'Not listed'}\n\nJOB DESCRIPTION:\n${job.job_description || 'Not available'}`,
    settings
  );

  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Failed to generate salary intelligence');
  return JSON.parse(match[0]);
}
