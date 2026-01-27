import fs from "node:fs";
import path from "node:path";

const USERNAME = "pammyu";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Missing GITHUB_TOKEN env var");
  process.exit(1);
}

const query = `
query($login:String!) {
  user(login:$login) {
    contributionsCollection {
      contributionCalendar {
        weeks {
          contributionDays {
            date
            contributionCount
          }
        }
      }
    }
  }
}
`;

async function gqlRequest() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
      "User-Agent": "pammyu-streak-updater"
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function parseDays(data) {
  const weeks = data.user.contributionsCollection.contributionCalendar.weeks ?? [];
  const days = weeks.flatMap(w => w.contributionDays).map(d => ({
    date: d.date,
    count: d.contributionCount
  }));
  // ensure sorted
  days.sort((a, b) => a.date.localeCompare(b.date));
  return days;
}

function computeStreaks(days) {
  // streak counts days with count > 0
  const has = (i) => days[i].count > 0;

  // longest streak
  let longest = 0;
  let currentRun = 0;
  for (let i = 0; i < days.length; i++) {
    if (has(i)) {
      currentRun++;
      if (currentRun > longest) longest = currentRun;
    } else {
      currentRun = 0;
    }
  }

  // current streak (from most recent day backwards)
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (has(i)) current++;
    else break;
  }

  const total = days.reduce((sum, d) => sum + d.count, 0);

  return { current, longest, total };
}

function renderSvg({ current, longest, total }) {
  const tplPath = path.join("assets", "streak-cyber.template.svg");
  const outPath = path.join("assets", "streak-cyber.svg");

  const tpl = fs.readFileSync(tplPath, "utf8");

  // progress width: scale current streak into [140..520] px, capped
  const minW = 140;
  const maxW = 520;
  const scaled = Math.min(maxW, minW + current * 12);

  const svg = tpl
    .replaceAll("{{CURRENT_STREAK}}", String(current))
    .replaceAll("{{LONGEST_STREAK}}", String(longest))
    .replaceAll("{{TOTAL_CONTRIBS}}", String(total))
    .replaceAll("{{PROGRESS_WIDTH}}", String(scaled));

  fs.writeFileSync(outPath, svg, "utf8");
}

const data = await gqlRequest();
const days = parseDays(data);
const stats = computeStreaks(days);
renderSvg(stats);

console.log("Updated streak-cyber.svg:", stats);
