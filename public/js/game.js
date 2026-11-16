const params = new URLSearchParams(window.location.search);
const urlRoomCode = params.get('room');

// Check if this is a refresh (we've already loaded with this room code)
const loadedRoom = sessionStorage.getItem('loadedRoom');
const roomCode = (loadedRoom === urlRoomCode) ? null : urlRoomCode;

// Game state
let myColor = null;
let myRole = null;
let mySocketId = null;
let currentRoom = null;
let channel = null;

// AI mode flag
let isAIMode = false;
let aiColor = null;
let nnueApi = null;
let nnueLoaded = false;
const AI_THINK_TIME = 3000; // Max 3 seconds thinking time

// Evaluation bar elements
const evalSidebar = document.getElementById('eval-sidebar');
const evalBarRef = document.getElementById('eval-bar-ref');
const evalFill = document.getElementById('eval-fill');
const evalText = document.getElementById('eval-text');

console.log('[game.js] Loaded. roomCode:', roomCode);

// --- Join URL and AI button logic ---
const joinUrlDiv = document.getElementById('join-url');
const copyUrlBtn = document.getElementById('copy-url-btn');
const playAiBtn = document.getElementById('play-ai-btn');

// Display the join URL
if (joinUrlDiv) {
  const joinUrl = window.location.href;
  joinUrlDiv.textContent = joinUrl;
}

// Copy URL button
if (copyUrlBtn) {
  copyUrlBtn.onclick = () => {
    const joinUrl = window.location.href;
    navigator.clipboard.writeText(joinUrl).then(() => {
      copyUrlBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyUrlBtn.textContent = 'Copy URL';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy URL:', err);
      alert('Failed to copy URL');
    });
  };
}

// Play AI button
if (playAiBtn) {
  playAiBtn.onclick = () => {
    startAIMode();
  };
}

// API URL for Pusher events
const apiUrl = window.location.origin === 'http://localhost:3000'
  ? 'http://localhost:3001/api/game'
  : '/api/game';

console.log('[game.js] API URL:', apiUrl);

// Start AI mode
function startAIMode() {
  console.log('[game.js] Starting AI mode');
  console.log('[game.js] evalSidebar element:', evalSidebar);
  isAIMode = true;
  aiColor = 'black'; // AI plays as black
  myColor = 'red'; // Player plays as red and goes first
  myRole = 'Player 1';

  // Show evaluation bar
  if (evalSidebar) {
    evalSidebar.style.display = 'flex';
    console.log('[game.js] Eval bar shown');
  } else {
    console.error('[game.js] evalSidebar not found!');
  }

  // Initialize NNUE if not loaded
  if (!nnueLoaded && typeof Module !== 'undefined' && Module.cwrap) {
    initNNUE();
  }

  // Use minimax if NNUE not available
  if (!nnueLoaded) {
    console.log('[game.js] NNUE not available, using minimax AI');
  }

  // Initialize the board
  initBoard();

  // Set game state - red goes first
  gameStarted = true;
  gameEnded = false;
  currentPlayer = 'red';
  isMyTurn = true; // Player goes first

  // Update UI
  updateStatus();
  updateEvalBar();

  console.log('[game.js] AI mode started. Player:', myColor, 'AI:', aiColor);
}

// Initialize NNUE engine (not currently used, kept for future integration)
function initNNUE() {
  console.log('[game.js] NNUE integration not used, using minimax AI');
  nnueLoaded = false;
}

// Update evaluation bar (from checkers-nnue style)
function updateEvalBar() {
  if (!isAIMode) return;

  // Use minimax evaluation function
  const score = evaluateBoard(board, myColor);
  const displayScore = (score / 100).toFixed(1);
  evalText.textContent = (score > 0 ? "+" : "") + displayScore;

  // Calculate fill percentage for vertical bar (Light/Red advantage)
  const redScore = (myColor === 'red') ? score : -score;
  let whitePercent = 50 + (redScore / 600) * 100;
  whitePercent = Math.max(5, Math.min(95, whitePercent));
  evalFill.style.height = `${whitePercent}%`;
}

// --- Room Logic ---
// Generate random room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Initialize room on load
function initializeRoom() {
  console.log('[game.js] initializeRoom called. roomCode:', roomCode);

  if (roomCode) {
    // Join existing room
    currentRoom = roomCode;
    sessionStorage.setItem('loadedRoom', roomCode);
    console.log('[game.js] Joining existing room:', currentRoom);
  } else {
    // Create new room
    currentRoom = generateRoomCode();
    console.log('[game.js] Created new room:', currentRoom);

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    window.history.replaceState({}, '', url);

    // Update join URL display
    if (joinUrlDiv) {
      joinUrlDiv.textContent = url.href;
    }
  }

  // Only subscribe if not already subscribed
  if (!channel) {
    // Subscribe to Pusher public channel (no auth needed)
    channel = pusher.subscribe(`game-${currentRoom}`);
    console.log('[game.js] Subscribed to Pusher channel:', `game-${currentRoom}`);

    // Listen for subscription succeeded
    channel.bind('pusher:subscription_succeeded', () => {
      console.log('[game.js] Subscription succeeded');
      mySocketId = pusher.connection.socket_id;
      console.log('[game.js] My socket ID:', mySocketId);

      // Notify server that I joined (with retry for cold starts)
      const joinWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            const res = await fetch(`${apiUrl}/joined`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ room: currentRoom, socketId: mySocketId })
            });
            const data = await res.json();
            console.log('[game.js] Joined response:', data);
            if (data.color) {
              myColor = data.color;
              sessionStorage.setItem('myAssignedColor', myColor);
            }
            if (data.role) {
              myRole = data.role;
              sessionStorage.setItem('myRole', myRole);
            }
            if (data.playerCount === 2) {
              statusDiv.textContent = 'Opponent joined - starting game...';
              // Start game locally if not already started
              setTimeout(() => {
                if (!gameStarted) {
                  startGameLocally();
                }
              }, 500);
            }
            return;
          } catch (err) {
            console.error('[game.js] Join error attempt', i + 1, ':', err);
            if (i < retries - 1) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }
        }
        console.error('[game.js] Failed to join after retries');
      };
      joinWithRetry();
    });
  }

  // Listen for start game
  channel.bind('startGame', (data) => {
    console.log('[game.js] startGame event received:', data);
    // Unsubscribe first to prevent duplicate handlers
    channel.unbind('startGame');
    handleStartGame(data);
  });

  // Listen for player joined
  channel.bind('playerJoined', (data) => {
    console.log('[game.js] playerJoined event received:', data);
    if (data.playerCount === 2) {
      statusDiv.textContent = 'Opponent joined - starting game...';
      // Start game locally since server stateless may lose track
      setTimeout(() => {
        if (!gameStarted) {
          startGameLocally();
        }
      }, 500);
    } else {
      statusDiv.textContent = `You are in the room (${data.playerCount}/2 players). Send URL to opponent.`;
    }
  });

  // Listen for sync board (moves)
  channel.bind('syncBoard', (data) => {
    console.log('[game.js] syncBoard event received');
    handleSyncBoard(data);
  });

  // Listen for opponent left
  channel.bind('opponentLeft', () => {
    console.log('[game.js] opponentLeft event received');
    const myPoints = countPieces(myColor);
    showEndGameScreen(`Opponent left. You win!`, myPoints);
  });

  // Listen for chat messages
  channel.bind('chatMessage', (data) => {
    console.log('[game.js] chatMessage received:', data);
    appendChatMessage(data.sender, data.msg);
  });
}



