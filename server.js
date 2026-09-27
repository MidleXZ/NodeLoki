const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Use the safe writable directory passed from Electron (falls back to root if run normally via node)
const storageDir = process.env.USER_DATA_PATH || __dirname;
const dataFolder = path.join(storageDir, 'nodeloki-data');

// Safely create your app directory if it doesn't exist
if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});