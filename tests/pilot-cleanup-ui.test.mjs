import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const tools = option("--tools") || process.env.MO_BISTRO_TEST_TOOLS;
const playwright =
  option("--playwright") || process.env.MO_BISTRO_TEST_PLAYWRIGHT;

// Real Pilot components, global production CSS and CSS modules; fixture HTTP
// responses only. Never start the application server or connect to a database.
test(
  "Pilot cleanup: phone/tablet/desktop queue, details, QR, search and guest status",
  { skip: !tools || !playwright },
  async () => {
    const { build } = require(path.join(tools, "esbuild"));
    const { chromium } = require(playwright);
    const root = process.cwd();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-ui-"));
    await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';
        import Reception from './src/components/pilot/reception'; import {ConfirmationProvider} from './src/components/confirmation-provider';
        import Status from './src/components/pilot/status';
        import Login from './src/components/pilot/login';
        createRoot(document.getElementById('root')).render(<ConfirmationProvider>{location.pathname==='/login'?<Login/>:location.pathname==='/status'?<Status/>:<Reception username="Synthetic Reception"/>}</ConfirmationProvider>);`,
        loader: "tsx",
        resolveDir: root,
      },
      bundle: true,
      outfile: path.join(temp, "app.js"),
      jsx: "automatic",
      nodePaths: [path.join(root, "node_modules")],
      plugins: [
        {
          name: "fixture-navigation",
          setup(build) {
            build.onResolve({ filter: /^next\/font\/google$/ }, () => ({
              path: "google-font",
              namespace: "fixture-font",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture-font" }, () => ({
              contents:
                'export function Geist(){return {className:"",variable:""}}',
            }));
            build.onResolve({ filter: /^next\/navigation$/ }, () => ({
              path: "navigation",
              namespace: "fixture",
            }));
            build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents:
                'const router={replace(){throw Error("Unexpected navigation")},refresh(){}};export function useRouter(){return router}export function useSearchParams(){return new URLSearchParams(location.search)}',
            }));
            build.onResolve({ filter: /^@\// }, (args) => {
              const base = path.join(root, "src", args.path.slice(2));
              return {
                path: [".ts", ".tsx"]
                  .map((ext) => base + ext)
                  .find((file) => fs.existsSync(file)),
              };
            });
          },
        },
      ],
    });
    const globalCss = fs
      .readdirSync(".next/static", { recursive: true })
      .filter((file) => file.endsWith(".css"))
      .map((file) => fs.readFileSync(path.join(".next/static", file), "utf8"))
      .join("\n");
    assert.ok(globalCss.length > 0, "Production CSS is required");
    const parties = Array.from({ length: 135 }, (_, i) => ({
      id: i + 1,
      name: `Synthetic QA Guest ${i + 1}`,
      phone: "01000000001",
      party_size: 2,
      preference: i % 2 ? "outdoor" : "indoor",
      status: "waiting",
      joined_at: "2026-10-22T15:00:00Z",
      called_at: null,
      whatsapp_consent: false,
      message_status: null,
      message_error: null,
      pending_exit_kind: null,
      pending_exit_at: null,
      pending_exit_token: null,
      phone_call_taps: 0,
      informed_via: null,
    }));
    let status = "waiting";
    const mutations = [];
    const server = http.createServer((req, res) => {
      if (
        req.method === "PATCH" &&
        /^\/api\/pilot\/parties\/\d+$/.test(req.url)
      ) {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          const action = JSON.parse(body).action;
          mutations.push(action);
          const p = parties.find(
            (p) => p.id === Number(req.url.split("/").at(-1)),
          );
          if (!p || !["seated", "guest_informed"].includes(action)) {
            res.writeHead(400);
            res.end("{}");
            return;
          }
          p.status = action === "seated" ? "seated" : "called";
          if (action === "guest_informed") {
            p.called_at = new Date().toISOString();
            p.informed_via = "staff_confirmed";
          }
          res.setHeader("Content-Type", "application/json");
          res.end('{"success":true}');
        });
        return;
      }
      if (req.method !== "GET") {
        mutations.push("UNEXPECTED");
        res.writeHead(405);
        res.end();
        return;
      }
      if (req.url === "/api/pilot/queue") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(parties.filter((p) => p.status !== "seated")));
      } else if (req.url.startsWith("/api/pilot/status?")) {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            id: 1,
            status,
            position: 1,
            whatsapp_consent: false,
            whatsapp_reply_observed: false,
          }),
        );
      } else if (req.url === "/app.js") {
        res.setHeader("Content-Type", "text/javascript");
        res.end(fs.readFileSync(path.join(temp, "app.js")));
      } else if (req.url === "/app.css") {
        res.setHeader("Content-Type", "text/css");
        res.end(
          globalCss +
            "\n" +
            fs.readFileSync(path.join(temp, "app.css"), "utf8"),
        );
      } else {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><html class="h-full"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/app.css"></head><body class="min-h-full flex flex-col"><div id="root" style="display:contents"></div><script src="/app.js"></script></body></html>',
        );
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: [
          process.env.PILOT_TEST_BROWSER,
          chromium.executablePath(),
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        ].find((file) => file && fs.existsSync(file)),
      });

      const errors = [];
      for (const width of [390, 768, 1440]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
        });
        await page.clock.install({ time: new Date("2026-11-18T10:00:00Z") });
        page.on("pageerror", (e) => errors.push(e.message));
        await page.route("**/*", (route) =>
          new URL(route.request().url()).origin === origin
            ? route.continue()
            : route.abort(),
        );
        await page.goto(origin);
        await page
          .getByRole("button", { name: "Synthetic QA Guest 135", exact: true })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "Reception overflow " + width,
        );
        const shots = process.env.MO_BISTRO_UI_SCREENSHOTS || temp;
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({
          path: path.join(shots, "pilot-reception-" + width + ".png"),
        });
        await page
          .getByRole("button", {
            name: "Guest details for Synthetic QA Guest 1",
            exact: true,
          })
          .click();
        const drawer = page.getByRole("dialog", {
          name: "Synthetic QA Guest 1",
          exact: true,
        });
        await drawer.waitFor();
        await drawer.getByText("01000000001", { exact: true }).waitFor();
        await drawer
          .getByRole("button", { name: "Cancel booking", exact: true })
          .click();
        const confirmation = page.getByRole("alertdialog", {
          name: "Cancel booking?",
          exact: true,
        });
        await confirmation.waitFor();
        await confirmation
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await drawer
          .getByRole("button", { name: "Close guest details", exact: true })
          .click();
        await page
          .getByRole("button", { name: "QR Code", exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Mo Bistro", exact: true })
          .waitFor();
        await page.screenshot({
          path: path.join(shots, "pilot-qr-" + width + ".png"),
        });
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await page
          .getByRole("searchbox", {
            name: "Search a guest or phone number",
            exact: true,
          })
          .fill("Synthetic QA Guest 135");
        assert.equal(
          await page
            .getByRole("button", { name: "Synthetic QA Guest 1", exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", { name: "Synthetic QA Guest 135", exact: true })
          .waitFor();
        await page.goto(origin + "/status?token=synthetic-only");
        await page.locator(".guest-booking-facts").waitFor();
        await page.screenshot({
          path: path.join(shots, "pilot-status-" + width + ".png"),
          fullPage: true,
        });
        await page.close();
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(
        mutations,
        [],
        "Opening/cancelling dialogs must not mutate bookings",
      );
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
