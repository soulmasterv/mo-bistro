import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness, request, context, requireDependency } from './handler-harness.mjs';
const { PGlite } = requireDependency('@electric-sql/pglite');
function adapter(db) {
  const sql=async(strings,...values)=>{
    let query='';
    for(let i=0;i<strings.length;i++) query+=strings[i]+(i<values.length?'$'+(i+1):'');
    return (await db.query(query,values)).rows;
  };
  sql.begin=fn=>db.transaction(tx=>fn(adapter(tx)));
  return sql;
}
async function setup({migrate=true}={}) {
  const db=new PGlite();
  await db.exec(fs.readFileSync('migrations/001_postgres_schema.sql','utf8'));
  await db.exec("INSERT INTO staff_users(username,role,credential_hash) VALUES ('manager','manager','test'),('reception','reception','test'); INSERT INTO guests(name,phone,party_size,seating_preference,tracking_token_hash) VALUES ('Guest One','01000000000',2,'any','private-tracking');");
  if(migrate) {
    await db.exec(fs.readFileSync('migrations/20261016_staff_booking_edits.sql','utf8'));
    await db.exec(fs.readFileSync('migrations/20261016_staff_booking_audit_json.sql','utf8'));
  }
  const h=harness();h.mocks['@/lib/postgres-db']={getPostgres:()=>adapter(db)};
  const route=h.route('guests/[id]/staff-details');
  const patch=body=>route.PATCH(request('PATCH',body),context(1));
  const get=()=>route.GET(request('GET'),context(1));
  const values={revision:0,name:'Guest One',party_size:2,seating_preference:'any',notes:''};
  return {db,h,route,patch,get,values};
}

test('staff booking notes fail safely without their migration',async()=>{
  const t=await setup({migrate:false});try {
    assert.equal((await t.get()).status,503);
    assert.equal((await t.patch({...t.values,notes:'Private'})).status,503);
    assert.equal((await t.db.query('SELECT name FROM guests')).rows[0].name,'Guest One');
  }finally{await t.db.close();}
});

test('notes and booking edits save atomically with server actor and private before/after history',async()=>{
  const t=await setup();try{
    t.h.state.actor={id:2,role:'reception',username:'reception'};
    const response=await t.patch({...t.values,name:'Updated Guest',party_size:4,seating_preference:'outdoor',notes:'  Allergy: nuts\nWindow requested  '});
    assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
    const data=await (await t.get()).json();
    assert.equal(data.booking.notes,'Allergy: nuts\nWindow requested');
    assert.equal(data.booking.party_size,4);assert.equal(data.booking.seating_preference,'outdoor');
    assert.equal(data.history.length,1);assert.equal(data.history[0].actor,'reception');
    assert.equal(data.history[0].before_values.name,'Guest One');
    assert.equal(data.history[0].after_values.name,'Updated Guest');
    await t.db.exec("UPDATE staff_users SET username='renamed' WHERE id=2");
    assert.equal((await (await t.get()).json()).history[0].actor,'reception');
    assert.equal((await t.db.query('SELECT phone,status,confirmed,tracking_token_hash FROM guests')).rows[0].phone,'01000000000');
    const listed=await (await t.h.route('guests').GET()).json();
    assert.ok(!JSON.stringify(listed).includes('Allergy'));
    assert.ok(!Object.hasOwn(listed[0],'notes'));
  }finally{await t.db.close();}
});

test('stale staff saves conflict instead of overwriting, and unchanged saves create no history',async()=>{
  const t=await setup();try{
    assert.equal((await t.patch(t.values)).status,200);
    assert.equal((await t.get()).status,200);
    assert.equal((await t.db.query('SELECT * FROM guest_booking_changes')).rows.length,0);
    assert.equal((await t.patch({...t.values,notes:'First shift'})).status,200);
    assert.equal((await t.patch({...t.values,notes:'Stale second shift'})).status,409);
    const data=await (await t.get()).json();
    assert.equal(data.booking.notes,'First shift');assert.equal(data.booking.revision,1);
    assert.equal(data.history.length,1);
  }finally{await t.db.close();}
});

