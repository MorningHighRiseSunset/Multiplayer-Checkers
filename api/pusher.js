const pusher = require('./pusher-server');

// Simple in-memory room tracking (for Vercel serverless, this resets on each cold start)
const rooms = {};

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method, body } = req;
  const path = req.url;

  console.log('[pusher.js] Request:', method, path);

  try {
    if (method === 'POST' && path === '/joined') {
      const { room, socketId } = body;
      if (!rooms[room]) {
        rooms[room] = { players: [] };
      }
      rooms[room].players.push(socketId);
      console.log('[pusher.js] Player joined room:', room, 'Player count:', rooms[room].players.length);

      // Notify other players
      pusher.trigger(`private-${room}`, 'playerJoined', { socketId, playerCount: rooms[room].players.length });

      // Auto-start if 2 players
      if (rooms[room].players.length === 2) {
        console.log('[pusher.js] 2 players in room, starting game...');
        const colorAssignments = {};
        colorAssignments[rooms[room].players[0]] = 'red';
        colorAssignments[rooms[room].players[1]] = 'black';
        const firstTurn = 'black';
        const board = getInitialBoard();
        const moveHistory = [];
        const roles = {
          [rooms[room].players[0]]: 'Player 1',
          [rooms[room].players[1]]: 'Player 2'
        };

        pusher.trigger(`private-${room}`, 'startGame', {
          colorAssignments,
          firstTurn,
          board,
          moveHistory,
          roles
        });
      }

      return res.json({ success: true, playerCount: rooms[room].players.length });
    }

    if (method === 'POST' && path === '/start') {
      const { room, colorAssignments, firstTurn, board, moveHistory, roles } = body;
      pusher.trigger(`private-${room}`, 'startGame', {
        colorAssignments,
        firstTurn,
        board,
        moveHistory,
        roles
      });
      console.log('[pusher.js] startGame triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && path === '/move') {
      const { room, from, to, move, lastMove, currentPlayer, moveHistory } = body;
      pusher.trigger(`private-${room}`, 'syncBoard', {
        from,
        to,
        move,
        lastMove,
        currentPlayer,
        moveHistory
      });
      console.log('[pusher.js] move triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && path === '/left') {
      const { room, socketId } = body;
      if (rooms[room]) {
        rooms[room].players = rooms[room].players.filter(id => id !== socketId);
        console.log('[pusher.js] Player left room:', room, 'Player count:', rooms[room].players.length);
      }
      pusher.trigger(`private-${room}`, 'opponentLeft', {});
      console.log('[pusher.js] opponentLeft triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && path === '/chat') {
      const { room, sender, msg } = body;
      pusher.trigger(`private-${room}`, 'chatMessage', { sender, msg });
      console.log('[pusher.js] chatMessage triggered for room:', room);
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('[pusher.js] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

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