// Handle start game
function handleStartGame({ colorAssignments, firstTurn, board: serverBoard, moveHistory: serverHistory, roles, lastMove: serverLastMove }) {
  console.log('[game.js] handleStartGame:', { colorAssignments, firstTurn, roles });

  // Assign my color from server
  if (colorAssignments && mySocketId in colorAssignments) {
    myColor = colorAssignments[mySocketId];
    sessionStorage.setItem('myAssignedColor', myColor);
    console.log('[game.js] Assigned myColor from server:', myColor);
  }
  if (roles && roles[mySocketId]) {
    myRole = roles[mySocketId];
    sessionStorage.setItem('myRole', myRole);
    console.log('[game.js] Assigned myRole from server:', myRole);
  } else {
    // Fallback if roles not provided
    myRole = myColor === 'red' ? 'Player 1' : 'Player 2';
    sessionStorage.setItem('myRole', myRole);
    console.log('[game.js] Fallback myRole:', myRole);
  }

  currentPlayer = firstTurn || 'black';
  isMyTurn = (myColor === currentPlayer);
  gameStarted = true;
  gameEnded = false;

  if (serverBoard) board = JSON.parse(JSON.stringify(serverBoard));
  if (serverHistory) moveHistory = [...serverHistory];
  if (serverLastMove) lastMove = serverLastMove;
  else lastMove = null;

  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
  checkGameOver();
}

// Handle sync board
function handleSyncBoard({ board: serverBoard, currentPlayer: serverCurrent, moveHistory: serverHistory, lastMove: serverLastMove, color, role, from, to, move }) {
  console.log('[game.js] handleSyncBoard event received:', { from, to, move, serverCurrent });

  // Use server board as source of truth
  if (serverBoard) {
    board = serverBoard;
  }

  if (serverCurrent) currentPlayer = serverCurrent;
  if (serverHistory) moveHistory = [...serverHistory];
  if (serverLastMove) lastMove = serverLastMove;
  if (color) {
    myColor = color;
    sessionStorage.setItem('myAssignedColor', myColor);
  }
  if (role) {
    myRole = role;
    sessionStorage.setItem('myRole', myRole);
  }

  selected = null;
  validMoves = [];
  gameStarted = true;
  isMyTurn = (myColor === currentPlayer);
  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
  checkGameOver();
}

// --- Move history panel ---
let moveHistoryElem = document.getElementById('move-history');
const boardSize = 8;
const boardDiv = document.getElementById('game-board');
const statusDiv = document.getElementById('game-status');
const printBtn = document.getElementById('print-btn');

// --- Move history panel logic ---
function renderMoveHistory() {
  if (!moveHistoryElem) {
    console.warn('[game.js] moveHistoryElem not found, skipping renderMoveHistory');
    return;
  }
  
  moveHistoryElem.innerHTML = '';
  let moves = moveHistory || [];
  for (let i = 0; i < moves.length; i++) {
    const li = document.createElement('li');
    li.textContent = moves[i];
    moveHistoryElem.appendChild(li);
  }
}

// --- Add Leave Game button ---
let leaveBtn = document.getElementById('leave-btn');
if (!leaveBtn) {
  leaveBtn = document.createElement('button');
  leaveBtn.id = 'leave-btn';
  leaveBtn.textContent = 'Leave Game';
  printBtn.parentNode.appendChild(leaveBtn);
}

leaveBtn.onclick = () => {
  console.log('[game.js] Leave Game clicked');
  fetch(`${apiUrl}/left`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: currentRoom || roomCode, socketId: mySocketId })
  });
  window.location.href = '/';
};

// --- Chat elements ---
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

let board = [];
let currentPlayer = 'black'; // Black goes first by default
let selected = null;
let validMoves = [];
let moveHistory = [];
let isMyTurn = false;
let gameStarted = false;
let gameEnded = false;

// Animation and highlight state
let lastMove = null; // {from: {row,col}, to: {row,col}}

// Restore initial board and move history if coming from lobby
const startBoard = sessionStorage.getItem('startBoard');
const startMoveHistory = sessionStorage.getItem('startMoveHistory');
const startFirstTurn = sessionStorage.getItem('startFirstTurn');

// Get my socket id after connecting
pusher.connection.bind('connected', () => {
  mySocketId = pusher.connection.socket_id;
  console.log('[game.js] Pusher connected. socket.id:', mySocketId);
});

// Handle connection errors
pusher.connection.bind('error', (error) => {
  console.error('[game.js] Pusher connection error:', error);
  statusDiv.textContent = 'Connection error. Please refresh the page.';
});

pusher.connection.bind('disconnected', () => {
  console.log('[game.js] Pusher disconnected');
  statusDiv.textContent = 'Disconnected from server.';
});



