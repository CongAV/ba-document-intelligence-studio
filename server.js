const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
app.use(express.json());

/* ==============================
   DATABASE
=================================*/

const db = new sqlite3.Database("./database.db");

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      projectId INTEGER,
      name TEXT,
      type TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId INTEGER,
      versionNumber TEXT,
      changeLog TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      versionId INTEGER,
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

app.get("/api/projects", (req, res) => {
  db.all("SELECT * FROM projects ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;

  if (!name) return res.status(400).json({ error: "Missing name" });

  db.run(
    "INSERT INTO projects (name, description) VALUES (?, ?)",
    [name, description || ""],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ==============================
   DOCUMENT APIs
=================================*/

app.get("/api/documents/:projectId", (req, res) => {
  db.all(
    "SELECT * FROM documents WHERE projectId = ?",
    [req.params.projectId],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
});

app.post("/api/documents", (req, res) => {
  const { projectId, name, type } = req.body;

  db.run(
    "INSERT INTO documents (projectId, name, type) VALUES (?, ?, ?)",
    [projectId, name, type],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ==============================
   VERSION APIs
=================================*/

app.get("/api/versions/:documentId", (req, res) => {
  db.all(
    "SELECT * FROM versions WHERE documentId = ?",
    [req.params.documentId],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
});

app.post("/api/versions", (req, res) => {
  const { documentId, versionNumber, changeLog } = req.body;

  db.run(
    "INSERT INTO versions (documentId, versionNumber, changeLog) VALUES (?, ?, ?)",
    [documentId, versionNumber, changeLog],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ==============================
   REQUIREMENT APIs
=================================*/

app.get("/api/requirements/:versionId", (req, res) => {
  db.all(
    "SELECT * FROM requirements WHERE versionId = ?",
    [req.params.versionId],
    (err, rows) => {
      if (err) return res.status(500).json(err);
      res.json(rows);
    }
  );
});

app.post("/api/requirements", (req, res) => {
  const { versionId, type, title, description, priority, status } = req.body;

  db.run(
    `INSERT INTO requirements 
    (versionId, type, title, description, priority, status) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [versionId, type, title, description, priority, status],
    function (err) {
      if (err) return res.status(500).json(err);
      res.json({ id: this.lastID });
    }
  );
});

/* ==============================
   STATIC
=================================*/

app.use(express.static("public"));

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
