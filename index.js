const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function main() {
  // Deschidem baza de date (fisierul chat.db va fi creat automat daca nu exista)
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  // Cream tabelul pentru mesaje daca nu exista
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
  `);

  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {} // Ajuta la recuperarea mesajelor daca pica netul
  });

  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
  });

  io.on('connection', async (socket) => {
    console.log('Utilizator conectat');

    socket.on('chat message', async (msg) => {
      let result;
      try {
        // Salvam mesajul in baza de date
        result = await db.run('INSERT INTO messages (content) VALUES (?)', msg);
      } catch (e) {
        return;
      }
      // Trimitem mesajul catre toti clientii
      io.emit('chat message', msg, result.lastID);
    });

    // Trimitem mesajele vechi catre utilizatorul care tocmai s-a conectat
    if (!socket.recovered) {
      try {
        await db.each('SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit('chat message', row.content, row.id);
          }
        );
      } catch (e) {
        // Eroare la incarcarea mesajelor
      }
    }
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Serverul ruleaza pe portul ${port}`);
  });
}

main();
