# Prerequisites

Before cloning the project, install the following:

- Git
- nvm: https://www.nvmnode.com/guide/download.html

---

# Setup

## 1. Clone the repository

```bash
git clone <repository-url>
cd madayawgas-backend
```

## 2. Check your current Node.js version

```bash
node -v
```

If the output is:

```text
v22.19.0
```

you can skip to **Step 5**.

Otherwise, continue to Step 3.

---

## 3. Install Node.js 22.19.0

```bash
nvm install 22.19.0
```

> This only needs to be done once.

---

## 4. Switch to Node.js 22.19.0

```bash
nvm use 22.19.0
```

Verify:

```bash
node -v
```

Expected:

```text
v22.19.0
```

---

## 5. Install project dependencies

```bash
npm install
```

---

## 6. Start the development server

```bash
npm run dev
```
