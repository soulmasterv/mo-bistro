import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";
const dependency = createRequire(import.meta.url);
const tools = process.env.MO_BISTRO_TEST_TOOLS;
const playwrightPath = process.env.MO_BISTRO_TEST_PLAYWRIGHT;

// Actual React components and compiled application CSS, with a local fixture API.
// This exercises UI behavior; it is not a live authentication/Neon/Vercel test.
test(
  "Desktop/mobile workspace navigation, login sizing, table controls and QR behavior",
  { skip: !tools || !playwrightPath },
  async () => {
    const esbuild = dependency(path.join(tools, "esbuild"));
    const { chromium } = dependency(playwrightPath);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mo-bistro-browser-"));
    const root = process.cwd();
    const component = (file) =>
      JSON.stringify(path.join(root, file).replaceAll("\\", "/"));
    const source =
      'import React from "react"; import {createRoot} from "react-dom/client";' +
      "import Login from " +
      component("src/app/login/page.tsx") +
      ";" +
      "import Reception from " +
      component("src/app/reception-dashboard.tsx") +
      ";" +
      "import Management from " +
      component("src/app/management/management-dashboard.tsx") +
      ";" +
      "import Waiter from " +
      component("src/app/waiter/waiter-dashboard.tsx") +
      ";" +
      "import Header from " +
      component("src/components/workspace-header.tsx") +
      ";" +
      'const p=location.pathname;const role=document.cookie.match(/fixture_role=(manager|reception|waiter)/)?.[1] ?? "manager";' +
      'const title=p==="/waiter"?"Waiter":p==="/management"||p==="/manager"?"Management":"Reception";' +
      'createRoot(document.getElementById("root")).render(p==="/login"?<Login/>:<><Header role={role} workspace={title}/>{title==="Waiter"?<Waiter/>:title==="Management"?<Management/>:<Reception/>}</>);';
    await esbuild.build({
      stdin: { contents: source, loader: "tsx", resolveDir: root },
      bundle: true,
      outfile: path.join(temp, "app.js"),
      platform: "browser",
      jsx: "automatic",
      nodePaths: [path.join(root, "node_modules")],
      plugins: [
        {
          name: "fixture-navigation",
          setup(build) {
            build.onResolve(
              { filter: /^next\/(link|navigation)$/ },
              (args) => ({ path: args.path, namespace: "fixture" }),
            );
            build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
              resolveDir: root,
              loader: "tsx",
              contents:
                args.path === "next/link"
                  ? 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}'
                  : "export function useRouter(){return {replace:path=>location.assign(path),push:path=>location.assign(path),refresh(){}}}export function useSearchParams(){return new URLSearchParams(location.search)}",
            }));
            build.onResolve({ filter: /^@\// }, (args) => {
              const base = path.join(root, "src", args.path.slice(2));
              for (const extension of [".ts", ".tsx"])
                if (fs.existsSync(base + extension))
                  return { path: base + extension };
              return undefined;
            });
          },
        },
      ],
    });
    const css = fs
      .readdirSync(".next/static/chunks")
      .filter((file) => file.endsWith(".css"))
      .map((file) =>
        fs.readFileSync(path.join(".next/static/chunks", file), "utf8"),
      )
      .join("\n");
    const html = fs.readFileSync(".next/server/app/join.html", "utf8");
    const viewport = html.match(/<meta name="viewport"[^>]*>/)?.[0];
    assert.ok(viewport);
    assert.ok(!viewport.includes("user-scalable=no"));
    assert.ok(!viewport.includes("maximum-scale=1"));
    let mode = "detailed",
      occupied = 1;
    const errors = [];
    const readyRequests = [];
    const guests = [
      {
        id: 1,
        name: "Test Guest with a longer name",
        phone: "01012345678",
        party_size: 2,
        seating_preference: "any",
        status: "waiting",
        confirmed: 1,
        created_at: "2026-10-12",
      },
      {
        id: 2,
        name: "Called Guest",
        phone: "01012345679",
        party_size: 3,
        seating_preference: "outdoor",
        status: "called",
        confirmed: 1,
        created_at: "2026-10-12",
      },
    ];
    const tables = [
      { id: 1, name: "Indoor 1", area: "indoor", status: "occupied", seats: 4 },
      { id: 2, name: "Outdoor 1", area: "outdoor", status: "free", seats: 4 },
    ];
    const areas = () => [
      {
        area: "indoor",
        total_tables: 2,
        occupied_tables: occupied,
        free_tables: 2 - occupied,
        max_party_size: 4,
      },
      {
        area: "outdoor",
        total_tables: 2,
        occupied_tables: 0,
        free_tables: 2,
        max_party_size: 4,
      },
    ];
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname === "/app.js") {
        res.setHeader("content-type", "application/javascript");
        res.end(fs.readFileSync(path.join(temp, "app.js")));
        return;
      }
      if (url.pathname === "/app.css") {
        res.setHeader("content-type", "text/css");
        res.end(css);
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        let raw = "";
        for await (const part of req) raw += part;
        const body = raw ? JSON.parse(raw) : {},
          role =
            req.headers.cookie?.match(
              /fixture_role=(manager|reception|waiter)/,
            )?.[1] ?? "manager";
        let data = {};
        switch (url.pathname) {
          case "/api/auth/login":
            data = { role: body.username, username: body.username };
            res.setHeader(
              "set-cookie",
              "fixture_role=" + body.username + "; Path=/; SameSite=Lax",
            );
            break;
          case "/api/auth/logout":
            data = { success: true };
            break;
          case "/api/auth/me":
            data = { id: 1, role, username: role };
            break;
          case "/api/guests":
            data = guests;
            break;
          case "/api/qr":
            data = { url: "http://localhost/join?code=test-qr" };
            break;
          case "/api/tables":
            data = tables;
            break;
          case "/api/waiter/tables/1/free":
            tables[0].status = "free";
            data = { success: true };
            break;
          case "/api/table-view-mode":
            if (req.method === "PATCH") mode = body.mode;
            data = { mode, can_manage: role === "manager" };
            break;
          case "/api/simple-tables":
            if (req.method === "POST") {
              occupied = Math.max(0, occupied - 1);
              data = { success: true, area: body.area, repeated: false };
            } else data = { areas: areas() };
            break;
          case "/api/waiter/table-requests":
            data = { requests: readyRequests };
            break;
          case "/api/waiter/area-requests":
            readyRequests.push({id:1,table_id:null,request_area:body.area,area:body.area,inventory_mode:"simple",table_name:"Indoor area",status:"pending",requested_by:"manager"});
            data = { success: true, request_id: 1 };
            break;
          case "/api/reception/table-requests/1":
            readyRequests[0].status=body.action === "approve" ? "approved" : "rejected";
            if(body.action === "approve") occupied=Math.max(0,occupied-1);
            data={success:true,inventory_mode:"simple",area:"indoor",table_id:null};break;
          case "/api/reception/table-requests":
            data = readyRequests.filter(item=>item.status === "pending");
            break;
          case "/api/wait-estimate":
            data = { minutes: 30 };
            break;
          case "/api/management":
            data = {
              settings: {
                qr_rotation_seconds: "300",
                qr_required: false,
                approval_required: false,
                queue_capacity: 50,
                restaurant_name: "Mo Bistro",
              },
            };
            break;
          case "/api/management/staff-pin/users":
            data = {
              users: [
                {
                  id: 1,
                  username: "manager",
                  role: "manager",
                  active: 1,
                  has_pin: true,
                },
              ],
              pin_supported: true,
              current_staff_id: 1,
            };
            break;
          case "/api/management/staff-shifts":
            data = { shifts: [] };
            break;
          case "/api/management/tables":
            data = tables;
            break;
          case "/api/management/seating-settings":
            data = {
              require_table_assignment: true,
              allow_area_override: true,
            };
            break;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(data));
        return;
      }
      res.setHeader("content-type", "text/html");
      res.end(
        "<!doctype html><html><head>" +
          viewport +
          '<link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
      );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = "http://127.0.0.1:" + server.address().port;
    const candidates = [
      process.env.MO_BISTRO_TEST_BROWSER,
      chromium.executablePath(),
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ].filter(Boolean);
    const executable = candidates.find((file) => fs.existsSync(file));
    assert.ok(executable, "No Chromium browser available");
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: executable,
      });
      for (const width of [320, 390, 1440]) {
        mode = "detailed";
        readyRequests.length=0;
        tables[0].status = "occupied";
        occupied = 1;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          isMobile: width < 768,
          hasTouch: width < 768,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(origin + "/login");
        await page.getByLabel("Username", { exact: true }).fill("manager");
        await page.getByLabel("Password", { exact: true }).fill("fixture-only");
        if (width < 768)
          assert.ok(
            await page
              .getByLabel("Username", { exact: true })
              .evaluate(
                (input) => parseFloat(getComputedStyle(input).fontSize) >= 16,
              ),
          );
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page.waitForURL("**/manager");
        await page.getByText("Switch Workspace", { exact: true }).waitFor();
        await page.getByText("Monday",{exact:true}).waitFor();
        await page.getByLabel("Total anonymous tables",{exact:true}).first().waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          "Management overflow at " + width,
        );
        await page.getByText("Switch Workspace", { exact: true }).click();
        await page.getByRole("link", { name: "Waiter", exact: true }).click();
        await page.waitForURL("**/waiter");
        await page
          .getByRole("heading", { name: "Table is ready", exact: true })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          "Waiter overflow at " + width,
        );
        await page.getByText("Switch Workspace", { exact: true }).click();
        await page
          .getByRole("link", { name: "Reception", exact: true })
          .click();
        await page.waitForURL(origin + "/");
        await page
          .getByRole("button", { name: "Clear Indoor 1", exact: true })
          .waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
          "Reception overflow at " + width,
        );
        const readiness = await page
          .getByRole("heading", { name: "Table readiness", exact: true })
          .boundingBox();
        assert.ok(readiness.y < 500, "Readiness belongs near the top");
        await page.getByRole("button", { name: "QR Code" }).click();
        const dialog = page.getByRole("dialog", {
          name: "Mo Bistro",
          exact: true,
        });
        await dialog.waitFor();
        await dialog
          .getByText("Scan this QR code to join the waitlist.", { exact: true })
          .waitFor();
        await dialog
          .getByRole("button", { name: "Copy link", exact: true })
          .waitFor({ state: "visible" });
        await dialog.locator("svg").waitFor();
        assert.ok((await dialog.locator("svg").count()) === 1);
        if(width === 390) await page.screenshot({path:path.join(temp,"qr-mobile.png")});
        await page.keyboard.press("Tab");
        assert.ok(
          await dialog.evaluate((node) =>
            node.contains(document.activeElement),
          ),
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Clear Indoor 1", exact: true })
          .click();
        await page.getByText("Table is now free.", { exact: true }).waitFor();
        mode = "simple";
        await page.reload();
        await page
          .getByRole("button", { name: "Table free", exact: true })
          .first()
          .waitFor();
        assert.equal(
          await page.getByText("Choose occupied table...").count(),
          0,
        );
        await page
          .getByRole("button", { name: "Table free", exact: true })
          .first()
          .click();
        await page
          .getByText("Indoor availability updated.", { exact: true })
          .waitFor();
        if (width === 390) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(temp, "reception-mobile.png"),
            fullPage: true,
          });
        }
        occupied=1;
        await page.getByText("Switch Workspace",{exact:true}).click();
        await page.getByRole("link",{name:"Waiter",exact:true}).click();await page.waitForURL("**/waiter");
        await page.getByRole("button",{name:"Table is ready — Indoor",exact:true}).click();
        await page.getByText("Indoor request sent to Reception.",{exact:true}).waitFor();
        await page.getByText("Switch Workspace",{exact:true}).click();
        await page.getByRole("link",{name:"Reception",exact:true}).click();await page.waitForURL(origin+"/");
        await page.getByRole("button",{name:/Table requests: 1 pending/}).click();
        assert.equal(await page.getByText("Select the occupied indoor table",{exact:true}).count(),0);
        await page.getByRole("button",{name:"Approve",exact:true}).click();
        await page.getByRole("heading",{name:"Table is free!",exact:true}).waitFor();assert.equal(occupied,0);
        await context.close();
      }
      for (const role of ["reception", "waiter"]) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
        });
        await context.addCookies([
          { name: "fixture_role", value: role, url: origin },
        ]);
        const page = await context.newPage();
        await page.goto(origin + (role === "waiter" ? "/waiter" : "/"));
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .waitFor();
        assert.equal(
          await page.getByText("Switch Workspace", { exact: true }).count(),
          0,
        );
        await context.close();
      }
      assert.deepEqual(errors, []);
      console.log("Browser evidence directory: " + temp);
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
