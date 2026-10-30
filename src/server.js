import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { Product } from "./models/Product.js";
import { Settings } from "./models/Settings.js";
import productsRouter from "./routes/products.routes.js";
import salesRouter from "./routes/sales.routes.js";
import settingsRouter from "./routes/settings.routes.js";
import { DEFAULT_SETTINGS, SEED_PRODUCTS } from "./utils/defaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, "..");

const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const allowLocalhost =
  String(process.env.ALLOW_LOCALHOST ?? "true").toLowerCase() !== "false";
const allowedOrigins = String(
  process.env.CLIENT_ORIGIN || "http://localhost:4200,http://127.0.0.1:4200",
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

function findDirWithIndexHtml(baseDir, depth = 0) {
  if (!baseDir || depth > 5 || !fs.existsSync(baseDir)) return null;
  if (fs.existsSync(path.join(baseDir, "index.html"))) return baseDir;
  if (fs.existsSync(path.join(baseDir, "browser", "index.html"))) {
    return path.join(baseDir, "browser");
  }
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name === "node_modules" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      const found = findDirWithIndexHtml(
        path.join(baseDir, entry.name),
        depth + 1,
      );
      if (found) return found;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Automatically removes Angular's `media="print" onload="this.media='all'"` critical-CSS
 * attributes from index.html so `styles-*.css` (styles.scss) always loads directly on screen
 * after every `ng build`, without any manual editing.
 */
function normalizeAngularIndexHtml(htmlContent) {
  return htmlContent
    .replace(
      /<link\s+([^>]*?)media=["']print["']\s+onload=["']this\.media=['"]all['"]["']([^>]*)>/gi,
      "<link $1$2>",
    )
    .replace(
      /<link\s+([^>]*?)onload=["']this\.media=['"]all['"]["']\s+media=["']print["']([^>]*)>/gi,
      "<link $1$2>",
    );
}

function patchIndexHtmlOnDisk(distDir) {
  if (!distDir) return;
  const indexFile = path.join(distDir, "index.html");
  if (!fs.existsSync(indexFile)) return;
  try {
    const raw = fs.readFileSync(indexFile, "utf8");
    const fixed = normalizeAngularIndexHtml(raw);
    if (fixed !== raw) {
      fs.writeFileSync(indexFile, fixed, "utf8");
      console.log(`Auto-fixed Angular stylesheet link in: ${indexFile}`);
    }
  } catch (err) {
    console.warn("Could not auto-patch index.html on disk:", err.message);
  }
}

/**
 * If ../frontend/dist exists on the machine, automatically copies the latest `ng build`
 * output into `backend/public` on server startup so `backend/public` is always up to date.
 */
function autoSyncFrontendBuild() {
  const externalCandidates = [
    process.env.FRONTEND_DIST_PATH
      ? path.resolve(backendRoot, process.env.FRONTEND_DIST_PATH)
      : null,
    path.resolve(backendRoot, "../frontend/dist"),
    path.resolve(backendRoot, "../dist"),
  ].filter(Boolean);

  for (const candidate of externalCandidates) {
    const sourceBuildDir = findDirWithIndexHtml(candidate);
    if (sourceBuildDir) {
      patchIndexHtmlOnDisk(sourceBuildDir);
      const publicDir = path.join(backendRoot, "public");
      try {
        fs.rmSync(publicDir, { recursive: true, force: true });
        fs.mkdirSync(publicDir, { recursive: true });
        fs.cpSync(sourceBuildDir, publicDir, { recursive: true });
        patchIndexHtmlOnDisk(publicDir);
        console.log(
          `Auto-synced latest Angular build from ${sourceBuildDir} -> ${publicDir}`,
        );
        return publicDir;
      } catch {
        return sourceBuildDir;
      }
    }
  }
  return null;
}

function resolveFrontendDistPath() {
  const candidates = [
    process.env.FRONTEND_DIST_PATH
      ? path.resolve(backendRoot, process.env.FRONTEND_DIST_PATH)
      : null,
    path.join(backendRoot, "public"),
    path.join(backendRoot, "dist"),
    path.resolve(backendRoot, "../frontend/dist"),
    path.resolve(backendRoot, "../dist"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = findDirWithIndexHtml(candidate);
    if (resolved) {
      patchIndexHtmlOnDisk(resolved);
      return resolved;
    }
  }
  return null;
}

app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    // Disable Helmet's restrictive CSP so Angular's styles, inline scripts, Google Fonts,
    // and Unsplash product images work after every `ng build` without manual fixes.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(
  cors((req, callback) => {
    const rawOrigin = req.header("Origin");
    if (!rawOrigin) {
      return callback(null, { origin: true });
    }
    const origin = rawOrigin.trim().replace(/\/$/, "");
    const requestHost = req.get("host");
    const isSameOrigin =
      Boolean(requestHost) &&
      (origin === `${req.protocol}://${requestHost}` ||
        origin === `http://${requestHost}` ||
        origin === `https://${requestHost}`);
    const isLocalOrigin =
      allowLocalhost &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

    if (
      allowedOrigins.includes("*") ||
      allowedOrigins.includes(origin) ||
      isSameOrigin ||
      isLocalOrigin
    ) {
      return callback(null, {
        origin: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
      });
    }
    return callback(new Error(`Origin ${rawOrigin} is not allowed by CORS.`));
  }),
);
app.use(express.json({ limit: "3mb" }));

app.get("/api/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "database-disconnected",
    database: connected ? mongoose.connection.name : "not-connected",
    timestamp: new Date().toISOString(),
  });
});
app.use("/api/products", productsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api", (_req, res) =>
  res.status(404).json({ message: "API endpoint not found." }),
);

// Automatically sync from ../frontend/dist (if present) and patch index.html at startup
autoSyncFrontendBuild();
const initialFrontendDist = resolveFrontendDistPath();
if (initialFrontendDist) {
  console.log(`Serving Angular frontend build from: ${initialFrontendDist}`);
  // Set index: false so '/' and SPA routes go through our auto-normalizing index.html handler
  app.use(express.static(initialFrontendDist, { maxAge: "1h", index: false }));
} else {
  console.log(
    "No frontend build found yet (checked ./public, ./dist, ../frontend/dist). Running in API mode until frontend is built.",
  );
}

app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
  const distPath = resolveFrontendDistPath() || initialFrontendDist;
  if (!distPath) {
    if (req.path === "/" || req.path === "/index.html") {
      return res.status(200).json({
        status: "ok",
        message:
          "Ember Grill API is running. Build the Angular frontend (ng build) and place it in backend/public or ../frontend/dist to serve the UI here.",
        healthEndpoint: "/api/health",
      });
    }
    return next();
  }

  // If the request is for a static file (.css, .js, .ico, .png, etc.), serve it directly
  const requestedAsset = path.normalize(path.join(distPath, req.path));
  if (
    req.path !== "/" &&
    req.path !== "/index.html" &&
    requestedAsset.startsWith(distPath) &&
    fs.existsSync(requestedAsset) &&
    fs.statSync(requestedAsset).isFile()
  ) {
    return res.sendFile(requestedAsset);
  }

  // Always serve index.html with Angular's print-media stylesheet trap stripped automatically
  const indexFile = path.join(distPath, "index.html");
  try {
    const rawHtml = fs.readFileSync(indexFile, "utf8");
    const cleanHtml = normalizeAngularIndexHtml(rawHtml);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.status(200).send(cleanHtml);
  } catch (err) {
    return next(err);
  }
});

