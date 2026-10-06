import { z } from "zod";

export const states = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"] as const;
export const timezones = ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha"] as const;
export const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, "Data inválida.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleSchema = z.object({
  kind: z.enum(["once", "weekly"]), startDate: date, endDate: date,
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startTime: time, endTime: time, timezone: z.enum(timezones),
}).superRefine((value, context) => {
  if (value.endDate < value.startDate || Date.parse(value.endDate) - Date.parse(value.startDate) > 365 * 86400000) context.addIssue({ code: "custom", message: "O período deve ter até 366 dias e término posterior ao início." });
  if (value.kind === "once" && value.startDate !== value.endDate) context.addIssue({ code: "custom", message: "Atendimento pontual deve ter uma única data." });
  if (value.startTime === value.endTime) context.addIssue({ code: "custom", message: "Informe horários diferentes para início e fim." });
  if (new Set(value.days).size !== value.days.length) context.addIssue({ code: "custom", message: "Dias repetidos." });
  if (value.kind === "weekly") {
    let found = false;
    for (let day = Date.parse(value.startDate); day <= Date.parse(value.endDate); day += 86400000) if (value.days.includes(new Date(day).getUTCDay())) found = true;
    if (!found) context.addIssue({ code: "custom", message: "Nenhum dia da escala está dentro do período." });
  }
});
export type CareSchedule = z.infer<typeof scheduleSchema>;
export function scheduleSummary(value: unknown) {
  const parsed = scheduleSchema.safeParse(value);
  if (!parsed.success) return "Escala antiga: confirme os horários antes de contratar";
  const s = parsed.data;
  return `${s.kind === "once" ? "Pontual" : s.days.map(day => weekdays[day]).join(", ")} · ${s.startTime}–${s.endTime}${s.endTime < s.startTime ? " (dia seguinte)" : ""} · ${s.startDate.split("-").reverse().join("/")} a ${s.endDate.split("-").reverse().join("/")} · ${s.timezone}`;
}
export function scheduleEstimate(value: unknown, rate: number) {
  const parsed = scheduleSchema.safeParse(value); if (!parsed.success) return 0;
  const s = parsed.data;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const duration = (minutes(s.endTime) - minutes(s.startTime) + 1440) % 1440;
  let count = 0;
  for (let day = Date.parse(s.startDate); day <= Date.parse(s.endDate); day += 86400000) if (s.kind === "once" || s.days.includes(new Date(day).getUTCDay())) count++;
  return Math.round(count * duration / 60 * rate * 100) / 100;
}
