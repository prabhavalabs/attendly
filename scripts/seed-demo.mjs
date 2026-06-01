#!/usr/bin/env node
/**
 * Demo-data seeder — populates a running attendly backend with a realistic
 * dataset (lecturers, classes, timetables, ~100 students, enrollments,
 * sessions, attendance, invoices + payments) so you can exercise pagination,
 * reports and the UI against real data.
 *
 * Usage (backend must be running + owner seeded):
 *   API_BASE=http://localhost:8787 \
 *   OWNER_EMAIL=theekshana2@gmail.com OWNER_PASSWORD=nipun1992 \
 *   node scripts/seed-demo.mjs
 */

const API = process.env.API_BASE ?? "http://localhost:8787";
const EMAIL = process.env.OWNER_EMAIL ?? "theekshana2@gmail.com";
const PASSWORD = process.env.OWNER_PASSWORD ?? "nipun1992";
const STUDENT_COUNT = Number(process.env.STUDENT_COUNT ?? 100);
const TODAY = new Date(); // server date

let token = "";

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const chance = (p) => Math.random() < p;
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (d, days) => new Date(d.getTime() + days * 86400000);

const FIRST = ["Nimal", "Kamal", "Sunil", "Amara", "Dilani", "Sanduni", "Tharindu", "Kasun", "Ishara", "Nuwan",
  "Sachini", "Hashan", "Ruwan", "Madhavi", "Chathura", "Dinusha", "Ravindu", "Pasan", "Hiruni", "Oshadi",
  "Lakshan", "Gayan", "Sewwandi", "Buddhika", "Thilini", "Yasiru", "Nethmi", "Sahan", "Imasha", "Dulanjana"];
const LAST = ["Perera", "Fernando", "Silva", "Jayasuriya", "Bandara", "Wickramasinghe", "Rajapaksa", "Gunawardena",
  "Dissanayake", "Senanayake", "Ekanayake", "Herath", "Kumara", "Wijesinghe", "Madushanka", "Weerasinghe"];
const SUBJECTS = [
  ["Physics", "PHY"], ["Chemistry", "CHE"], ["Combined Maths", "CMB"], ["Biology", "BIO"],
  ["English", "ENG"], ["ICT", "ICT"], ["Economics", "ECN"], ["Accounting", "ACC"],
  ["Sinhala", "SIN"], ["Business Studies", "BST"],
];
const BANDS = ["teal", "amber", "coral", "blue", "violet", "green"];
const REL = ["father", "mother", "guardian"];

function phone() {
  return `07${pick(["1", "2", "5", "6", "7", "8"])}${String(rand(10000000)).padStart(7, "0")}`;
}

