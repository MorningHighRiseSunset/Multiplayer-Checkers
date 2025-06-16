const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};

app.get("/", (req, res) => {
  res.send("Checkers multiplayer server is running!");
});

app.use((req, res) => {
  res.status(404).send('Not found');
});

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

// Helper: broadcast full room state to all clients in the room
function broadcastRoomState(room) {
  if (!rooms[room]) return;
  const state = {
    roles: rooms[room].roles, // {socketId: 'Player 1', ...}
    colors: rooms[room].colors // {socketId: 'red', ...}
  };
  io.to(room).emit('roomState', state);
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let myRole = null;

  socket.on('createRoom', (roomCode) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {}, ready: {}, colors: {}, roles: {} };
    }
  });

  socket.on('joinRoom', (roomCode) => {
    currentRoom = roomCode;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {}, ready: {}, colors: {}, roles: {} };
    }
    // Assign role
    const roleCount = Object.keys(rooms[roomCode].roles).length;
    myRole = roleCount === 0 ? 'Player 1' : 'Player 2';
    rooms[roomCode].roles[socket.id] = myRole;
    rooms[roomCode].players[socket.id] = null;
    broadcastRoomState(roomCode);

    // Notify others
    socket.to(roomCode).emit('playerJoined', { role: myRole });
  });

  socket.on('pickColor', ({ room, color }) => {
    if (!rooms[room]) return;
    rooms[room].colors[socket.id] = color;
    broadcastRoomState(room);
    io.to(room).emit('colorPicked', { color, byMe: false });
    const pickedColors = Object.values(rooms[room].colors);
    if (pickedColors.length === 2 && pickedColors[0] !== pickedColors[1]) {
      io.to(room).emit('bothPicked');
    }
  });

  socket.on('playerReady', ({ room, color }) => {
    if (!rooms[room]) return;
    rooms[room].ready[socket.id] = true;
    socket.to(room).emit('opponentReady', { color });

    // If both players are ready, start the game and send color assignments
    if (Object.keys(rooms[room].ready).length === 2) {
      // Build color assignment map
      const colorAssignments = {};
      for (const [sockId, pickedColor] of Object.entries(rooms[room].colors)) {
        colorAssignments[sockId] = pickedColor;
      }
      // Determine who is black (black goes first)
      let firstTurn = 'black';
      io.to(room).emit('bothReady');
      io.to(room).emit('startGame', { colorAssignments, firstTurn });
      // Mark room as "inGame" to suppress leave notifications
      rooms[room].inGame = true;
    }
  });

  socket.on('joinGame', ({ room, color }) => {
    currentRoom = room;
    socket.join(room);
  });

  socket.on('move', ({ room, from, to, move }) => {
    socket.to(room).emit('opponentMove', { from, to, move });
  });

  socket.on('resetGame', ({ room }) => {
    io.to(room).emit('resetGame');
  });

  socket.on('leaveRoom', ({ room }) => {
    socket.leave(room);
    if (rooms[room]) {
      const leftRole = rooms[room].roles[socket.id];
      delete rooms[room].players[socket.id];
      delete rooms[room].ready[socket.id];
      delete rooms[room].colors[socket.id];
      delete rooms[room].roles[socket.id];
      broadcastRoomState(room);
      // Only notify if not in game
      if (!rooms[room].inGame) {
        socket.to(room).emit('playerLeft', { role: leftRole });
      }
      if (
        Object.keys(rooms[room].players).length === 0 &&
        Object.keys(rooms[room].ready).length === 0 &&
        Object.keys(rooms[room].colors).length === 0 &&
        Object.keys(rooms[room].roles).length === 0
      ) {
        delete rooms[room];
      }
    }
  });

  socket.on('leaveGame', ({ room }) => {
    socket.leave(room);
    socket.to(room).emit('opponentLeft');
  });

  socket.on('chatMessage', ({ room, msg }) => {
    const sender = (rooms[room] && rooms[room].roles && rooms[room].roles[socket.id]) || 'Player';
    socket.to(room).emit('chatMessage', { sender, msg });
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      const leftRole = rooms[currentRoom].roles[socket.id];
      delete rooms[currentRoom].players[socket.id];
      delete rooms[currentRoom].ready[socket.id];
      delete rooms[currentRoom].colors[socket.id];
      delete rooms[currentRoom].roles[socket.id];
      broadcastRoomState(currentRoom);
      // Only notify if not in game
      if (!rooms[currentRoom].inGame) {
        socket.to(currentRoom).emit('playerLeft', { role: leftRole });
      }
      if (
        Object.keys(rooms[currentRoom].players).length === 0 &&
        Object.keys(rooms[currentRoom].ready).length === 0 &&
        Object.keys(rooms[currentRoom].colors).length === 0 &&
        Object.keys(rooms[currentRoom].roles).length === 0
      ) {
        delete rooms[currentRoom];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});