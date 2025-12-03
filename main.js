const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreLeftEl = document.getElementById("score-left");
const scoreRightEl = document.getElementById("score-right");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const paddle = (x) => ({ x, y: HEIGHT / 2 - 50, w: 12, h: 100, speed: 6 });
const left = paddle(20);
const right = paddle(WIDTH - 20 - 12);

let keys = {};
let running = true;

// Features
let aiEnabled = true;
const audioCtx =
  window.AudioContext || window.webkitAudioContext
    ? new (window.AudioContext || window.webkitAudioContext)()
    : null;

// Tic-Tac-Toe state
let tttBoard = Array(9).fill(null); // 'X' or 'O'
let gameOver = false;

// Token being hit into cells
let token = null; // {x,y,vx,vy,r,type}
let nextType = "X";

// overlay
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const newGameBtn = document.getElementById("newGameBtn");

function spawnToken() {
  // spawn with a stronger initial velocity (random direction, speed 3..6)
  const angle = Math.random() * Math.PI * 2;
  const speed = 3 + Math.random() * 3; // 3..6
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  token = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx,
    vy,
    r: 12,
    type: nextType,
    wasHit: false,
  };
  nextType = nextType === "X" ? "O" : "X";
}

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function drawCircle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = type === "paddle" ? 640 : type === "place" ? 220 : 440;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(now);
  o.stop(now + 0.12);
}

function loadState() {
  const lsAI = localStorage.getItem("pong_ai_enabled");
  if (lsAI !== null) aiEnabled = lsAI === "1";
}
function saveSettings() {
  localStorage.setItem("pong_ai_enabled", aiEnabled ? "1" : "0");
}

// Grid
const grid = {
  size: 300,
  x: WIDTH / 2 - 150,
  y: HEIGHT / 2 - 150,
};

function gridCellRect(i) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  const w = grid.size / 3;
  return { x: grid.x + col * w, y: grid.y + row * w, w: w, h: w };
}

function placeTokenInCell(i, type) {
  if (tttBoard[i]) return false;
  tttBoard[i] = type;
  playSound("place");
  return true;
}

function checkWinner() {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (
      tttBoard[a] &&
      tttBoard[a] === tttBoard[b] &&
      tttBoard[a] === tttBoard[c]
    )
      return tttBoard[a];
  }
  if (tttBoard.every(Boolean)) return "TIE";
  return null;
}

function resetMatch() {
  tttBoard = Array(9).fill(null);
  gameOver = false;
  hideOverlay();
  spawnToken();
}

function showOverlay(text) {
  if (!overlay) return;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}
function hideOverlay() {
  if (!overlay) return;
  overlay.classList.add("hidden");
}

// Pointer controls
let pointerActive = false;
canvas.addEventListener("pointerdown", (e) => {
  pointerActive = true;
  canvas.setPointerCapture(e.pointerId);
  handlePointer(e);
});
canvas.addEventListener("pointermove", (e) => {
  if (pointerActive) handlePointer(e);
});
canvas.addEventListener("pointerup", (e) => {
  pointerActive = false;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch (_) {}
});
function handlePointer(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  if (x < WIDTH / 2) left.y = clamp(y - left.h / 2, 0, HEIGHT - left.h);
  else right.y = clamp(y - right.h / 2, 0, HEIGHT - right.h);
}

