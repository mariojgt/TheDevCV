/**
 * GitHub profile importer — fetches public profile + repos via the GitHub REST API
 * and maps them into our `ExtractedCV` shape so the import flow can reuse the
 * same review/save pipeline as file + LinkedIn imports.
 *
 * No auth: 60 req/hr per IP, which is plenty for a single-user import (we make
 * exactly 2 requests: /users/{u} and /users/{u}/repos). No AI credits consumed.
 */
import type { ExtractedCV } from './import';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  blog: string | null;
  company: string | null;
  location: string | null;
  email: string | null;
  twitter_username: string | null;
  public_repos: number;
  followers: number;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  archived: boolean;
  private: boolean;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  homepage: string | null;
  updated_at: string;
  pushed_at: string;
}

export interface GitHubPreview {
  user: GitHubUser;
  repos: GitHubRepo[];     // top 6 selected for Projects
  topLanguages: string[];  // up to 8 aggregated from non-fork repos
}

/** Accept raw username, github.com/u, or https://github.com/u — return canonical login. */
export function parseGitHubUsername(input: string): string {
  const trimmed = input.trim().replace(/^@/, '').replace(/\/+$/, '');
  if (!trimmed) throw new Error('Enter a GitHub username');
  const match = trimmed.match(/(?:github\.com\/)?([A-Za-z0-9][A-Za-z0-9-]{0,38})$/);
  if (!match) throw new Error(`"${input}" doesn't look like a GitHub username`);
  return match[1];
}

async function ghFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) throw new Error('GitHub user not found — check the username');
  if (res.status === 403) {
    const reset = res.headers.get('x-ratelimit-reset');
    const minutes = reset ? Math.max(1, Math.ceil((+reset * 1000 - Date.now()) / 60000)) : null;
    throw new Error(minutes ? `GitHub rate limit hit — try again in ~${minutes} min` : 'GitHub rate limit hit — try again later');
  }
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchGitHubPreview(input: string): Promise<GitHubPreview> {
  const username = parseGitHubUsername(input);

  const [user, allRepos] = await Promise.all([
    ghFetch<GitHubUser>(`/users/${username}`),
    ghFetch<GitHubRepo[]>(`/users/${username}/repos?per_page=100&sort=pushed&type=owner`),
  ]);

  const ownRepos = allRepos.filter(r => !r.fork && !r.archived && !r.private);

  const repos = [...ownRepos]
    .sort((a, b) => b.stargazers_count - a.stargazers_count || +new Date(b.pushed_at) - +new Date(a.pushed_at))
    .slice(0, 6);

  // Weight languages by stars so a repo with 1k stars beats 10 throwaway repos of the same language.
  const langWeight = new Map<string, number>();
  for (const r of ownRepos) {
    if (!r.language) continue;
    langWeight.set(r.language, (langWeight.get(r.language) ?? 0) + Math.max(1, r.stargazers_count));
  }
  const topLanguages = [...langWeight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([lang]) => lang);

  return { user, repos, topLanguages };
}

/** Normalize a "blog" URL that may or may not include the scheme. */
function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Build an ExtractedCV from a GitHub preview. If `existing` is provided (e.g. from
 * a prior LinkedIn/file import) we merge — GitHub only fills gaps, never overwrites.
 */
export function githubPreviewToExtracted(
  preview: GitHubPreview,
  existing: ExtractedCV | null = null,
): ExtractedCV {
  const { user, repos, topLanguages } = preview;

  const base: ExtractedCV = existing ?? {
    profile: {},
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    projects: [],
    languages: [],
  };

  const profile = { ...base.profile };
  profile.full_name = profile.full_name || user.name || user.login;
  profile.github = profile.github || `github.com/${user.login}`;
  if (!profile.location && user.location) profile.location = user.location;
  if (!profile.website) profile.website = normalizeUrl(user.blog);
  if (!profile.summary && user.bio) profile.summary = user.bio;
  if (!profile.email && user.email) profile.email = user.email;
  if (!profile.version_name) profile.version_name = `${user.login} — GitHub import`;
  if (profile.is_default === undefined) profile.is_default = !existing;

  const existingProjectNames = new Set(
    base.projects.map(p => p.name?.toLowerCase()).filter((n): n is string => Boolean(n)),
  );
  const newProjects = repos
    .filter(r => !existingProjectNames.has(r.name.toLowerCase()))
    .map((r, i) => {
      const technologies = Array.from(
        new Set([r.language, ...r.topics].filter((t): t is string => Boolean(t))),
      );
      const highlights: string[] = [];
      if (r.stargazers_count >= 5) highlights.push(`${r.stargazers_count.toLocaleString()} GitHub stars`);
      if (r.forks_count >= 5) highlights.push(`${r.forks_count.toLocaleString()} forks`);
      if (r.homepage) highlights.push(`Live: ${r.homepage}`);
      return {
        name: r.name,
        description: r.description ?? null,
        url: r.html_url,
        technologies,
        highlights,
        sort_order: base.projects.length + i,
      };
    });

  const existingSkillNames = new Set(
    base.skills.map(s => s.name?.toLowerCase()).filter((n): n is string => Boolean(n)),
  );
  const newSkills = topLanguages
    .filter(lang => !existingSkillNames.has(lang.toLowerCase()))
    .map((lang, i) => ({
      name: lang,
      category: 'Languages',
      proficiency: 'advanced' as const,
      sort_order: base.skills.length + i,
    }));

  return {
    ...base,
    profile,
    projects: [...base.projects, ...newProjects],
    skills: [...base.skills, ...newSkills],
  };
}
