import assert from "node:assert/strict";
import test from "node:test";
import { scheduleSchema, scheduleEstimate, scheduleSummary } from "../src/lib/care-planning.ts";
import { allowedPushEndpoint } from "../src/lib/push.ts";
const schedule = { kind: "weekly", startDate: "2026-10-05", endDate: "2026-10-09", days: [1,2,3,4,5], startTime: "20:00", endTime: "08:00", timezone: "America/Sao_Paulo" };
test("escala valida datas, turnos noturnos e estimativa do período inteiro", () => {
  assert.equal(scheduleSchema.safeParse(schedule).success, true);
  assert.equal(scheduleEstimate(schedule,25),1500);
  assert.match(scheduleSummary(schedule), /dia seguinte/);
  assert.equal(scheduleSchema.safeParse({ ...schedule, days: [0] }).success,false);
  assert.equal(scheduleSchema.safeParse({ ...schedule, days: [1,1] }).success,false);
  assert.equal(scheduleSchema.safeParse({ ...schedule, endDate: "2028-01-01" }).success,false);
  assert.equal(scheduleSchema.safeParse({ ...schedule, startDate: "2026-02-30" }).success,false);
  assert.equal(scheduleSchema.safeParse({ ...schedule, startTime: "99:00" }).success,false);
  assert.equal(scheduleSchema.safeParse({ ...schedule, kind: "once" }).success,false);
  assert.equal(scheduleSchema.safeParse({ ...schedule, startTime: "08:00" }).success,false);
});
test("push rejeita destinos locais, credenciais na URL e hosts disfarçados", () => {
  for (const endpoint of ["http://127.0.0.1/a", "https://localhost/a", "https://fcm.googleapis.com.evil.example/a", "https://user:pass@fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a", "https://169.254.169.254/"]) assert.equal(allowedPushEndpoint(endpoint),false,endpoint);
  assert.equal(allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/test"),true);
  assert.equal(allowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/test"),true);
});
