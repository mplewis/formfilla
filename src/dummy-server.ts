import express from "express";
import path from "path";
import bodyParser from "body-parser";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "../resources/form.html"));
});

app.post("/", (req, res) => {
  console.log("Form submission:", req.body);
  res.status(201).send();
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
