// Backend perantara ke Roblox Open Cloud (Assets API). Node 18+.
const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const upload = multer({ limits: { fileSize: 20 * 1024 * 1024 } });
app.use(express.static(path.join(__dirname, "public")));

const API = "https://apis.roblox.com/assets/v1";
const TYPES = {
  decal: { assetType: "Decal", mimes: { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", tga: "image/tga" } },
  audio: { assetType: "Audio", mimes: { mp3: "audio/mpeg", ogg: "audio/ogg" } },
  file:  { assetType: "Model", mimes: { rbxm: "model/x-rbxm", rbxmx: "model/x-rbxm", fbx: "model/fbx" } },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const { type, apiKey, target, ownerId, name, description } = req.body;
    const cfg = TYPES[type];
    if (!cfg) return res.status(400).json({ error: "Tipe tidak valid" });
    if (!req.file || !apiKey || !ownerId || !name)
      return res.status(400).json({ error: "File, API key, ID pemilik, dan nama wajib diisi" });

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    const mime = cfg.mimes[ext];
    if (!mime) return res.status(400).json({ error: `Ekstensi .${ext} tidak didukung untuk ${cfg.assetType}` });

    const creator = target === "group" ? { groupId: String(ownerId) } : { userId: String(ownerId) };
    const meta = {
      assetType: cfg.assetType,
      displayName: name.slice(0, 50),
      description: (description || "").slice(0, 1000),
      creationContext: { creator },
    };

    const form = new FormData();
    form.append("request", JSON.stringify(meta));
    form.append("fileContent", new Blob([req.file.buffer], { type: mime }), req.file.originalname);

    const r = await fetch(`${API}/assets`, { method: "POST", headers: { "x-api-key": apiKey }, body: form });
    const op = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: op.message || "Upload ditolak Roblox", detail: op });

    // Polling sampai operasi selesai
    const opId = op.path.split("/").pop();
    for (let i = 0; i < 30; i++) {
      await sleep(1500);
      const pr = await fetch(`${API}/operations/${opId}`, { headers: { "x-api-key": apiKey } });
      const st = await pr.json();
      if (st.done) {
        if (st.error) return res.status(400).json({ error: st.error.message || "Moderasi/validasi gagal", detail: st.error });
        const assetId = st.response.assetId;
        return res.json({ ok: true, assetId, name: meta.displayName, url: `https://create.roblox.com/store/asset/${assetId}` });
      }
    }
    res.status(202).json({ error: "Masih diproses Roblox, cek lagi nanti", operationId: opId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Jalan di http://localhost:${PORT}`));
