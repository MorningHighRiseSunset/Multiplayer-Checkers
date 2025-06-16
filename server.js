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
    roles: rooms[room].roles,
    colors: rooms[room].colors
  };
  io.to(room).emit('roomState', state);
}

// Helper: initialize a new board
function getInitialBoard() {
  const board = [];
  for (let row = 0; row < 8; row++) {
    let rowArr = [];
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) rowArr.push({ color: 'black', king: false });
        else if (row > 4) rowArr.push({ color: 'red', king: false });
        else rowArr.push(null);
      } else {
        rowArr.push(null);
      }
    }
    board.push(rowArr);
  }
  return board;
}

io.on('connection', (socket) => {
  let currentRoom = null;
  let myRole = null;

  socket.on('createRoom', (roomCode) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: {},
        ready: {},
        colors: {},
        roles: {},
        inGame: false,
        board: getInitialBoard(),
        currentPlayer: 'black',
        moveHistory: []
      };
    }
  });

  socket.on('joinRoom', (roomCode) => {
    currentRoom = roomCode;
    socket.join(roomCode);
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: {},
        ready: {},
        colors: {},
        roles: {},
        inGame: false,
        board: getInitialBoard(),
        currentPlayer: 'black',
        moveHistory: []
      };
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

    // If both players are ready, start the game and send color assignments and board state
    if (Object.keys(rooms[room].ready).length === 2) {
      const colorAssignments = {};
      for (const [sockId, pickedColor] of Object.entries(rooms[room].colors)) {
        colorAssignments[sockId] = pickedColor;
      }
      let firstTurn = 'black';
      rooms[room].inGame = true;
      rooms[room].board = getInitialBoard();
      rooms[room].currentPlayer = firstTurn;
      rooms[room].moveHistory = [];
      io.to(room).emit('bothReady');
      io.to(room).emit('startGame', {
        colorAssignments,
        firstTurn,
        board: rooms[room].board,
        moveHistory: rooms[room].moveHistory
      });
    }
  });

  socket.on('joinGame', ({ room, color }) => {
    currentRoom = room;
    socket.join(room);
    // Send current board state if game is in progress
    if (rooms[room] && rooms[room].inGame) {
      io.to(socket.id).emit('syncBoard', {
        board: rooms[room].board,
        currentPlayer: rooms[room].currentPlayer,
        moveHistory: rooms[room].moveHistory
      });
    }
  });

  socket.on('move', ({ room, from, to, move }) => {
    if (!rooms[room] || !rooms[room].inGame) return;
    // Apply move to server board
    const board = rooms[room].board;
    const piece = board[from.row][from.col];
    board[to.row][to.col] = piece;
    board[from.row][from.col] = null;
    let becameKing = false;
    if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === 7)) {
      if (!piece.king) {
        piece.king = true;
        becameKing = true;
      }
    }
    if (move.jump) {
      const { row: jr, col: jc } = move.jumped;
      board[jr][jc] = null;
      // Multi-jump logic is handled on client; server trusts move for now
    }
    // Record move in history
    rooms[room].moveHistory.push(
      `${capitalize(rooms[room].currentPlayer)}: (${from.row},${from.col}) → (${to.row},${to.col})${move.jump ? ' (jump)' : ''}${becameKing ? ' (king)' : ''}`
    );
    // Switch turn
    rooms[room].currentPlayer = rooms[room].currentPlayer === 'red' ? 'black' : 'red';
    // Broadcast move and new board state to both players
    socket.to(room).emit('opponentMove', { from, to, move });
    io.to(room).emit('syncBoard', {
      board: rooms[room].board,
      currentPlayer: rooms[room].currentPlayer,
      moveHistory: rooms[room].moveHistory
    });
  });

  socket.on('resetGame', ({ room }) => {
    if (!rooms[room]) return;
    rooms[room].board = getInitialBoard();
    rooms[room].currentPlayer = 'black';
    rooms[room].moveHistory = [];
    io.to(room).emit('resetGame');
    io.to(room).emit('syncBoard', {
      board: rooms[room].board,
      currentPlayer: rooms[room].currentPlayer,
      moveHistory: rooms[room].moveHistory
    });
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

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT}`);
});