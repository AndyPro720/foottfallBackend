const { Storage } = require("@google-cloud/storage");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const storage = new Storage();

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
  });
}

async function compressVideo(inputPath, outputPath) {
  await runCommand("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-vf",
    "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    outputPath,
  ]);
}

async function main() {
  const [bucketName, inputObjectPath, outputObjectPath] = process.argv.slice(2);

  if (!bucketName || !inputObjectPath || !outputObjectPath) {
    throw new Error("Usage: node index.js <bucket> <inputObjectPath> <outputObjectPath>");
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "video-compress-"));
  const inputPath = path.join(tempDir, "input");
  const outputPath = path.join(tempDir, "compressed.mp4");

  try {
    const bucket = storage.bucket(bucketName);
    const inputFile = bucket.file(inputObjectPath);

    console.log(`Downloading gs://${bucketName}/${inputObjectPath}`);
    await inputFile.download({ destination: inputPath });

    const beforeStat = await fs.stat(inputPath);
    console.log(`Input size: ${beforeStat.size} bytes`);

    await compressVideo(inputPath, outputPath);

    const afterStat = await fs.stat(outputPath);
    console.log(`Output size: ${afterStat.size} bytes`);

    console.log(`Uploading gs://${bucketName}/${outputObjectPath}`);
    await bucket.upload(outputPath, {
      destination: outputObjectPath,
      resumable: false,
      metadata: {
        contentType: "video/mp4",
        cacheControl: "private, max-age=31536000",
      },
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
