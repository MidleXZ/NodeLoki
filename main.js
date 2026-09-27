const { app, BrowserWindow } = require('electron');
const path = require('path');

// This starts your Express server automatically when the app launches!
require('./server.js');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load your frontend interface (adjust the path if your HTML file is elsewhere in frontend/)
  mainWindow.loadFile(path.join(__dirname, 'frontend/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});