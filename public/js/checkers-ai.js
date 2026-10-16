// Checkers AI Library - Based on Jokimax/Checkers-lib
// Uses minimax with alpha-beta pruning for intelligent move selection

// Convert our board format to library format
function convertBoardToLibraryFormat(board) {
  const libraryBoard = [];
  for (let row = 0; row < 8; row++) {
    const rowArr = [];
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) {
        rowArr.push("*");
      } else if (piece.color === 'red') {
        rowArr.push(piece.king ? "W" : "w");
      } else {
        rowArr.push(piece.king ? "B" : "b");
      }
    }
    libraryBoard.push(rowArr);
  }
  return libraryBoard;
}

// Convert library move format back to our format
function convertLibraryMoveToOurFormat(libraryMove, board) {
  if (!libraryMove || libraryMove.length < 2) return null;
  
  const from = libraryMove[0];
  const to = libraryMove[libraryMove.length - 1];
  
  // Handle multi-jump moves
  const jumps = [];
  for (let i = 1; i < libraryMove.length - 1; i++) {
    const jumpSquare = libraryMove[i];
    if (jumpSquare.originalPiece !== "*") {
      jumps.push({ row: jumpSquare.y, col: jumpSquare.x });
    }
  }
  
  // Check for promotion
  const piece = board[from.y][from.x];
  const isPromotion = piece && !piece.king && 
    ((piece.color === 'red' && to.y === 0) || (piece.color === 'black' && to.y === 7));
  
  return {
    from: { row: from.y, col: from.x },
    to: { row: to.y, col: to.x },
    jump: jumps.length > 0,
    jumps: jumps,
    promotion: isPromotion
  };
}

// Get all possible moves for a piece at position
function getPieceMoves(position, x, y, hasToCapture = false, forcedCaptures = false, canCaptureBackwards = false, flyingKing = false, maxCaptures = false) {
  let moves = [];
  if (position[y][x] === "b" || position[y][x] === "w") {
    const res = getPeasantMoves(position, x, y, position[y][x], hasToCapture, forcedCaptures, canCaptureBackwards);
    if (res.hasToCapture && !hasToCapture) {
      moves = [];
      hasToCapture = true;
    }
    moves = moves.concat(res.moves);
  } else if (position[y][x] === "W") {
    const res = getKingMoves(position, x, y, "w", hasToCapture, forcedCaptures, flyingKing);
    if (res.hasToCapture && !hasToCapture) {
      moves = [];
      hasToCapture = true;
    }
    moves = moves.concat(res.moves);
  } else if (position[y][x] === "B") {
    const res = getKingMoves(position, x, y, "b", hasToCapture, forcedCaptures, flyingKing);
    if (res.hasToCapture && !hasToCapture) {
      moves = [];
      hasToCapture = true;
    }
    moves = moves.concat(res.moves);
  }
  if (maxCaptures) moves = getMaxCaptures(moves);
  return { "moves": moves, "hasToCapture": hasToCapture };
}

// Get all possible moves for a color
function getMoves(position, pieceType = "w", forcedCaptures = false, canCaptureBackwards = false, flyingKing = false, maxCaptures = false) {
  let hasToCapture = false;
  let moves = [];

  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((pieceType === "b" && position[y][x] === "b") || (pieceType === "w" && position[y][x] === "w")) {
        const res = getPeasantMoves(position, x, y, pieceType, hasToCapture, forcedCaptures, canCaptureBackwards);
        if (res.hasToCapture && !hasToCapture) {
          moves = [];
          hasToCapture = true;
        }
        moves = moves.concat(res.moves);
      } else if ((pieceType === "b" && position[y][x] === "B") || (pieceType === "w" && position[y][x] === "W")) {
        const res = getKingMoves(position, x, y, pieceType, hasToCapture, forcedCaptures, flyingKing);
        if (res.hasToCapture && !hasToCapture) {
          moves = [];
          hasToCapture = true;
        }
        moves = moves.concat(res.moves);
      }
    }
  }

  if (maxCaptures) moves = getMaxCaptures(moves);
  return { "moves": moves, "hasToCapture": hasToCapture };
}

