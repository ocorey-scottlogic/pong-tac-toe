### Caveat

This is the only human written section of the repo.
Cd into the folder and run `python -m http.server 8000`. You'll figure the rest out.

# Pong — Minimal

This is a minimal Pong implementation using HTML5 Canvas and vanilla JavaScript.

Features

- Two-player local controls (keyboard)
- AI opponent for the right paddle (toggleable)
- Touch / pointer controls for mobile/tablet
- Simple synth sound effects (no external files)
- Persistent scoreboard using `localStorage`

Controls

- Left paddle: `W` (up), `S` (down)
- Right paddle: `Arrow Up`, `Arrow Down` (disabled when AI is enabled)
- `A` to toggle AI for the right paddle (enabled by default)
- `Space` to pause/unpause
- `R` to reset scores

Touch

- Drag on the left half to control the left paddle, drag on the right half for the right paddle.

Run

- Open `index.html` in a browser, or run a simple static server from the project folder:

```bash
# from the project folder
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

Notes

- Sounds are generated with the WebAudio API; your browser may require a user gesture before audio is allowed.
- Scores and AI toggle persist across reloads.
