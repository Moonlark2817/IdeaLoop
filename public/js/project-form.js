document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("project-form");

    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("id");

    const isEditing = Boolean(projectId);

    const titleInput = document.getElementById("title");
    const descriptionInput = document.getElementById("description");
    const tagsInput = document.getElementById("tags");
    const projectUrlInput = document.getElementById("project-url");
    const seekingInput = document.getElementById("seeking-collaborators");
    const heading = document.getElementById("form-heading");
    const errorMessage = document.getElementById("form-error");

    let existingProject = null;

    const projects = getProjects();

    if (isEditing) {
        existingProject = getProjectById(projectId);

        if (!existingProject) {
            heading.textContent = "Project Not Found";
            errorMessage.textContent = "The project you are trying to edit does not exist.";
            form.hidden = true;
            return;
        }

        heading.textContent = "Edit Project";

        titleInput.value = existingProject.title || "";
        descriptionInput.value = existingProject.description || "";
        tagsInput.value = Array.isArray(existingProject.tags)
            ? existingProject.tags.join(", ")
            : "";
        projectUrlInput.value = existingProject.projectUrl || "";
        seekingInput.checked = Boolean(existingProject.seekingCollaborators);
    }

    form.addEventListener("submit", event => {
        event.preventDefault();

        errorMessage.textContent = "";

        const title = titleInput.value.trim();
        const description = descriptionInput.value.trim();
        const tags = tagsInput.value
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean);
        const projectUrl = projectUrlInput.value.trim();

        if (!title || !description) {
            errorMessage.textContent = "Please provide a title and description.";
            return;
        }

        if (projectUrl) {
            try {
                const parsedUrl = new URL(projectUrl);

                if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                    throw new Error("Invalid protocol");
                }
            } catch {
                errorMessage.textContent = "Please enter a valid HTTP or HTTPS project URL.";
                return;
            }
        }

        const updatedProject = {
            id: isEditing ? existingProject.id : crypto.randomUUID(),
            title,
            description,
            tags,
            projectUrl,
            seekingCollaborators: seekingInput.checked,
            createdAt: isEditing
                ? existingProject.createdAt
                : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        let updatedProjects;

        if (isEditing) {
            updatedProjects = projects.map(project =>
                String(project.id) === String(projectId)
                    ? updatedProject
                    : project
            );
        } else {
            updatedProjects = [...projects, updatedProject];
        }

        saveProjects(updatedProjects);

        window.location.href =
            `project-details.html?id=${encodeURIComponent(updatedProject.id)}`;
    });
});