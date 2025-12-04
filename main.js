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
let tttBoardHits = Array(9).fill(0); // hit counter for each cell
let gameOver = false;

// Token being hit into cells
let tokens = []; // Array of {x,y,vx,vy,r,type}
let nextType = "X";

// Auto-spawn settings
const SPAWN_INTERVAL = 1000; // 1 second
const MAX_TOKENS = 5;
let lastSpawnTime = 0;

// Visual particles for hit effects
let particles = [];

function spawnParticles(x, y, color) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 3;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.4,
      r: 2 + Math.random() * 3,
      color,
    });
  }
}

// overlay
const overlay = document.getElementById("overlay");
const overlayText = document.getElementById("overlayText");
const newGameBtn = document.getElementById("newGameBtn");
const removalMessage = document.getElementById("removalMessage");
const removalMessageText = document.getElementById("removalMessageText");

function spawnToken() {
  // spawn with a stronger initial velocity biased horizontally (speed 3..6)
  // choose left or right with a small vertical spread to avoid near-vertical starts
  const side = Math.random() > 0.5 ? 1 : -1; // 1 => right, -1 => left
  const spread = Math.PI / 6; // +/- 15 degrees
  const base = side === 1 ? 0 : Math.PI;
  const angle = base + (Math.random() - 0.5) * spread;
  const speed = 5 + Math.random() * 4; // 5..9 (faster)
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  tokens.push({
    x: WIDTH / 2,
    y: HEIGHT / 2,
    vx,
    vy,
    r: 12,
    type: nextType,
    wasHit: false,
  });
  nextType = nextType === "X" ? "O" : "X";
  lastSpawnTime = Date.now();
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

// When a token is over the tic-tac-toe grid we slowly damp its velocity
// so it will settle; snapping only occurs when speed is below a threshold.
const GRID_DAMPING = 0.97; // multiply velocities by this each frame when on-grid
const SNAP_SPEED_THRESHOLD = 1.4; // only snap into a cell when speed <= this
const MIN_VELOCITY = 0.5; // minimum velocity to maintain while on grid (prevents creeping to zero)

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
  tttBoardHits = Array(9).fill(0);
  gameOver = false;
  hideOverlay();
  tokens = [];
  spawnToken();
}

function showTemporaryMessage(text, ms = 900) {
  showOverlay(text);
  setTimeout(() => {
    if (!gameOver) hideOverlay();
  }, ms);
}

function removeRandomTokenFor(type) {
  const indices = [];
  for (let i = 0; i < 9; i++) if (tttBoard[i] === type) indices.push(i);
  if (indices.length === 0) return false;
  const pick = indices[Math.floor(Math.random() * indices.length)];
  const r = gridCellRect(pick);
  // particle and sound feedback
  spawnParticles(
    r.x + r.w / 2,
    r.y + r.h / 2,
    type === "X" ? "#ffdca3" : "#a8f0c3"
  );
  playSound("place");
  tttBoard[pick] = null;
  // show removal message at bottom of screen
  showRemovalMessage(
    (type === "X" ? "X" : "O") + " was removed from the board"
  );
  return true;
}

