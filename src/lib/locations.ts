import { z } from "zod";
import { states } from "@/lib/care-planning";

const municipalitySchema = z.object({ id: z.number(), nome: z.string(), microrregiao: z.object({ mesorregiao: z.object({ UF: z.object({ sigla: z.enum(states) }) }) }).nullable(), "regiao-imediata": z.object({ "regiao-intermediaria": z.object({ UF: z.object({ sigla: z.enum(states) }) }) }).optional() });
async function externalJson(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
  if (!response.ok) throw new Error("Serviço de localidades indisponível. Tente novamente.");
  return response.json();
}
export async function municipalities(state: string) {
  const uf = z.enum(states).parse(state);
  const data = z.array(municipalitySchema).parse(await externalJson(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`));
  return data.map(item => ({ id: String(item.id), name: item.nome }));
}
export async function resolveRegion(input: { municipalityId?: string; cep?: string }) {
  let id = input.municipalityId;
  let district = "";
  let postalState: string | undefined;
  if (input.cep) {
    const cep = z.string().regex(/^\d{8}$/).parse(input.cep);
    const postal = z.object({ erro: z.union([z.boolean(), z.string()]).optional(), ibge: z.string().optional(), bairro: z.string().optional(), uf: z.string().optional() }).parse(await externalJson(`https://viacep.com.br/ws/${cep}/json/`));
    if (postal.erro || !postal.ibge) throw new Error("CEP não encontrado. Selecione o município ou corrija o CEP.");
    id = postal.ibge; district = postal.bairro ?? ""; postalState = postal.uf;
  }
  z.string().regex(/^\d{7}$/).parse(id);
  const city = municipalitySchema.parse(await externalJson(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${id}`));
  const state = city.microrregiao?.mesorregiao.UF.sigla ?? city["regiao-imediata"]?.["regiao-intermediaria"].UF.sigla;
  if (!state || (postalState && state !== postalState)) throw new Error("Município e UF incompatíveis.");
  return { municipality_id: String(city.id), city: city.nome, state, district, label: `${district ? district + " — " : ""}${city.nome}/${state}` };
}
