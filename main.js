const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreLeftEl = document.getElementById("score-left");
const scoreRightEl = document.getElementById("score-right");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const paddle = (x) => ({ x, y: HEIGHT / 2 - 50, w: 12, h: 100, speed: 6 });
const left = paddle(20);
const right = paddle(WIDTH - 20 - 12);

const ball = { x: WIDTH / 2, y: HEIGHT / 2, r: 8, speed: 5, velX: 5, velY: 3 };
let scoreLeft = 0,
  scoreRight = 0;
let keys = {};
let running = true;

// Features
let aiEnabled = true; // AI controls right paddle by default
const audioCtx =
  window.AudioContext || window.webkitAudioContext
    ? new (window.AudioContext || window.webkitAudioContext)()
    : null;

// Load persistent scores and settings
function loadState() {
  const lsLeft = localStorage.getItem("pong_score_left");
  const lsRight = localStorage.getItem("pong_score_right");
  const lsAI = localStorage.getItem("pong_ai_enabled");
  if (lsLeft !== null) {
    scoreLeft = parseInt(lsLeft, 10) || 0;
    scoreLeftEl.textContent = scoreLeft;
  }
  if (lsRight !== null) {
    scoreRight = parseInt(lsRight, 10) || 0;
    scoreRightEl.textContent = scoreRight;
  }
  if (lsAI !== null) {
    aiEnabled = lsAI === "1";
  }
}
function saveScores() {
  localStorage.setItem("pong_score_left", String(scoreLeft));
  localStorage.setItem("pong_score_right", String(scoreRight));
}
function saveSettings() {
  localStorage.setItem("pong_ai_enabled", aiEnabled ? "1" : "0");
}

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  if (type === "paddle") o.frequency.value = 640;
  else if (type === "wall") o.frequency.value = 220;
  else if (type === "score") o.frequency.value = 120;
  else o.frequency.value = 440;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(now);
  o.stop(now + 0.14);
}

function resetBall(direction) {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  const angle = (Math.random() * Math.PI) / 4 - Math.PI / 8;
  const sign = direction === "left" ? -1 : 1;
  ball.speed = 5;
  ball.velX = sign * ball.speed * Math.cos(angle);
  ball.velY = ball.speed * Math.sin(angle);
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

// Pointer/touch controls
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
  if (x < WIDTH / 2) {
    left.y = clamp(y - left.h / 2, 0, HEIGHT - left.h);
  } else {
    right.y = clamp(y - right.h / 2, 0, HEIGHT - right.h);
  }
}

function update() {
  if (!running) return;
  // input
  if (keys["w"]) left.y -= left.speed;
  if (keys["s"]) left.y += left.speed;
  if (!aiEnabled) {
    if (keys["ArrowUp"]) right.y -= right.speed;
    if (keys["ArrowDown"]) right.y += right.speed;
  }
  left.y = clamp(left.y, 0, HEIGHT - left.h);
  right.y = clamp(right.y, 0, HEIGHT - right.h);

  // simple AI for right paddle
  if (aiEnabled) {
    const target = ball.y - right.h / 2;
    const diff = target - right.y;
    const maxMove = right.speed * 0.9;
    right.y += Math.sign(diff) * Math.min(Math.abs(diff), maxMove);
    right.y = clamp(right.y, 0, HEIGHT - right.h);
  }

  // move ball
  ball.x += ball.velX;
  ball.y += ball.velY;

  // top/bottom collision
  if (ball.y - ball.r <= 0 || ball.y + ball.r >= HEIGHT) {
    ball.velY *= -1;
    ball.y = clamp(ball.y, ball.r, HEIGHT - ball.r);
    playSound("wall");
  }

  // paddle collisions
  // left
  if (ball.x - ball.r <= left.x + left.w && ball.x - ball.r > left.x) {
    if (ball.y >= left.y && ball.y <= left.y + left.h) {
      const collidePoint = (ball.y - (left.y + left.h / 2)) / (left.h / 2);
      const angle = collidePoint * (Math.PI / 4);
      const speed = Math.min(12, ball.speed + 0.5);
      ball.speed = speed;
      ball.velX = Math.abs(speed * Math.cos(angle));
      ball.velY = speed * Math.sin(angle);
      playSound("paddle");
    }
  }

  // right
  if (ball.x + ball.r >= right.x && ball.x + ball.r < right.x + right.w) {
    if (ball.y >= right.y && ball.y <= right.y + right.h) {
      const collidePoint = (ball.y - (right.y + right.h / 2)) / (right.h / 2);
      const angle = collidePoint * (Math.PI / 4);
      const speed = Math.min(12, ball.speed + 0.5);
      ball.speed = speed;
      ball.velX = -Math.abs(speed * Math.cos(angle));
      ball.velY = speed * Math.sin(angle);
      playSound("paddle");
    }
  }

  // scoring
  if (ball.x - ball.r <= 0) {
    scoreRight++;
    scoreRightEl.textContent = scoreRight;
    saveScores();
    playSound("score");
    resetBall("right");
  } else if (ball.x + ball.r >= WIDTH) {
    scoreLeft++;
    scoreLeftEl.textContent = scoreLeft;
    saveScores();
    playSound("score");
    resetBall("left");
  }
}

function draw() {
  // clear
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  // middle line
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 10; y < HEIGHT; y += 28) {
    ctx.fillRect(WIDTH / 2 - 1, y, 2, 14);
  }

  // paddles
  drawRect(left.x, left.y, left.w, left.h, "#e6eef8");
  drawRect(right.x, right.y, right.w, right.h, "#e6eef8");
  // ball
  drawCircle(ball.x, ball.y, ball.r, "#ffdca3");
}

function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// input handlers
window.addEventListener("keydown", (e) => {
  if (e.key === " ") {
    running = !running;
  }
  if (e.key === "r" || e.key === "R") {
    scoreLeft = scoreRight = 0;
    scoreLeftEl.textContent = 0;
    scoreRightEl.textContent = 0;
    saveScores();
    resetBall();
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

// start
loadState();
resetBall(Math.random() > 0.5 ? "left" : "right");
loop();
