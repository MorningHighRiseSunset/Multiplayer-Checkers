const socket = io('https://multiplayer-checkers.onrender.com');

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room');

let myColorPick = null;
let myAssignedColor = null;
let myRole = null;

const colorButtons = document.querySelectorAll('.color-btn');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const statusDiv = document.getElementById('room-status');
const playersDiv = document.getElementById('players-list');

// Pick color
colorButtons.forEach(btn => {
  btn.onclick = () => {
    myColorPick = btn.dataset.color;
    socket.emit('pickColor', { room: roomCode, color: myColorPick });
    colorButtons.forEach(b => b.disabled = true);
    btn.classList.add('selected');
    statusDiv.textContent = `You picked ${myColorPick}`;
    readyBtn.disabled = false; // Enable Ready button after picking color
  };
});

// Listen for color picked
socket.on('colorPicked', ({ color }) => {
  statusDiv.textContent = `A player picked ${color}`;
});

// Listen for room state updates
socket.on('roomState', ({ roles, colors }) => {
  if (!playersDiv) return;
  playersDiv.innerHTML = '';
  // Reset dots
  document.getElementById('dot-player1').classList.remove('active');
  document.getElementById('dot-player2').classList.remove('active');
  for (const [sockId, role] of Object.entries(roles)) {
    const color = colors[sockId] || 'not picked';
    const li = document.createElement('li');
    li.textContent = `${role}: ${color}`;
    playersDiv.appendChild(li);
    // Light up the dot for this player
    if (role === 'Player 1') document.getElementById('dot-player1').classList.add('active');
    if (role === 'Player 2') document.getElementById('dot-player2').classList.add('active');
  }
});

// Ready button
readyBtn.onclick = () => {
  if (!myColorPick) {
    statusDiv.textContent = "Pick a color first!";
    return;
  }
  socket.emit('playerReady', { room: roomCode, color: myColorPick });
  readyBtn.disabled = true;
  statusDiv.textContent = "Waiting for other player...";
};

// Leave button
leaveBtn.onclick = () => {
  socket.emit('leaveRoom', { room: roomCode });
  // Optionally clear sessionStorage
  sessionStorage.removeItem('myAssignedColor');
  sessionStorage.removeItem('myRole');
  sessionStorage.removeItem('startFirstTurn');
  window.location.href = 'lobby.html';
};

// Listen for both players ready and color assignments
socket.on('startGame', ({ colorAssignments, firstTurn, roles }) => {
  myAssignedColor = colorAssignments[socket.id];
  myRole = roles[socket.id];
  sessionStorage.setItem('myAssignedColor', myAssignedColor);
  sessionStorage.setItem('myRole', myRole);
  sessionStorage.setItem('startFirstTurn', firstTurn);
  window.location.href = `game.html?room=${roomCode}`;
});

// Listen for opponent ready
socket.on('opponentReady', ({ color }) => {
  statusDiv.textContent = `Opponent is ready (${color})`;
});

// Listen for both players picked
socket.on('bothPicked', () => {
  statusDiv.textContent = "Both players picked colors. Click Ready!";
});

// Listen for both players ready
socket.on('bothReady', () => {
  statusDiv.textContent = "Both players are ready. Starting game...";
});

// Listen for player joined/left
socket.on('playerJoined', ({ role }) => {
  statusDiv.textContent = `${role} joined the room.`;
});
socket.on('playerLeft', ({ role }) => {
  statusDiv.textContent = `${role} left the room.`;
});

// On page load, join the room
socket.emit('joinRoom', roomCode);