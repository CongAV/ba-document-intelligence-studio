const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static("public"));

/* ==============================
   DATABASE
=================================*/

const db = new sqlite3.Database("./database.db");

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      documentType TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER,
      type TEXT,
      title TEXT,
      description TEXT,
      priority TEXT,
      status TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

});

/* ==============================
   PROJECT APIs
=================================*/

// Get all projects
app.get("/api/projects", (req, res) => {
  db.all("SELECT * FROM projects ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

// Create project
app.post("/api/projects", (req, res) => {
  const { name, documentType } = req.body;

  if (!name || !documentType) {
    return res.status(400).json({ error: "Missing name or documentType" });
  }

  db.run(
    "INSERT INTO projects (name, documentType) VALUES (?, ?)",
    [name, documentType],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ==============================
   REQUIREMENT APIs
=================================*/

// Get requirements by project
app.get("/api/requirements/:projectId", (req, res) => {
  const projectId = req.params.projectId;

  db.all(
    "SELECT * FROM requirements WHERE projectId = ? ORDER BY createdAt DESC",
    [projectId],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
});

// Create requirement
app.post("/api/requirements", (req, res) => {
  const { projectId, type, title, description, priority, status } = req.body;

  if (!projectId || !type || !title) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  db.run(
    `INSERT INTO requirements 
    (projectId, type, title, description, priority, status) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, type, title, description, priority || "Medium", status || "Draft"],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ==============================
   FRONTEND ROUTING
=================================*/

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

/* ==============================
   START SERVER
=================================*/

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
