import assert from 'node:assert/strict';
import test from 'node:test';
import { executeStructuredImport, runCli, DEFAULT_SERVER } from '../src/index.mjs';
import { DEFAULT_SCOPES, normalizeRequestedScopes, validateTokenResponse } from '../src/oauth.mjs';

const families = { flight:['flights_import','flights:write'], 'flight-seat':['flights_seat_update','flights:write'], reservation:['reservations_import','reservations:write'], 'visit-items':['visits_items_add','visits:write'] };
const handle=`pah_${'a'.repeat(43)}`;
const catalog=(family,scope)=>({capabilities:['prepare','commit'].map(step=>({name:`${family}_${step}`,
  annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[scope]}]}))});

test('each narrow CLI import discovers the complete pair and forwards the reviewed handle only',async()=>{
  for (const [kind,[family,scope]] of Object.entries(families)) {
    const calls=[];
    const result=await executeStructuredImport({server:DEFAULT_SERVER,session:{scope},kind,stage:'commit',confirmed:true,
      arguments:{action_handle:handle,idempotency_key:'commit-one'},fetchImpl:async(url,options)=>{
        calls.push({url,options});return Response.json(calls.length===1?catalog(family,scope):{result:{status:'added'}});
      }});
    assert.equal(result.result.status,'added');assert.equal(calls.length,2);
    assert.deepEqual(JSON.parse(calls[1].options.body),{capability:`${family}_commit`,arguments:{action_handle:handle,idempotency_key:'commit-one',confirmed:true}});
  }
});

test('no implicit confirmation, wrong family, mutable commit data or scope escalation',async()=>{
  const input={server:DEFAULT_SERVER,session:{scope:'flights:write'},kind:'flight',stage:'commit',confirmed:true,arguments:{action_handle:handle,idempotency_key:'commit-one'},fetchImpl:()=>{throw new Error('must not fetch');}};
  for (const changes of [{confirmed:false},{kind:'booking'},{stage:'execute'},{session:{scope:'flights:read'}},
    {arguments:{...input.arguments,seat:'2A'}},{arguments:{...input.arguments,user_id:'other'}}]) {
    await assert.rejects(()=>executeStructuredImport({...input,...changes}));
  }
  assert.deepEqual(normalizeRequestedScopes([]),[...DEFAULT_SCOPES]);
  assert.deepEqual(normalizeRequestedScopes('visits:write'),['visits:write']);
  assert.throws(()=>validateTokenResponse({token_type:'bearer',access_token:`pat_${'a'.repeat(43)}`,refresh_token:`prt_${'a'.repeat(43)}`,expires_in:3600,scope:'visits:write'},{allowedScopes:DEFAULT_SCOPES}),/not authorized/);
});

test('missing pair or changed annotations fail closed without executing',async()=>{
  for(const mutate of [c=>c.capabilities.pop(),c=>c.capabilities[1].annotations.readOnlyHint=true,
    c=>c.capabilities[1].annotations.openWorldHint=true,c=>c.capabilities[0].securitySchemes=[]]){
    const c=catalog('flights_import','flights:write');mutate(c);let calls=0;
    await assert.rejects(()=>executeStructuredImport({server:DEFAULT_SERVER,session:{scope:'flights:write'},kind:'flight',stage:'commit',confirmed:true,
      arguments:{action_handle:handle,idempotency_key:'commit-one'},fetchImpl:async()=>{calls++;return Response.json(c);}}),/not enabled/);
    assert.equal(calls,1);
  }
});

test('CLI import parsing preserves two steps and requires confirmation, not generic call',async()=>{
  const output=[]; const errors=[]; const requests=[];
  const deps={stdout:{write:s=>output.push(s)},stderr:{write:s=>errors.push(s)},
    readCredentialImpl:async()=>JSON.stringify({server:DEFAULT_SERVER,scope:'visits:write',access_token:'test',refresh_token:'test',expires_at:Date.now()+3600000}),
    fetchImpl:async(url,options)=>{requests.push({url,options});return Response.json(url.endsWith('/capabilities')?catalog('visits_items_add','visits:write'):{result:{status:'added'}});}};
  assert.equal(await runCli(['import','visit-items','commit','--input',JSON.stringify({action_handle:handle,idempotency_key:'commit-one'}),'--json'],deps),2);
  assert.equal(requests.length,0);
  assert.equal(await runCli(['import','visit-items','commit','--input',JSON.stringify({action_handle:handle,idempotency_key:'commit-one'}),'--confirm','--json'],deps),0);
  assert.equal(requests.length,2);
});
