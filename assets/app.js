const ownerEl = document.getElementById("owner");
const repoEl = document.getElementById("repo");
const tokenEl = document.getElementById("token");
const form = document.getElementById("project-form");
const statusEl = document.getElementById("status");
const projectsEl = document.getElementById("projects");

const STORAGE_KEY = "feed-factory-gh-config";

function saveGitHubConfig() {
  const payload = {
    owner: ownerEl.value.trim(),
    repo: repoEl.value.trim(),
    token: tokenEl.value.trim()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadGitHubConfig() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    ownerEl.value = parsed.owner || "";
    repoEl.value = parsed.repo || "";
    tokenEl.value = parsed.token || "";
  } catch (_) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function githubRequest(path, method = "GET", body = null) {
  const owner = ownerEl.value.trim();
  const repo = repoEl.value.trim();
  const token = tokenEl.value.trim();

  if (!owner || !repo) {
    throw new Error("Заполните owner и repo");
  }

  const headers = { "Accept": "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message ? `${data.message}` : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

function decodeBase64Unicode(value) {
  return decodeURIComponent(escape(window.atob(value.replace(/\n/g, ""))));
}

function encodeBase64Unicode(value) {
  return window.btoa(unescape(encodeURIComponent(value)));
}

async function loadProjectsJson() {
  try {
    const file = await githubRequest("/contents/data/projects.json");
    const text = decodeBase64Unicode(file.content);
    return { sha: file.sha, data: JSON.parse(text) };
  } catch (err) {
    if (String(err.message).includes("Not Found")) {
      return { sha: null, data: { projects: [] } };
    }
    throw err;
  }
}

function renderProjects(projects) {
  projectsEl.innerHTML = "";
  if (!projects.length) {
    projectsEl.innerHTML = "<li>Пока нет проектов</li>";
    return;
  }

  const owner = ownerEl.value.trim();
  const repo = repoEl.value.trim();
  for (const project of projects) {
    const url = `https://${owner}.github.io/${repo}/feeds/${project.slug}.xml`;
    const li = document.createElement("li");
    li.innerHTML = `<strong>${project.project_name}</strong> - <a href="${url}" target="_blank">${url}</a> (каждые ${project.interval_hours}ч)`;
    projectsEl.appendChild(li);
  }
}

async function refreshProjectsList() {
  const payload = await loadProjectsJson();
  renderProjects(payload.data.projects || []);
}

async function saveProjectsJson(newData, previousSha) {
  const content = encodeBase64Unicode(JSON.stringify(newData, null, 2) + "\n");
  await githubRequest("/contents/data/projects.json", "PUT", {
    message: "Update projects config",
    content,
    sha: previousSha || undefined
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveGitHubConfig();
  statusEl.textContent = "Сохраняю проект в data/projects.json...";

  const fd = new FormData(form);
  const project = {
    project_name: String(fd.get("project_name")).trim(),
    slug: String(fd.get("slug")).trim(),
    source_feed_url: String(fd.get("source_feed_url")).trim(),
    fields: String(fd.get("fields")).split(",").map((x) => x.trim()).filter(Boolean),
    replacement_value: String(fd.get("replacement_value")).trim(),
    interval_hours: Number(fd.get("interval_hours")),
    updated_at: new Date().toISOString()
  };

  try {
    const payload = await loadProjectsJson();
    const projects = payload.data.projects || [];
    const index = projects.findIndex((x) => x.slug === project.slug);
    if (index >= 0) {
      projects[index] = project;
    } else {
      projects.push(project);
    }
    payload.data.projects = projects;

    await saveProjectsJson(payload.data, payload.sha);
    statusEl.textContent = "Готово. Через пару минут Actions обновит feeds/*.xml.";
    await refreshProjectsList();
  } catch (err) {
    statusEl.textContent = `Ошибка: ${err.message}`;
  }
});

for (const input of [ownerEl, repoEl, tokenEl]) {
  input.addEventListener("change", async () => {
    saveGitHubConfig();
    try {
      await refreshProjectsList();
    } catch (_) {
      // ignore until valid config
    }
  });
}

loadGitHubConfig();
if (ownerEl.value && repoEl.value) {
  refreshProjectsList().catch(() => {});
}