// Initialize board with pieces
function initBoard() {
  console.log('[game.js] initBoard called');
  board = [];
  for (let row = 0; row < boardSize; row++) {
    let rowArr = [];
    for (let col = 0; col < boardSize; col++) {
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
  currentPlayer = 'black';
  selected = null;
  validMoves = [];
  moveHistory = [];
  lastMove = null;
  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
}

// If coming from lobby, use the board and move history from sessionStorage
if (startBoard) {
  console.log('[game.js] startBoard found in sessionStorage');
  board = JSON.parse(startBoard);
  moveHistory = startMoveHistory ? JSON.parse(startMoveHistory) : [];
  currentPlayer = startFirstTurn || 'black';
  gameStarted = true;
  renderBoard();
  renderMoveHistory();
  highlightLastMove();
  updateStatus();
  sessionStorage.removeItem('startBoard');
  sessionStorage.removeItem('startMoveHistory');
  sessionStorage.removeItem('startFirstTurn');
  myRole = sessionStorage.getItem('myRole') || null;
}

// --- Animation helpers ---
function getSquareElement(row, col) {
  return boardDiv.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
}
function getPieceElement(row, col) {
  const sq = getSquareElement(row, col);
  return sq ? sq.querySelector('.piece') : null;
}

// Animate a move from (fromRow,fromCol) to (toRow,toCol)
function animateMove(from, to, callback) {
  const fromSq = getSquareElement(from.row, from.col);
  const toSq = getSquareElement(to.row, to.col);
  if (!fromSq || !toSq) { callback && callback(); return; }
  const piece = fromSq.querySelector('.piece');
  if (!piece) { callback && callback(); return; }

  // Get boardDiv's position for absolute offset
  const fromRect = fromSq.getBoundingClientRect();
  const toRect = toSq.getBoundingClientRect();

  // Clone the piece for animation
  const animPiece = piece.cloneNode(true);
  animPiece.classList.add('moving');
  animPiece.style.position = 'fixed';
  animPiece.style.left = fromRect.left + 'px';
  animPiece.style.top = fromRect.top + 'px';
  animPiece.style.width = fromRect.width + 'px';
  animPiece.style.height = fromRect.height + 'px';
  animPiece.style.pointerEvents = 'none';
  animPiece.style.zIndex = 1000;
  // Add smooth transition
  animPiece.style.transition = 'transform 1.2s cubic-bezier(0.22, 0.61, 0.36, 1)';
  document.body.appendChild(animPiece);

  // Hide original piece during animation
  piece.style.visibility = 'hidden';

  // Animate to destination
  requestAnimationFrame(() => {
    animPiece.style.transform = `translate(${toRect.left - fromRect.left}px, ${toRect.top - fromRect.top}px)`;
  });

  setTimeout(() => {
    document.body.removeChild(animPiece);
    piece.style.visibility = '';
    callback && callback();
  }, 1200); // Increased duration for smoother animation
}

// --- Highlight last moved checker ---
function highlightLastMove() {
  // Remove old highlights
  boardDiv.querySelectorAll('.last-move').forEach(el => el.classList.remove('last-move'));
  if (lastMove && lastMove.to) {
    const sq = getSquareElement(lastMove.to.row, lastMove.to.col);
    if (sq) sq.classList.add('last-move');
  }
}

// Render the board (red always on bottom, black always on top)
function renderBoard() {
  boardDiv.innerHTML = '';
  boardDiv.style.display = 'grid';
  boardDiv.style.gridTemplate = `repeat(${boardSize}, 1fr) / repeat(${boardSize}, 1fr)`;

  // Always render red at the bottom, black at the top
  for (let displayRow = 0; displayRow < boardSize; displayRow++) {
    let row = boardSize - 1 - displayRow; // flip so red is always at the bottom
    for (let col = 0; col < boardSize; col++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((row + col) % 2 === 1 ? 'dark' : 'light');
      square.dataset.row = row;
      square.dataset.col = col;

      // Highlight last move
      if (lastMove && lastMove.to && lastMove.to.row === row && lastMove.to.col === col) {
        square.classList.add('last-move');
      }

      if (selected && selected.row === row && selected.col === col) {
        square.classList.add('selected');
      }
      if (validMoves.some(m => m.row === row && m.col === col)) {
        square.classList.add('valid-move');
      }

      const piece = board[row][col];
      if (piece) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'piece ' + piece.color + (piece.king ? ' king' : '');
        square.appendChild(pieceDiv);
      }

      square.addEventListener('click', onSquareClick);
      // Add touch support for mobile
      square.addEventListener('touchend', function(e) {
        e.preventDefault(); // Prevents simulated mouse events
        onSquareClick({ currentTarget: square });
      }, { passive: false });

      boardDiv.appendChild(square);
    }
  }
}

// --- Auto double-jump logic with animation and server sync ---
function performMoveWithAnimation(from, to, move, callback) {
  animateMove(from, to, () => {
    doMove(from, to, move);
    renderBoard();
    highlightLastMove();
    setTimeout(() => {
      const piece = board[to.row][to.col];
      if (move && move.jump && piece) {
        // Send this jump to server only if not in AI mode
        if (!isAIMode) {
          sendMoveToServer(from, to, move);
        }
        const jumps = getValidMoves(to.row, to.col, true);
        if (jumps.length > 0) {
          const nextJump = jumps[0];
          lastMove = { from: { ...to }, to: { row: nextJump.row, col: nextJump.col } };
          performMoveWithAnimation(
            { row: to.row, col: to.col },
            { row: nextJump.row, col: nextJump.col },
            nextJump,
            callback
          );
          return;
        }
      } else {
        // If not a jump, send the move to server only if not in AI mode
        if (!isAIMode) {
          sendMoveToServer(from, to, move);
        }
      }
      callback && callback();
    }, 100);
  });
}

// Actually update the board for a move (no animation)
function doMove(from, to, move) {
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;
  // King me
  if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === boardSize - 1)) {
    piece.king = true;
  }
  // Remove jumped piece
  if (move && move.jump && move.jumped) {
    board[move.jumped.row][move.jumped.col] = null;
  }
}

// Get valid moves for a piece
function getValidMoves(row, col, onlyJumps = false) {
  const piece = board[row][col];
  if (!piece) return [];
  const directions = [];
  if (piece.color === 'red' || piece.king) directions.push([-1, -1], [-1, 1]);
  if (piece.color === 'black' || piece.king) directions.push([1, -1], [1, 1]);
  let moves = [], jumps = [];
  for (const [dr, dc] of directions) {
    const [r1, c1] = [row + dr, col + dc];
    const [r2, c2] = [row + dr * 2, col + dc * 2];
    if (isInBounds(r1, c1) && !board[r1][c1] && !onlyJumps)
      moves.push({ row: r1, col: c1, jump: false });
    if (isInBounds(r2, c2) && board[r1][c1] && board[r1][c1].color !== piece.color && !board[r2][c2])
      jumps.push({ row: r2, col: c2, jump: true, jumped: { row: r1, col: c1 } });
  }
  return jumps.length > 0 ? jumps : moves;
}

