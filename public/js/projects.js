const STORAGE_KEY = "idealoop_projects";

const sampleProjects = [
    {
        id: "1",
        title: "Campus Event Finder",
        description: "A website that helps college students discover campus events, clubs, and activities in one place.",
        tags: ["JavaScript", "HTML", "CSS"],
        projectUrl: "https://github.com/",
        seekingCollaborators: true,
        createdAt: new Date().toISOString()
    },
    {
        id: "2",
        title: "Study Group Matcher",
        description: "An application that connects students taking the same classes so they can form study groups.",
        tags: ["Python", "Database"],
        projectUrl: "https://github.com/",
        seekingCollaborators: true,
        createdAt: new Date().toISOString()
    },
    {
        id: "3",
        title: "Personal Portfolio",
        description: "A responsive personal portfolio website showcasing projects, skills, and experience.",
        tags: ["HTML", "CSS", "JavaScript"],
        projectUrl: "https://github.com/",
        seekingCollaborators: false,
        createdAt: new Date().toISOString()
    }
];

function getProjects() {
    const storedProjects = localStorage.getItem(STORAGE_KEY);

    if (storedProjects === null) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleProjects));
        return sampleProjects;
    }

    try {
        const projects = JSON.parse(storedProjects);
        return Array.isArray(projects) ? projects : [];
    } catch {
        return [];
    }
}

function saveProjects(projects) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function getProjectById(id) {
    return getProjects().find(project => String(project.id) === String(id));
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatDate(date) {
    if (!date) return "Date unavailable";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "Date unavailable";
    }

    return parsedDate.toLocaleDateString();
}

function createProjectCard(project) {
    const tags = Array.isArray(project.tags) ? project.tags : [];

    return `
        <article class="project-card">
            <h2>${escapeHTML(project.title)}</h2>

            <p class="project-description">
                ${escapeHTML(project.description)}
            </p>

            <div class="project-meta">
                ${tags.map(tag =>
                    `<span class="tag">${escapeHTML(tag)}</span>`
                ).join("")}
            </div>

            <div class="card-footer">
                <span class="project-date">
                    ${formatDate(project.createdAt)}
                </span>

                <a class="button"
                   href="project-details.html?id=${encodeURIComponent(project.id)}">
                    View Project
                </a>
            </div>

            <div style="margin-top: 14px;">
                <span class="status ${project.seekingCollaborators ? "" : "closed"}">
                    ${project.seekingCollaborators
                        ? "Seeking Collaborators"
                        : "Not Seeking Collaborators"}
                </span>
            </div>
        </article>
    `;
}

function renderProjects(projects) {
    const projectList = document.getElementById("project-list");

    if (!projectList) return;

    if (projects.length === 0) {
        projectList.innerHTML = `
            <div class="empty-state">
                <h2>No projects found</h2>
                <p>Try another search or create a new project.</p>
            </div>
        `;
        return;
    }

    projectList.innerHTML = projects.map(createProjectCard).join("");
}

function initializeProjectFeed() {
    const projectList = document.getElementById("project-list");
    const searchInput = document.getElementById("project-search");

    if (!projectList) return;

    const projects = getProjects();

    renderProjects(projects);

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            const searchTerm = searchInput.value.toLowerCase().trim();

            const filteredProjects = getProjects().filter(project => {
                const title = String(project.title ?? "").toLowerCase();
                const description = String(project.description ?? "").toLowerCase();
                const tags = Array.isArray(project.tags) ? project.tags : [];

                return title.includes(searchTerm) ||
                    description.includes(searchTerm) ||
                    tags.some(tag => String(tag).toLowerCase().includes(searchTerm));
            });

            renderProjects(filteredProjects);
        });
    }
}

function initializeProjectDetails() {
    const detailsContainer = document.getElementById("project-details");

    if (!detailsContainer) return;

    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("id");

    const project = projectId ? getProjectById(projectId) : null;

    if (!project) {
        detailsContainer.innerHTML = `
            <div class="empty-state">
                <h2>Project Not Found</h2>
                <p>This project may have been deleted or does not exist.</p>
                <br>
                <a href="projects.html" class="button">Back to Projects</a>
            </div>
        `;
        return;
    }

    const tags = Array.isArray(project.tags) ? project.tags : [];

    detailsContainer.innerHTML = `
        <div class="details-card">
            <h1>${escapeHTML(project.title)}</h1>

            <span class="status ${project.seekingCollaborators ? "" : "closed"}">
                ${project.seekingCollaborators
                    ? "Seeking Collaborators"
                    : "Not Seeking Collaborators"}
            </span>

            <div class="details-section">
                <h2>About This Project</h2>
                <p>${escapeHTML(project.description)}</p>
            </div>

            <div class="details-section">
                <h2>Skills and Technologies</h2>
                <div class="project-meta">
                    ${tags.length
                        ? tags.map(tag => `<span class="tag">${escapeHTML(tag)}</span>`).join("")
                        : "<p>No tags provided.</p>"}
                </div>
            </div>

            <div class="details-section">
                <h2>Project Link</h2>
                ${project.projectUrl
                    ? `<a href="${escapeHTML(project.projectUrl)}"
                         target="_blank"
                         rel="noopener noreferrer"
                         class="button button-secondary">Visit Project</a>`
                    : "<p>No project link provided.</p>"}
            </div>

            <div class="details-section">
                <p class="project-date">
                    Created: ${formatDate(project.createdAt)}
                </p>
            </div>

            <div class="details-actions">
                <a href="project-form.html?id=${encodeURIComponent(project.id)}"
                   class="button">Edit Project</a>

                <button id="delete-project"
                        class="button button-danger"
                        type="button">
                    Delete Project
                </button>

                <a href="projects.html"
                   class="button button-secondary">Back to Feed</a>
            </div>
        </div>
    `;

    document.getElementById("delete-project").addEventListener("click", () => {
        const confirmed = confirm("Are you sure you want to delete this project?");

        if (!confirmed) return;

        const updatedProjects = getProjects().filter(
            item => String(item.id) !== String(project.id)
        );

        saveProjects(updatedProjects);
        window.location.href = "projects.html";
    });
}

document.addEventListener("DOMContentLoaded", () => {
    initializeProjectFeed();
    initializeProjectDetails();
});