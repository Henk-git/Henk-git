#!/usr/bin/env node
// Regenerates assets/github-stats.svg (+ dark variant) from live GitHub data.
// Requires GITHUB_TOKEN (any authenticated token works for public user stats).

const USERNAME = process.env.GH_USERNAME || "Henk-git";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const year = new Date().getUTCFullYear();
const from = `${year}-01-01T00:00:00Z`;
const to = new Date().toISOString();

const query = /* GraphQL */ `
  query ($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      pullRequests { totalCount }
      issues { totalCount }
      repositoriesContributedTo(contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
        totalCount
      }
      contributionsCollection(from: $from, to: $to) {
        totalCommitContributions
        restrictedContributionsCount
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
        totalCount
        nodes {
          stargazerCount
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name } }
          }
        }
      }
    }
  }
`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query, variables: { login: USERNAME, from, to } }),
});

if (!res.ok) {
  console.error("GitHub API error", res.status, await res.text());
  process.exit(1);
}

const { data, errors } = await res.json();
if (errors) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}

const u = data.user;
const totalStars = u.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
const totalRepos = u.repositories.totalCount;
const commits = u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount;
const pullRequests = u.pullRequests.totalCount;
const issues = u.issues.totalCount;
const contributedTo = u.repositoriesContributedTo.totalCount;

const langBytes = new Map();
for (const repo of u.repositories.nodes) {
  for (const edge of repo.languages.edges) {
    langBytes.set(edge.node.name, (langBytes.get(edge.node.name) || 0) + edge.size);
  }
}
const totalBytes = [...langBytes.values()].reduce((a, b) => a + b, 0) || 1;
const topLangs = [...langBytes.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([name, bytes]) => ({ name, pct: (bytes / totalBytes) * 100 }));

const maxPct = Math.max(...topLangs.map((l) => l.pct), 1);
const BAR_MAX = 270;
const barRows = topLangs
  .map((l, i) => {
    const y = 94 + i * 36;
    const width = Math.max(4, Math.round((l.pct / maxPct) * BAR_MAX));
    const delay = i === 0 ? "" : ` g${i + 1}`;
    return `    <text x="548" y="${y + 11}" font-size="10">${l.name.toUpperCase()}</text><rect class="bar" x="660" y="${y}" width="270" height="12"/><rect class="fill grow${delay}" x="660" y="${y}" width="${width}" height="12"/>`;
  })
  .join("\n");

function render(ink) {
  return `<svg viewBox="0 0 1000 310" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub statistics and repository languages">
  <style>
    :root { --ink:${ink}; }
    .mono { font-family:ui-monospace,"SFMono-Regular","SF Mono",Menlo,Consolas,"Liberation Mono",monospace; fill:var(--ink); }
    .panel,.rule,.bar { fill:none; stroke:var(--ink); stroke-width:1; }
    .fill { fill:var(--ink); }
    .grow { transform:scaleX(0); transform-origin:left; animation:grow .8s cubic-bezier(.2,.7,.2,1) forwards; }
    .g2{animation-delay:.1s}.g3{animation-delay:.2s}.g4{animation-delay:.3s}.g5{animation-delay:.4s}
    @keyframes grow { to { transform:scaleX(1); } }
    @media (prefers-reduced-motion:reduce) { .grow { animation:none; transform:scaleX(1); } }
  </style>
  <rect class="panel" x="24" y="20" width="456" height="270" rx="2"/>
  <rect class="panel" x="520" y="20" width="456" height="270" rx="2"/>

  <g class="mono">
    <text x="52" y="58" font-size="15" font-weight="700" letter-spacing="2">GITHUB STATS</text>
    <line class="rule" x1="52" y1="72" x2="452" y2="72"/>
    <text x="52" y="110" font-size="11" letter-spacing="1">TOTAL STARS</text><text x="436" y="110" font-size="13" text-anchor="end">${totalStars}</text>
    <text x="52" y="146" font-size="11" letter-spacing="1">${year} COMMITS</text><text x="436" y="146" font-size="13" text-anchor="end">${commits}</text>
    <text x="52" y="182" font-size="11" letter-spacing="1">TOTAL PULL REQUESTS</text><text x="436" y="182" font-size="13" text-anchor="end">${pullRequests}</text>
    <text x="52" y="218" font-size="11" letter-spacing="1">TOTAL ISSUES</text><text x="436" y="218" font-size="13" text-anchor="end">${issues}</text>
    <text x="52" y="254" font-size="11" letter-spacing="1">CONTRIBUTED TO</text><text x="436" y="254" font-size="13" text-anchor="end">${contributedTo}</text>

    <text x="548" y="58" font-size="15" font-weight="700" letter-spacing="2">LANGUAGES BY REPOSITORY</text>
    <line class="rule" x1="548" y1="72" x2="948" y2="72"/>
${barRows}
  </g>
</svg>
`;
}

const fs = await import("node:fs/promises");
await fs.writeFile(new URL("../assets/github-stats.svg", import.meta.url), render("#000000"));
await fs.writeFile(new URL("../assets/dark/github-stats.svg", import.meta.url), render("#FFFFFF"));

console.log(`updated github-stats.svg — ${totalStars} stars, ${commits} commits (${year}), ${topLangs.length} languages`);