function showRemovalMessage(text, ms = 900) {
  if (!removalMessage) return;
  removalMessageText.textContent = text;
  removalMessage.classList.remove("hidden");
  setTimeout(() => {
    removalMessage.classList.add("hidden");
  }, ms);
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
  
  // Auto-spawn logic
  const now = Date.now();
  if (tokens.length === 0) {
      spawnToken();
  } else if (tokens.length < MAX_TOKENS && now - lastSpawnTime > SPAWN_INTERVAL) {
      spawnToken();
  }

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
    // Find the most relevant token to target
    // Prefer tokens moving towards the right paddle (vx > 0)
    // Among those, pick the one closest to the paddle
    let targetToken = null;
    let minDist = Infinity;
    
    for (const t of tokens) {
      if (t.vx > 0) {
        const dist = (WIDTH - 20) - t.x;
        if (dist < minDist) {
          minDist = dist;
          targetToken = t;
        }
      }
    }
    // If no token moving towards us, just pick the closest one
    if (!targetToken && tokens.length > 0) {
      minDist = Infinity;
      for (const t of tokens) {
        const dist = Math.abs((WIDTH - 20) - t.x);
        if (dist < minDist) {
          minDist = dist;
          targetToken = t;
        }
      }
    }

    const target = targetToken ? targetToken.y : HEIGHT / 2;
    const diff = target - right.y;
    right.y += Math.sign(diff) * Math.min(Math.abs(diff), right.speed * 0.9);
    right.y = clamp(right.y, 0, HEIGHT - right.h);
  }

  // token physics
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    token.x += token.vx;
    token.y += token.vy;

    // walls
    if (token.y - token.r <= 0 || token.y + token.r >= HEIGHT) {
      token.vy *= -1;
      token.y = clamp(token.y, token.r, HEIGHT - token.r);
    }

    // paddle collisions - left
    if (token.x - token.r <= left.x + left.w && token.x - token.r > left.x) {
      if (token.y >= left.y && token.y <= left.y + left.h) {
        token.x = left.x + left.w + token.r;
        // stronger horizontal impulse and larger vertical variance to increase difficulty
        token.vx = Math.abs(token.vx) + 2.4;
        token.vy += (Math.random() - 0.5) * 3;
        token.wasHit = true;
        token.type = "X";
        token.hitFlash = 0.35;
        spawnParticles(token.x, token.y, "#ffdca3");
        playSound("paddle");
      }
    }
    if (token.x + token.r >= right.x && token.x + token.r < right.x + right.w) {
      if (token.y >= right.y && token.y <= right.y + right.h) {
        token.x = right.x - token.r;
        token.vx = -Math.abs(token.vx) - 2.4;
        token.vy += (Math.random() - 0.5) * 3;
        token.wasHit = true;
        token.type = "O";
        token.hitFlash = 0.35;
        spawnParticles(token.x, token.y, "#a8f0c3");
        playSound("paddle");
      }
    }

    // If token is over the grid area and has been hit, gradually damp its speed so it can settle.
    const inGridX = token.x >= grid.x && token.x <= grid.x + grid.size;
    const inGridY = token.y >= grid.y && token.y <= grid.y + grid.size;
    const onGrid = inGridX && inGridY;
    if (onGrid && token.wasHit) {
      // check which cell the token is in
      let cellIndex = -1;
      for (let j = 0; j < 9; j++) {
        const r = gridCellRect(j);
        const cx = r.x + r.w / 2,
          cy = r.y + r.h / 2;
        const distX = Math.abs(token.x - cx),
          distY = Math.abs(token.y - cy);
        if (distX < r.w / 2 && distY < r.h / 2) {
          cellIndex = j;
          break;
        }
      }
      // only damp if the cell is empty
      if (cellIndex === -1 || !tttBoard[cellIndex]) {
        token.vx *= GRID_DAMPING;
        token.vy *= GRID_DAMPING;
        // maintain a minimum velocity to keep the token moving
        const speed = Math.hypot(token.vx, token.vy);
        if (speed > 0 && speed < MIN_VELOCITY) {
          const scale = MIN_VELOCITY / speed;
          token.vx *= scale;
          token.vy *= scale;
        }
      } else {
        // bounce off occupied cell based on which edge we hit
        const r = gridCellRect(cellIndex);
        const cx = r.x + r.w / 2,
          cy = r.y + r.h / 2;
        const distX = Math.abs(token.x - cx);
        const distY = Math.abs(token.y - cy);
        // bounce horizontally or vertically depending on which edge is closer
        if (distX > distY) {
          token.vx *= -1; // bounce left/right
        } else {
          token.vy *= -1; // bounce up/down
        }
        // increment hit counter for this cell
        tttBoardHits[cellIndex]++;
        // if hit 3 times, destroy the token
        if (tttBoardHits[cellIndex] >= 3) {
          const type = tttBoard[cellIndex];
          tttBoard[cellIndex] = null;
          tttBoardHits[cellIndex] = 0;
          spawnParticles(cx, cy, type === "X" ? "#ffdca3" : "#a8f0c3");
          playSound("place");
        }
      }
    }

    // check if token can settle inside an empty cell
    // snap-to-grid placement: only snap if token was hit and its speed is low enough
    let tokenRemoved = false;
    for (let j = 0; j < 9; j++) {
      const r = gridCellRect(j);
      const cx = r.x + r.w / 2,
        cy = r.y + r.h / 2;
      const distX = Math.abs(token.x - cx),
        distY = Math.abs(token.y - cy);
      if (distX < r.w / 2 && distY < r.h / 2 && !tttBoard[j] && token.wasHit) {
        const speed = Math.hypot(token.vx, token.vy);
        // only snap into place when slow enough
        if (speed <= SNAP_SPEED_THRESHOLD) {
          // snap token to cell center for a brief visual, then place
          token.x = cx;
          token.y = cy;
          token.vx = 0;
          token.vy = 0;
          // clear any existing small particles so snap is visible
          particles = particles.filter((p) => p.life > 0.02);
          playSound("place");
          // short delay so player sees the snap
          setTimeout(() => {
            if (placeTokenInCell(j, token.type)) {
                // Token is effectively consumed
            }
            const res = checkWinner();
            if (res === "X" || res === "O") {
              gameOver = true;
              showOverlay((res === "X" ? "X" : "O") + " wins!");
            } else if (res === "TIE") {
              gameOver = true;
              showOverlay("Tie Game");
            } else {
              // spawn next token after a short pause if no tokens left?
              // For multiball, we might want to keep spawning or ensure at least one ball is in play.
              // Let's just spawn another one to keep the game going if count is low
              // if (tokens.length === 0) {
              //     setTimeout(() => {
              //       spawnToken();
              //     }, 300);
              // }
              // Auto-spawn loop handles this now
            }
          }, 90);
          
          // Remove token immediately from update loop so it doesn't move or collide
          tokens.splice(i, 1);
          tokenRemoved = true;
          break;
        }
      }
    }
    
    if (tokenRemoved) continue;

    // out of bounds -> remove a random mark from the losing player, then respawn
    if (token.x < -50 || token.x > WIDTH + 50) {
      // determine which side lost: token passed left -> left lost; passed right -> right lost
      if (token.x < -50) {
        // left lost a pong point -> remove a random X
        removeRandomTokenFor("X");
      } else {
        removeRandomTokenFor("O");
      }
      // remove this token
      tokens.splice(i, 1);
      
      // if no tokens left, spawn one
      // if (tokens.length === 0) {
      //     spawnToken();
      // }
      // Auto-spawn loop handles this
    }
  }

  // update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06; // small gravity
    p.life -= 0.016;
    if (p.life <= 0) particles.splice(i, 1);
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
  // tokens
  for (const token of tokens) {
    ctx.fillStyle = token.type === "X" ? "#ffdca3" : "#a8f0c3";
    ctx.beginPath();
    ctx.arc(token.x, token.y, token.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#072029";
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(token.type, token.x, token.y);
    
    // token hit flash ring
    if (token.hitFlash && token.hitFlash > 0) {
        const t = token.hitFlash;
        const max = 18;
        const r = token.r + (1 - t / 0.35) * max;
        ctx.strokeStyle = "rgba(255,255,255," + 0.6 * (t / 0.35) + ")";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(token.x, token.y, r, 0, Math.PI * 2);
        ctx.stroke();
        // decay
        token.hitFlash = Math.max(0, token.hitFlash - 0.016);
    }
  }
  
  // draw particles
  if (particles.length) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillStyle = p.color || "#fff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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
  if (e.key === "m" || e.key === "M") {
      spawnToken();
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
