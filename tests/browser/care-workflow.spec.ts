import { expect, test, Page } from "@playwright/test";
const client = "10000000-0000-4000-8000-000000000001";
const caregiver = "10000000-0000-4000-8000-000000000002";
const jobId = "10000000-0000-4000-8000-000000000003";
const contractId = "10000000-0000-4000-8000-000000000004";
const chatId = "10000000-0000-4000-8000-000000000005";
const region = { id: "10000000-0000-4000-8000-000000000006", municipality_id: "3550308", city: "São Paulo", state: "SP", district: "", label: "São Paulo/SP" };
const schedule = { kind: "weekly", startDate: "2090-01-02", endDate: "2090-01-09", days: [1,2,3,4,5], startTime: "08:00", endTime: "17:00", timezone: "America/Sao_Paulo" };
const opportunity = { id: jobId, title: "Companhia durante o dia", description: "Acompanhamento e atividades de companhia", care_type: "Acompanhamento e companhia", approximate_region: region.label, verified_regions: region, schedule, requirements: "Experiência com acompanhamento", hourly_rate: 30, status: "published", created_at: "2090-01-01T10:00:00Z" };
const contract = { id: contractId, opportunity_id: jobId, client_id: client, caregiver_id: caregiver, client_name: "Família", caregiver_name: "Cuidador", gross_amount: 1000, platform_fee: 100, caregiver_net_amount: 900, status: "active", starts_at: "2090-01-02T11:00:00Z", ends_at: "2090-01-10T20:00:00Z", created_at: "2090-01-01T10:00:00Z", client_signed_at: "2090-01-01T10:00:00Z", caregiver_signed_at: "2090-01-01T11:00:00Z", document_version: 1, terms: { conditions: "Condições combinadas para o atendimento" }, opportunities: opportunity };
async function mock(page: Page, role: "client" | "caregiver" = "client") {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    if (request.method() !== "GET") { const body = request.postDataJSON(); writes.push({ path, body }); return route.fulfill({ json: path === "/api/locations" ? { region } : path.endsWith("/messages") ? { message: { id: "new-message", sender_id: role === "client" ? client : caregiver, body: body.body, created_at: "2090-01-01T12:00:00Z" } } : { saved: true, opportunity, contract } }); }
    const fixtures: Record<string, unknown> = {
      "/api/auth/session": { authenticated: true, profile: { name: role === "client" ? "Família" : "Cuidador", role, verificationStatus: "approved" } },
      "/api/opportunities": { opportunities: [opportunity] }, "/api/applications": { applications: [] }, "/api/contracts": { contracts: [contract] },
      "/api/notifications": { notifications: [] }, "/api/locations": { municipalities: [{ id: "3550308", name: "São Paulo" }] },
      "/api/appointments": { currentUserId: client, appointments: [{ id: jobId, contract_id: contractId, title: "Companhia durante o dia", starts_at: contract.starts_at, ends_at: "2090-01-02T20:00:00Z", status: "scheduled", contracts: { caregiver_id: caregiver, service_snapshot: opportunity } }] },
      [`/api/contracts/${contractId}/care`]: { currentUserId: role === "client" ? client : caregiver, details: { address: "Endereço privado", care_notes: "Orientações privadas", emergency_contact: "Responsável" }, tasks: [], changes: [], reviews: [], versions: [] },
      [`/api/contracts/${contractId}/files`]: { currentUserId: client, files: [] },
      [`/api/contracts/${contractId}/payments`]: { enabled: false, payments: [] },
      "/api/stripe/connect": { enabled: false, ready: false },
      "/api/medications": { medications: [], administrations: [], hasMore: false },
      "/api/conversations": { currentUserId: client, conversations: [{ id: chatId, opportunity_id: jobId, contact_name: "Cuidador", opportunity_title: opportunity.title, unread: 2, last_body: "Olá, podemos conversar?", blocked: false, peer_read_at: null }] },
      [`/api/conversations/${chatId}/messages`]: { messages: [{ id: jobId, sender_id: caregiver, body: "Olá, podemos conversar?", created_at: "2090-01-01T10:00:00Z" }], nextCursor: null },
      [`/api/conversations/${chatId}/context`]: { opportunity, contracts: [contract] },
    };
    await route.fulfill({ json: fixtures[path] ?? {} });
  });
  await page.goto("/"); await expect(page.locator(".shell")).toBeVisible(); return writes;
}
test("família publica com localização validada e escala estruturada", async ({ page }) => {
  const writes = await mock(page);
  await page.locator(".sidebar").getByRole("button", { name: "Publicar oportunidade", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Companhia para familiar");
  await page.getByRole("combobox", { name: "Tipo de cuidado", exact: true }).selectOption("Acompanhamento e companhia");
  await page.getByLabel("Descrição", { exact: true }).fill("Acompanhamento e atividades de companhia");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("combobox", { name: "UF", exact: true }).selectOption("SP");
  await page.getByRole("combobox", { name: "Município", exact: true }).selectOption("3550308");
  await expect(page.getByText("Região selecionada:")).toContainText("São Paulo/SP");
  await page.getByLabel("Primeira data").fill("2090-01-02"); await page.getByLabel("Última data").fill("2090-01-09");
  await page.getByLabel("Valor por hora (R$)").fill("30"); await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect.poll(() => writes.filter(item => item.path === "/api/opportunities").length).toBe(1);
  expect(writes.find(item => item.path === "/api/opportunities")?.body.regionId).toBe(region.id);
  expect(writes.find(item => item.path === "/api/opportunities")?.body.schedule).toMatchObject({ startTime: "08:00", timezone: "America/Sao_Paulo" });
});

test("retorno do checkout não inventa pagamento; família atualiza e reembolsa teste", async ({ page }) => {
  await mock(page);
  let status = "open";
  const actions: string[] = [];
  await page.route(`**/api/contracts/${contractId}/payments`, async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); actions.push(body.action);
      expect(Object.keys(body).sort()).toEqual(["action", "paymentId"]);
      status = body.action === "refund" ? "refunded" : "paid";
      return route.fulfill({ json: { status, url: null } });
    }
    return route.fulfill({ json: { enabled: true, payments: [{ id: jobId, contract_version: 1, amount_cents: 100000, fee_cents: 10000, refunded_cents: status === "refunded" ? 100000 : 0, status, created_at: "2090-01-01T10:00:00Z" }] } });
  });
  await page.goto(`/?stripe=return&contract=${contractId}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Aguardando pagamento", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Pagamento de teste confirmado", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Atualizar pagamento", exact: true }).click();
  await expect(dialog.getByText("Pagamento de teste confirmado", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await dialog.getByRole("button", { name: "Reembolsar teste", exact: true }).click();
  await expect(dialog.getByText("Reembolso de teste concluído", { exact: true })).toBeVisible();
  expect(actions).toEqual(["refresh", "refund"]);
});

test("cuidador configura Stripe pelo financeiro sem botão para cobrar a família", async ({ page }) => {
  await mock(page, "caregiver");
  await page.route("**/api/stripe/connect", async route => route.fulfill({ json: { enabled: true, ready: false, registered: false } }));
  await page.goto("/?stripe=connect-refresh");
  await expect(page.getByRole("button", { name: "Configurar recebimentos de teste", exact: true })).toBeVisible();
  await expect(page.getByText("Nenhum dinheiro real será recebido.", { exact: false })).toBeVisible();
  await page.route(`**/api/contracts/${contractId}/payments`, async route => route.fulfill({ json: { enabled: true, payments: [] } }));
  await page.locator(".sidebar").getByRole("button", { name: "Meus contratos", exact: true }).click();
  await page.locator(".contract-summary").click();
  await expect(page.getByRole("dialog").getByText("A família inicia o pagamento", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Testar pagamento com cartão" })).toHaveCount(0);
});
test("contrato expõe rotina privada e contraproposta, agenda permite reagendar", async ({ page }) => {
  const writes = await mock(page);
  await page.locator(".sidebar").getByRole("button", { name: "Meus contratos", exact: true }).click();
  await page.locator(".contract-summary").click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Baixar contrato e registros de aceite" })).toBeVisible();
  await dialog.getByText("Adicionar tarefa à rotina", { exact: true }).click();
  await dialog.getByLabel("Tarefa", { exact: true }).fill("Hidratação");
  await dialog.getByLabel("Primeiro horário (fuso deste dispositivo)").fill("2090-01-03T12:00");
  await dialog.getByRole("button", { name: "Criar tarefas" }).click();
  await expect.poll(() => writes.some(item => item.body.action === "task")).toBe(true);
  await dialog.getByRole("button", { name: "Fechar contrato", exact: true }).click();
  await page.locator(".sidebar").getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: "Reagendar", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Início", { exact: true }).fill("2090-01-03T08:00");
  await page.getByRole("dialog").getByLabel("Término", { exact: true }).fill("2090-01-03T17:00");
  await page.getByLabel("Motivo", { exact: true }).fill("Ajuste combinado com a família");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
  await expect.poll(() => writes.some(item => item.body.action === "reschedule")).toBe(true);
});
test("chat mantém contexto e abre o contrato correspondente", async ({ page }) => {
  await mock(page); await page.locator(".sidebar").getByRole("button", { name: "Mensagens", exact: true }).click();
  await expect(page.locator(".chat-messages")).toContainText("Olá, podemos conversar?");
  await page.getByText("Ver vaga e contratos desta conversa", { exact: true }).click();
  await page.getByRole("button", { name: "Abrir contrato · active" }).click();
  await expect(page.getByRole("dialog")).toContainText("Companhia durante o dia");
});
test("vagas cabem em tela móvel", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mock(page, "caregiver");
  await page.locator(".mobile-nav").getByRole("button", { name: "Vagas", exact: true }).click();
  await expect(page.locator(".opportunity").getByText("São Paulo/SP", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Demonstrar interesse", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("opportunities-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const role of ["client", "caregiver"] as const) {
  test('chat identifica remetentes para ' + role, async ({ page }) => {
    await mock(page, role);
    await page.route('**/api/conversations/*/messages', route => route.fulfill({json:{currentUserId: role === 'client' ? client : caregiver, messages:[
      {id:'one',sender_id:client,body:'Mensagem da familia',created_at:'2090-01-01T10:00:00Z'},
      {id:'two',sender_id:caregiver,body:'Mensagem do cuidador',created_at:'2090-01-01T10:01:00Z'}],nextCursor:null}}));
    await page.locator('.sidebar').getByRole('button',{name:'Mensagens',exact:true}).click();
    await expect(page.locator('.chat-message.mine')).toContainText(role === 'client' ? 'Mensagem da familia' : 'Mensagem do cuidador');
    await expect(page.locator('.chat-message.theirs')).toContainText(role === 'client' ? 'Mensagem do cuidador' : 'Mensagem da familia');
  });
}
test('deslize horizontal navega e movimento vertical preserva a secao', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await mock(page);
  const area=page.locator('.greeting');
  await area.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:280,clientY:160}]});
  await area.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:100,clientY:165}]});
  await expect(page.locator('.mobile-nav button.active')).toContainText('Minhas vagas');
  await area.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:280,clientY:160}]});
  await area.dispatchEvent('touchmove',{touches:[{identifier:1,clientX:100,clientY:280}]});
  await area.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:100,clientY:280}]});
  await expect(page.locator('.mobile-nav button.active')).toContainText('Minhas vagas');
});

test('foto de perfil carrega pela mesma origem com CSP ativa', async ({page}) => {
  await mock(page);
  await page.route('**/api/auth/session',route=>route.fulfill({json:{authenticated:true,profile:{name:'Familia',role:'client',avatarUrl:'/api/profile/avatar',verificationStatus:'approved'}}}));
  await page.route('**/api/profile/avatar',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')}));
  await page.goto('/');
  await expect(page.locator('.topbar .avatar')).toHaveCSS('background-image', /api\/profile\/avatar/);
  const loaded = await page.evaluate(async()=>{const image=new Image();image.src='/api/profile/avatar';await image.decode();return image.naturalWidth;});
  expect(loaded).toBe(1);
});

 test('menu mobile oferece contratos e financeiro', async ({page}) => {
 await page.setViewportSize({width:390,height:844}); await mock(page,'caregiver');
 await page.locator('.mobile-nav').getByRole('button',{name:'Mais',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Financeiro',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.locator('.mobile-nav button.active')).toContainText('Mais');
 await page.locator('.mobile-nav').getByRole('button',{name:'Mais',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'Meus contratos',exact:true}).click();
 await expect(page.locator('.contract-summary')).toBeVisible();
 });
 test('navegar pede confirmacao e preserva rascunho quando cancelado', async ({page}) => {
 await mock(page); await page.locator('.sidebar').getByRole('button',{name:'Publicar oportunidade',exact:true}).click();
 await page.getByLabel('Título',{exact:true}).fill('Rascunho importante');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('.sidebar').getByRole('button',{name:'Agenda',exact:true}).click();
 await expect(page.getByLabel('Título',{exact:true})).toHaveValue('Rascunho importante');
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.sidebar').getByRole('button',{name:'Agenda',exact:true}).click();
 await expect(page.getByLabel('Título',{exact:true})).toHaveCount(0);
 });

test('troca automatica de conversa nao mistura historico nem rascunho', async ({page})=>{
 await mock(page);await page.locator('.sidebar').getByRole('button',{name:'Mensagens',exact:true}).click();
 await expect(page.locator('.chat-messages')).toContainText('podemos conversar');
 await page.getByRole('textbox',{name:'Mensagem',exact:true}).fill('Rascunho antigo');
 const next='10000000-0000-4000-8000-000000000099';
 await page.route('**/api/conversations',route=>route.fulfill({json:{currentUserId:client,conversations:[{id:next,opportunity_id:jobId,contact_name:'Novo contato',opportunity_title:'Outra conversa',unread:0,last_body:'',blocked:false,peer_read_at:null}]}}));
 await page.route('**/api/conversations/'+next+'/messages',route=>route.fulfill({json:{messages:[{id:'new',sender_id:caregiver,body:'Historico novo',created_at:'2090-01-01T11:00:00Z'}],nextCursor:null}}));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('.chat-messages')).toContainText('Historico novo');
 await expect(page.locator('.chat-messages')).not.toContainText('podemos conversar');
 await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveValue('');
});

test('modo simples mostra atendimento real e ajuda com contato',async({page})=>{
 await page.setViewportSize({width:390,height:844});await mock(page);
 await expect(page.getByRole('region',{name:'Seu próximo atendimento'})).toContainText('Companhia durante o dia');
 await page.getByRole('button',{name:'Usar modo simples',exact:true}).click();
 await expect(page.locator('.sidebar')).toBeHidden();
 await expect(page.locator('.mobile-nav')).toBeHidden();
 await page.locator('.simple-actions').getByRole('button',{name:'Pedir ajuda',exact:true}).click();
 await expect(page.getByRole('link',{name:'Enviar e-mail ao suporte'})).toHaveAttribute('href',/mailto:contato.suporte@zeloucuidados.com/);
 await page.getByText('Atrasos, cancelamentos e substituição',{exact:true}).click();
 await expect(page.getByText('Cancelar um plantão não cancela automaticamente',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Usar painel completo',exact:true}).click();
 await expect(page.locator('.mobile-nav')).toBeVisible();
});
test('cuidador acessa proximo plantao e regiao sem expor endereco no mapa',async({page})=>{
 await mock(page,'caregiver');await page.getByText('Planejar deslocamento',{exact:true}).click();
 await expect(page.getByRole('link',{name:'Consultar região aproximada no Google Maps'})).toHaveAttribute('href',/query=S%C3%A3o%20Paulo%2FSP/);
 await page.getByRole('button',{name:'Ver tarefas, endereço e contato'}).click();
 await expect(page.getByRole('dialog')).toContainText('Companhia durante o dia');
});
