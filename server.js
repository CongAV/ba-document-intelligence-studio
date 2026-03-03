const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx");

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
   EXPORT WORD
=================================*/

app.get("/api/export/:versionId", (req, res) => {

  const versionId = req.params.versionId;

  db.get("SELECT * FROM versions WHERE id = ?", [versionId], (err, version) => {
    if (err || !version) return res.status(404).send("Version not found");

    db.get("SELECT * FROM documents WHERE id = ?", [version.documentId], (err, document) => {

      db.get("SELECT * FROM projects WHERE id = ?", [document.projectId], (err, project) => {

        db.all("SELECT * FROM requirements WHERE versionId = ?", [versionId], async (err, requirements) => {

          const doc = new Document({
            sections: [{
              children: [

                new Paragraph({
                  text: project.name,
                  heading: HeadingLevel.HEADING_1
                }),

                new Paragraph({
                  text: `${document.name} - Version ${version.versionNumber}`,
                  heading: HeadingLevel.HEADING_2
                }),

                new Paragraph({
                  text: "Change Log:",
                  heading: HeadingLevel.HEADING_3
                }),

                new Paragraph(version.changeLog || ""),

                new Paragraph(""),

                new Paragraph({
                  text: "Requirements",
                  heading: HeadingLevel.HEADING_2
                }),

                ...requirements.map(r =>
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: `[${r.type}] ${r.title} (${r.priority})`,
                        bold: true
                      })
                    ]
                  })
                ),

                ...requirements.map(r =>
                  new Paragraph(r.description)
                )

              ]
            }]
          });

          const buffer = await Packer.toBuffer(doc);

          const fileName = `${project.name}_${document.type}_v${version.versionNumber}.docx`;

          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
          );

          res.send(buffer);

        });
      });
    });
  });
});

/* ==============================
   PROJECT / DOC / VERSION / REQ APIs
=================================*/

app.get("/api/projects", (req, res) => {
  db.all("SELECT * FROM projects ORDER BY createdAt DESC", [], (err, rows) => {
    res.json(rows);
  });
});

app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;
  db.run(
    "INSERT INTO projects (name, description) VALUES (?, ?)",
    [name, description],
    function () {
      res.json({ id: this.lastID });
    }
  );
});

app.get("/api/documents/:projectId", (req, res) => {
  db.all("SELECT * FROM documents WHERE projectId = ?", [req.params.projectId], (err, rows) => {
    res.json(rows);
  });
});

app.post("/api/documents", (req, res) => {
  const { projectId, name, type } = req.body;
  db.run(
    "INSERT INTO documents (projectId, name, type) VALUES (?, ?, ?)",
    [projectId, name, type],
    function () {
      res.json({ id: this.lastID });
    }
  );
});

app.get("/api/versions/:documentId", (req, res) => {
  db.all("SELECT * FROM versions WHERE documentId = ?", [req.params.documentId], (err, rows) => {
    res.json(rows);
  });
});

app.post("/api/versions", (req, res) => {
  const { documentId, versionNumber, changeLog } = req.body;
  db.run(
    "INSERT INTO versions (documentId, versionNumber, changeLog) VALUES (?, ?, ?)",
    [documentId, versionNumber, changeLog],
    function () {
      res.json({ id: this.lastID });
    }
  );
});

app.get("/api/requirements/:versionId", (req, res) => {
  db.all("SELECT * FROM requirements WHERE versionId = ?", [req.params.versionId], (err, rows) => {
    res.json(rows);
  });
});

app.post("/api/requirements", (req, res) => {
  const { versionId, type, title, description, priority, status } = req.body;
  db.run(
    `INSERT INTO requirements 
    (versionId, type, title, description, priority, status) 
    VALUES (?, ?, ?, ?, ?, ?)`,
    [versionId, type, title, description, priority, status],
    function () {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
