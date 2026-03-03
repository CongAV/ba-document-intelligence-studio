const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

/* ================= OPENAI ================= */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ================= DATABASE ================= */

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

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      versionId INTEGER,
      provider TEXT,
      result_json TEXT,
      qualityScore INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

});

/* ================= AI REVIEW ================= */

app.post("/api/ai-review/:versionId", async (req, res) => {

  const versionId = req.params.versionId;

  db.all(
    "SELECT * FROM requirements WHERE versionId = ?",
    [versionId],
    async (err, requirements) => {

      if (!requirements || requirements.length === 0) {
        return res.json({ message: "No requirements found." });
      }

      const formatted = requirements.map(r =>
        `[${r.type}] ${r.title}\n${r.description}`
      ).join("\n\n");

      const prompt = `
You are a Senior Business Analyst.

Review the following requirements.

Return STRICT JSON:

{
  "qualityScore": number (0-100),
  "summary": "short paragraph",
  "missingAC": [],
  "edgeCases": [],
  "inconsistency": [],
  "risk": [],
  "suggestedNFR": []
}

Requirements:
${formatted}
`;

      try {

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You are a professional Business Analyst." },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
        });

        const content = response.choices[0].message.content;

        let parsed;
        try {
          parsed = JSON.parse(content);
        } catch {
          parsed = {
            qualityScore: 0,
            summary: "Failed to parse AI response.",
            raw: content
          };
        }

        db.run(
          `INSERT INTO ai_reviews (versionId, provider, result_json, qualityScore)
           VALUES (?, ?, ?, ?)`,
          [
            versionId,
            "openai",
            JSON.stringify(parsed),
            parsed.qualityScore || 0
          ]
        );

        res.json(parsed);

      } catch (error) {
        console.error(error);
        res.status(500).json({ error: "AI review failed." });
      }

    }
  );

});

/* ================= GET AI HISTORY ================= */

app.get("/api/ai-reviews/:versionId", (req, res) => {
  db.all(
    "SELECT * FROM ai_reviews WHERE versionId = ? ORDER BY createdAt DESC",
    [req.params.versionId],
    (err, rows) => res.json(rows)
  );
});

/* ================= EXPORT WORD ================= */

app.get("/api/export/:versionId", (req, res) => {

  const versionId = req.params.versionId;

  db.get("SELECT * FROM versions WHERE id = ?", [versionId], (err, version) => {
    db.get("SELECT * FROM documents WHERE id = ?", [version.documentId], (err, document) => {
      db.get("SELECT * FROM projects WHERE id = ?", [document.projectId], (err, project) => {

        db.all("SELECT * FROM requirements WHERE versionId = ?", [versionId], async (err, requirements) => {

          const doc = new Document({
            sections: [{
              children: [
                new Paragraph({ text: project.name, heading: HeadingLevel.HEADING_1 }),
                new Paragraph({ text: `${document.name} - Version ${version.versionNumber}`, heading: HeadingLevel.HEADING_2 }),
                new Paragraph(""),
                ...requirements.map(r =>
                  new Paragraph({
                    children: [new TextRun({ text: `[${r.type}] ${r.title}`, bold: true })]
                  })
                ),
                ...requirements.map(r => new Paragraph(r.description))
              ]
            }]
          });

          const buffer = await Packer.toBuffer(doc);
          res.setHeader("Content-Disposition", `attachment; filename="BA_Document_v${version.versionNumber}.docx"`);
          res.send(buffer);

        });

      });
    });
  });

});

/* ================= BASIC CRUD ================= */

app.get("/api/projects", (req, res) => {
  db.all("SELECT * FROM projects", [], (err, rows) => res.json(rows));
});

app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;
  db.run("INSERT INTO projects (name, description) VALUES (?, ?)",
    [name, description],
    function () { res.json({ id: this.lastID }); }
  );
});

app.get("/api/documents/:projectId", (req, res) => {
  db.all("SELECT * FROM documents WHERE projectId = ?",
    [req.params.projectId],
    (err, rows) => res.json(rows)
  );
});

app.post("/api/documents", (req, res) => {
  const { projectId, name, type } = req.body;
  db.run("INSERT INTO documents (projectId, name, type) VALUES (?, ?, ?)",
    [projectId, name, type],
    function () { res.json({ id: this.lastID }); }
  );
});

app.get("/api/versions/:documentId", (req, res) => {
  db.all("SELECT * FROM versions WHERE documentId = ?",
    [req.params.documentId],
    (err, rows) => res.json(rows)
  );
});

app.post("/api/versions", (req, res) => {
  const { documentId, versionNumber, changeLog } = req.body;
  db.run("INSERT INTO versions (documentId, versionNumber, changeLog) VALUES (?, ?, ?)",
    [documentId, versionNumber, changeLog],
    function () { res.json({ id: this.lastID }); }
  );
});

app.get("/api/requirements/:versionId", (req, res) => {
  db.all("SELECT * FROM requirements WHERE versionId = ?",
    [req.params.versionId],
    (err, rows) => res.json(rows)
  );
});

app.post("/api/requirements", (req, res) => {
  const { versionId, type, title, description, priority, status } = req.body;
  db.run(`INSERT INTO requirements 
          (versionId, type, title, description, priority, status) 
          VALUES (?, ?, ?, ?, ?, ?)`,
    [versionId, type, title, description, priority, status],
    function () { res.json({ id: this.lastID }); }
  );
});

/* ================= STATIC ================= */

app.use(express.static("public"));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
