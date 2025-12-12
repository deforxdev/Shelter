const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://quldnqjfzcvemywtdpuk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1bGRucWpmemN2ZW15d3RkcHVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwODM0MzYsImV4cCI6MjA3OTY1OTQzNn0.j8tQLXi5ZPyCqIYcn5TautFlwOhKo3rwGAIkvL8al4g';

const storagePath = path.join(app.getPath('userData'), 'supabase-session.json');

const customStorage = {
  getItem: (key) => {
    try {
      const data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
      return data[key];
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } catch {}
    data[key] = value;
    fs.writeFileSync(storagePath, JSON.stringify(data));
  },
  removeItem: (key) => {
    let data = {};
    try {
      data = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } catch {}
    delete data[key];
    fs.writeFileSync(storagePath, JSON.stringify(data));
  }
};

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { storage: customStorage } });

// Track current user session for cleanup
let currentUserSession = null;

ipcMain.on('reload-window', () => {
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    mainWindow.reload();
  }
});

// Track user session for cleanup
ipcMain.on('set-user-session', (event, sessionData) => {
  currentUserSession = sessionData;
  console.log('User session set:', sessionData);
});

// Clear user session
ipcMain.on('clear-user-session', () => {
  currentUserSession = null;
  console.log('User session cleared');
});

async function createWindow() {
  // Hide menu bar
  Menu.setApplicationMenu(null);

  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile('build/index.html');
  }
  
  // Open DevTools with F12, refresh with F5 or Ctrl+R
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
    if (input.key === 'F5' || (input.control && input.key === 'r')) {
      mainWindow.webContents.reload();
    }
  });
}

// Функція для видалення користувача з кімнати
async function cleanupCurrentUser() {
  if (!currentUserSession || !currentUserSession.userId || !currentUserSession.roomId) {
    return;
  }

  try {
    console.log('Cleaning up user from room:', currentUserSession);

    // Отримати поточну кімнату
    const { data: room, error: fetchError } = await supabase
      .from('rooms')
      .select('players, host_id')
      .eq('id', currentUserSession.roomId)
      .single();

    if (fetchError || !room) {
      console.error('Error fetching room for cleanup:', fetchError);
      return;
    }

    if (room.players) {
      // Видалити користувача з списку гравців
      const updatedPlayers = room.players.filter(p => p.id !== currentUserSession.userId);

      let updates = { players: updatedPlayers };

      // Якщо користувач був хостом, передати хост іншому гравцю
      if (room.host_id === currentUserSession.userId && updatedPlayers.length > 0) {
        updates.host_id = updatedPlayers[0].id;
      }

      // Оновити кімнату
      const { error: updateError } = await supabase
        .from('rooms')
        .update(updates)
        .eq('id', currentUserSession.roomId);

      if (updateError) {
        console.error('Error updating room during cleanup:', updateError);
      } else {
        console.log('User removed from room successfully');
      }
    }
  } catch (err) {
    console.error('User cleanup error:', err);
  }
}

// Функція для видалення порожніх кімнат
async function cleanupEmptyRooms() {
  try {
    // Отримати всі кімнати
    const { data: rooms, error: fetchError } = await supabase
      .from('rooms')
      .select('id, players');

    if (fetchError) {
      console.error('Error fetching rooms:', fetchError);
      return;
    }

    // Видалити кімнати з 0 гравцями
    for (const room of rooms || []) {
      const playerCount = room.players ? room.players.length : 0;
      if (playerCount === 0) {
        const { error: deleteError } = await supabase
          .from('rooms')
          .delete()
          .eq('id', room.id);

        if (deleteError) {
          console.error(`Error deleting room ${room.id}:`, deleteError);
        } else {
          console.log(`Deleted empty room: ${room.id}`);
        }
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

app.whenReady().then(createWindow);

app.on('before-quit', async (event) => {
  event.preventDefault();
  console.log('App closing, cleaning up...');
  await cleanupCurrentUser();
  await cleanupEmptyRooms();
  console.log('Cleanup complete, exiting...');
  app.exit(0);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});