const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function backend(options={}) {
 const props=new Map([['TURNSTILE_SECRET_KEY','TEST_SERVER_KEY'],['TURNSTILE_SITE_KEY','PUBLIC_SITE_KEY'],['REGISTRATION_EMAILS_ENABLED','true'],['REGISTRATION_EMAIL_SPREADSHEET_ID','TEST_SHEET']]);
 let fetches=0,writes=0,sends=0;
 const rows=options.rows||[];
 const sheet={getLastRow:()=>rows.length+1,getRange:()=>({getValues:()=>rows,setValues:()=>{writes++;},setValue:()=>{},insertCheckboxes:()=>{}})};
 const c=vm.createContext({Date,console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperties:o=>Object.entries(o).forEach(([k,v])=>props.set(k,v))})},
  UrlFetchApp:{fetch:(url,request)=>{fetches++;assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');assert.equal(request.payload.secret,'TEST_SERVER_KEY');return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(options.verification||{success:true,hostname:'hanklumbard.github.io',action:'ski-registration'})};}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>sheet}),openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
  Utilities:{newBlob:t=>({getBytes:()=>Buffer.from(t)}),base64Encode:b=>Buffer.from(b).toString('base64')},
  HtmlService:{XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:t=>({setXFrameOptionsMode:()=>JSON.parse(Buffer.from(t.match(/atob\("([^"]+)"\)/)[1],'base64').toString())})}
 });
 vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 c.getSettings_=()=>({registrationOpen:true,cardPrices:{Student:45,Adult:45}});
 c.getSheet_=()=>sheet;c.newCode_=()=> 'ABCD';c.findRegistration_=()=>options.prior?{displayId:'ABCD'}:null;c.sendRegistrationReceipt_=()=>{sends++;};
 return {c,props,stats:()=>({fetches,writes,sends})};
}
function payload(){return {registrationId:'11111111-1111-4111-8111-111111111111',turnstileToken:'TEST_TOKEN',guardian:{firstName:'Test',lastName:'Parent',email:'test@example.com',cell:'555-123-4567',street:'1 Test St',city:'Test City',state:'MI',zip:'49000'},people:[{firstName:'Test',lastName:'Student',type:'Student'}],total:45};}
function post(api,p){return api.c.doPost({parameter:{payload:JSON.stringify(p),nonce:'TEST_NONCE'}});}
test('Missing verification never writes a registration',()=>{const a=backend();const p=payload();delete p.turnstileToken;assert.equal(post(a,p).ok,false);assert.deepEqual(a.stats(),{fetches:0,writes:0,sends:0});});
test('Forged, wrong-hostname and wrong-action verification cannot register',()=>{for(const verification of [{success:false},{success:true,hostname:'attacker.example',action:'ski-registration'},{success:true,hostname:'hanklumbard.github.io',action:'other'}]){const a=backend({verification});assert.equal(post(a,payload()).ok,false);assert.equal(a.stats().writes,0);}});
test('Valid verification saves once and computes the existing card total',()=>{const a=backend();const r=post(a,payload());assert.equal(r.ok,true);assert.equal(r.displayId,'ABCD');assert.deepEqual(a.stats(),{fetches:1,writes:1,sends:0});});
test('Same-ID retry succeeds without a reused token or another write/email',()=>{const a=backend({prior:true});const p=payload();delete p.turnstileToken;assert.equal(post(a,p).duplicate,true);assert.deepEqual(a.stats(),{fetches:0,writes:0,sends:0});});
test('Missing private key fails closed and public settings expose only the site key',()=>{const a=backend();a.props.delete('TURNSTILE_SECRET_KEY');assert.equal(post(a,payload()).ok,false);assert.equal(a.stats().writes,0);const b=backend();const s=b.c.getPublicSettings_();assert.equal(s.turnstileSiteKey,'PUBLIC_SITE_KEY');assert.equal(JSON.stringify(s).includes('TEST_SERVER_KEY'),false);});
test('Multiple email recipients and incorrect totals are rejected before verification',()=>{for(const mutate of [p=>p.guardian.email='a@example.com,b@example.com',p=>p.total=1]){const a=backend(),p=payload();mutate(p);assert.equal(post(a,p).ok,false);assert.equal(a.stats().fetches,0);assert.equal(a.stats().writes,0);}});
function row(id,email,date,status=''){const r=Array(21).fill('');r[0]=date;r[1]='ABCD';r[4]=email;r[13]=45;r[17]=id;r[18]=status;return r;}
test('Rate counts deduplicate cardholder rows, normalize emails and exclude old records',()=>{const a=backend(),now=new Date('2026-10-12T12:00:00Z');const rows=[row('a','TEST@EXAMPLE.COM',new Date('2026-10-12T11:50:00Z')),row('a','TEST@EXAMPLE.COM',now),row('b','other@example.com',new Date('2026-10-12T09:00:00Z')),row('c','test@example.com',new Date('2026-10-10T12:00:00Z'))];assert.equal(JSON.stringify(a.c.countRecentRegistrations_(rows,'test@example.com',now)),JSON.stringify({hour:1,day:2,emailHour:1,emailDay:1}));});
test('Repeated registrations for one email are blocked without writes',()=>{const a=backend({rows:[1,2,3].map(i=>row(String(i),'test@example.com',new Date()))});assert.equal(post(a,payload()).ok,false);assert.equal(a.stats().writes,0);});
test('Daily receipt budget reserves attempts and leaves excess receipts pending',()=>{const a=backend({rows:[1,2,3,4].map(i=>row(String(i),'test@example.com',new Date(),'Pending'))});a.props.set('RECEIPT_BUDGET_DAY',new Date().toISOString().slice(0,10));a.props.set('RECEIPT_BUDGET_COUNT','88');a.c.sendPendingRegistrationReceipts();assert.equal(a.stats().sends,2);assert.equal(a.props.get('RECEIPT_BUDGET_COUNT'),'90');a.c.sendPendingRegistrationReceipts();assert.equal(a.stats().sends,2);});
