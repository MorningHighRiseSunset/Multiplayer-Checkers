const boardDiv = document.getElementById('mini-board');
const playBtn = document.getElementById('play-btn');

// Both pieces on the same diagonal, both on dark squares
// Black at [0,1], Red at [1,2], so black can jump to [2,3]
let miniBoard = [
  [null, { color: 'black', king: false }, null, null],
  [null, null, { color: 'red', king: false }, null],
  [null, null, null, null],
  [null, null, null, null]
];

// Render mini board
function renderMiniBoard() {
  boardDiv.innerHTML = '';
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const square = document.createElement('div');
      square.className = 'mini-square ' + ((row + col) % 2 === 1 ? 'mini-dark' : 'mini-light');
      square.dataset.row = row;
      square.dataset.col = col;

      const piece = miniBoard[row][col];
      if (piece) {
        const pieceDiv = document.createElement('div');
        pieceDiv.className = 'mini-piece mini-' + piece.color + (piece.king ? ' mini-king' : '');
        pieceDiv.dataset.row = row;
        pieceDiv.dataset.col = col;
        square.appendChild(pieceDiv);
      }
      boardDiv.appendChild(square);
    }
  }
}

renderMiniBoard();

// Animation functions
function animBlackJumpsRed() {
  // Black checker jumps over red checker (from [0,1] to [2,3])
  const black = boardDiv.querySelector('.mini-piece.mini-black');
  const red = boardDiv.querySelector('.mini-piece.mini-red');
  if (!black || !red) return;
  black.style.zIndex = 2;
  // Animate black: up, over, and down to [2,3]
  black.animate([
    { transform: 'translate(0,0) scale(1)' },
    { transform: 'translate(36px,36px) scale(1.15)' }, // over red
    { transform: 'translate(72px,72px) scale(1)' }
  ], { duration: 700, fill: 'forwards' });
  setTimeout(() => {
    red.style.opacity = 0;
    setTimeout(() => {
      red.remove();
      black.style.transform = 'translate(72px,72px)';
    }, 200);
  }, 500);
}

function animRedBecomesKing() {
  // Red checker moves diagonally from [1,2] to [0,3] and becomes king (no capture)
  const red = boardDiv.querySelector('.mini-piece.mini-red');
  if (!red) return;

  red.animate([
    { transform: 'translate(0,0) scale(1)' },
    { transform: 'translate(38px,-38px) scale(1.15)' }
  ], { duration: 700, fill: 'forwards' });

  setTimeout(() => {
    red.classList.add('mini-king');
    red.style.transform = 'translate(38px,-38px)';
  }, 700);
}

// Play button logic
playBtn.onclick = () => {
  playBtn.disabled = true;
  // Randomly pick an animation
  const anims = [animBlackJumpsRed, animRedBecomesKing];
  const anim = anims[Math.floor(Math.random() * anims.length)];
  anim();
  setTimeout(() => {
    window.location.href = "lobby.html";
  }, 1500);
};