function update() {
  if (!running || gameOver) return;
  // paddles
  if (keys["w"]) left.y -= left.speed;
  if (keys["s"]) left.y += left.speed;
  if (!aiEnabled) {
    if (keys["ArrowUp"]) right.y -= right.speed;
    if (keys["ArrowDown"]) right.y += right.speed;
  }
  left.y = clamp(left.y, 0, HEIGHT - left.h);
  right.y = clamp(right.y, 0, HEIGHT - right.h);
  if (aiEnabled) {
    const target = token ? token.y : HEIGHT / 2;
    const diff = target - right.y;
    right.y += Math.sign(diff) * Math.min(Math.abs(diff), right.speed * 0.9);
    right.y = clamp(right.y, 0, HEIGHT - right.h);
  }

  // token physics
  if (token) {
    token.x += token.vx;
    token.y += token.vy;
    // no damping: token keeps its velocity until hit or bounced
    // walls
    if (token.y - token.r <= 0 || token.y + token.r >= HEIGHT) {
      token.vy *= -1;
      token.y = clamp(token.y, token.r, HEIGHT - token.r);
    }
    // paddle collisions - left
    if (token.x - token.r <= left.x + left.w && token.x - token.r > left.x) {
      if (token.y >= left.y && token.y <= left.y + left.h) {
        token.x = left.x + left.w + token.r;
        token.vx = Math.abs(token.vx) + 1.2;
        token.vy += (Math.random() - 0.5) * 2;
        token.wasHit = true;
        token.type = "X";
        playSound("paddle");
      }
    }
    if (token.x + token.r >= right.x && token.x + token.r < right.x + right.w) {
      if (token.y >= right.y && token.y <= right.y + right.h) {
        token.x = right.x - token.r;
        token.vx = -Math.abs(token.vx) - 1.2;
        token.vy += (Math.random() - 0.5) * 2;
        token.wasHit = true;
        token.type = "O";
        playSound("paddle");
      }
    }

    // check if token settled inside an empty cell
    // snap-to-grid placement: if token center enters any empty cell, snap it immediately
    for (let i = 0; i < 9; i++) {
      const r = gridCellRect(i);
      const cx = r.x + r.w / 2,
        cy = r.y + r.h / 2;
      const distX = Math.abs(token.x - cx),
        distY = Math.abs(token.y - cy);
      if (distX < r.w / 2 && distY < r.h / 2 && !tttBoard[i] && token.wasHit) {
        // snap token to cell center for a brief visual, then place
        token.x = cx;
        token.y = cy;
        token.vx = 0;
        token.vy = 0;
        playSound("place");
        // short delay so player sees the snap
        setTimeout(() => {
          placeTokenInCell(i, token.type);
          token = null;
          const res = checkWinner();
          if (res === "X" || res === "O") {
            gameOver = true;
            showOverlay((res === "X" ? "X" : "O") + " wins!");
          } else if (res === "TIE") {
            gameOver = true;
            showOverlay("Tie Game");
          } else {
            // spawn next token after a short pause
            setTimeout(() => {
              spawnToken();
            }, 300);
          }
        }, 90);
        break;
      }
    }
    // out of bounds -> wrap or bounce horizontally
    if (token && (token.x < -50 || token.x > WIDTH + 50)) {
      // reset to center if lost
      spawnToken();
    }
  }
}

function drawGrid() {
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 4;
  const w = grid.size / 3; // vertical lines
  ctx.beginPath();
  ctx.moveTo(grid.x + w, grid.y);
  ctx.lineTo(grid.x + w, grid.y + grid.size);
  ctx.moveTo(grid.x + 2 * w, grid.y);
  ctx.lineTo(grid.x + 2 * w, grid.y + grid.size);
  ctx.moveTo(grid.x, grid.y + w);
  ctx.lineTo(grid.x + grid.size, grid.y + w);
  ctx.moveTo(grid.x, grid.y + 2 * w);
  ctx.lineTo(grid.x + grid.size, grid.y + 2 * w);
  ctx.stroke();
  // draw marks
  for (let i = 0; i < 9; i++) {
    const r = gridCellRect(i);
    const mark = tttBoard[i];
    if (mark) {
      ctx.fillStyle = mark === "X" ? "#ffdca3" : "#a8f0c3";
      ctx.font = r.w * 0.5 + "px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mark, r.x + r.w / 2, r.y + r.h / 2);
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT); // background midline
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 10; y < HEIGHT; y += 28) ctx.fillRect(WIDTH / 2 - 1, y, 2, 14);
  // draw grid
  drawGrid();
  // paddles
  drawRect(left.x, left.y, left.w, left.h, "#e6eef8");
  drawRect(right.x, right.y, right.w, right.h, "#e6eef8");
  // token
  if (token) {
    ctx.fillStyle = token.type === "X" ? "#ffdca3" : "#a8f0c3";
    ctx.beginPath();
    ctx.arc(token.x, token.y, token.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#072029";
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(token.type, token.x, token.y);
  }
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// input handlers
window.addEventListener("keydown", (e) => {
  if (e.key === " ") running = !running;
  if (e.key === "r" || e.key === "R") {
    resetMatch();
  }
  if (e.key === "a" || e.key === "A") {
    aiEnabled = !aiEnabled;
    saveSettings();
  }
  keys[e.key] = true;
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

newGameBtn &&
  newGameBtn.addEventListener("click", () => {
    resetMatch();
  });

// start
loadState();
resetMatch();
loop();
