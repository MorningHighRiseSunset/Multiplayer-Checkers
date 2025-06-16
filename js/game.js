// --- Multiplayer Game Logic with Socket.IO ---

const socket = io('https://multiplayer-checkers.onrender.com'); // Change to your deployed server URL

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');
const myColor = params.get('color'); // 'red' or 'black'

const boardSize = 8;
const boardDiv = document.getElementById('game-board');
const statusDiv = document.getElementById('game-status');
const moveHistoryList = document.getElementById('move-history');
const newGameBtn = document.getElementById('new-game-btn');
const printBtn = document.getElementById('print-btn');

let board = [];
let currentPlayer = 'red';
let selected = null;
let validMoves = [];
let moveHistory = [];
let isMyTurn = false;

// Join the game room
socket.emit('joinGame', { room: roomCode, color: myColor });

// Listen for turn assignment
socket.on('startGame', ({ firstTurn }) => {
  currentPlayer = firstTurn;
  isMyTurn = (myColor === currentPlayer);
  renderBoard();
  updateStatus();
});

// Listen for opponent move
socket.on('opponentMove', ({ from, to, move }) => {
  makeMove(from, to, move, false);
  isMyTurn = true;
  updateStatus();
});

// Listen for opponent leaving
socket.on('opponentLeft', () => {
  alert('Opponent left the game.');
  window.location.href = 'lobby.html';
});

// Initialize board with pieces
function initBoard() {
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
  currentPlayer = 'red';
  selected = null;
  validMoves = [];
  moveHistory = [];
  renderBoard();
  renderMoveHistory();
  updateStatus();
}

// Render the board
function renderBoard() {
  boardDiv.innerHTML = '';
  boardDiv.style.display = 'grid';
  boardDiv.style.gridTemplate = `repeat(${boardSize}, 50px) / repeat(${boardSize}, 50px)`;
  for (let row = 0; row < boardSize; row++) {
    for (let col = 0; col < boardSize; col++) {
      const square = document.createElement('div');
      square.className = 'square ' + ((row + col) % 2 === 1 ? 'dark' : 'light');
      square.dataset.row = row;
      square.dataset.col = col;
      square.style.width = '50px';
      square.style.height = '50px';

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
      boardDiv.appendChild(square);
    }
  }
}

function updateStatus() {
  if (!myColor) {
    statusDiv.textContent = "Spectator mode";
    return;
  }
  if (isMyTurn) {
    statusDiv.textContent = `Your turn (${myColor})`;
  } else {
    statusDiv.textContent = `Opponent's turn (${currentPlayer})`;
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
  if (!isMyTurn) return;
  const row = parseInt(e.currentTarget.dataset.row);
  const col = parseInt(e.currentTarget.dataset.col);
  const piece = board[row][col];

  // Only allow selecting your own color
  if (piece && piece.color === myColor && piece.color === currentPlayer) {
    selected = { row, col };
    validMoves = getValidMoves(row, col, hasAnyJumps(currentPlayer));
    renderBoard();
    return;
  }

  if (selected && validMoves.some(m => m.row === row && m.col === col)) {
    const move = validMoves.find(m => m.row === row && m.col === col);
    makeMove(selected, { row, col }, move, true);
    selected = null;
    validMoves = [];
    renderBoard();
    return;
  }

  selected = null;
  validMoves = [];
  renderBoard();
}

// Make a move
function makeMove(from, to, move, sendToServer) {
  const piece = board[from.row][from.col];
  board[to.row][to.col] = piece;
  board[from.row][from.col] = null;
  let becameKing = false;
  if ((piece.color === 'red' && to.row === 0) || (piece.color === 'black' && to.row === boardSize - 1)) {
    if (!piece.king) {
      piece.king = true;
      becameKing = true;
    }
  }
  if (move.jump) {
    const { row: jr, col: jc } = move.jumped;
    board[jr][jc] = null;
    // Multi-jump
    selected = { row: to.row, col: to.col };
    validMoves = getValidMoves(to.row, to.col, true);
    if (validMoves.length > 0 && !becameKing) {
      renderBoard();
      return;
    }
  }
  // Record move in history
  moveHistory.push(
    `${capitalize(currentPlayer)}: (${from.row},${from.col}) → (${to.row},${to.col})${move.jump ? ' (jump)' : ''}${becameKing ? ' (king)' : ''}`
  );
  renderMoveHistory();

  // Send move to server if it's my move
  if (sendToServer) {
    socket.emit('move', {
      room: roomCode,
      from,
      to,
      move
    });
    isMyTurn = false;
    updateStatus();
  }

  // Check for win
  if (isGameOver()) {
    statusDiv.textContent = `${capitalize(currentPlayer)} wins!`;
    boardDiv.querySelectorAll('.square').forEach(sq => sq.removeEventListener('click', onSquareClick));
    return;
  }

  currentPlayer = currentPlayer === 'red' ? 'black' : 'red';
  selected = null;
  validMoves = [];
  renderBoard();
}

function renderMoveHistory() {
  moveHistoryList.innerHTML = '';
  moveHistory.forEach(m => {
    const li = document.createElement('li');
    li.textContent = m;
    moveHistoryList.appendChild(li);
  });
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

// New Game button (optional: could emit a reset event)
newGameBtn.onclick = () => {
  initBoard();
  socket.emit('resetGame', { room: roomCode });
};

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

// Leave game if window/tab closed
window.addEventListener('beforeunload', () => {
  socket.emit('leaveGame', { room: roomCode, color: myColor });
});

// Initialize game
initBoard();