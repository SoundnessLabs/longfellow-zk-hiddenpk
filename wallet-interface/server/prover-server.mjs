#!/usr/bin/env node
/**
 * Local proving server for the Hidden-PK wallet frontend.
 *
 *   POST /api/prove  { pkX, pkY, r, s, msgHash }   (all 0x + 64 hex)
 *     -> { proofHex, proofSizeBytes, proveMs, verifyMs, ethAddr, setupMs: null }
 *
 *   GET  /api/health -> { ok: true, binExists: bool }
 *
 * Shells out to the native C++ CLI:
 *   hidden_pk_prove --pkX .. --pkY .. --r .. --s .. --msg ..
 *
 * Build the binary first:
 *   mkdir -p <repo-root>/build && cd <repo-root>/build
 *   cmake .. -DCMAKE_BUILD_TYPE=Release
 *   make -j$(nproc) hidden_pk_prove
 *
 * The binary is expected at:
 *   <repo-root>/build/lib/circuits/hidden_pk/hidden_pk_prove
 * Override with env var HIDDEN_PK_PROVE_BIN.
 */

import express from "express";
import cors from "cors";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "..", "..");

// cmake is run against lib/, so the binary lands at build/circuits/hidden_pk/hidden_pk_prove
const DEFAULT_BIN = join(
  REPO_ROOT, "build", "circuits", "hidden_pk", "hidden_pk_prove"
);
const BIN = process.env.HIDDEN_PK_PROVE_BIN || DEFAULT_BIN;

// ---------------------------------------------------------------------------

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
function mustHex32(name, v) {
  if (!HEX32.test(v)) throw new Error(`${name} must be 0x + 64 hex chars`);
  return v.toLowerCase();
}

// ---------------------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, binExists: existsSync(BIN) });
});

app.post("/api/prove", (req, res) => {
  try {
    const pkX = mustHex32("pkX", req.body.pkX);
    const pkY = mustHex32("pkY", req.body.pkY);
    const r   = mustHex32("r",   req.body.r);
    const s   = mustHex32("s",   req.body.s);
    const msg = mustHex32("msgHash", req.body.msgHash);

    if (!existsSync(BIN)) {
      throw new Error(
        `hidden_pk_prove binary not found at:\n  ${BIN}\n\n` +
        `Build it with:\n` +
        `  mkdir -p ${REPO_ROOT}/build && cd ${REPO_ROOT}/build\n` +
        `  cmake ../lib -DCMAKE_BUILD_TYPE=Release\n` +
        `  make -j$(sysctl -n hw.ncpu) hidden_pk_prove`
      );
    }

    const res_ = spawnSync(BIN, [
      "--pkX", pkX,
      "--pkY", pkY,
      "--r",   r,
      "--s",   s,
      "--msg", msg,
    ], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,  // 32 MB — proofs can be large
      timeout: 120_000,              // 2 min cap
    });

    if (res_.status !== 0) {
      const stderr = (res_.stderr || "").trim();
      // The binary writes {"error":"..."} to stderr on failure.
      try {
        const parsed = JSON.parse(stderr);
        throw new Error(parsed.error || stderr);
      } catch (_) {
        throw new Error(stderr || `hidden_pk_prove exited ${res_.status}`);
      }
    }

    const out = (res_.stdout || "").trim();
    let result;
    try {
      result = JSON.parse(out);
    } catch (_) {
      throw new Error(`could not parse prover output: ${out.slice(0, 200)}`);
    }

    // setupMs is not applicable for Ligero (transparent setup).
    res.json({
      proofHex:       result.proofHex,
      proofSizeBytes: result.proofSizeBytes,
      setupMs:        null,
      proveMs:        result.proveMs,
      verifyMs:       result.verifyMs,
      ethAddr:        result.ethAddr,
    });
  } catch (e) {
    console.error("[prove]", e.message);
    res.status(500).send(e.message || String(e));
  }
});

// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`hidden-pk prover server → http://localhost:${PORT}`);
  console.log(`  repo root: ${REPO_ROOT}`);
  console.log(`  binary:    ${BIN}  (${existsSync(BIN) ? "found" : "MISSING — build first"})`);
});
