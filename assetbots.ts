#!/usr/bin/env npx tsx

import { program } from "commander";

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const API_BASE = "https://api.assetbots.com/v1";
const CONFIG_PATH = join(homedir(), ".config", "assetbots", "credentials.json");

function getApiKey(): string {
  // Check env var first
  if (process.env.ASSETBOTS_API_KEY) {
    return process.env.ASSETBOTS_API_KEY;
  }
  
  // Fall back to config file
  if (existsSync(CONFIG_PATH)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
      if (config.apiKey) {
        return config.apiKey;
      }
    } catch {
      // ignore parse errors
    }
  }
  
  console.error("Error: ASSETBOTS_API_KEY not set and no config found at", CONFIG_PATH);
  process.exit(1);
}

async function apiRequest(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    params?: Record<string, string | number | undefined>;
  } = {}
): Promise<unknown> {
  const { method = "GET", body, params } = options;
  
  let url = `${API_BASE}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      "X-Api-Key": getApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`API Error ${response.status}: ${errorText}`);
    process.exit(1);
  }

  return response.json();
}

function formatTable(data: Record<string, unknown>[], columns?: string[]): void {
  if (!data.length) {
    console.log("No results found.");
    return;
  }

  const cols = columns || Object.keys(data[0]);
  
  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const col of cols) {
    widths[col] = Math.max(
      col.length,
      ...data.map((row) => String(row[col] ?? "").length)
    );
  }

  // Print header
  console.log(cols.map((c) => c.padEnd(widths[c])).join("  "));
  console.log(cols.map((c) => "-".repeat(widths[c])).join("  "));

  // Print rows
  for (const row of data) {
    console.log(cols.map((c) => String(row[c] ?? "").padEnd(widths[c])).join("  "));
  }
}

interface AssetData {
  id?: string;
  tag?: string;
  description?: string;
  category?: { name?: string };
  checkout?: { person?: { name?: string }; location?: { name?: string } };
  labels?: { name: string }[];
  archived?: boolean;
  createDate?: string;
  updateDate?: string;
}

interface PersonData {
  id?: string;
  name?: string;
  email?: string;
  department?: string;
  title?: string;
}

interface LocationData {
  id?: string;
  name?: string;
  address?: { line1?: string; city?: string; state?: string };
}

interface CheckoutData {
  id?: string;
  assets?: { tag?: string }[];
  person?: { name?: string };
  location?: { name?: string };
  createDate?: string;
}

interface RepairData {
  id?: string;
  asset?: { tag?: string };
  description?: string;
  createDate?: string;
}

interface ApiResponse {
  data?: unknown[];
  next?: { uri?: string };
}

// ===== ASSETS =====

program
  .command("assets")
  .description("List all assets")
  .option("-l, --limit <number>", "Maximum number of results", "100")
  .option("-o, --offset <number>", "Offset to start at", "0")
  .option("-f, --filter <filter>", "OData filter expression")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/assets", {
      params: {
        limit: opts.limit,
        offset: opts.offset,
        $filter: opts.filter,
      },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const assets = (result.data || []) as AssetData[];
    const formatted = assets.map((a) => ({
      id: a.id,
      tag: a.tag || "-",
      description: a.description || "-",
      category: a.category?.name || "-",
      assignedTo:
        a.checkout?.person?.name || a.checkout?.location?.name || "-",
      labels: a.labels?.map((l) => l.name).join(", ") || "-",
    }));

    formatTable(formatted, ["id", "tag", "description", "category", "assignedTo", "labels"]);
  });

program
  .command("asset <id>")
  .description("Get a specific asset by ID or tag")
  .option("--json", "Output raw JSON")
  .action(async (id: string, opts) => {
    // Try to find by ID first, then by tag
    let result: ApiResponse;
    try {
      result = (await apiRequest(`/assets/${id}`)) as ApiResponse;
    } catch {
      // If not found by ID, search by tag
      result = (await apiRequest("/assets", {
        params: { $filter: `tag eq ${id}`, limit: 1 },
      })) as ApiResponse;
    }

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const assets = (result.data || []) as AssetData[];
    if (!assets.length) {
      console.log("Asset not found.");
      return;
    }

    const a = assets[0];
    console.log(`ID:          ${a.id}`);
    console.log(`Tag:         ${a.tag || "-"}`);
    console.log(`Description: ${a.description || "-"}`);
    console.log(`Category:    ${a.category?.name || "-"}`);
    console.log(`Assigned To: ${a.checkout?.person?.name || a.checkout?.location?.name || "-"}`);
    console.log(`Labels:      ${a.labels?.map((l) => l.name).join(", ") || "-"}`);
    console.log(`Archived:    ${a.archived ? "Yes" : "No"}`);
    console.log(`Created:     ${a.createDate || "-"}`);
    console.log(`Updated:     ${a.updateDate || "-"}`);
  });

program
  .command("search <query>")
  .description("Search assets by tag or description")
  .option("-l, --limit <number>", "Maximum number of results", "50")
  .option("--json", "Output raw JSON")
  .action(async (query: string, opts) => {
    // Search by tag first
    const tagResult = (await apiRequest("/assets", {
      params: { $filter: `tag eq ${query}`, limit: opts.limit },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(tagResult, null, 2));
      return;
    }

    const assets = (tagResult.data || []) as AssetData[];
    if (!assets.length) {
      console.log(`No assets found matching "${query}"`);
      return;
    }

    const formatted = assets.map((a) => ({
      id: a.id,
      tag: a.tag || "-",
      description: a.description || "-",
      category: a.category?.name || "-",
      assignedTo:
        a.checkout?.person?.name || a.checkout?.location?.name || "-",
    }));

    formatTable(formatted, ["id", "tag", "description", "category", "assignedTo"]);
  });

// ===== PEOPLE =====

program
  .command("people")
  .description("List all people")
  .option("-l, --limit <number>", "Maximum number of results", "100")
  .option("-o, --offset <number>", "Offset to start at", "0")
  .option("-f, --filter <filter>", "OData filter expression")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/people", {
      params: {
        limit: opts.limit,
        offset: opts.offset,
        $filter: opts.filter,
      },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const people = (result.data || []) as PersonData[];
    const formatted = people.map((p) => ({
      id: p.id,
      name: p.name || "-",
      email: p.email || "-",
      department: p.department || "-",
      title: p.title || "-",
    }));

    formatTable(formatted, ["id", "name", "email", "department", "title"]);
  });

program
  .command("person <id>")
  .description("Get a specific person by ID")
  .option("--json", "Output raw JSON")
  .option("--assets", "Also list assets assigned to this person")
  .action(async (id: string, opts) => {
    const result = (await apiRequest(`/people/${id}`)) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const people = (result.data || []) as PersonData[];
    if (!people.length) {
      console.log("Person not found.");
      return;
    }

    const p = people[0];
    console.log(`ID:         ${p.id}`);
    console.log(`Name:       ${p.name || "-"}`);
    console.log(`Email:      ${p.email || "-"}`);
    console.log(`Department: ${p.department || "-"}`);
    console.log(`Title:      ${p.title || "-"}`);

    if (opts.assets) {
      console.log("\nAssigned Assets:");
      const assetsResult = (await apiRequest(`/people/${id}/assets`)) as ApiResponse;
      const assets = (assetsResult.data || []) as AssetData[];
      if (assets.length) {
        const formatted = assets.map((a) => ({
          tag: a.tag || "-",
          description: a.description || "-",
        }));
        formatTable(formatted, ["tag", "description"]);
      } else {
        console.log("  No assets assigned.");
      }
    }
  });

// ===== LOCATIONS =====

program
  .command("locations")
  .description("List all locations")
  .option("-l, --limit <number>", "Maximum number of results", "100")
  .option("-o, --offset <number>", "Offset to start at", "0")
  .option("-f, --filter <filter>", "OData filter expression")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/locations", {
      params: {
        limit: opts.limit,
        offset: opts.offset,
        $filter: opts.filter,
      },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const locations = (result.data || []) as LocationData[];
    const formatted = locations.map((l) => ({
      id: l.id,
      name: l.name || "-",
      address: l.address?.line1 || "-",
      city: l.address?.city || "-",
      state: l.address?.state || "-",
    }));

    formatTable(formatted, ["id", "name", "address", "city", "state"]);
  });

program
  .command("location <id>")
  .description("Get a specific location by ID")
  .option("--json", "Output raw JSON")
  .option("--assets", "Also list assets at this location")
  .action(async (id: string, opts) => {
    const result = (await apiRequest(`/locations/${id}`)) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const locations = (result.data || []) as LocationData[];
    if (!locations.length) {
      console.log("Location not found.");
      return;
    }

    const l = locations[0];
    console.log(`ID:      ${l.id}`);
    console.log(`Name:    ${l.name || "-"}`);
    console.log(`Address: ${l.address?.line1 || "-"}`);
    console.log(`City:    ${l.address?.city || "-"}`);
    console.log(`State:   ${l.address?.state || "-"}`);

    if (opts.assets) {
      console.log("\nAssets at this location:");
      const assetsResult = (await apiRequest(`/locations/${id}/assets`)) as ApiResponse;
      const assets = (assetsResult.data || []) as AssetData[];
      if (assets.length) {
        const formatted = assets.map((a) => ({
          tag: a.tag || "-",
          description: a.description || "-",
        }));
        formatTable(formatted, ["tag", "description"]);
      } else {
        console.log("  No assets at this location.");
      }
    }
  });

// ===== CHECKOUTS =====

program
  .command("checkout")
  .description("Checkout assets to a person or location")
  .requiredOption("-a, --assets <ids...>", "Asset IDs to checkout")
  .option("-p, --person <id>", "Person ID to checkout to")
  .option("-l, --location <id>", "Location ID to checkout to")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    if (!opts.person && !opts.location) {
      console.error("Error: Must specify either --person or --location");
      process.exit(1);
    }

    const body: { assetIds: string[]; personId?: string; locationId?: string } = {
      assetIds: opts.assets,
    };
    if (opts.person) body.personId = opts.person;
    if (opts.location) body.locationId = opts.location;

    const result = await apiRequest("/checkouts", {
      method: "POST",
      body,
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("Checkout created successfully!");
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("checkin")
  .description("Check in assets")
  .requiredOption("-a, --assets <ids...>", "Asset IDs to check in")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = await apiRequest("/check-ins", {
      method: "POST",
      body: { assetIds: opts.assets },
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("Check-in successful!");
    console.log(JSON.stringify(result, null, 2));
  });

// ===== REPAIRS =====

program
  .command("repairs")
  .description("List repairs")
  .option("-l, --limit <number>", "Maximum number of results", "100")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/repairs", {
      params: { limit: opts.limit },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const repairs = (result.data || []) as RepairData[];
    const formatted = repairs.map((r) => ({
      id: r.id,
      asset: r.asset?.tag || "-",
      description: r.description || "-",
      created: r.createDate || "-",
    }));

    formatTable(formatted, ["id", "asset", "description", "created"]);
  });

program
  .command("repair <assetId>")
  .description("Create a repair for an asset")
  .option("-d, --description <text>", "Repair description")
  .option("--json", "Output raw JSON")
  .action(async (assetId: string, opts) => {
    const result = await apiRequest("/repairs", {
      method: "POST",
      body: {
        assetId,
        description: opts.description,
      },
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("Repair created successfully!");
    console.log(JSON.stringify(result, null, 2));
  });

// ===== DATABASES =====

program
  .command("databases")
  .description("List available databases")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/databases")) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(JSON.stringify(result, null, 2));
  });

// ===== NOTES =====

program
  .command("notes")
  .description("List notes")
  .option("-l, --limit <number>", "Maximum number of results", "100")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/notes", {
      params: { limit: opts.limit },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("note <assetId>")
  .description("Add a note to an asset")
  .requiredOption("-t, --text <text>", "Note text")
  .option("--json", "Output raw JSON")
  .action(async (assetId: string, opts) => {
    const result = await apiRequest("/notes", {
      method: "POST",
      body: {
        assetId,
        text: opts.text,
      },
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log("Note added successfully!");
    console.log(JSON.stringify(result, null, 2));
  });

// ===== LABELS =====

interface LabelData {
  id?: string;
  name?: string;
  color?: string;
  description?: string;
}

program
  .command("labels")
  .description("List all available labels")
  .option("-l, --limit <number>", "Maximum number of results", "100")
  .option("-o, --offset <number>", "Offset to start at", "0")
  .option("--json", "Output raw JSON")
  .action(async (opts) => {
    const result = (await apiRequest("/labels", {
      params: {
        limit: opts.limit,
        offset: opts.offset,
      },
    })) as ApiResponse;

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const labels = (result.data || []) as LabelData[];
    if (!labels.length) {
      console.log("No labels found.");
      return;
    }

    const formatted = labels.map((l) => ({
      id: l.id || "-",
      name: l.name || "-",
      color: l.color || "-",
      description: l.description || "-",
    }));

    formatTable(formatted, ["id", "name", "color", "description"]);
  });

program
  .command("label-add")
  .description("Add a label to an asset")
  .argument("<assetId>", "Asset ID or tag")
  .argument("<labelName>", "Label name to add")
  .option("--json", "Output raw JSON")
  .action(async (assetId: string, labelName: string, opts) => {
    const result = await apiRequest(`/assets/${assetId}/labels`, {
      method: "POST",
      body: { name: labelName },
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Label "${labelName}" added to asset ${assetId} successfully!`);
  });

program
  .command("label-remove")
  .description("Remove a label from an asset")
  .argument("<assetId>", "Asset ID or tag")
  .argument("<labelName>", "Label name to remove")
  .option("--json", "Output raw JSON")
  .action(async (assetId: string, labelName: string, opts) => {
    const result = await apiRequest(`/assets/${assetId}/labels/${encodeURIComponent(labelName)}`, {
      method: "DELETE",
    });

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`Label "${labelName}" removed from asset ${assetId} successfully!`);
  });

program.parse();
