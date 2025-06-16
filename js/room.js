// --- Multiplayer Room Logic with Socket.IO ---

const socket = io('https://multiplayer-checkers.onrender.com');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room') || 'UNKNOWN';

document.getElementById('room-code').textContent = `Room Code: ${roomCode}`;

const pickBtns = document.querySelectorAll('.pick-btn');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomStatus = document.getElementById('room-status');
const playerStatus = {
  red: document.querySelector('#player-red .status'),
  black: document.querySelector('#player-black .status')
};
const dotRed = document.getElementById('dot-red');
const dotBlack = document.getElementById('dot-black');

let myColor = null;
let opponentColor = null;
let iAmReady = false;
let opponentReady = false;
let playersPresent = { red: false, black: false };

// Join the room
socket.emit('joinRoom', roomCode);

// Set yourself as present when you join
function updatePresence() {
  if (myColor) {
    playersPresent[myColor] = true;
    updateDots();
  }
}
function updateDots() {
  dotRed.classList.toggle('active', playersPresent.red);
  dotBlack.classList.toggle('active', playersPresent.black);
}

// Handle color pick
pickBtns.forEach(btn => {
  btn.onclick = () => {
    myColor = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColor });
    pickBtns.forEach(b => b.disabled = true);
    btn.textContent = "You";
    playerStatus[myColor].textContent = "You picked this!";
    playersPresent[myColor] = true;
    updateDots();
    roomStatus.textContent = "Waiting for opponent to join and pick...";
  };
});

// Listen for color pick updates
socket.on('colorPicked', ({ color }) => {
  // Only update for opponent's pick
  if (color === myColor) return;
  opponentColor = color;
  pickBtns.forEach(b => {
    if (b.dataset.color === color) {
      b.disabled = true;
      playerStatus[color].textContent = "Opponent picked this!";
      b.textContent = "Opponent";
    }
  });
  playersPresent[color] = true;
  updateDots();
  // Enable ready if you picked and opponent picked
  if (myColor && opponentColor && myColor !== opponentColor) {
    readyBtn.disabled = false;
    roomStatus.textContent = "Both players picked! Click Ready when ready.";
  }
});

// Listen for both colors picked (for the player who picks second)
socket.on('bothPicked', () => {
  if (myColor && opponentColor && myColor !== opponentColor) {
    readyBtn.disabled = false;
    roomStatus.textContent = "Both players picked! Click Ready when ready.";
  }
});

// Ready logic
readyBtn.onclick = () => {
  iAmReady = true;
  readyBtn.disabled = true;
  socket.emit('playerReady', { room: roomCode, color: myColor });
  roomStatus.textContent = "Waiting for opponent to be ready...";
};

// Listen for opponent ready
socket.on('opponentReady', ({ color }) => {
  opponentReady = true;
  playerStatus[color].textContent = "Opponent is ready!";
  if (iAmReady) {
    roomStatus.textContent = "Both players ready! Starting game...";
    setTimeout(() => {
      window.location.href = `game.html?room=${roomCode}&color=${myColor}`;
    }, 1200);
  }
});

// Listen for both ready (for the player who is second to be ready)
socket.on('bothReady', () => {
  roomStatus.textContent = "Both players ready! Starting game...";
  setTimeout(() => {
    window.location.href = `game.html?room=${roomCode}&color=${myColor}`;
  }, 1200);
});

// Listen for opponent joining (to update presence dot)
socket.on('opponentJoined', () => {
  // If you already picked, mark opponent as present when they join
  if (myColor === 'red') {
    playersPresent.black = true;
  } else if (myColor === 'black') {
    playersPresent.red = true;
  }
  updateDots();
});

// Listen for opponent leaving
socket.on('opponentLeft', () => {
  // Remove opponent's presence
  if (myColor === 'red') {
    playersPresent.black = false;
  } else if (myColor === 'black') {
    playersPresent.red = false;
  }
  updateDots();
  alert('Opponent left the room.');
  window.location.href = 'lobby.html';
});

// Leave button
leaveBtn.onclick = () => {
  socket.emit('leaveRoom', { room: roomCode, color: myColor });
  window.location.href = "lobby.html";
};

// On disconnect, clean up
window.addEventListener('beforeunload', () => {
  socket.emit('leaveRoom', { room: roomCode, color: myColor });
});

// Initial dot update
updateDots();