function isInBounds(row, col) {
  return row >= 0 && row < boardSize && col >= 0 && col < boardSize;
}

function hasAnyJumps(color) {
  for (let row = 0; row < boardSize; row++)
    for (let col = 0; col < boardSize; col++)
      if (board[row][col] && board[row][col].color === color && getValidMoves(row, col, true).length > 0)
        return true;
  return false;
}

// Handle square click
function onSquareClick(e) {
  if (!isMyTurn || !gameStarted || gameEnded) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  const piece = board[row][col];

  console.log('[game.js] Square clicked:', { row, col, piece, myColor, currentPlayer, isMyTurn, gameStarted, gameEnded });

  // Only allow selecting your own color and only if it's your turn
  if (piece && piece.color === myColor && piece.color === currentPlayer) {
    selected = { row, col };
    validMoves = getValidMoves(row, col, hasAnyJumps(currentPlayer));
    console.log('[game.js] Selected piece, valid moves:', validMoves);
    renderBoard();
    highlightLastMove();
    return;
  }

  if (selected && validMoves.some(m => m.row === row && m.col === col)) {
    const move = validMoves.find(m => m.row === row && m.col === col);
    console.log('[game.js] Moving to valid square:', move);
    isMyTurn = false;
    lastMove = { from: { ...selected }, to: { row, col } };
    performMoveWithAnimation(selected, { row, col }, move, () => {
      // Switch turns
      currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
      renderBoard();
      highlightLastMove();
      updateStatus();
      checkGameOver();

      // If in AI mode, trigger AI move after player
      if (isAIMode && !gameEnded) {
        updateEvalBar();
        setTimeout(() => {
          makeAIMove();
        }, 1000);
      }
    });
    selected = null;
    validMoves = [];
    return;
  }

  selected = null;
  validMoves = [];
  renderBoard();
  highlightLastMove();
}

// Send move to server, let server update board and broadcast to both players
function sendMoveToServer(from, to, move) {
  console.log('[game.js] Sending move to server:', { from, to, move });

  // In AI mode, apply move locally immediately (no server sync)
  if (isAIMode) {
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
    }
    moveHistory.push(
      `${capitalize(currentPlayer)}: (${from.row},${from.col}) → (${to.row},${to.col})${move.jump ? ' (jump)' : ''}${becameKing ? ' (king)' : ''}`
    );
    currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
    isMyTurn = false;
    updateStatus();
    return;
  }

  // In multiplayer mode, send to server - server is source of truth
  const lastMove = { from, to };

  // Convert move to server format
  const serverMove = {
    from,
    to,
    jump: move.jump,
    jumped: move.jump ? move.jumped : null,
    promotion: false // Server will determine promotion
  };

  const nextPlayer = currentPlayer === 'red' ? 'black' : 'red';

  fetch(`${apiUrl}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room: currentRoom || roomCode,
      from,
      to,
      move: serverMove,
      lastMove,
      currentPlayer: nextPlayer,
      moveHistory
    })
  });

  // Show "sending..." state, will update when syncBoard arrives
  statusDiv.textContent = 'Sending move...';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isGameOver() {
  // Game over if the other player has no pieces or no moves
  const other = currentPlayer === 'red' ? 'black' : 'red';
  let hasPiece = false, hasMove = false;
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      if (board[row][col] && board[row][col].color === other) {
        hasPiece = true;
        if (getValidMoves(row, col).length > 0) hasMove = true;
      }
    }
  }
  return !hasPiece || !hasMove;
}

function checkGameOver() {
  if (gameEnded) return;
  if (isGameOver()) {
    let winner = currentPlayer === 'red' ? 'Black' : 'Red';
    const winnerColor = winner.toLowerCase();
    const points = countPieces(winnerColor);
    showEndGameScreen(`${winner} wins!`, points);
    gameEnded = true;
    console.log('[game.js] Game over:', winner, 'wins');
  }
}

function countPieces(color) {
  let count = 0;
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      if (board[row][col] && board[row][col].color === color) count++;
    }
  }
  return count;
}

function showEndGameScreen(message, points) {
  gameEnded = true;
  const buttonHtml = isAIMode
    ? `<button id="play-again-btn" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#2e7a3c;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-right:10px;">Play Again</button>
       <button id="leave-btn-final" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#7a5c2e;color:#fff;border:none;border-radius:8px;cursor:pointer;">New Game</button>`
    : `<button id="leave-btn-final" style="margin-top:18px;padding:10px 28px;font-size:1em;background:#7a5c2e;color:#fff;border:none;border-radius:8px;cursor:pointer;">New Game</button>`;

  statusDiv.innerHTML = `
    <div style="font-size:1.5em;color:#ffd700;margin:18px 0 10px 0;">${message}</div>
    <div style="font-size:1.1em;color:#fff;">Your points: <b>${points}</b></div>
    ${buttonHtml}
  `;

  const leaveBtnFinal = document.getElementById('leave-btn-final');
  if (leaveBtnFinal) {
    leaveBtnFinal.onclick = () => {
      isAIMode = false;
      if (evalSidebar) evalSidebar.style.display = 'none';
      window.location.href = '/';
    };
  }

  if (isAIMode) {
    const playAgainBtn = document.getElementById('play-again-btn');
    if (playAgainBtn) {
      playAgainBtn.onclick = () => {
        gameEnded = false;
        startAIMode();
      };
    }
  }

  console.log('[game.js] showEndGameScreen:', message, points);
}

// Print button (prints move history)
printBtn.onclick = () => {
  let movesHtml = '<h2>Checkers Move History</h2><ol>';
  moveHistory.forEach(m => {
    movesHtml += `<li>${m}</li>`;
  });
  movesHtml += '</ol>';
  const printWindow = window.open('', '', 'width=600,height=800');
  printWindow.document.write(`
    <html>
      <head>
        <title>Checkers Move History</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          h2 { color: #a67c38; }
          ol { font-size: 1.1em; }
        </style>
      </head>
      <body>
        ${movesHtml}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
};

function updateStatus() {
  if (gameEnded) return;
  if (!gameStarted) {
    statusDiv.textContent = "Share the URL above with your opponent to start playing";
    console.log('[game.js] Status: Share URL with opponent');
    return;
  }
  if (isAIMode) {
    if (currentPlayer === myColor) {
      statusDiv.textContent = `Your turn (${myColor})`;
      console.log('[game.js] Status: Your turn', myColor);
    } else {
      statusDiv.textContent = `AI's turn (${aiColor})`;
      console.log('[game.js] Status: AI\'s turn', aiColor);
    }
  } else {
    if (isMyTurn) {
      statusDiv.textContent = `Your turn (${myColor})`;
      console.log('[game.js] Status: Your turn', myColor);
    } else {
      statusDiv.textContent = `Opponent's turn (${currentPlayer})`;
      console.log('[game.js] Status: Opponent\'s turn', currentPlayer);
    }
  }
}