app.use((err, _req, res, _next) => {
  if (res.headersSent) return;
  if (err?.name === "ValidationError") {
    return res.status(400).json({
      message: Object.values(err.errors)
        .map((item) => item.message)
        .join(" "),
    });
  }
  if (err?.code === 11000) {
    return res
      .status(409)
      .json({ message: "A record with the same unique value already exists." });
  }
  if (err?.message?.includes("not allowed by CORS")) {
    return res
      .status(403)
      .json({
        message:
          "This frontend origin is not allowed. Check CLIENT_ORIGIN in the backend .env file.",
      });
  }
  console.error("API error:", err);
  const status =
    Number(err?.statusCode || err?.status) >= 400 &&
    Number(err?.statusCode || err?.status) < 500
      ? Number(err.statusCode || err.status)
      : 500;
  res
    .status(status)
    .json({
      message:
        status === 500
          ? "An unexpected server error occurred."
          : err.message || "Request failed.",
    });
});

async function initializeData() {
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    await Product.insertMany(SEED_PRODUCTS);
    console.log(`Seeded ${SEED_PRODUCTS.length} starter menu products.`);
  }
  await Settings.findByIdAndUpdate(
    "default",
    { $setOnInsert: DEFAULT_SETTINGS },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );
}

let server;
try {
  await connectDatabase();
  await initializeData();
  server = app.listen(port, host, () => {
    console.log(`Ember Grill Server listening on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
  });
} catch (error) {
  console.error("Could not start the API:", error.message);
  console.error(
    "Check your .env file, Atlas database user and Atlas Network Access IP list.",
  );
  process.exitCode = 1;
  await disconnectDatabase().catch(() => {});
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down Ember Grill API...`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase().catch((error) =>
    console.error("Database shutdown warning:", error.message),
  );
  process.exit(0);
}
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