// Get peasant moves
function getPeasantMoves(position, x, y, pieceType = "w", hasToCapture = false, forcedCaptures = false, canCaptureBackwards = false) {
  let originalPiece = position[y][x];
  position[y][x] = "*";
  let moves = getPieceCaptures(position, x, y, pieceType, [{"x": x, "y": y, "originalPiece": originalPiece}], canCaptureBackwards);

  if (moves.length !== 0) {
    hasToCapture = forcedCaptures;
  }

  if (!hasToCapture) {
    let forwardY = pieceType === "b" ? y + 1 : y - 1;
    if (x - 1 >= 0 && forwardY >= 0 && forwardY < 8 && position[forwardY][x - 1] === "*") {
      moves.push([{"x": x, "y": y, "originalPiece": originalPiece}, {"x": x - 1, "y": forwardY, "originalPiece": "*"}]);
    }
    if (x + 1 < 8 && forwardY >= 0 && forwardY < 8 && position[forwardY][x + 1] === "*") {
      moves.push([{"x": x, "y": y, "originalPiece": originalPiece}, {"x": x + 1, "y": forwardY, "originalPiece": "*"}]);
    }
  }

  position[y][x] = originalPiece;
  return {"moves": moves, "hasToCapture": hasToCapture};

  function getPieceCaptures(pos, x1, y1, pieceType, capture) {
    let capturesRes = [];
    let directions = [-1, 1];
    let backwardDirection = canCaptureBackwards ? [-1, 1] : [pieceType === "b" ? 1 : -1];

    for (let dy of backwardDirection) {
      for (let dx of directions) {
        let nextX = x1 + (2 * dx);
        let nextY = y1 + (2 * dy);
        let enemyX = x1 + dx;
        let enemyY = y1 + dy;

        if (nextX >= 0 && nextX < 8 && nextY >= 0 && nextY < 8 &&
          ((pieceType === "b" && (pos[enemyY][enemyX] === "w" || pos[enemyY][enemyX] === "W")) ||
          (pieceType === "w" && (pos[enemyY][enemyX] === "b" || pos[enemyY][enemyX] === "B"))) &&
          pos[nextY][nextX] === "*") {
          let capturedPiece = pos[enemyY][enemyX];
          pos[enemyY][enemyX] = "*";
          let newCapture = capture.concat([{"x": enemyX, "y": enemyY, "originalPiece": capturedPiece}, {"x": nextX, "y": nextY, "originalPiece": "*"}]);
          let search = getPieceCaptures(pos, nextX, nextY, pieceType, newCapture);
          if (search.length === 0) capturesRes.push(newCapture);
          else {
            if (!forcedCaptures) capturesRes.push(newCapture);
            for (let i = 0; i < search.length; i++) capturesRes.push(search[i]);
          }
          pos[enemyY][enemyX] = capturedPiece;
        }
      }
    }
    return capturesRes;
  }
}

// Get king moves
function getKingMoves(position, x, y, pieceType = "w", hasToCapture = false, forcedCaptures = false, flyingKing = false) {
  let originalPiece = position[y][x];
  position[y][x] = "*";
  let moves = getKingCaptures(position, x, y, pieceType, [{"x": x, "y": y, "originalPiece": originalPiece}]);

  if (moves.length !== 0) {
    hasToCapture = forcedCaptures;
  }
  if (!hasToCapture) {
    if (x - 1 >= 0 && y - 1 >= 0 && position[y - 1][x - 1] === "*") {
      moves.push([{"x": x, "y": y, "originalPiece": originalPiece}, {"x": x - 1, "y": y - 1, "originalPiece": "*"}]);
    }
    if (x + 1 < 8 && y - 1 >= 0 && position[y - 1][x + 1] === "*") {
      moves.push([{"x": x, "y": y, "originalPiece": originalPiece}, {"x": x + 1, "y": y - 1, "originalPiece": "*"}]);
    }
    if (x - 1 >= 0 && y + 1 < 8 && position[y + 1][x - 1] === "*") {
      moves.push([{"x": x, "y": y, "originalPiece": originalPiece}, {"x": x - 1, "y": y + 1, "originalPiece": "*"}]);
    }
    if (x + 1 < 8 && y + 1 < 8 && position[y + 1][x + 1] === "*") {
      moves.push([{"x": x, "y": y, "originalPiece": originalPiece}, {"x": x + 1, "y": y + 1, "originalPiece": "*"}]);
    }
  }

  position[y][x] = originalPiece;
  return {"moves": moves, "hasToCapture": hasToCapture};

  function getKingCaptures(pos, x1, y1, pieceType, capture) {
    let capturesRes = [];
    const directions = [
      { dx: 1, dy: 1 },
      { dx: 1, dy: -1 },
      { dx: -1, dy: 1 },
      { dx: -1, dy: -1 }
    ];
    for (let direction of directions) {
      let nextX = x1 + (2 * direction.dx);
      let nextY = y1 + (2 * direction.dy);
      let enemyX = x1 + direction.dx;
      let enemyY = y1 + direction.dy;

      if (nextX >= 0 && nextX < 8 && nextY >= 0 && nextY < 8 &&
        ((pieceType === "b" && (pos[enemyY][enemyX] === "w" || pos[enemyY][enemyX] === "W")) ||
        (pieceType === "w" && (pos[enemyY][enemyX] === "b" || pos[enemyY][enemyX] === "B"))) &&
        pos[nextY][nextX] === "*") {
        let capturedPiece = pos[enemyY][enemyX];
        pos[enemyY][enemyX] = "*";
        let newCapture = capture.concat([{ "x": enemyX, "y": enemyY, "originalPiece": capturedPiece }, { "x": nextX, "y": nextY, "originalPiece": "*" }]);
        let search = getKingCaptures(pos, nextX, nextY, pieceType, newCapture);
        if (search.length === 0) capturesRes.push(newCapture);
        else {
          if (!forcedCaptures) capturesRes.push(newCapture);
          for (let i = 0; i < search.length; i++) capturesRes.push(search[i]);
        }
        pos[enemyY][enemyX] = capturedPiece;
      }
    }
    return capturesRes;
  }
}

