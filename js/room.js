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
const dotPlayer1 = document.getElementById('dot-player1');
const dotPlayer2 = document.getElementById('dot-player2');

let myRole = null;
let myColor = null;
let iAmReady = false;
let opponentReady = false;

// Join the room (for both host and guest)
socket.emit('joinRoom', roomCode);

// Listen for role assignment and room state
socket.on('roomState', (state) => {
  if (!state || !state.roles) return;

  // Find my role
  for (const [sockId, role] of Object.entries(state.roles)) {
    if (sockId === socket.id) {
      myRole = role;
      break;
    }
  }

  // Show green dots for present players in status bar
  dotPlayer1.classList.remove('active');
  dotPlayer2.classList.remove('active');
  for (const [sockId, role] of Object.entries(state.roles)) {
    if (role === 'Player 1') dotPlayer1.classList.add('active');
    if (role === 'Player 2') dotPlayer2.classList.add('active');
  }

  // Show notification if both players are present
  const roles = Object.values(state.roles);
  if (roles.length === 2) {
    roomStatus.textContent = "Both players are in the lobby!";
  } else if (roles.length === 1) {
    roomStatus.textContent = "Waiting for another player to join...";
  }

  // Only disable pick buttons for colors that are already picked
  pickBtns.forEach(b => {
    b.disabled = false;
    b.textContent = "Pick";
    playerStatus[b.dataset.color].textContent = "";
  });

  let pickedColors = {};
  if (state.colors) {
    for (const [sockId, color] of Object.entries(state.colors)) {
      pickedColors[color] = sockId;
    }
  }

  // Disable a color if it's already picked by anyone else
  pickBtns.forEach(b => {
    const color = b.dataset.color;
    if (pickedColors[color] && (!myColor || myColor !== color)) {
      b.disabled = true;
      b.textContent = "Opponent";
      playerStatus[color].textContent = "Opponent picked this!";
    }
    if (myColor === color) {
      b.disabled = true;
      b.textContent = "You";
      playerStatus[color].textContent = "You picked this!";
    }
  });

  // Enable ready if both colors are picked and not the same
  if (pickedColors.red && pickedColors.black && myColor && pickedColors.red !== pickedColors.black) {
    readyBtn.disabled = false;
    roomStatus.textContent = "Both players picked! Click Ready when ready.";
  } else {
    readyBtn.disabled = true;
  }
});

// Listen for player join/leave notifications
socket.on('playerJoined', ({ role }) => {
  if (role === 'Player 2') {
    roomStatus.textContent = "Player 2 joined the lobby!";
  } else if (role === 'Player 1') {
    roomStatus.textContent = "Player 1 joined the lobby!";
  }
});
socket.on('playerLeft', ({ role }) => {
  if (role === 'Player 2') {
    roomStatus.textContent = "Player 2 left the lobby!";
  } else if (role === 'Player 1') {
    roomStatus.textContent = "Player 1 left the lobby!";
  }
});

// Handle color pick
pickBtns.forEach(btn => {
  btn.onclick = () => {
    myColor = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColor });
    roomStatus.textContent = "Waiting for opponent to join and pick...";
  };
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

// Listen for opponent leaving (fallback)
socket.on('opponentLeft', () => {
  roomStatus.textContent = "Opponent left the room!";
  setTimeout(() => {
    window.location.href = 'lobby.html';
  }, 1200);
});

// Leave button
leaveBtn.onclick = () => {
  socket.emit('leaveRoom', { room: roomCode });
  window.location.href = "lobby.html";
};

// On disconnect, clean up
window.addEventListener('beforeunload', () => {
  socket.emit('leaveRoom', { room: roomCode });
});