// Start game locally (used when server stateless loses track)
function startGameLocally() {
  console.log('[game.js] Starting game locally');
  // Only assign if server didn't assign
  if (!myColor) {
    if (!myRole) {
      myRole = 'Player 1';
    }
    const isFirstPlayer = myRole === 'Player 1';
    myColor = isFirstPlayer ? 'black' : 'red';
    sessionStorage.setItem('myAssignedColor', myColor);
    sessionStorage.setItem('myRole', myRole);
  }
  currentPlayer = 'black';
  initBoard();
  moveHistory = [];
  gameStarted = true;
  isMyTurn = (myColor === currentPlayer);
  selected = null;
  validMoves = [];
  renderBoard();
  renderMoveHistory();
  updateStatus();
}

// Leave game if window/tab closed
window.addEventListener('beforeunload', () => {
  console.log('[game.js] beforeunload: leaving game');
  fetch(`${apiUrl}/left`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: currentRoom || roomCode, socketId: mySocketId })
  });
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- Chat box logic ---
if (chatForm && chatInput && chatMessages) {
  // Add feedback message on page load
  const feedbackDiv = document.createElement('div');
  feedbackDiv.style.padding = '8px';
  feedbackDiv.style.background = '#2a2a2a';
  feedbackDiv.style.borderRadius = '4px';
  feedbackDiv.style.marginBottom = '8px';
  feedbackDiv.style.fontSize = '0.9em';
  feedbackDiv.style.color = '#ffffff';
  feedbackDiv.style.border = '1px solid #444';
  feedbackDiv.innerHTML = 'Please send comments/feedback to: <a href="mailto:maurice13stu@gmail.com" style="color: #66b3ff; text-decoration: underline;">maurice13stu@gmail.com</a>';
  chatMessages.appendChild(feedbackDiv);

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (msg) {
      // Use myRole if available, else fallback to "You"
      const senderLabel = myRole ? myRole : "You";
      appendChatMessage(senderLabel, msg);
      fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: currentRoom || roomCode, sender: senderLabel, msg })
      });
      chatInput.value = '';
      console.log('[game.js] Chat message sent:', msg);
    }
  });

  function appendChatMessage(sender, msg) {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Initialize game if not coming from lobby
if (!startBoard) {
  console.log('[game.js] No startBoard in sessionStorage, calling initBoard');
  initBoard();
}

// Initialize Pusher room on page load
if (!startBoard) {
  initializeRoom();
}

// Listen for WASM ready event
window.addEventListener('wasm-ready', () => {
  console.log('[game.js] WASM ready event received');
  if (!nnueLoaded) {
    initNNUE();
  }
});

// --- STRONG MINIMAX AI ---
const AI_DEPTH = 6;

// Clone board for simulation
function cloneBoard(board) {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

// Check if a piece is under attack
function isPieceUnderAttack(board, row, col, piece) {
  const opponent = piece.color === 'red' ? 'black' : 'red';
  
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const enemy = board[r][c];
      if (enemy && enemy.color === opponent) {
        const moves = getValidMovesForPiece(board, r, c, enemy);
        for (const move of moves) {
          if (move.jump && move.row === row && move.col === col) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

// Count pieces that can be captured
function countCapturablePieces(board, color) {
  let count = 0;
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color && isPieceUnderAttack(board, r, c, piece)) {
        count++;
      }
    }
  }
  return count;
}

// Evaluation function with strict safety checks
function evaluateBoard(board, color) {
  let score = 0;
  const opponent = color === 'red' ? 'black' : 'red';

  // Count pieces first
  let myPieces = 0, myKings = 0, opponentPieces = 0, opponentKings = 0;

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      if (piece.color === color) {
        myPieces++;
        if (piece.king) myKings++;
      } else {
        opponentPieces++;
        if (piece.king) opponentKings++;
      }
    }
  }

  // Material balance - this is the most important
  const myMaterial = myPieces + myKings * 5; // Kings worth 5 regular pieces
  const opponentMaterial = opponentPieces + opponentKings * 5;
  score += (myMaterial - opponentMaterial) * 200;

  // Now evaluate positions for remaining pieces
  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const piece = board[r][c];
      if (!piece) continue;

      let pieceValue = 0;

      // Position bonuses (much smaller compared to material)
      if (piece.color === 'red') {
        pieceValue += (7 - r) * 2; // Advance bonus
        if (c >= 2 && c <= 5) pieceValue += 3; // Center control
        if (c === 0 || c === 7) pieceValue -= 5; // Edge penalty
        if (r <= 2) pieceValue += 5; // Near promotion
      } else {
        pieceValue += r * 2; // Advance bonus
        if (c >= 2 && c <= 5) pieceValue += 3; // Center control
        if (c === 0 || c === 7) pieceValue -= 5; // Edge penalty
        if (r >= 5) pieceValue += 5; // Near promotion
      }

      // HYPER-DEFENSIVE: ENORMOUS penalty for hanging pieces
      if (isPieceUnderAttack(board, r, c, piece)) {
        if (piece.color === color) {
          // Our piece under attack - MASSIVE penalty
          // Make it so bad that the AI will do almost anything to avoid it
          pieceValue -= piece.king ? 1000 : 500;
        } else {
          // Opponent piece under attack - small bonus
          pieceValue += piece.king ? 100 : 50;
        }
      }

      if (piece.color === color) {
        score += pieceValue;
      } else {
        score -= pieceValue;
      }
    }
  }

  // Mobility (smaller factor)
  const myMoves = getAllMoves(board, color).length;
  const opponentMoves = getAllMoves(board, opponent).length;
  score += (myMoves - opponentMoves) * 3;

  return score;
}

