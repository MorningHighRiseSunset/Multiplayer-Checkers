const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};

// Health check route for Render
app.get("/", (req, res) => {
  res.send("Checkers multiplayer server is running!");
});

// Catch-all 404 route for unknown endpoints
app.use((req, res) => {
  res.status(404).send('Not found');
});

// Log uncaught exceptions and rejections
process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerColor = null;

  console.log(`[connect] Socket ${socket.id} connected`);

  socket.on('createRoom', (roomCode) => {
    console.log(`[createRoom] Socket ${socket.id} created room ${roomCode}`);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {}, ready: {}, colors: {} };
    }
  });

  socket.on('joinRoom', (roomCode) => {
    console.log(`[joinRoom] Socket ${socket.id} joined room ${roomCode}`);
    currentRoom = roomCode;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: {}, ready: {}, colors: {} };
    }
    rooms[roomCode].players[socket.id] = null;
    socket.to(roomCode).emit('opponentJoined');
  });

  socket.on('pickColor', ({ room, color }) => {
    console.log(`[pickColor] Socket ${socket.id} picked ${color} in room ${room}`);
    if (!rooms[room]) return;
    rooms[room].colors[socket.id] = color;
    playerColor = color;
    io.to(room).emit('colorPicked', { color, byMe: false });
    const pickedColors = Object.values(rooms[room].colors);
    if (pickedColors.length === 2 && pickedColors[0] !== pickedColors[1]) {
      io.to(room).emit('bothPicked');
    }
  });

  socket.on('playerReady', ({ room, color }) => {
    console.log(`[playerReady] Socket ${socket.id} (${color}) is ready in room ${room}`);
    if (!rooms[room]) return;
    rooms[room].ready[socket.id] = true;
    socket.to(room).emit('opponentReady', { color });
    if (Object.keys(rooms[room].ready).length === 2) {
      io.to(room).emit('bothReady');
      io.to(room).emit('startGame', { firstTurn: 'red' });
    }
  });

  socket.on('joinGame', ({ room, color }) => {
    console.log(`[joinGame] Socket ${socket.id} joined game in room ${room} as ${color}`);
    currentRoom = room;
    playerColor = color;
    socket.join(room);
  });

  socket.on('move', ({ room, from, to, move }) => {
    console.log(`[move] Socket ${socket.id} in room ${room}:`, from, '->', to, move);
    socket.to(room).emit('opponentMove', { from, to, move });
  });

  socket.on('resetGame', ({ room }) => {
    console.log(`[resetGame] Room ${room} requested reset`);
    io.to(room).emit('resetGame');
  });

  socket.on('leaveRoom', ({ room, color }) => {
    console.log(`[leaveRoom] Socket ${socket.id} (${color}) left room ${room}`);
    socket.leave(room);
    if (rooms[room]) {
      delete rooms[room].players[socket.id];
      delete rooms[room].ready[socket.id];
      delete rooms[room].colors[socket.id];
      socket.to(room).emit('opponentLeft');
      if (
        Object.keys(rooms[room].players).length === 0 &&
        Object.keys(rooms[room].ready).length === 0 &&
        Object.keys(rooms[room].colors).length === 0
      ) {
        delete rooms[room];
        console.log(`[cleanup] Deleted empty room ${room}`);
      }
    }
  });

  socket.on('leaveGame', ({ room, color }) => {
    console.log(`[leaveGame] Socket ${socket.id} (${color}) left game in room ${room}`);
    socket.leave(room);
    socket.to(room).emit('opponentLeft');
  });

  socket.on('disconnect', () => {
    console.log(`[disconnect] Socket ${socket.id} disconnected`);
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[socket.id];
      delete rooms[currentRoom].ready[socket.id];
      delete rooms[currentRoom].colors[socket.id];
      socket.to(currentRoom).emit('opponentLeft');
      if (
        Object.keys(rooms[currentRoom].players).length === 0 &&
        Object.keys(rooms[currentRoom].ready).length === 0 &&
        Object.keys(rooms[currentRoom].colors).length === 0
      ) {
        delete rooms[currentRoom];
        console.log(`[cleanup] Deleted empty room ${currentRoom}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});