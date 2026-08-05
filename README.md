# MadayawGas Backend

## Requirements

Before setting up the project, install the following:

- Git
- nvm for Windows
- Node.js **v22.19.0** (installed through nvm)

---

## First-Time Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd madayawgas-backend
```

### 2. Install Node.js v22.19.0

> This only needs to be done once.

```bash
nvm install 22.19.0
```

### 3. Switch to the project's Node.js version

```bash
nvm use 22.19.0
```

### 4. Verify your Node.js version

```bash
node -v
```

Expected output:

```text
v22.19.0
```

### 5. Install project dependencies

```bash
npm install
```

### 6. Start the development server

```bash
npm run dev
```

---

## Daily Workflow

Whenever you work on the project:

```bash
cd madayawgas-backend

nvm use 22.19.0

npm install    # Only if package.json or package-lock.json changed

npm run dev
```

---

## Updating Your Local Repository

```bash
git pull

nvm use 22.19.0

npm install    # Only if dependencies were updated

npm run dev
```

---

## Troubleshooting

### Wrong Node.js Version

Check your current version:

```bash
node -v
```

Switch to the required version:

```bash
nvm use 22.19.0
```

---

### Node.js Version Not Installed

Install it using:

```bash
nvm install 22.19.0
```

Then switch to it:

```bash
nvm use 22.19.0
```

---

### Dependency Installation Errors

If you encounter issues after switching Node versions, remove the existing dependencies and reinstall:

```bash
rmdir /s /q node_modules
del package-lock.json

npm install
```

---

## Required Node.js Version

This project **must** use:

```text
Node.js v22.19.0
```

Using a different major version (such as Node 24) may cause dependency installation failures, particularly with native modules like `better-sqlite3`.
