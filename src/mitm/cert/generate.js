"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== "default") __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCert = generateCert;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dataPaths_1 = require("@/lib/dataPaths");
const TARGET_HOST = "daily-cloudcode-pa.googleapis.com";
/**
 * Generate self-signed SSL certificate using selfsigned (pure JS, no openssl needed)
 */
async function generateCert() {
  const certDir = path_1.default.join((0, dataPaths_1.resolveDataDir)(), "mitm");
  const keyPath = path_1.default.join(certDir, "server.key");
  const certPath = path_1.default.join(certDir, "server.crt");
  if (fs_1.default.existsSync(keyPath) && fs_1.default.existsSync(certPath)) {
    console.log("✅ SSL certificate already exists");
    return { key: keyPath, cert: certPath };
  }
  if (!fs_1.default.existsSync(certDir)) {
    fs_1.default.mkdirSync(certDir, { recursive: true });
  }
  // Dynamic import for optional dependency
  const { default: selfsigned } = await Promise.resolve().then(() =>
    __importStar(require("selfsigned"))
  );
  const attrs = [{ name: "commonName", value: TARGET_HOST }];
  const notAfter = new Date();
  notAfter.setFullYear(notAfter.getFullYear() + 1);
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    algorithm: "sha256",
    notAfterDate: notAfter,
    extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: TARGET_HOST }] }],
  });
  fs_1.default.writeFileSync(keyPath, pems.private);
  fs_1.default.writeFileSync(certPath, pems.cert);
  console.log(`✅ Generated SSL certificate for ${TARGET_HOST}`);
  return { key: keyPath, cert: certPath };
}
