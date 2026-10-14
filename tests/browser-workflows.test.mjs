import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { createRequire } from "node:module";
const dependency = createRequire(import.meta.url);
function argument(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
const tools = argument("--tools") || process.env.MO_BISTRO_TEST_TOOLS;
const playwrightPath = argument("--playwright") || process.env.MO_BISTRO_TEST_PLAYWRIGHT;
const screenshots = argument("--screenshots") || process.env.MO_BISTRO_UI_SCREENSHOTS;
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
      "import Join from " +
      component("src/app/join/page.tsx") +
      ";" +
      "import Menu from " + component("src/app/menu/page.tsx") + ";" +
      "import Status from " + component("src/app/status/page.tsx") + ";" +
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
      "import {ConfirmationProvider} from " + component("src/components/confirmation-provider.tsx") + ";" +
      "import Header from " +
      component("src/components/workspace-header.tsx") +
      ";" +
      'const p=location.pathname;const role=document.cookie.match(/fixture_role=(manager|reception|waiter)/)?.[1] ?? "manager";' +
      'const title=p==="/waiter"?"Waiter":p.startsWith("/management")||p==="/manager"?"Management":"Reception";' +
      'createRoot(document.getElementById("root")).render(<ConfirmationProvider>{p==="/join"?<><ThemePreference/><Join/></>:p==="/menu"?<><ThemePreference/><Menu/></>:p==="/status"?<><ThemePreference/><Status/></>:p==="/login"?<><ThemePreference/><Login/></>:p==="/login/pin"?<><ThemePreference/><PinLogin/></>:<><ThemePreference/><Header role={role} workspace={p==="/workspace-fixture"?"Workspaces":title}/>{title==="Waiter"?<Waiter/>:title==="Management"?(p==="/management/staff-pins"?<StaffPins/>:<Management/>):<Reception/>}</>}</ConfirmationProvider>);';
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
    let trackingStatus = "waiting";
    let trackingEta = null;
    let subscriptionSubscribed = true;
    let feedbackEditable = true;
    let staffUsername = "manager";
    let sessionStatus = 200;
    const guestActions = [];
    const errors = [];
    const readyRequests = [];
    let submittedBooking;
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
    guests.push(...Array.from({length:20}, (_, index) => ({
      id:100 + index, name:`Synthetic Queue Guest ${index + 1}`, phone:`010${String(index + 50).padStart(8,"0")}`,
      party_size:2, seating_preference:"any", status:"waiting", confirmed:1, created_at:"2026-10-12",
    })));
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
      if(/^\/menus\/menu-page-\d{2}\.jpg$/.test(req.url)) {
        res.setHeader("content-type","image/jpeg");res.end(fs.readFileSync("public"+req.url));return;
      }
      if(req.url === "/menus/mo-bistro-menu.pdf") {
        res.setHeader("content-type","application/pdf");res.end(fs.readFileSync("public/menus/mo-bistro-menu.pdf"));return;
      }
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
        if (/^\/api\/guests\/\d+$/.test(url.pathname) && req.method === "PATCH") guestActions.push(body.action);
        if (url.pathname.startsWith("/api/whatsapp/guests/")) {
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              available: true,
              subscribed: true,
              feedback_consent: true,
              confirmation_consent: true,
              opted_out: false,
            }),
          );
          return;
        }
        switch (url.pathname) {
          case "/api/seating":
            data = {
              tables: tables.filter((table) => table.status === "free"),
              guest: guests[0],
            };
            break;
          case "/api/whatsapp/test":
            if(req.method!=="GET")throw Error("Browser checks must never attempt a WhatsApp send");
            data={visible:true,enabled:false,reason:"Check Preview test migration."};
            break;
          case "/api/whatsapp/config":
            data = { available: true };
            break;
          case "/api/qr/permit":
            data = { valid: true, expiresAt: null };
            break;
          case "/api/whatsapp/subscription":
            data = {available:true,subscribed:subscriptionSubscribed,feedbackConsent:true,feedbackEditable,url:"https://wa.me/201000000000?text=SUBSCRIBE"};
            break;
          case "/api/reception/next-guest":
            data={areas:[{area:"indoor",available:true,guest:{id:guests[0].id,name:guests[0].name,party_size:guests[0].party_size}},{area:"outdoor",available:true,guest:null}]};
            break;
          case "/api/track":
            data = {confirmation_required:true, guest:{name:"Omar Hassan",party_size:2,status:trackingStatus,confirmed:true,created_at:new Date().toISOString(),eta_at:trackingEta}, queue_position:3,guests_ahead:2};
            break;
          case "/api/join":
            submittedBooking = body;
            data = { token: "a".repeat(64) };
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
            res.statusCode = sessionStatus;
            data = { id: 1, role, username: role };
            break;
          case "/api/guests/4/eta":
          case "/api/guests/1/eta":
            data={success:true,eta_at:null};break;
          case "/api/guests":
            if(req.method==="POST"){data={success:true,id:900,token:"f".repeat(64)};break;}
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
          '<link rel="stylesheet" href="/app.css"></head><body><div id="root" style="display:contents"></div><script src="/app.js"></script></body></html>',
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
      for (const width of [320, 390, 768, 1024, 1440]) {
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
        page.on("dialog", dialog => { errors.push("Unexpected native browser dialog"); void dialog.dismiss(); });
        await context.addInitScript(() => { if(location.pathname === "/login") localStorage.setItem("mo-bistro-theme", "dark"); });
        await page.goto(origin + "/login");
        await page.waitForFunction(() => document.documentElement.dataset.theme === "guest-light");
        assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),"Login should not add page scroll when its contents fit");
        if(width<=900) {
          await page.setViewportSize({width,height:650});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),"Login should fit a short mobile viewport");
          await page.setViewportSize({width,height:900});
        }
        await page.getByLabel("Username", { exact: true }).fill("manager");
        await page.getByLabel("Password", { exact: true }).fill("fixture-only");
        assert.equal(await page.getByLabel("Password", {exact:true}).evaluate(el=>getComputedStyle(el).color), "rgb(41, 49, 38)");
        assert.equal(await page.getByRole("button", {name:"Sign in",exact:true}).evaluate(el=>getComputedStyle(el).color), "rgb(41, 49, 38)");
        if(screenshots) await page.screenshot({path:path.join(screenshots, `login-restored-${width}.png`),fullPage:true});
        if(width===390) {
          let finishLogin;
          let attempts=0;
          await page.route("**/api/auth/login",async route=>{
            attempts++;
            await new Promise(resolve=>{finishLogin=resolve;});
            await route.fulfill({status:401,contentType:"application/json",body:'{"error":"Synthetic invalid credentials"}'});
          });
          await page.getByRole("button",{name:"Sign in",exact:true}).click();
          const pending=page.getByRole("button",{name:"Signing in...",exact:true});
          await pending.waitFor();
          assert.equal(await pending.isDisabled(),true);
          assert.equal(await pending.evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(191, 192, 191)");
          await page.locator("form").evaluate(form=>{form.requestSubmit();form.requestSubmit();});
          assert.equal(attempts,1);
          if(screenshots)await page.screenshot({path:path.join(screenshots,"login-pending-390.png")});
          finishLogin();
          await page.getByText("Synthetic invalid credentials",{exact:true}).waitFor();
          assert.equal(await page.getByRole("button",{name:"Sign in",exact:true}).isEnabled(),true);
          await page.unroute("**/api/auth/login");
        }

        if (width <= 1100)
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
        await page.getByLabel("Open menu", { exact: true }).waitFor();
        await page.getByText("Monday", { exact: true }).waitFor();
        await page.getByRole("button",{name:"Send Test WhatsApp",exact:true}).waitFor();
        assert.equal(await page.getByRole("button",{name:"Send Test WhatsApp",exact:true}).isDisabled(),true);
        async function chooseTheme(value) {
          if (
            !(await page
              .locator("details")
              .first()
              .evaluate((el) => el.open))
          )
            await page.getByLabel("Open menu", { exact: true }).click();
          await page
            .getByRole("button", {
              name: "Use " + value + " theme",
              exact: true,
            })
            .click();
          await page.keyboard.press("Escape");
        }
        await chooseTheme("dark");
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        assert.equal(
          await page
            .locator(".bistro-app")
            .evaluate((el) => getComputedStyle(el).backgroundColor),
          "rgb(16, 17, 17)",
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
          "rgb(23, 25, 25)",
        );
        await page.reload();
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        await page.emulateMedia({ colorScheme: "dark" });
        await chooseTheme("system");
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        await page.emulateMedia({ colorScheme: "light" });
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "light",
        );
        await chooseTheme("light");
        await page.getByLabel("Open menu", { exact: true }).click();
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
        await page.getByLabel("Open menu", { exact: true }).click();
        await page
          .getByRole("button", { name: "Create employee", exact: true })
          .focus();
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
        await page.getByLabel("Open menu", { exact: true }).click();
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
        await chooseTheme("dark");
        await page.waitForFunction(()=>getComputedStyle(document.querySelector(".bistro-waiter")).backgroundColor === "rgb(16, 17, 17)");
        if(screenshots) await page.screenshot({path:path.join(screenshots,`waiter-dark-${width}.png`)});
        await chooseTheme("light");
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `waiter-${width}.png`),
            fullPage: width < 768,
          });
        await page.getByLabel("Open menu", { exact: true }).click();
        await page
          .getByRole("link", { name: "Reception", exact: true })
          .click();
        await page.waitForURL(origin + "/");
        const overview = page.getByLabel("Service overview", { exact: true });
        await overview.getByText("30m", { exact: true }).waitFor();
        assert.equal(await overview.locator("dt").allTextContents().then(labels=>labels.join(",")), "Current ETA,Indoor,Outdoor");
        for (const [index, area] of ["indoor","outdoor"].entries()) {
          const expected = `${tables.filter(table=>table.area===area&&table.status==="free").length} / ${tables.filter(table=>table.area===area).length} free`;
          await page.waitForFunction(({index,expected}) => document.querySelectorAll('.reception-service-strip dd')[index+1]?.textContent === expected, {index,expected});
        }
        if (width === 390) {
          await page.route("**/api/wait-estimate", route=>route.fulfill({status:503,contentType:"application/json",body:'{"error":"Synthetic failure"}'}));
          await page.evaluate(()=>window.dispatchEvent(new Event("mo-bistro-tables-changed")));
          await overview.getByTitle("Wait estimate unavailable", {exact:true}).waitFor();
          assert.equal(await overview.locator("dd").first().textContent(), "—");
          assert.notEqual(await overview.locator("dd").nth(1).textContent(), "—");
          await page.unroute("**/api/wait-estimate");
          await page.evaluate(()=>window.dispatchEvent(new Event("mo-bistro-tables-changed")));
          await overview.getByText("30m",{exact:true}).waitFor();
        }
        await page.getByRole("button", { name: "Tables", exact: true }).click();
        await page
          .getByRole("button", { name: "Clear Indoor 1", exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Close tables", exact: true })
          .click();
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
          .getByText("Subscribed to updates", { exact: true })
          .waitFor();
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `guest-sheet-${width}.png`),
          });
        const sheet = page.getByRole("dialog", {
          name: unconfirmed.name,
          exact: true,
        });
        assert.ok(await sheet.isVisible());
        const actionCount = guestActions.length;
        await sheet.getByRole("button", {name:"Cancel booking",exact:true}).click();
        const confirmation = page.getByRole("alertdialog", {name:"Cancel booking?",exact:true});
        await confirmation.waitFor();
        assert.equal(await page.locator(".confirmation-overlay").evaluate(el=>getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0.65)");
        assert.equal(guestActions.length, actionCount);
        assert.ok(await confirmation.getByRole("button",{name:"Cancel",exact:true}).evaluate(el=>el===document.activeElement));
        if(screenshots) await page.screenshot({path:path.join(screenshots,`custom-confirmation-${width}.png`)});
        await page.keyboard.press("Escape");
        await confirmation.waitFor({state:"hidden"});
        assert.ok(await sheet.isVisible());
        assert.equal(guestActions.length, actionCount);
        assert.equal(await page.evaluate(()=>document.body.style.overflow), "hidden");
        await sheet.getByRole("button", {name:"Cancel booking",exact:true}).click();
        await confirmation.getByRole("button",{name:"Cancel",exact:true}).click();
        assert.equal(guestActions.length, actionCount);
        let releaseCancellation;
        const cancellationGate = new Promise(resolve=>{releaseCancellation=resolve;});
        let heldRequests=0;
        const cancelUrl = `**/api/guests/${unconfirmed.id}`;
        await page.route(cancelUrl,async route=>{
          heldRequests++;
          await cancellationGate;
          await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Synthetic cancellation failure"})});
        });
        await sheet.getByRole("button",{name:"Cancel booking",exact:true}).click();
        await confirmation.getByRole("button",{name:"Cancel booking",exact:true}).click();
        const cancelling = sheet.getByRole("button",{name:"Cancelling…",exact:true});
        await cancelling.waitFor();
        assert.equal(await cancelling.isDisabled(),true);
        assert.equal(await sheet.getByRole("button",{name:"No-show",exact:true}).isDisabled(),true);
        assert.equal(await sheet.getByRole("button",{name:"Seat guest",exact:true}).isDisabled(),true);
        const disabledSeat = await sheet.getByRole("button",{name:"Seat guest",exact:true}).evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
        assert.equal(disabledSeat.background,"rgb(213, 213, 213)");
        assert.notEqual(disabledSeat.background,disabledSeat.color);
        assert.equal(await sheet.getByText("Open WhatsApp",{exact:true}).getAttribute("href"),null);
        await sheet.getByText("Cancelling booking… Please wait.",{exact:true}).waitFor();
        await cancelling.evaluate(el=>el.click());
        assert.equal(heldRequests,1);
        if(screenshots) await page.screenshot({path:path.join(screenshots,`guest-cancelling-${width}.png`)});
        releaseCancellation();
        await sheet.getByText("Synthetic cancellation failure",{exact:true}).waitFor();
        assert.equal(await sheet.getByRole("button",{name:"Cancel booking",exact:true}).isEnabled(),true);
        assert.ok(await sheet.isVisible());
        await page.unroute(cancelUrl);
        await sheet.getByRole("button", {name:"Cancel booking",exact:true}).click();
        await Promise.all([
          page.waitForResponse(response=>/\/api\/guests\/\d+$/.test(new URL(response.url()).pathname)&&response.request().method()==="PATCH"),
          confirmation.getByRole("button",{name:"Cancel booking",exact:true}).click(),
        ]);
        assert.equal(guestActions.length, actionCount + 1);
        await sheet.waitFor({state:"hidden"});
        await page.getByRole("button",{name:"More actions for "+unconfirmed.name,exact:true}).click();
        await sheet.waitFor();
        assert.equal(
          await sheet
            .getByRole("link", { name: "Open WhatsApp", exact: true })
            .getAttribute("href"),
          "https://wa.me/2" + unconfirmed.phone,
        );
        await sheet.getByText("Expected table readiness",{exact:true}).click();
        await sheet.getByLabel("Minutes from now",{exact:true}).fill("20");
        await sheet.getByRole("button",{name:"Save ETA",exact:true}).click();
        await sheet.getByText("Expected readiness saved.",{exact:true}).waitFor();
        await sheet.getByRole("button",{name:"Clear ETA",exact:true}).click();
        await sheet.getByText("Expected readiness cleared.",{exact:true}).waitFor();
        await page.keyboard.press("Escape");
        await sheet.waitFor({ state: "hidden" });

        const queue = page.getByRole("region", { name: "Guest queue" });
        assert.equal(await page.locator(".bistro-avatar").count(),0,"Redundant initials should be removed");
        if(width<=900) {
          assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),"Queue page should fit the viewport");
          assert.ok(await queue.evaluate(el=>el.clientHeight>=250),"Guest list should retain usable space");
          assert.ok(await page.locator(".bistro-guest-card").evaluateAll(rows=>rows.every(row=>row.getBoundingClientRect().height>=92)),"Guest rows should not shrink");
          if(width===390) {
            await page.setViewportSize({width,height:650});
            assert.ok(await queue.evaluate(el=>el.clientHeight>=140),"Short mobile viewport still needs a readable list");
            assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
            if(screenshots)await page.screenshot({path:path.join(screenshots,"queue-mobile-390x650.png")});
            await page.setViewportSize({width,height:900});
          }
        }
        if (width <= 900) assert.ok(await queue.evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector('.queue-bottom-bar').getBoundingClientRect().top + 1), 'Queue must end above fixed tools');
        // Verify the shipped layout, not an artificially constrained test box.
        assert.ok(await queue.evaluate((el) => el.scrollHeight > el.clientHeight));
        await queue.hover();
        await page.mouse.wheel(0, 450);
        await page.waitForFunction(() => document.querySelector('[aria-label="Guest queue"]').scrollTop > 0);
        await queue.evaluate((el) => { el.scrollTop = 0; });
        assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
        assert.ok(await page.locator(".queue-next-badge").count() > 0);
        assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).count(), 0);
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
        await chooseTheme("dark");
        await page.waitForFunction(
          () => document.documentElement.dataset.theme === "dark",
        );
        if(width===390) {
          await page.getByRole("button",{name:"More actions for "+unconfirmed.name,exact:true}).click();
          await page.getByRole("dialog",{name:unconfirmed.name,exact:true}).getByRole("button",{name:"Cancel booking",exact:true}).click();
          await page.getByRole("alertdialog",{name:"Cancel booking?",exact:true}).waitFor();
          if(screenshots) await page.screenshot({path:path.join(screenshots,"custom-confirmation-dark.png")});
          await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
        }
        await page.waitForFunction(() => {
          const button = document.querySelector(
            '[aria-label="Seat Omar Hassan"]',
          );
          return (
            getComputedStyle(button).backgroundColor === "rgb(234, 196, 131)"
          );
        });
        assert.deepEqual(
          await page
            .getByRole("button", { name: "Seat Omar Hassan", exact: true })
            .evaluate((el) => ({
              background: getComputedStyle(el).backgroundColor,
              color: getComputedStyle(el).color,
            })),
          { background: "rgb(234, 196, 131)", color: "rgb(23, 23, 23)" },
        );
        await page.evaluate(() => window.scrollTo(0, 0));
        if (screenshots)
          await page.screenshot({
            path: path.join(screenshots, `reception-dark-${width}.png`),
            fullPage: width < 768,
          });
        await page.getByRole("button",{name:"QR Code",exact:true}).click();
        await page.getByText("Scan this QR code to join the waitlist.",{exact:true}).waitFor();
        assert.equal(await page.locator(".bistro-qr-overlay").evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(16, 17, 17)");
        if(screenshots) await page.screenshot({path:path.join(screenshots,`qr-dark-${width}.png`)});
        await page.getByRole("button",{name:"Close",exact:true}).click();
        await page.getByRole("button",{name:"Seat Omar Hassan",exact:true}).click();
        await page.getByRole("dialog",{name:"Assign table"}).waitFor();
        if(screenshots) await page.screenshot({path:path.join(screenshots,`seat-dark-${width}.png`)});
        await page.getByRole("dialog",{name:"Assign table"}).getByRole("button",{name:/close/i}).click();
        await chooseTheme("light");
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
        if(width===390) {
          await page.evaluate(()=>Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async()=>{throw Error("Synthetic clipboard rejection");}}}));
          await dialog.getByRole("button",{name:"Copy link",exact:true}).click();
          await dialog.getByText("Automatic copying is unavailable. Select and copy the registration link above.",{exact:true}).waitFor();
          assert.equal(await dialog.getByLabel("Registration link",{exact:true}).inputValue(),"http://localhost/join?code=test-qr");
        }
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
        await add.getByLabel("Phone number",{exact:true}).fill("01012345677");
        await add.getByRole("button",{name:"Add to waitlist",exact:true}).click();
        await add.waitFor({ state: "hidden" });
        const handoff=page.getByRole("dialog",{name:"Guest tracking link",exact:true});await handoff.waitFor();
        assert.equal(await handoff.locator("svg").count(),1);
        if(screenshots)await page.screenshot({path:path.join(screenshots,`tracking-handoff-${width}.png`)});
        await page.keyboard.press("Escape");await handoff.waitFor({state:"hidden"});
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
        await page.getByRole("button", { name: "Tables", exact: true }).click();
        await page
          .getByRole("button", { name: "Clear Indoor 1", exact: true })
          .click();
        await page.getByText("Table is now free.", { exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Close tables", exact: true })
          .click();
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
        await page.waitForFunction(expected => document.querySelectorAll('.reception-service-strip dd')[1]?.textContent === expected, `${2-occupied} / 2 free`);
        await page.getByRole("button", { name: "Tables", exact: true }).click();
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
        await page
          .getByRole("button", { name: "Close tables", exact: true })
          .click();
        occupied = 1;
        await page.getByLabel("Open menu", { exact: true }).click();
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
        await page.getByLabel("Open menu", { exact: true }).click();
        await page
          .getByRole("link", { name: "Reception", exact: true })
          .click();
        await page.waitForURL(origin + "/");
        await page
          .getByRole("button", { name: "Open table requests (1)", exact: true })
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
          .getByRole("button", { name: "Open table requests (1)", exact: true })
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
        await page.getByLabel("Open menu", { exact: true }).click();
        await assertNoSideScroll("Open workspace selector");
        await page.goto(origin + "/waiter");
        await page
          .getByRole("heading", { name: tables[0].name, exact: true })
          .waitFor();
        await assertNoSideScroll("Long Waiter content");
        await page.goto(origin + "/");
        await page
          .getByRole("button", {
            name: "Guest details for " + guests[0].name,
            exact: true,
          })
          .waitFor();
        await assertNoSideScroll("Long Reception content");
        await page
          .getByRole("button", { name: "Open table requests (1)", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Approve", exact: true })
          .waitFor();
        await assertNoSideScroll("Open request panel");
        await page
          .getByRole("button", { name: "Open table requests (1)", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "More actions for " + guests[0].name,
            exact: true,
          })
          .click();
        await assertNoSideScroll("Open guest sheet");
        await page
          .getByRole("dialog", { name: guests[0].name, exact: true })
          .getByRole("button", { name: "Seat guest", exact: true })
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
        if(width<=900) {
          await page.setViewportSize({width,height:650});
          assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),"PIN login should fit a short mobile viewport");
          await page.setViewportSize({width,height:900});
        }
        if(width===390) {
          let finishPin;
          let attempts=0;
          await page.route("**/api/auth/pin-login",async route=>{
            attempts++;
            await new Promise(resolve=>{finishPin=resolve;});
            await route.fulfill({status:401,contentType:"application/json",body:'{"error":"Synthetic invalid PIN"}'});
          });
          for(let digit=0;digit<6;digit++)await page.getByRole("button",{name:"1",exact:true}).click();
          await page.getByRole("button",{name:"Sign in",exact:true}).click();
          const pending=page.getByRole("button",{name:"Signing in...",exact:true});
          await pending.waitFor();
          assert.equal(await pending.isDisabled(),true);
          assert.equal(await pending.evaluate(el=>getComputedStyle(el).backgroundColor),"rgb(191, 192, 191)");
          await pending.evaluate(button=>button.click());
          assert.equal(attempts,1);
          finishPin();
          await page.getByText("Synthetic invalid PIN",{exact:true}).waitFor();
          assert.equal(await page.getByRole("button",{name:"1",exact:true}).isEnabled(),true);
          await page.unroute("**/api/auth/pin-login");
        }
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
        await page.getByLabel("Open menu", { exact: true }).click();
        await page
          .getByRole("button", { name: "Sign out", exact: true })
          .waitFor();
        assert.equal(
          await page
            .getByRole("link", { name: "Management", exact: true })
            .count(),
          0,
        );
        await context.close();
      }
      for (const consent of [false, true]) {
        const guestContext = await browser.newContext({
          viewport: { width: 390, height: 844 },
          colorScheme: "dark",
        });
        const guestPage = await guestContext.newPage();
        await guestContext.addInitScript(() =>
          localStorage.setItem("mo-bistro-theme", "dark"),
        );
        await guestPage.goto(origin + "/join");
        await guestPage.getByRole("checkbox").waitFor();
        assert.equal(await guestPage.getByRole("checkbox").count(), 1);
        await guestPage.waitForFunction(
          () => document.documentElement.dataset.theme === "guest-light",
        );
        await guestPage
          .getByPlaceholder("Full name", { exact: true })
          .fill("Omar Hassan");
        await guestPage
          .getByPlaceholder("01XXXXXXXXX", { exact: true })
          .fill("01012345678");
        if (consent) await guestPage.getByRole("checkbox").check();
        if (screenshots && consent)
          await guestPage.screenshot({
            path: path.join(screenshots, "join-combined-consent.png"),
            fullPage: true,
          });
        await guestPage
          .getByRole("button", { name: "Join the waitlist", exact: true })
          .click();
        await guestPage.waitForURL("**/status?token=*");
        await guestPage.getByText("Omar Hassan", {exact:true}).waitFor();
        await guestPage.waitForFunction(() => document.documentElement.dataset.theme === "guest-light");
        await guestPage.getByText("WhatsApp updates enabled",{exact:true}).waitFor();
        assert.equal(await guestPage.getByRole("link",{name:"Subscribe to WhatsApp updates"}).count(),0);
        assert.equal(await guestPage.getByRole("checkbox").count(),0); // Review preference is collapsed for subscribers.
        await guestPage.getByText("To unsubscribe at any time, reply UNSUBSCRIBE or STOP on WhatsApp.",{exact:true}).waitFor();
        feedbackEditable=false; await guestPage.reload();
        await guestPage.getByText("WhatsApp updates enabled",{exact:true}).waitFor();
        assert.equal(await guestPage.getByRole("checkbox").count(),0);
        if(screenshots) await guestPage.screenshot({path:path.join(screenshots,"whatsapp-updates-enabled.png"),fullPage:true});
        subscriptionSubscribed=false; await guestPage.reload();
        await guestPage.getByRole("link",{name:"Subscribe to WhatsApp updates"}).waitFor();
        assert.equal(await guestPage.getByRole("checkbox").count(),0);
        subscriptionSubscribed=true;
        await guestPage.getByRole("button",{name:"Check subscription status",exact:true}).click();
        await guestPage.getByText("WhatsApp updates enabled",{exact:true}).waitFor();
        assert.equal(await guestPage.getByRole("link",{name:"Subscribe to WhatsApp updates"}).count(),0);
        subscriptionSubscribed=true; feedbackEditable=true;
        assert.equal(submittedBooking.whatsapp_confirmation_consent, consent);
        assert.equal(submittedBooking.whatsapp_feedback_consent, consent);
        await guestContext.close();
      }
      const seatedStaff=await browser.newPage();
      guests[0].status="seated";
      await seatedStaff.goto(origin+"/");
      const activeCount=guests.filter(g=>g.status==="waiting"||g.status==="called").length;
      await seatedStaff.getByRole("button",{name:`All guests (${activeCount})`,exact:true}).waitFor();
      assert.equal(await seatedStaff.getByRole("button",{name:"Guest details for "+guests[0].name,exact:true}).count(),0);
      assert.equal(await seatedStaff.locator(".bistro-count").textContent(),String(activeCount));
      await seatedStaff.getByRole("button",{name:/^Seated \(/}).click();
      await seatedStaff.getByRole("button",{name:"Seat "+guests[0].name,exact:true}).waitFor();
      assert.equal(await seatedStaff.getByRole("button",{name:"Seat "+guests[0].name,exact:true}).isDisabled(),true);
      await seatedStaff.getByRole("button",{name:"More actions for "+guests[0].name,exact:true}).click();
      assert.equal(await seatedStaff.getByRole("dialog").getByRole("button",{name:"Seat guest",exact:true}).isDisabled(),true);
      await seatedStaff.close();
      const menuPage = await browser.newPage();
      await menuPage.goto(origin + "/workspace-fixture");
      await menuPage.getByLabel("Open menu",{exact:true}).click();
      assert.equal(await menuPage.getByRole("navigation",{name:"Workspace menu"}).getByRole("link").count(),0);
      await menuPage.close();
      for(const width of [320,390,768,1024,1440]) {
        const guestContext=await browser.newContext({viewport:{width,height:900}});
        const guest=await guestContext.newPage();
        for(const status of ["waiting","called","seated","cancelled"]) {
          trackingStatus=status; subscriptionSubscribed=true;
          await guest.goto(origin+"/status?token="+"a".repeat(64));
          await guest.getByText("Omar Hassan",{exact:true}).waitFor();
          if (status === "waiting") {
            trackingEta = new Date(Date.now()+30*60_000).toISOString();
            await guest.getByRole("button",{name:"Refresh status",exact:true}).click();
            await guest.getByText("Expected table readiness",{exact:true}).waitFor();
            const estimate=guest.locator(".guest-estimate > div");
            assert.equal(await estimate.evaluate(el=>getComputedStyle(el).borderRadius),"16px");
            assert.ok(await estimate.evaluate(el=>parseFloat(getComputedStyle(el).marginBottom)>=24));
            if(screenshots)await guest.screenshot({path:path.join(screenshots,`guest-personal-readiness-${width}.png`),fullPage:true});
            assert.equal(await guest.getByText("Current estimated wait",{exact:true}).count(),0);
            trackingEta = null;
            await guest.getByRole("button",{name:"Refresh status",exact:true}).click();
            await guest.getByText("Current estimated wait",{exact:true}).waitFor();
            assert.equal(await guest.getByText("Expected table readiness",{exact:true}).count(),0);
          }
          assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          if(status==="seated") {
            await guest.getByRole("heading",{name:"You’re seated!",exact:true}).waitFor();
            assert.equal(await guest.getByText("Queue position",{exact:true}).count(),0);
            assert.equal(await guest.getByText("Parties ahead",{exact:true}).count(),0);
            assert.equal(await guest.getByRole("button",{name:"Refresh status"}).count(),0);
            assert.equal(await guest.getByRole("link",{name:"Subscribe to WhatsApp updates"}).count(),0);
          }
          if(screenshots) await guest.screenshot({path:path.join(screenshots,`guest-${status}-${width}.png`),fullPage:true});
        }
        subscriptionSubscribed=false;trackingStatus="seated";await guest.reload();
        await guest.getByRole("heading",{name:"You’re seated!",exact:true}).waitFor();
        assert.equal(await guest.getByRole("link",{name:"Subscribe to WhatsApp updates"}).count(),0);
        await guest.goto(origin+"/menu");
        await guest.getByRole("heading",{name:"Something delicious awaits."}).waitFor();
        assert.equal(await guest.getByRole("link",{name:"Open menu",exact:true}).getAttribute("href"),"/menus/mo-bistro-menu.pdf");
        assert.ok(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        const firstPage=guest.getByRole("img",{name:"Mo Bistro menu, page 1 of 27",exact:true});
        await firstPage.waitFor(); await firstPage.evaluate(image=>image.decode());
        const menuScroll=guest.getByRole("region",{name:"Mo Bistro menu pages"});
        assert.ok(await menuScroll.evaluate(el=>el.scrollHeight>el.clientHeight));
        await menuScroll.evaluate(el=>{el.scrollTop=500;});
        assert.ok(await menuScroll.evaluate(el=>el.scrollTop>0));
        assert.ok(await guest.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1));
        await menuScroll.evaluate(el=>{el.scrollTop=0;});
        assert.equal(await guest.getByRole("img").count(),27);
        if(screenshots) await guest.screenshot({path:path.join(screenshots,`menu-${width}.png`)});
        await guestContext.close();
      }
      const testContext = await browser.newContext({viewport:{width:390,height:844}});
      const testPage = await testContext.newPage();
      let isolatedTestAttempts = 0;
      let setupReads = 0;
      let releaseSetup;
      let holdSetup = false;
      testPage.on("dialog", dialog=>{errors.push("Unexpected native browser dialog");void dialog.dismiss();});
      await testPage.route("**/api/whatsapp/test", async route=>{
        if(route.request().method()==="POST") {
          assert.deepEqual(route.request().postDataJSON(),{confirm:true}); isolatedTestAttempts++;
          await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({state:"sent",providerStatus:200,messageId:"synthetic-only"})});
        } else {
          setupReads++;
          if (holdSetup) await new Promise(resolve=>{releaseSetup=resolve;});
          await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({visible:true,enabled:true,window_open:true,
            automaticNotifications:{live:false,windowTextEnabled:true,isolatedTestEnabled:true}})});
        }
      });
      await testPage.goto(origin+"/management");
      const sendTest = testPage.getByRole("button",{name:"Send Test WhatsApp",exact:true});
      await testPage.getByText(/Setup check 1 complete/).waitFor();
      await testPage.getByText(/live sending is disabled/).waitFor();
      await testPage.getByText(/do not subscribe a booking/).waitFor();
      holdSetup = true;
      await testPage.getByRole("button",{name:"Check setup",exact:true}).click();
      await testPage.getByRole("button",{name:"Checking setup…",exact:true}).waitFor();
      assert.equal(await sendTest.isDisabled(),true);
      assert.equal(isolatedTestAttempts,0);
      await testPage.waitForFunction(()=>document.body.textContent.includes("Checking Preview configuration"));
      while (!releaseSetup) await new Promise(resolve=>setTimeout(resolve,10));
      holdSetup = false;
      releaseSetup();
      await testPage.getByText(/Setup check 2 complete/).waitFor();
      assert.equal(setupReads,2);
      assert.equal(isolatedTestAttempts,0);
      const bulkActions=[];
      let releaseBulk;
      await testPage.route("**/api/management/danger-zone", async route=>{
        bulkActions.push(route.request().postDataJSON());
        await new Promise(resolve=>{releaseBulk=resolve;});
        await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,freed:5,cancelled:3})});
      });
      const danger=testPage.getByRole("region",{name:"Danger zone",exact:true});
      for (const action of ["free_tables","cancel_queue"]) {
        const free=action==="free_tables";
        const button=danger.getByRole("button",{name:free?"Free all tables":"Cancel all waiting bookings",exact:true});
        await button.click();
        let confirmation=testPage.getByRole("alertdialog",{name:free?"Free all tables?":"Cancel the entire waiting queue?",exact:true});
        await confirmation.getByRole("button",{name:"Cancel",exact:true}).click();
        const before=bulkActions.length;
        await button.click();
        confirmation=testPage.getByRole("alertdialog",{name:free?"Free all tables?":"Cancel the entire waiting queue?",exact:true});
        await confirmation.getByRole("button",{name:free?"Free all tables":"Cancel all waiting bookings",exact:true}).click();
        await danger.getByRole("button",{name:free?"Freeing tables…":"Cancelling bookings…",exact:true}).waitFor();
        while(!releaseBulk) await new Promise(resolve=>setTimeout(resolve,10));
        assert.equal(bulkActions.length,before+1);
        assert.deepEqual(bulkActions.at(-1),{action,confirm:true});
        assert.equal(await danger.getByRole("button").evaluateAll(buttons=>buttons.every(button=>button.disabled)),true);
        releaseBulk();releaseBulk=null;
        await danger.getByText(free?"5 tables freed. Seated bookings were preserved.":"3 waiting/called bookings cancelled. Seated guests were preserved.",{exact:true}).waitFor();
      }
      assert.equal(bulkActions.length,2);
      await sendTest.click();
      const testConfirmation = testPage.getByRole("alertdialog",{name:"Send test WhatsApp?",exact:true});
      await testConfirmation.waitFor();
      assert.equal(isolatedTestAttempts,0);
      await testConfirmation.getByRole("button",{name:"Cancel",exact:true}).click();
      assert.equal(isolatedTestAttempts,0);
      await sendTest.click();
      await testConfirmation.getByRole("button",{name:"Send test message",exact:true}).click();
      await testPage.getByText(/Meta HTTP 200: sent/).waitFor();
      assert.equal(isolatedTestAttempts,1);
      assert.equal(await sendTest.isDisabled(),true);
      await testContext.close();
      const expiryContext = await browser.newContext();
      const expiryPage = await expiryContext.newPage();
      await expiryPage.goto(origin + "/");
      await expiryPage.getByLabel("Service overview",{exact:true}).waitFor();
      await expiryPage.waitForFunction(()=>document.documentElement.dataset.theme==="dark");
      sessionStatus=503;
      await Promise.all([
        expiryPage.waitForResponse(response=>response.url().endsWith("/api/auth/me")),
        expiryPage.evaluate(()=>window.dispatchEvent(new Event("focus"))),
      ]);
      assert.equal(new URL(expiryPage.url()).pathname,"/");
      sessionStatus=401;
      await expiryPage.evaluate(()=>window.dispatchEvent(new Event("focus")));
      await expiryPage.waitForURL("**/login?reason=session-expired");
      sessionStatus=200;
      await expiryContext.close();
      assert.deepEqual(errors, []);
      console.log("Browser evidence directory: " + temp);
    } finally {
      if (browser) await browser.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
