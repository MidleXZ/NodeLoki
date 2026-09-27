const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PROJECTS_DIR = path.join(__dirname, 'projects');

// Ensure /projects directory exists on startup
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Get a specific project's data
app.get('/api/projects/:id', (req, res) => {
  const projectId = req.params.id;
  const projectFilePath = path.join(__dirname, 'projects', projectId, 'project.json');

  fs.readFile(projectFilePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(404).json({ error: 'Project file not found' });
    }
    try {
      const projectJson = JSON.parse(data);
      res.json(projectJson);
    } catch (parseErr) {
      res.status(500).json({ error: 'Failed to parse project JSON' });
    }
  });
});

// API: Create a new project folder inside /projects
app.post('/api/projects', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'Valid project name is required' });
  }

  const sanitizedName = name.trim().replace(/[^a-zA-Z0-9-_]/g, '_');
  const uniqueId = sanitizedName + '_' + Date.now();
  const projectFolderPath = path.join(PROJECTS_DIR, uniqueId);

  try {
    fs.mkdirSync(projectFolderPath, { recursive: true });

    const initialData = {
      name: name.trim(),
      flow: null,
      canvasHTML: '',
      elementCounter: 1
    };

    fs.writeFileSync(path.join(projectFolderPath, 'project.json'), JSON.stringify(initialData, null, 2));

    res.json({ success: true, id: uniqueId, name: name.trim(), path: projectFolderPath });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create project folder on disk' });
  }
});

// API: Save/Update project data inside its folder
app.post('/api/projects/:id', (req, res) => {
  const projectId = req.params.id;
  const projectFolderPath = path.join(PROJECTS_DIR, projectId);

  if (!fs.existsSync(projectFolderPath)) {
    return res.status(404).json({ error: 'Project folder not found' });
  }

  try {
    const dataFile = path.join(projectFolderPath, 'project.json');
    fs.writeFileSync(dataFile, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save project data' });
  }
});

// API: Delete project folder from /projects
app.delete('/api/projects/:id', (req, res) => {
  const projectId = req.params.id;
  const projectFolderPath = path.join(PROJECTS_DIR, projectId);

  if (!fs.existsSync(projectFolderPath)) {
    return res.status(404).json({ error: 'Project folder not found' });
  }

  try {
    fs.rmSync(projectFolderPath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project folder' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});