test('seating blocks detail edits but permits notes; closed bookings are protected and cleanup cascades',async()=>{
  const t=await setup();try{
    await t.db.exec("UPDATE guests SET status='seated' WHERE id=1");
    assert.equal((await t.patch({...t.values,party_size:5})).status,409);
    assert.equal((await t.patch({...t.values,name:'Different Guest'})).status,409);
    assert.equal((await t.patch({...t.values,seating_preference:'indoor'})).status,409);
    assert.equal((await t.patch({...t.values,notes:'Seated handover'})).status,200);
    await t.db.exec("UPDATE guests SET status='cancelled' WHERE id=1");
    assert.equal((await t.patch({...t.values,revision:1,notes:'Closed'})).status,409);
    await t.db.exec('DELETE FROM guests WHERE id=1');
    assert.equal((await t.db.query('SELECT * FROM guest_staff_details')).rows.length,0);
    assert.equal((await t.db.query('SELECT * FROM guest_booking_changes')).rows.length,0);
    assert.equal((await t.get()).status,404);
  }finally{await t.db.close();}
});

test('auth, cross-origin, license and strict validation protect private booking mutations',async()=>{
  const t=await setup();try{
    for(const actor of [null,{id:2,role:'waiter'}]) {
      t.h.state.actor=actor;
      assert.equal((await t.get()).status,401);assert.equal((await t.patch(t.values)).status,401);
    }
    t.h.state.actor={id:1,role:'manager'};
    assert.equal((await t.route.PATCH(request('PATCH',t.values,{origin:'https://evil.test'}),context(1))).status,403);
    t.h.state.license=false;assert.equal((await t.patch(t.values)).status,403);t.h.state.license=true;
    for(const invalid of [{party_size:31},{party_size:1.5},{party_size:0},{name:'A'},{name:'Bad\0Name'},
      {seating_preference:'roof'},{notes:'x'.repeat(1001)},{notes:'bad\0note'},{phone:'01011111111'},
      {actor_id:2},{revision:-1},{status:'seated'}]) assert.equal((await t.patch({...t.values,...invalid})).status,400);
    assert.equal((await t.route.GET(request('GET'),context('1x'))).status,400);
    assert.equal((await t.db.query('SELECT * FROM guest_booking_changes')).rows.length,0);
  }finally{await t.db.close();}
});

test('audit failure rolls back both booking changes and staff notes',async()=>{
  const t=await setup();try{
    await t.db.exec("CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END $$; CREATE TRIGGER reject_test_audit BEFORE INSERT ON guest_booking_changes FOR EACH ROW EXECUTE FUNCTION reject_test_audit();");
    assert.equal((await t.patch({...t.values,name:'Must roll back',notes:'Must roll back'})).status,503);
    assert.equal((await t.db.query('SELECT name FROM guests WHERE id=1')).rows[0].name,'Guest One');
    assert.equal((await t.db.query('SELECT * FROM guest_staff_details')).rows.length,0);
  }finally{await t.db.close();}
});

test('audit repair normalizes serialized snapshots and rejects future non-object snapshots',async()=>{
  const t=await setup();try{
    await t.db.exec('ALTER TABLE guest_booking_changes DROP CONSTRAINT guest_booking_changes_snapshot_objects');
    const snapshot={name:'Synthetic historical name',party_size:2,seating_preference:'any',notes:'Synthetic note'};
    await t.db.query('INSERT INTO guest_booking_changes(guest_id,actor_id,actor_label,before_values,after_values) VALUES(1,1,$1,$2::jsonb,$2::jsonb)',
      ['manager',JSON.stringify(JSON.stringify(snapshot))]);
    await t.db.exec(fs.readFileSync('migrations/20261016_staff_booking_audit_json.sql','utf8'));
    const row=(await t.db.query('SELECT before_values,after_values FROM guest_booking_changes')).rows[0];
    assert.deepEqual(row.before_values,snapshot);assert.deepEqual(row.after_values,snapshot);
    await assert.rejects(t.db.query("UPDATE guest_booking_changes SET before_values='\"not an object\"'::jsonb"),e=>e.code==='23514');
  }finally{await t.db.close();}
});