// Get max captures
function getMaxCaptures(moves) {
  if (moves.length === 0) return moves;
  let maxJumps = 0;
  for (let move of moves) {
    let jumps = 0;
    for (let square of move) {
      if (square.originalPiece !== "*") jumps++;
    }
    if (jumps > maxJumps) maxJumps = jumps;
  }
  return moves.filter(move => {
    let jumps = 0;
    for (let square of move) {
      if (square.originalPiece !== "*") jumps++;
    }
    return jumps === maxJumps;
  });
}

// Make move on board
function makeMove(position, move) {
  for (let i = 0; i < move.length - 1; i++) {
    let from = move[i];
    let to = move[i + 1];
    position[to.y][to.x] = from.originalPiece;
    position[from.y][from.x] = "*";
    
    // Handle promotion
    if (from.originalPiece === "w" && to.y === 0) {
      position[to.y][to.x] = "W";
    } else if (from.originalPiece === "b" && to.y === 7) {
      position[to.y][to.x] = "B";
    }
  }
}

// Unmake move on board
function unmakeMove(position, move) {
  let first = move[0];
  let last = move[move.length - 1];
  
  position[first.y][first.x] = first.originalPiece;
  position[last.y][last.x] = "*";
  
  // Restore captured pieces
  for (let i = 1; i < move.length - 1; i++) {
    let square = move[i];
    position[square.y][square.x] = square.originalPiece;
  }
}

// Get best move using minimax with alpha-beta pruning
function getBestMove(position, player = "w", forcedCaptures = false, canCaptureBackwards = false, flyingKing = false, maxCaptures = false, depth = 6) {
  let potentialMoves = getMoves(position, player, forcedCaptures, canCaptureBackwards, flyingKing, maxCaptures).moves;
  if (potentialMoves.length === 0) {
    return null;
  }
  if (potentialMoves.length === 1) {
    return potentialMoves[0];
  }

  let posOriginal = JSON.parse(JSON.stringify(position));
  potentialMoves = shuffle(potentialMoves);
  
  let bestMove = [];
  let highestScore = -10000000;
  let lowestScore = 10000000;

  for (let move of potentialMoves) {
    makeMove(position, move);
    let score = search(position, depth - 1, highestScore, lowestScore, getOpponent(player));
    unmakeMove(position, move);
    if (player === "w" && score > highestScore) {
      highestScore = score;
      bestMove = move;
    } else if (player === "b" && score < lowestScore) {
      lowestScore = score;
      bestMove = move;
    }
  }

  position = posOriginal;
  return bestMove;

  function search(pos, depth, alpha, beta, player) {
    if (depth === 0) return countScore(pos, player);
    let moves = getMoves(pos, player, forcedCaptures, canCaptureBackwards, flyingKing, maxCaptures).moves;
    if (moves.length === 0) {
      if (player === "w") return -1000000;
      else return 1000000;
    }

    if (player === "w") {
      for (let move of moves) {
        makeMove(pos, move);
        let score = search(pos, depth - 1, alpha, beta, "b");
        unmakeMove(pos, move);
        alpha = Math.max(alpha, score);
        if (alpha >= beta) break;
      }
      return alpha;
    } else {
      for (let move of moves) {
        makeMove(pos, move);
        let score = search(pos, depth - 1, alpha, beta, "w");
        unmakeMove(pos, move);
        beta = Math.min(beta, score);
        if (beta <= alpha) break;
      }
      return beta;
    }
  }

  function countScore(pos) {
    let score = 0;
    let foundBlack = false;
    let foundWhite = false;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (pos[y][x] === "b") {
          foundBlack = true;
          score -= 100;
        } else if (pos[y][x] === "w") {
          foundWhite = true;
          score += 100;
        } else if (pos[y][x] === "B") {
          foundBlack = true;
          if (flyingKing) score -= 1000;
          else score -= 300;
        } else if (pos[y][x] === "W") {
          foundWhite = true;
          if (flyingKing) score += 1000;
          else score += 300;
        }
      }
    }
    if (!foundBlack) return 1000000;
    if (!foundWhite) return -1000000;
    return score;
  }

  function getOpponent(player) {
    return player === "b" ? "w" : "b";
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}