// Get all moves for a color
function getAllMoves(board, color) {
  let moves = [];
  let hasJumps = false;

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        const pieceMoves = getValidMovesForPiece(board, r, c, piece);
        for (const move of pieceMoves) {
          if (move.jump) hasJumps = true;
          moves.push({
            from: { row: r, col: c },
            to: { row: move.row, col: move.col },
            jump: move.jump,
            jumped: move.jumped
          });
        }
      }
    }
  }

  // Mandatory jumps
  if (hasJumps) {
    moves = moves.filter(m => m.jump);
  }

  // Sort moves: prioritize smart jumps, then center squares, then advances
  moves.sort((a, b) => {
    // If both are jumps, use SEE to order them
    if (a.jump && b.jump) {
      const seeA = see(board, a, color);
      const seeB = see(board, b, color);
      return seeB - seeA; // Prefer jumps with better SEE score
    }

    // Jumps first
    if (a.jump && !b.jump) return -1;
    if (!a.jump && b.jump) return 1;

    // Prefer center squares
    const aCenter = a.to.col >= 2 && a.to.col <= 5 ? 1 : 0;
    const bCenter = b.to.col >= 2 && b.to.col <= 5 ? 1 : 0;
    if (aCenter !== bCenter) return bCenter - aCenter;

    // Prefer advances toward promotion
    const pieceColor = board[a.from.row][a.from.col].color;
    const aAdvance = pieceColor === 'red' ? (7 - a.to.row) : a.to.row;
    const bAdvance = pieceColor === 'red' ? (7 - b.to.row) : b.to.row;
    return bAdvance - aAdvance;
  });

  return moves;
}

// Get valid moves for a specific piece
function getValidMovesForPiece(board, row, col, piece) {
  const directions = [];
  if (piece.color === 'red' || piece.king) directions.push([-1, -1], [-1, 1]);
  if (piece.color === 'black' || piece.king) directions.push([1, -1], [1, 1]);
  
  let moves = [];
  for (const [dr, dc] of directions) {
    const r1 = row + dr, c1 = col + dc;
    const r2 = row + dr * 2, c2 = col + dc * 2;
    
    // Regular move
    if (r1 >= 0 && r1 < boardSize && c1 >= 0 && c1 < boardSize && !board[r1][c1]) {
      moves.push({ row: r1, col: c1, jump: false });
    }
    
    // Jump
    if (r2 >= 0 && r2 < boardSize && c2 >= 0 && c2 < boardSize && 
        board[r1][c1] && board[r1][c1].color !== piece.color && !board[r2][c2]) {
      moves.push({ row: r2, col: c2, jump: true, jumped: { row: r1, col: c1 } });
    }
  }
  
  return moves;
}

// Apply move to board
function applyMoveToBoard(board, move) {
  const newBoard = cloneBoard(board);
  const piece = newBoard[move.from.row][move.from.col];
  newBoard[move.to.row][move.to.col] = piece;
  newBoard[move.from.row][move.from.col] = null;

  // Handle promotion
  if ((piece.color === 'red' && move.to.row === 0) || (piece.color === 'black' && move.to.row === 7)) {
    piece.king = true;
  }

  // Handle jump
  if (move.jump && move.jumped) {
    newBoard[move.jumped.row][move.jumped.col] = null;
  }

  return newBoard;
}

// Quiescence search - extends search when captures are available
function quiescence(board, alpha, beta, maximizing, color, depth = 4) {
  const opponent = color === 'red' ? 'black' : 'red';

  // Stand-pat evaluation
  const standPat = evaluateBoard(board, color);
  if (maximizing) {
    if (standPat >= beta) return beta;
    alpha = Math.max(alpha, standPat);
  } else {
    if (standPat <= alpha) return alpha;
    beta = Math.min(beta, standPat);
  }

  // Only search captures in quiescence
  const moves = getAllMoves(board, maximizing ? color : opponent).filter(m => m.jump);

  if (moves.length === 0 || depth === 0) {
    return standPat;
  }

  if (maximizing) {
    let maxEval = standPat;
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move);
      const eval = quiescence(newBoard, alpha, beta, false, color, depth - 1);
      maxEval = Math.max(maxEval, eval);
      alpha = Math.max(alpha, eval);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = standPat;
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move);
      const eval = quiescence(newBoard, alpha, beta, true, color, depth - 1);
      minEval = Math.min(minEval, eval);
      beta = Math.min(beta, eval);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Minimax with alpha-beta pruning and quiescence
function minimax(board, depth, alpha, beta, maximizing, color) {
  const opponent = color === 'red' ? 'black' : 'red';

  if (depth === 0) {
    // Use quiescence search at leaf nodes to resolve capture sequences
    return quiescence(board, alpha, beta, maximizing, color);
  }

  const moves = getAllMoves(board, maximizing ? color : opponent);

  if (moves.length === 0) {
    return maximizing ? -10000 : 10000;
  }

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move);
      const eval = minimax(newBoard, depth - 1, alpha, beta, false, color);
      maxEval = Math.max(maxEval, eval);
      alpha = Math.max(alpha, eval);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const newBoard = applyMoveToBoard(board, move);
      const eval = minimax(newBoard, depth - 1, alpha, beta, true, color);
      minEval = Math.min(minEval, eval);
      beta = Math.min(beta, eval);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Static Exchange Evaluation - evaluate if a capture is good
function see(board, move, color) {
  if (!move.jump) return 0;

  const opponent = color === 'red' ? 'black' : 'red';
  const capturedPiece = board[move.jumped.row][move.jumped.col];
  if (!capturedPiece) return 0;

  // Value of captured piece
  const capturedValue = capturedPiece.king ? 1200 : 100;

  // Simulate the capture
  const newBoard = applyMoveToBoard(board, move);

  // Check if we can be recaptured
  const opponentMoves = getAllMoves(newBoard, opponent).filter(m => m.jump);
  let recaptureLoss = 0;

  for (const recapture of opponentMoves) {
    if (recapture.jumped.row === move.to.row && recapture.jumped.col === move.to.col) {
      const ourPiece = newBoard[move.to.row][move.to.col];
      const ourValue = ourPiece.king ? 1200 : 100;
      recaptureLoss = Math.max(recaptureLoss, ourValue);
      break;
    }
  }

  // Even if the trade is equal, we might want to capture to control the center
  // Add a small bonus for captures
  return capturedValue - recaptureLoss + 10;
}

