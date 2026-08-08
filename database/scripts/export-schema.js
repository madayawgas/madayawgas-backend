const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const REQUIRED_POSTGRES_MAJOR = 18;

/**
 * Find pg_dump without requiring PostgreSQL
 * to be added to the system PATH.
 */
function findPgDump() {
    // Try pg_dump from PATH first.
    try {
        execFileSync("pg_dump", ["--version"], {
            stdio: "ignore",
        });

        return "pg_dump";
    } catch {
        // pg_dump is not in PATH.
    }

    // Search the default Windows PostgreSQL installation directory.
    const postgresDir = "C:\\Program Files\\PostgreSQL";

    if (!fs.existsSync(postgresDir)) {
        return null;
    }

    const versions = fs
        .readdirSync(postgresDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => /^\d+$/.test(name))
        .sort((a, b) => Number(b) - Number(a));

    for (const version of versions) {
        const pgDumpPath = path.join(
            postgresDir,
            version,
            "bin",
            "pg_dump.exe"
        );

        if (fs.existsSync(pgDumpPath)) {
            return pgDumpPath;
        }
    }

    return null;
}

/**
 * Get the major PostgreSQL version from pg_dump.
 */
function getPostgresVersion(pgDump) {
    const output = execFileSync(pgDump, ["--version"], {
        encoding: "utf8",
    }).trim();

    const match = output.match(/PostgreSQL\)?\s+(\d+)\./);

    if (!match) {
        throw new Error(
            `Could not determine PostgreSQL version.\npg_dump returned: ${output}`
        );
    }

    return Number(match[1]);
}

/**
 * Remove information from pg_dump that changes between exports
 * but does not represent a database schema change.
 */
function cleanDump(content) {
    return (
        content
            // Normalize Windows and Unix line endings.
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")

            // Remove PostgreSQL 18 random restrict tokens.
            .replace(/^\\restrict\s+\S+\n/gm, "")
            .replace(/^\\unrestrict\s+\S+\n/gm, "")

            // Remove version-specific information.
            .replace(
                /^-- Dumped from database version .*\n/gm,
                ""
            )
            .replace(
                /^-- Dumped by pg_dump version .*\n/gm,
                ""
            )

            // Collapse excessive blank lines.
            .replace(/\n{3,}/g, "\n\n")

            // Remove unnecessary whitespace at the end of lines.
            .replace(/[ \t]+$/gm, "")

            // Ensure exactly one newline at the end of the file.
            .trimEnd() + "\n"
    );
}

/**
 * Export the current database schema.
 */
function exportSchema(pgDump) {
    const snapshotsDir = path.join(
        __dirname,
        "..",
        "snapshots"
    );

    fs.mkdirSync(snapshotsDir, { recursive: true });

    const outputFile = path.join(
        snapshotsDir,
        "schema.sql"
    );

    const databaseUrl = process.env.DATABASE_URL;

    const args = [
        "--schema-only",
        "--no-owner",
        "--no-privileges",
        "--no-comments",
        "--no-publications",
        "--no-subscriptions",
        "--dbname",
        databaseUrl,
        "--file",
        outputFile,
    ];

    execFileSync(pgDump, args, {
        stdio: "inherit",
    });

    // Clean the generated dump for Git.
    const rawDump = fs.readFileSync(outputFile, "utf8");
    const cleanedDump = cleanDump(rawDump);

    fs.writeFileSync(outputFile, cleanedDump, {
        encoding: "utf8",
        newline: "\n",
    });

    return outputFile;
}

function main() {
    console.log("Exporting database schema...\n");

    if (!process.env.DATABASE_URL) {
        console.error("✗ DATABASE_URL is not defined in .env");
        process.exit(1);
    }

    const pgDump = findPgDump();

    if (!pgDump) {
        console.error("✗ pg_dump could not be found.");
        console.error(
            "Please make sure PostgreSQL 18 is installed."
        );
        process.exit(1);
    }

    const version = getPostgresVersion(pgDump);

    console.log(`PostgreSQL version detected: ${version}.x`);

    if (version !== REQUIRED_POSTGRES_MAJOR) {
        console.error(
            `✗ PostgreSQL ${REQUIRED_POSTGRES_MAJOR}.x is required.`
        );
        console.error(
            `You have PostgreSQL ${version}.x installed.`
        );
        process.exit(1);
    }

    console.log(
        `✓ PostgreSQL ${REQUIRED_POSTGRES_MAJOR}.x is supported.`
    );

    const outputFile = exportSchema(pgDump);

    console.log(`✓ Schema exported to ${outputFile}`);
}

try {
    main();
} catch (error) {
    console.error("\n✗ Schema export failed:");
    console.error(error.message);
    process.exit(1);
}