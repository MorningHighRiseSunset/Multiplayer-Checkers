// --- Multiplayer Room Logic with Socket.IO and true presence sync ---

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
let iAmReady = false;
let opponentReady = false;

// Join the room
socket.emit('joinRoom', roomCode);

// Handle color pick
pickBtns.forEach(btn => {
  btn.onclick = () => {
    myColor = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColor });
    // Do not update UI here; wait for roomState event
    roomStatus.textContent = "Waiting for opponent to join and pick...";
  };
});

// Listen for room state updates (true multiplayer sync)
socket.on('roomState', (state) => {
  // Reset dots and statuses
  dotRed.classList.remove('active');
  dotBlack.classList.remove('active');
  pickBtns.forEach(b => {
    b.disabled = false;
    b.textContent = "Pick";
    playerStatus[b.dataset.color].textContent = "";
  });

  // Track which colors are picked and by whom
  let pickedColors = {};
  for (const [sockId, color] of Object.entries(state.colors)) {
    pickedColors[color] = sockId;
  }

  // Update dots and pick buttons
  if (pickedColors.red) {
    dotRed.classList.add('active');
    pickBtns.forEach(b => {
      if (b.dataset.color === 'red') {
        b.disabled = true;
        if (myColor === 'red') {
          b.textContent = "You";
          playerStatus.red.textContent = "You picked this!";
        } else {
          b.textContent = "Opponent";
          playerStatus.red.textContent = "Opponent picked this!";
        }
      }
    });
  }
  if (pickedColors.black) {
    dotBlack.classList.add('active');
    pickBtns.forEach(b => {
      if (b.dataset.color === 'black') {
        b.disabled = true;
        if (myColor === 'black') {
          b.textContent = "You";
          playerStatus.black.textContent = "You picked this!";
        } else {
          b.textContent = "Opponent";
          playerStatus.black.textContent = "Opponent picked this!";
        }
      }
    });
  }

  // Enable ready if both colors are picked and not the same
  if (pickedColors.red && pickedColors.black && myColor && pickedColors.red !== pickedColors.black) {
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
  // No-op: roomState will handle presence
});

// Listen for opponent leaving
socket.on('opponentLeft', () => {
  // Remove opponent's presence (roomState will handle dots)
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