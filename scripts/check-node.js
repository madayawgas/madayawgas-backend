const REQUIRED_MAJOR = 22;
const REQUIRED_VERSION = "22.19.0";

const currentVersion = process.versions.node;
const currentMajor = parseInt(currentVersion.split(".")[0], 10);

if (currentMajor !== REQUIRED_MAJOR) {
  console.error("");
  console.error("❌ Incorrect Node.js version.");
  console.error("");
  console.error(`Required: v${REQUIRED_VERSION}`);
  console.error(`Current : v${currentVersion}`);
  console.error("");
  console.error(
    "Please switch to Node.js 22.19.0 before installing dependencies.",
  );
  console.error("");

  process.exit(1);
}

console.log(`✔ Using Node.js v${currentVersion}`);