// Get best move for AI with safety pruning
function getBestAIMove(board, color) {
  const moves = getAllMoves(board, color);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const opponent = color === 'red' ? 'black' : 'red';

  // Safety check: don't make a move that gives the opponent a jump
  const safeMoves = moves.filter(move => {
    // Simulate the move
    const newBoard = applyMoveToBoard(board, move);

    // Check if opponent has any jumps available after this move
    const opponentMoves = getAllMoves(newBoard, opponent);
    const opponentHasJumps = opponentMoves.some(m => m.jump);

    // If opponent has jumps and this wasn't a mandatory jump, reject
    if (opponentHasJumps && !move.jump) {
      return false; // Don't give opponent a free jump
    }

    // Also check if the piece we just moved is under attack
    const movedPiece = newBoard[move.to.row][move.to.col];
    if (movedPiece && isPieceUnderAttack(newBoard, move.to.row, move.to.col, movedPiece)) {
      // We can be captured after this move
      // Only allow if it's a jump that gains material
      if (move.jump) {
        const capturedPiece = board[move.jumped.row][move.jumped.col];
        const capturedValue = capturedPiece.king ? 3 : 1;
        const ourValue = movedPiece.king ? 3 : 1;
        // Only allow if we clearly win the trade
        return capturedValue > ourValue;
      }
      return false; // Don't move to a square where we'll be captured
    }

    return true;
  });

  // If all moves are unsafe, use the original moves as fallback
  const movesToSearch = safeMoves.length > 0 ? safeMoves : moves;

  let bestMove = null;
  let bestScore = -Infinity;

  for (const move of movesToSearch) {
    const newBoard = applyMoveToBoard(board, move);
    const score = minimax(newBoard, AI_DEPTH - 1, -Infinity, Infinity, false, color);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove || moves[0];
}

// Main AI move function
function makeAIMove() {
  if (!isAIMode || gameEnded || currentPlayer !== aiColor) {
    console.log('[game.js] AI move check failed:', { isAIMode, gameEnded, currentPlayer, aiColor });
    return;
  }

  // Use NNUE if available, otherwise fallback to minimax
  if (nnueLoaded && nnueApi) {
    makeNNUEAIMove();
  } else {
    makeMinimaxAIMove();
  }
}

// Minimax AI move (fallback)
function makeMinimaxAIMove() {
  console.log('[game.js] AI making move with minimax depth', AI_DEPTH);

  // Debug: check what moves are available
  const availableMoves = getAllMoves(board, aiColor);
  console.log('[game.js] Available moves for AI:', availableMoves.length, availableMoves);

  const aiMove = getBestAIMove(board, aiColor);

  if (!aiMove) {
    console.log('[game.js] AI has no moves');
    checkGameOver();
    return;
  }

  console.log('[game.js] AI selected move:', aiMove);

  // Execute the move with animation - use AI-specific handler for multi-jumps
  executeAIMoveWithAnimation(aiMove);
}

// NNUE AI move
async function makeNNUEAIMove() {
  console.log('[game.js] AI making move with NNUE (max think time:', AI_THINK_TIME, 'ms)');

  statusDiv.textContent = "AI thinking...";

  // For simplicity, use minimax AI for now
  // NNUE integration requires complex board state synchronization
  // that's difficult without a setBoard function
  makeMinimaxAIMove();
}

// Minimax AI move (fallback)
function makeMinimaxAIMove() {
  console.log('[game.js] AI making move with minimax depth', AI_DEPTH);

  const aiMove = getBestAIMove(board, aiColor);

  if (!aiMove) {
    console.log('[game.js] AI has no moves');
    checkGameOver();
    return;
  }

  console.log('[game.js] AI selected move:', aiMove);

  // Execute the move with animation - use AI-specific handler for multi-jumps
  executeAIMoveWithAnimation(aiMove);
}

// Execute AI move with proper multi-jump animation handling
function executeAIMoveWithAnimation(aiMove) {
  const from = aiMove.from;
  const to = aiMove.to;
  const moveObj = {
    jump: aiMove.jump,
    jumped: aiMove.jumped
  };

  lastMove = { from, to };

  // For AI, we need to handle the complete move sequence including multi-jumps
  performAIMoveSequence(from, to, moveObj, () => {
    // Switch turns
    currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
    isMyTurn = true;

    renderBoard();
    highlightLastMove();
    updateStatus();
    checkGameOver();
  });
}

// Sync local board to NNUE engine
function syncBoardToNNUE() {
  if (!nnueLoaded || !nnueApi) return;

  // Reset engine with current human side
  // Map: red -> Light (1), black -> Dark (0)
  const humanSide = myColor === 'red' ? 1 : 0;
  nnueApi.resetGame(humanSide);

  // Since we can't easily sync arbitrary board states to NNUE,
  // we'll reset to initial position. For a real implementation,
  // we'd need to replay all moves from the start.
  // For now, NNUE AI will start from a fresh position when called.
  // This is acceptable for AI mode since we always start fresh.
}

// Sync board from NNUE engine
function syncBoardFromNNUE() {
  if (!nnueLoaded || !nnueApi) return;

  // Read board state from NNUE and update local board
  // NNUE uses 0-63 indices, 1=dark pawn, 2=dark king, 3=light pawn, 4=light king
  for (let i = 0; i < 64; i++) {
    const row = Math.floor(i / 8);
    const col = i % 8;
    const piece = nnueApi.getPieceAt(i);

    if (piece === 0) {
      board[row][col] = null;
    } else if (piece === 1) {
      board[row][col] = { color: 'black', king: false };
    } else if (piece === 2) {
      board[row][col] = { color: 'black', king: true };
    } else if (piece === 3) {
      board[row][col] = { color: 'red', king: false };
    } else if (piece === 4) {
      board[row][col] = { color: 'red', king: true };
    }
  }
}

// Perform AI move sequence with multi-jump support
function performAIMoveSequence(from, to, move, callback) {
  animateMove(from, to, () => {
    doMove(from, to, move);
    renderBoard();
    highlightLastMove();
    setTimeout(() => {
      const piece = board[to.row][to.col];
      if (move && move.jump && piece) {
        // Check for additional jumps (multi-jump)
        const jumps = getValidMoves(to.row, to.col, true);
        if (jumps.length > 0) {
          const nextJump = jumps[0];
          lastMove = { from: { ...to }, to: { row: nextJump.row, col: nextJump.col } };
          performAIMoveSequence(
            { row: to.row, col: to.col },
            { row: nextJump.row, col: nextJump.col },
            nextJump,
            callback
          );
          return;
        }
      }
      callback && callback();
    }, 100);
  });
}

// --- Video Chat Functionality (PeerJS) ---
let peer = null;
let localStream = null;
let currentCall = null;
let isVideoEnabled = true;
let isAudioEnabled = true;

// Video chat elements
const videoContainer = document.getElementById('video-container');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const localPlaceholder = document.getElementById('local-placeholder');
const remotePlaceholder = document.getElementById('remote-placeholder');
const videoStatus = document.getElementById('video-status');
const startVideoBtn = document.getElementById('start-video-btn');
const toggleVideoBtn = document.getElementById('toggle-video-btn');
const toggleAudioBtn = document.getElementById('toggle-audio-btn');
const leaveVideoBtn = document.getElementById('leave-video-btn');

// Get peer ID from URL or generate new one
const urlParams = new URLSearchParams(window.location.search);
const remotePeerId = urlParams.get('peer');

// Initialize video chat button event listeners
function initializeVideoChatButtons() {
  startVideoBtn.addEventListener('click', startVideoChat);
  toggleVideoBtn.addEventListener('click', toggleVideo);
  toggleAudioBtn.addEventListener('click', toggleAudio);
  leaveVideoBtn.addEventListener('click', stopVideoChat);
}

// Start video chat with PeerJS
async function startVideoChat() {
  console.log('[game.js] Starting video chat with PeerJS');
  
  try {
    // Initialize PeerJS
    peer = new Peer();
    
    peer.on('open', (id) => {
      console.log('[game.js] My peer ID:', id);
      videoStatus.textContent = 'Video chat ready - share your URL with opponent';
      
      // Update URL with peer ID
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('peer', id);
      window.history.replaceState({}, '', currentUrl);
      
      // Update join URL display
      const joinUrlDiv = document.getElementById('join-url');
      if (joinUrlDiv) {
        joinUrlDiv.textContent = currentUrl.href;
      }
      
      // Show control buttons
      startVideoBtn.style.display = 'none';
      toggleVideoBtn.style.display = 'inline-block';
      toggleAudioBtn.style.display = 'inline-block';
      leaveVideoBtn.style.display = 'inline-block';
      
      // If remote peer ID in URL, connect to them
      if (remotePeerId && remotePeerId !== id) {
        connectToPeer(remotePeerId);
      }
    });
    
    peer.on('call', (call) => {
      console.log('[game.js] Incoming call from:', call.peer);
      answerCall(call);
    });
    
    peer.on('error', (err) => {
      console.error('[game.js] PeerJS error:', err);
      videoStatus.textContent = 'Video chat error: ' + err.type;
    });
    
    // Get local media stream
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240 },
      audio: true
    });
    
    localVideo.srcObject = localStream;
    localVideo.play();
    
    hideLocalPlaceholder();
    showRemotePlaceholder();
    
  } catch (error) {
    console.error('[game.js] Failed to start video chat:', error);
    videoStatus.textContent = 'Failed to start video chat: ' + error.message;
    if (peer) {
      peer.destroy();
      peer = null;
    }
  }
}

