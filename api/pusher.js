const pusher = require('./pusher-server');

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
    if (method === 'POST' && path === '/start') {
      const { room, colorAssignments, firstTurn, board, moveHistory, roles } = body;
      pusher.trigger(`presence-${room}`, 'startGame', {
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
      pusher.trigger(`presence-${room}`, 'syncBoard', {
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

    if (method === 'POST' && path === '/joined') {
      const { room, role } = body;
      pusher.trigger(`presence-${room}`, 'playerJoined', { role });
      console.log('[pusher.js] playerJoined triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && path === '/left') {
      const { room } = body;
      pusher.trigger(`presence-${room}`, 'opponentLeft', {});
      console.log('[pusher.js] opponentLeft triggered for room:', room);
      return res.json({ success: true });
    }

    if (method === 'POST' && path === '/chat') {
      const { room, sender, msg } = body;
      pusher.trigger(`presence-${room}`, 'chatMessage', { sender, msg });
      console.log('[pusher.js] chatMessage triggered for room:', room);
      return res.json({ success: true });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('[pusher.js] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