async function main() {
  console.log(`Seeding ${API} as ${EMAIL} …`);
  ({ tokens: { access_token: token } } = await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD }));

  // 1. Lecturers
  const lecturers = [];
  for (let i = 0; i < 8; i++) {
    const l = await api("POST", "/api/lecturers", { name: `${pick(["Mr.", "Mrs.", "Ms.", "Dr."])} ${pick(LAST)}`, phone: phone() });
    lecturers.push(l.id);
  }
  console.log(`  ✓ ${lecturers.length} lecturers`);

  // 2. Classes (one per subject) + timetable slots
  const classes = [];
  for (const [subject, code] of SUBJECTS) {
    const grade = pick(["2026 A/L", "2027 A/L", "Grade 11"]);
    const cls = await api("POST", "/api/classes", {
      name: `${subject} — ${grade}`,
      subject,
      code: `${code}-${rand(90) + 10}`,
      band: pick(BANDS),
      fee_minor: (rand(6) + 2) * 50000, // LKR 1000–3500 in cents
      capacity: chance(0.4) ? 40 + rand(20) : null,
      lecturer_id: pick(lecturers),
      room: `Hall ${pick(["A", "B", "C", "D"])}`,
    });
    // 1–2 weekly slots
    const days = [...new Set([1 + rand(6), 1 + rand(6)])];
    for (const wd of days) {
      const startH = 8 + rand(8);
      await api("POST", `/api/classes/${cls.id}/timetable`, {
        weekday: wd, start_time: `${pad(startH)}:00`, end_time: `${pad(startH + 2)}:00`, room: cls.room,
      });
    }
    classes.push({ id: cls.id, slots: days.length });
  }
  console.log(`  ✓ ${classes.length} classes (with timetables)`);

  // 3. Students (+ optional guardian) and enrollments
  const enrollByClass = new Map(classes.map((c) => [c.id, []]));
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const status = chance(0.9) ? "active" : pick(["inactive", "graduated", "withdrawn"]);
    const guardians = chance(0.7)
      ? [{ name: `${pick(FIRST)} ${pick(LAST)}`, phone: phone(), relationship: pick(REL), is_primary: true }]
      : [];
    const stu = await api("POST", "/api/students", { full_name: name, phone: phone(), status, guardians });

    // enroll active students into 1–3 classes
    if (status === "active") {
      const picks = [...new Set([pick(classes), pick(classes), pick(classes)].slice(0, 1 + rand(3)))];
      for (const c of picks) {
        try {
          await api("POST", `/api/classes/${c.id}/enrollments`, { student_id: stu.id });
          enrollByClass.get(c.id).push(stu.id);
        } catch {
          /* class_full — skip */
        }
      }
    }
    if ((i + 1) % 25 === 0) console.log(`  … ${i + 1}/${STUDENT_COUNT} students`);
  }
  const totalEnroll = [...enrollByClass.values()].reduce((n, a) => n + a.length, 0);
  console.log(`  ✓ ${STUDENT_COUNT} students, ${totalEnroll} enrollments`);

  // 4. Generate sessions across ~6 weeks past → 2 weeks ahead
  const from = iso(addDays(TODAY, -42));
  const to = iso(addDays(TODAY, 14));
  const gen = await api("POST", "/api/sessions/generate", { from, to });
  console.log(`  ✓ generated ${gen.created} sessions (${from} → ${to})`);

  // 5. Mark attendance on past sessions (and set their status)
  const sessions = (await api("GET", `/api/sessions?from=${from}&to=${to}`)).sessions;
  const todayStr = iso(TODAY);
  let marked = 0;
  for (const s of sessions) {
    const past = s.session_date < todayStr;
    const isToday = s.session_date === todayStr;
    if (!past && !isToday) continue;
    await api("PATCH", `/api/sessions/${s.id}`, { status: past ? "closed" : "open" });
    const roster = enrollByClass.get(s.class_id) ?? [];
    const items = [];
    for (const studentId of roster) {
      if (chance(0.12)) continue; // ~12% absent (unmarked)
      items.push({ session_id: s.id, student_id: studentId, method: "manual", status: chance(0.1) ? "late" : "present" });
    }
    if (items.length) {
      await api("POST", "/api/checkin/batch", { items });
      marked += items.length;
    }
  }
  console.log(`  ✓ attendance marked (${marked} records across past/today sessions)`);

  // 6. Billing — invoices for last two months + payments (paid / partial / defaulter mix)
  const period = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const periods = [period(addDays(TODAY, -35)), period(TODAY)];
  for (const p of periods) {
    const { created } = await api("POST", "/api/invoices/generate", { period: p });
    console.log(`  ✓ invoices for ${p}: ${created}`);
  }
  const invoices = (await api("GET", "/api/invoices")).invoices;
  let paid = 0, partial = 0, unpaid = 0;
  for (const inv of invoices) {
    const r = Math.random();
    if (r < 0.6) {
      await api("POST", "/api/payments", { invoice_id: inv.id, amount_minor: inv.amount_minor, method: "cash" });
      paid++;
    } else if (r < 0.8) {
      await api("POST", "/api/payments", { invoice_id: inv.id, amount_minor: Math.round(inv.amount_minor / 2), method: "cash" });
      partial++;
    } else {
      unpaid++; // leave outstanding → defaulter
    }
  }
  console.log(`  ✓ payments: ${paid} paid, ${partial} partial, ${unpaid} unpaid (defaulters)`);

  console.log("\nDone. Explore the admin at http://localhost:5173");
}

main().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
