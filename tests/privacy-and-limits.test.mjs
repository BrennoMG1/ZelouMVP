import test from 'node:test';
import assert from 'node:assert/strict';
import { careDatabase, asUser } from './helpers/care-database.mjs';
const user='10000000-0000-4000-8000-000000000001';
const admin='10000000-0000-4000-8000-000000000002';
test('contador compartilhado é atômico, expira e não pode ser consumido diretamente pelo cliente',async()=>{
  const db=await careDatabase();try{
    const key='a'.repeat(64);
    const calls=await Promise.all(Array.from({length:12},()=>db.query('select consume_request_limit($1,5) allowed',[key])));
    assert.equal(calls.filter(r=>r.rows[0].allowed).length,5);
    await db.query("update request_limits set expires_at=now()-interval '1 second'");
    assert.equal((await db.query('select consume_request_limit($1,5) allowed',[key])).rows[0].allowed,true);
    await asUser(db,user);await assert.rejects(db.query('select consume_request_limit($1,5)',[key]),/permission denied/);
  }finally{await db.close();}
});
test('privacidade: usuário não conclui pedido, encerramento é retomável e JWT antigo perde acesso',async()=>{
  const db=await careDatabase();try{
    await db.query('insert into auth.users(id) values($1),($2)',[user,admin]);
    await db.query("insert into profiles(id,full_name,role,phone) values($1,'Personal name','client','123'),($2,'Admin','admin',null)",[user,admin]);
    await db.query('insert into storage.objects(id,owner) values($1,$1)',[user]);
    await asUser(db,user);
    assert.equal((await db.query('select * from storage.objects')).rows.length,1);
    const id=(await db.query("insert into privacy_requests(user_id,request_type,details) values($1,'deletion','Encerrar minha conta') returning id",[user])).rows[0].id;
    await assert.rejects(db.query("update privacy_requests set status='completed' where id=$1",[id]),/permission denied/);
    await assert.rejects(db.query("insert into privacy_requests(user_id,request_type,status) values($1,'deletion','completed')",[user]),/permission denied/);
    await assert.rejects(db.query("select review_privacy_request($1,'completed','Resposta administrativa')",[id]),/Acesso negado/);
    await asUser(db,admin);
    await db.query("select review_privacy_request($1,'in_progress','Pedido em análise administrativa')",[id]);
    await assert.rejects(db.query("select review_privacy_request($1,'completed','Encerramento não executado')",[id]),/processamento/);
    await db.exec('reset role');
    await db.query("select prepare_account_closure($1,$2,'Histórico contratual e auditoria preservados; solicitante informado.')",[id,admin]);
    await db.query("select prepare_account_closure($1,$2,'Repetição segura da mesma solicitação.')",[id,admin]);
    await asUser(db,user);
    assert.equal((await db.query('select active_account_uid() id')).rows[0].id,null);
    assert.equal((await db.query('select * from storage.objects')).rows.length,0);
    assert.equal((await db.query('select * from profiles')).rows.length,0);
    await assert.rejects(db.query("insert into privacy_requests(user_id,request_type) values($1,'correction')",[user]),/row-level security/);
    await assert.rejects(db.query('select care_applicant_profile($1)',[admin]),/Acesso negado/);
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.role','service_role',false)");
    await db.query('select finish_account_closure($1)',[id]);await db.query('select finish_account_closure($1)',[id]);
    assert.equal((await db.query('select full_name from profiles where id=$1',[user])).rows[0].full_name,'Conta encerrada');
    assert.equal((await db.query('select status from privacy_requests where id=$1',[id])).rows[0].status,'completed');
    assert.equal((await db.query("select count(*)::int n from audit_logs where action='privacy.account_closed_with_retention'")).rows[0].n,1);
  }finally{await db.close();}
});
