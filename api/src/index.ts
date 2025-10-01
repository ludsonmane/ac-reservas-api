import express from "express";
import cors from "cors";
import { connectMongo } from "./mongodb.js";
import reservasRouter from "./routes/reservas.js";
import 'dotenv/config';

const app = express();
const PORT = Number(process.env.PORT || 8080);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/health/db", async (req, res) => {
  try {
    await connectMongo();
    res.json({ ok: true });
  } catch (e:any) {
    res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

app.use("/reservas", reservasRouter);

app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});
