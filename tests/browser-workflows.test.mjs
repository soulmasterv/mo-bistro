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
const screenshots = process.env.MO_BISTRO_UI_SCREENSHOTS;
if (screenshots) fs.mkdirSync(screenshots, { recursive: true });

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
      "import PinLogin from " +
      component("src/app/login/pin/page.tsx") +
      ";" +
      "import StaffPins from " +
      component("src/app/management/staff-pins/staff-pins-client.tsx") +
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
      "import {ThemePreference} from " +
      component("src/components/theme-preference.tsx") +
      ";" +
      "import Header from " +
      component("src/components/workspace-header.tsx") +
      ";" +
      'const p=location.pathname;const role=document.cookie.match(/fixture_role=(manager|reception|waiter)/)?.[1] ?? "manager";' +
      'const title=p==="/waiter"?"Waiter":p.startsWith("/management")||p==="/manager"?"Management":"Reception";' +
      'createRoot(document.getElementById("root")).render(p==="/login"?<Login/>:p==="/login/pin"?<PinLogin/>:<><ThemePreference/><Header role={role} workspace={title}/>{title==="Waiter"?<Waiter/>:title==="Management"?(p==="/management/staff-pins"?<StaffPins/>:<Management/>):<Reception/>}</>);';
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
                  : "export function usePathname(){return location.pathname}export function useRouter(){return {replace:path=>location.assign(path),push:path=>location.assign(path),refresh(){}}}export function useSearchParams(){return new URLSearchParams(location.search)}",
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
    let staffUsername = "manager";
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
        name: "Mariam Khalil",
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
    // Synthetic service fixtures; these are never read from a live database.
    guests.push(
      {
        id: 3,
        name: "Youssef Ahmed",
        phone: "01000000001",
        party_size: 4,
        seating_preference: "indoor",
        status: "waiting",
        confirmed: 1,
        created_at: "2026-10-12",
      },
      {
        id: 4,
        name: "Nour Ali",
        phone: "01000000002",
        party_size: 2,
        seating_preference: "any",
        status: "waiting",
        confirmed: 0,
        created_at: "2026-10-12",
      },
      {
        id: 5,
        name: "Dina Mostafa",
        phone: "01000000003",
        party_size: 5,
        seating_preference: "outdoor",
        status: "waiting",
        confirmed: 1,
        created_at: "2026-10-12",
      },
    );
    tables.push(
      { id: 3, name: "Indoor 2", area: "indoor", status: "free", seats: 4 },
      { id: 4, name: "Indoor 3", area: "indoor", status: "occupied", seats: 6 },
      { id: 5, name: "Indoor 4", area: "indoor", status: "free", seats: 2 },
      {
        id: 6,
        name: "Outdoor 2",
        area: "outdoor",
        status: "occupied",
        seats: 4,
      },
      { id: 7, name: "Outdoor 3", area: "outdoor", status: "free", seats: 6 },
      { id: 8, name: "Outdoor 4", area: "outdoor", status: "free", seats: 2 },
    );
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
          case "/api/seating":
            data = {
              tables: tables.filter((table) => table.status === "free"),
              guest: guests[0],
            };
            break;
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
            data = guests.map((guest) => ({
              ...guest,
              confirmation_required: false,
            }));
            break;
          case "/api/seating":
            data = {
              mode,
              guest: guests[0],
              tables: tables.filter((table) => table.status === "free"),
            };
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
            readyRequests.push({
              id: 1,
              table_id: null,
              request_area: body.area,
              area: body.area,
              inventory_mode: "simple",
              table_name: "Indoor area",
              status: "pending",
              requested_by: "manager",
            });
            data = { success: true, request_id: 1 };
            break;
          case "/api/reception/table-requests/1":
            readyRequests[0].status =
              body.action === "approve" ? "approved" : "rejected";
            if (body.action === "approve") occupied = Math.max(0, occupied - 1);
            data = {
              success: true,
              inventory_mode: "simple",
              area: "indoor",
              table_id: null,
            };
            break;
          case "/api/reception/table-requests":
            data = readyRequests.filter((item) => item.status === "pending");
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
                  username: staffUsername,
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
      for (const width of [320, 390, 768, 1440]) {
        mode = "detailed";
        readyRequests.length = 0;
        tables[0].name = "Indoor 1";
        staffUsername = "manager";
        guests[0].name = "Omar Hassan";
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
        await page.getByText("Monday", { exact: true }).waitFor();
        const theme = page.getByLabel("Color theme", { exact: true });
        await theme.selectOption("dark");
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        assert.equal(
          await page
            .locator(".bistro-app")
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          "rgb(18, 19, 22)",
        );
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `management-dark-${width}.png`),
            fullPage: width < 768,
          });
        assert.equal(
          await page
            .locator(".bistro-settings-card")
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          "rgb(30, 32, 37)",
        );
        await page.reload();
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await theme.selectOption("system");
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        await page.emulateMedia({ colorScheme: "light" });
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "light",
        );
        await theme.selectOption("light");
        await page.getByText("Switch Workspace", { exact: true }).click();
        assert.equal(
          await page
            .locator("details")
            .first()
            .evaluate((el) => el.open),
          true,
        );
        await page.locator(".bistro-app").click({ position: { x: 2, y: 350 } });
        assert.equal(
          await page
            .locator("details")
            .first()
            .evaluate((el) => el.open),
          false,
        );
        await page.getByText("Switch Workspace", { exact: true }).click();
        await theme.focus();
        assert.equal(
          await page
            .locator("details")
            .first()
            .evaluate((el) => el.open),
          false,
        );
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `management-${width}.png`),
            fullPage: width < 768,
          });
        await page
          .getByLabel("Total anonymous tables", { exact: true })
          .first()
          .waitFor();
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
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `waiter-${width}.png`),
            fullPage: width < 768,
          });
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
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `reception-${width}.png`),
            fullPage: width < 768,
          });
        const unconfirmed = guests.find((guest) => guest.confirmed === 0);
        await page
          .getByRole("button", {
            name: "More actions for " + unconfirmed.name,
            exact: true,
          })
          .click();
        assert.equal(
          await page
            .getByRole("button", { name: "Confirm booking", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .getByText("Awaiting confirmation", { exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", {
            name: "More actions for " + unconfirmed.name,
            exact: true,
          })
          .click();
        const queue = page.getByRole("region", { name: "Guest queue" });
        await queue.evaluate((el) => {
          el.style.maxHeight = "200px";
        });
        assert.ok(
          await queue.evaluate((el) => el.scrollHeight > el.clientHeight),
        );
        await queue.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        assert.ok(await queue.evaluate((el) => el.scrollTop > 0));
        await queue.evaluate((el) => {
          el.style.maxHeight = "";
          el.scrollTop = 0;
        });
        await page
          .getByLabel("Color theme", { exact: true })
          .selectOption("dark");
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        await page.waitForFunction(() => {
          const button = document.querySelector(
            '[aria-label="Seat Omar Hassan"]',
          );
          return (
            getComputedStyle(button).backgroundColor === "rgb(226, 228, 233)"
          );
        });
        assert.deepEqual(
          await page
            .getByRole("button", { name: "Seat Omar Hassan", exact: true })
            .evaluate((el) => ({
              background: getComputedStyle(el).backgroundColor,
              color: getComputedStyle(el).color,
            })),
          { background: "rgb(226, 228, 233)", color: "rgb(23, 25, 30)" },
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `reception-dark-${width}.png`),
            fullPage: width < 768,
          });
        await page
          .getByLabel("Color theme", { exact: true })
          .selectOption("light");
        assert.equal(
          await page
            .getByRole("heading", { name: "Table readiness", exact: true })
            .count(),
          0,
        );
        assert.equal(
          await page
            .locator(".bistro-notification-center")
            .evaluate((el) => el.getBoundingClientRect().height),
          0,
        );
        await page.getByRole("button", { name: "QR Code" }).click();
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `qr-${width}.png`),
          });
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
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `qr-${width}.png`),
          });
        assert.ok((await dialog.locator("svg").count()) === 1);
        if (width === 390)
          await page.screenshot({ path: path.join(temp, "qr-mobile.png") });
        await page.keyboard.press("Tab");
        assert.ok(
          await dialog.evaluate((node) =>
            node.contains(document.activeElement),
          ),
        );
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Add guest", exact: true })
          .click();
        const add = page.getByRole("dialog", {
          name: "Add guest",
          exact: true,
        });
        await add
          .getByLabel("Full name", { exact: true })
          .fill("Fixture New Guest");
        await add
          .getByLabel("Seating preference", { exact: true })
          .selectOption("outdoor");
        assert.ok(
          await add
            .getByLabel("Full name", { exact: true })
            .evaluate(
              (node) =>
                parseFloat(getComputedStyle(node).fontSize) >= 16 ||
                window.innerWidth >= 768,
            ),
        );
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `add-guest-${width}.png`),
          });
        await page.keyboard.press("Escape");
        await add.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Seat Omar Hassan", exact: true })
          .click();
        const seat = page.getByRole("dialog", {
          name: "Assign table",
          exact: true,
        });
        await seat.getByRole("button", { name: /Outdoor 1/ }).click();
        assert.equal(
          await seat
            .getByRole("button", {
              name: "Assign table & seat guest",
              exact: true,
            })
            .isEnabled(),
          true,
        );
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `seat-guest-${width}.png`),
          });
        await page.keyboard.press("Escape");
        await seat.waitFor({ state: "hidden" });
        await page
          .getByRole("button", { name: "Clear Indoor 1", exact: true })
          .click();
        await page.getByText("Table is now free.", { exact: true }).waitFor();
        await page.getByText("Indoor 1 is ready!", { exact: true }).waitFor();
        assert.ok(
          await page
            .locator(".bistro-table-notice")
            .evaluate(
              (el) => el.closest(".bistro-notification-center") !== null,
            ),
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `notifications-${width}.png`),
            fullPage: width < 768,
          });
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
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `reception-simple-${width}.png`),
            fullPage: width < 768,
          });
        occupied = 1;
        await page.getByText("Switch Workspace", { exact: true }).click();
        await page.getByRole("link", { name: "Waiter", exact: true }).click();
        await page.waitForURL("**/waiter");
        await page
          .getByRole("button", {
            name: "Table is ready — Indoor",
            exact: true,
          })
          .click();
        await page
          .getByText("Indoor request sent to Reception.", { exact: true })
          .waitFor();
        await page.getByText("Switch Workspace", { exact: true }).click();
        await page
          .getByRole("link", { name: "Reception", exact: true })
          .click();
        await page.waitForURL(origin + "/");
        await page
          .getByRole("heading", { name: "Table readiness", exact: true })
          .waitFor();
        assert.ok(
          await page
            .locator(".bistro-notification-center")
            .evaluate(
              (el) =>
                el.getBoundingClientRect().bottom <=
                document.querySelector(".bistro-queue").getBoundingClientRect()
                  .top,
            ),
        );
        if (screenshots) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(screenshots, `pending-request-${width}.png`),
            fullPage: width < 768,
          });
        }
        await page
          .getByRole("button", { name: /Table requests: 1 pending/ })
          .click();
        assert.equal(
          await page
            .getByText("Select the occupied indoor table", { exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", { name: "Approve", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Table is free!", exact: true })
          .waitFor();
        assert.equal(occupied, 0);
        await page
          .getByRole("heading", { name: "Table readiness", exact: true })
          .waitFor({ state: "hidden" });
        assert.equal(
          await page.locator("#table-request-notifications").count(),
          0,
        );
        mode = "detailed";
        tables[0].name = "W".repeat(40);
        staffUsername = "W".repeat(32);
        guests[0].name = "W".repeat(100);
        readyRequests.length = 0;
        readyRequests.push({
          id: 1,
          table_id: 1,
          table_name: tables[0].name,
          requested_by: staffUsername,
          inventory_mode: "detailed",
          status: "pending",
        });
        async function assertNoSideScroll(label) {
          const result = await page.evaluate(() => ({
            viewport: window.innerWidth,
            width: document.documentElement.scrollWidth,
            scrollers: [...document.querySelectorAll("body *")]
              .filter(
                (element) =>
                  !["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) &&
                  element.clientWidth > 0 &&
                  element.scrollWidth > element.clientWidth + 1 &&
                  ["auto", "scroll"].includes(
                    getComputedStyle(element).overflowX,
                  ),
              )
              .map((element) => ({
                tag: element.tagName,
                class: element.className,
                width: element.scrollWidth,
                available: element.clientWidth,
              })),
            offenders: [...document.querySelectorAll("body *")]
              .filter((element) => {
                const box = element.getBoundingClientRect();
                return (
                  box.width > 0 &&
                  (box.right > window.innerWidth + 1 || box.left < -1)
                );
              })
              .map((element) => ({
                tag: element.tagName,
                class: element.className,
                right: element.getBoundingClientRect().right,
              }))
              .slice(0, 8),
          }));
          assert.ok(
            result.width <= width &&
              result.viewport <= width &&
              result.scrollers.length === 0,
            label + " at " + width + "px: " + JSON.stringify(result),
          );
        }
        await page.goto(origin + "/management");
        await page.getByText(staffUsername, { exact: true }).first().waitFor();
        await page.getByText("Monday", { exact: true }).waitFor();
        await assertNoSideScroll("Long Manager content");
        await page.getByText("Switch Workspace", { exact: true }).click();
        await assertNoSideScroll("Open workspace selector");
        await page.goto(origin + "/waiter");
        await page
          .getByRole("heading", { name: tables[0].name, exact: true })
          .waitFor();
        await assertNoSideScroll("Long Waiter content");
        await page.goto(origin + "/");
        await page
          .getByRole("heading", { name: guests[0].name, exact: true })
          .waitFor();
        await assertNoSideScroll("Long Reception content");
        await page
          .getByRole("button", { name: /Table requests: 1 pending/ })
          .click();
        await page
          .getByRole("button", { name: "Approve", exact: true })
          .waitFor();
        await assertNoSideScroll("Open request panel");
        await page
          .getByRole("button", { name: /Table requests: 1 pending/ })
          .click();
        await page
          .getByRole("button", {
            name: "More actions for " + guests[0].name,
            exact: true,
          })
          .click();
        await assertNoSideScroll("Open guest menu");
        await page
          .getByRole("button", { name: "Seat " + guests[0].name, exact: true })
          .click();
        await page
          .getByRole("dialog", { name: "Assign table", exact: true })
          .waitFor();
        await assertNoSideScroll("Seating dialog");
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await page.getByRole("button", { name: "QR Code" }).click();
        await page
          .getByRole("dialog", { name: "Mo Bistro", exact: true })
          .waitFor();
        await assertNoSideScroll("QR dialog");
        assert.ok(
          await page.locator(".bistro-qr-overlay").evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.top === 0 &&
              rect.left === 0 &&
              rect.width === innerWidth &&
              rect.height === innerHeight &&
              el.contains(document.elementFromPoint(5, 5))
            );
          }),
        );
        await page.goto(origin + "/management/staff-pins");
        await page
          .locator('select:not([aria-label="Color theme"])')
          .selectOption("1");
        await page.getByLabel("New six-digit PIN", { exact: true }).waitFor();
        await assertNoSideScroll("Staff PIN form");
        await page.goto(origin + "/login/pin");
        await page
          .getByLabel("Staff username", { exact: true })
          .fill(staffUsername);
        await assertNoSideScroll("PIN login");
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
