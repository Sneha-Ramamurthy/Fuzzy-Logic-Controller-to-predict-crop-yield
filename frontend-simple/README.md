# Simple frontend (no Node.js)

Plain HTML/CSS/JS. Needs only Python.

1. Start the backend:  `cd backend && uvicorn app.main:app --reload --port 8000`
2. Serve this folder:  `cd frontend-simple && python -m http.server 5173`
3. Open http://localhost:5173  (use `localhost`, not `127.0.0.1` or a double-clicked file: the API only allows that origin)