// Connect to remote peer
function connectToPeer(peerId) {
  console.log('[game.js] Connecting to peer:', peerId);
  videoStatus.textContent = 'Connecting to opponent...';
  
  const call = peer.call(peerId, localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('[game.js] Received remote stream');
    remoteVideo.srcObject = remoteStream;
    remoteVideo.play();
    hideRemotePlaceholder();
    videoStatus.textContent = 'Video chat connected!';
  });
  
  call.on('close', () => {
    console.log('[game.js] Call ended');
    videoStatus.textContent = 'Opponent disconnected';
    showRemotePlaceholder();
  });
  
  currentCall = call;
}

// Answer incoming call
function answerCall(call) {
  videoStatus.textContent = 'Incoming call...';
  
  call.answer(localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('[game.js] Call answered, received stream');
    remoteVideo.srcObject = remoteStream;
    remoteVideo.play();
    hideRemotePlaceholder();
    videoStatus.textContent = 'Video chat connected!';
  });
  
  call.on('close', () => {
    console.log('[game.js] Call ended');
    videoStatus.textContent = 'Opponent disconnected';
    showRemotePlaceholder();
  });
  
  currentCall = call;
}

// Stop video chat
function stopVideoChat() {
  console.log('[game.js] Stopping video chat');
  
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  
  if (peer) {
    peer.destroy();
    peer = null;
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (localVideo.srcObject) {
    localVideo.srcObject = null;
  }
  
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject = null;
  }
  
  // Update UI
  startVideoBtn.style.display = 'inline-block';
  toggleVideoBtn.style.display = 'none';
  toggleAudioBtn.style.display = 'none';
  leaveVideoBtn.style.display = 'none';
  videoStatus.textContent = 'Click Start to begin video chat';
  
  showLocalPlaceholder();
  showRemotePlaceholder();
}

// Toggle video
function toggleVideo() {
  if (!localStream) return;
  
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isVideoEnabled = !isVideoEnabled;
    videoTrack.enabled = isVideoEnabled;
    
    toggleVideoBtn.textContent = isVideoEnabled ? '🔴' : '📹';
    toggleVideoBtn.title = isVideoEnabled ? 'Turn off camera' : 'Turn on camera';
    
    if (isVideoEnabled) {
      toggleVideoBtn.classList.remove('muted');
      hideLocalPlaceholder();
    } else {
      toggleVideoBtn.classList.add('muted');
      showLocalPlaceholder();
    }
  }
}

// Toggle audio
function toggleAudio() {
  if (!localStream) return;
  
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isAudioEnabled = !isAudioEnabled;
    audioTrack.enabled = isAudioEnabled;
    
    toggleAudioBtn.textContent = isAudioEnabled ? '🔊' : '🔇';
    toggleAudioBtn.title = isAudioEnabled ? 'Mute microphone' : 'Unmute microphone';
    
    if (isAudioEnabled) {
      toggleAudioBtn.classList.remove('muted');
    } else {
      toggleAudioBtn.classList.add('muted');
    }
  }
}

// Leave video chat
function leaveVideoChat() {
  stopVideoChat();
}

function showLocalPlaceholder() {
  localPlaceholder.style.display = 'flex';
  localVideo.style.display = 'none';
}

function hideLocalPlaceholder() {
  localPlaceholder.style.display = 'none';
  localVideo.style.display = 'block';
}

function showRemotePlaceholder() {
  remotePlaceholder.style.display = 'flex';
  remoteVideo.style.display = 'none';
}

function hideRemotePlaceholder() {
  remotePlaceholder.style.display = 'none';
  remoteVideo.style.display = 'block';
}

// Initialize video chat buttons when page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeVideoChatButtons();
});
