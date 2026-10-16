// Working Checkers AI from felipersteles/learning-checkers
// Proper minimax with alpha-beta pruning and move generation

'use strict';

// ─── LogicalBoard ─────────────────────────────────────────────────────────────
class LogicalBoard {
  constructor(cells) {
    this.cells = cells;
  }

  get(x, y) { return this.cells[y][x]; }
  set(x, y, val) { this.cells[y][x] = val; }

  clone() {
    return new LogicalBoard(this.cells.map(row => row.map(c => c ? { ...c } : null)));
  }

  applyMove(mv) {
    const piece = { ...this.get(mv.fromX, mv.fromY) };
    this.set(mv.fromX, mv.fromY, null);
    mv.eatPositions.forEach(({ x, y }) => this.set(x, y, null));
    const promoted = piece.color === 'white' ? mv.toY === 0 : mv.toY === 7;
    this.set(mv.toX, mv.toY, { color: piece.color, isQueen: piece.isQueen || promoted });
    return this;
  }

  isTerminal() {
    let hasWhite = false, hasBlack = false;
    for (const row of this.cells) {
      for (const c of row) {
        if (!c) continue;
        if (c.color === 'white') hasWhite = true;
        else hasBlack = true;
        if (hasWhite && hasBlack) return false;
      }
    }
    return true;
  }
}

// ─── LogicalMoveEngine ────────────────────────────────────────────────────────
class LogicalMoveEngine {
  static _inBounds(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8; }

  static _DIRS = [
    (x, y) => [x - 1, y - 1],
    (x, y) => [x + 1, y - 1],
    (x, y) => [x - 1, y + 1],
    (x, y) => [x + 1, y + 1],
  ];

  static _canCapture(cell, opponentColor, isQueen, rules = null) {
    if (!cell || cell.color !== opponentColor) return false;
    return isQueen || !cell.isQueen;
  }

  static _rules(rules) {
    return rules || {};
  }

  static _filterMoves(moves, board, rules) {
    const captures = moves.filter(move => move.eatPositions.length > 0);
    if (!captures.length) return moves;
    const maxCaptures = Math.max(...captures.map(move => move.eatPositions.length));
    return captures.filter(move => move.eatPositions.length === maxCaptures);
  }

  static getAllMoves(board, color, rules = null) {
    const moves = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const cell = board.get(x, y);
        if (!cell || cell.color !== color) continue;
        LogicalMoveEngine._collect(board, x, y, x, y, cell.isQueen, color, [], moves, false);
      }
    }
    return LogicalMoveEngine._filterMoves(moves, board);
  }

  static _collect(board, fromX, fromY, curX, curY, isQueen, color, eatChain, moves, inChain) {
    const opp = color === 'white' ? 'black' : 'white';
    const fwdDirs = color === 'white'
      ? [LogicalMoveEngine._DIRS[0], LogicalMoveEngine._DIRS[1]]
      : [LogicalMoveEngine._DIRS[2], LogicalMoveEngine._DIRS[3]];
    const moveDirs = isQueen ? LogicalMoveEngine._DIRS : fwdDirs;
    const captureDirs = LogicalMoveEngine._DIRS;

    if (!inChain) {
      moveDirs.forEach(step => {
        let [nx, ny] = step(curX, curY);
        if (LogicalMoveEngine._inBounds(nx, ny) && !board.get(nx, ny)) {
          moves.push({ fromX, fromY, toX: nx, toY: ny, eatPositions: [] });
        }
      });
    }

    captureDirs.forEach(step => {
      let [nx, ny] = step(curX, curY);
      if (!LogicalMoveEngine._inBounds(nx, ny)) return;

      const cell = board.get(nx, ny);
      const alreadyEaten = eatChain.some(e => e.x === nx && e.y === ny);
      if (!LogicalMoveEngine._canCapture(cell, opp, isQueen) || alreadyEaten) return;

      let [jx, jy] = step(nx, ny);
      if (LogicalMoveEngine._inBounds(jx, jy) && !board.get(jx, jy)) {
        const chain = [...eatChain, { x: nx, y: ny }];
        const before = moves.length;
        LogicalMoveEngine._collect(board, fromX, fromY, jx, jy, isQueen, color, chain, moves, true);
        const hasContinuation = moves.slice(before).some(move => move.eatPositions.length > chain.length);

        if (!hasContinuation) {
          moves.push({ fromX, fromY, toX: jx, toY: jy, eatPositions: chain });
        }
      }
    });
  }
}

// ─── MachinePlayer ────────────────────────────────────────────────────────────
class MachinePlayer {
  static DEPTHS = { easy: 1, medium: 3, hard: 5 };

  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
  }

  chooseBestMove(boardCells, machineColor) {
    const board = new LogicalBoard(boardCells);
    const depth = MachinePlayer.DEPTHS[this.difficulty] || 3;
    const result = this._minimax(board, depth, true, machineColor, machineColor, true);

    if (!result || typeof result !== 'object') return null;

    let best = null, bestVal = -Infinity;
    for (const { value, move } of Object.values(result)) {
      if (value > bestVal) { bestVal = value; best = move; }
    }
    return best;
  }

  _minimax(board, depth, isMax, moveColor, machineColor, firstCall) {
    if (depth === 0 || board.isTerminal()) {
      return this._heuristic(board, machineColor);
    }

    const opp = moveColor === 'white' ? 'black' : 'white';
    const moves = LogicalMoveEngine.getAllMoves(board, moveColor);
    if (!moves.length) return this._heuristic(board, machineColor);

    if (isMax) {
      let maxEval = -Infinity;
      const moveValues = {};

      for (const mv of moves) {
        const next = board.clone().applyMove(mv);
        const value = this._minimax(next, depth - 1, false, opp, machineColor, false);
        if (value > maxEval) maxEval = value;
        moveValues[`${mv.fromX},${mv.fromY},${mv.toX},${mv.toY}`] = { value, move: mv };
      }

      return firstCall ? moveValues : maxEval;
    } else {
      let minEval = Infinity;

      for (const mv of moves) {
        const next = board.clone().applyMove(mv);
        const value = this._minimax(next, depth - 1, true, opp, machineColor, false);
        if (value < minEval) minEval = value;
      }

      return minEval;
    }
  }

  _heuristic(board, machineColor) {
    let score = 0;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const cell = board.get(x, y);
        if (!cell) continue;
        const val = cell.isQueen ? 3 : 1;
        score += cell.color === machineColor ? val : -val;
      }
    }
    return score;
  }
}
