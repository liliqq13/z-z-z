import test from 'node:test'
import assert from 'node:assert/strict'
import {generatePlan,reasonsFor,actualMinutes,weeklyMinutes,validateRecord,validateBackup,isShiftScheduled,hours} from '../src/lib/engine.js'
const staff=Array.from({length:4},(_,i)=>({id:`p${i}`,name:`人员${i}`,canDrive:true,active:true,unavailableDates:[],unavailableWeekdays:[]}))
const shifts=[{id:'day',name:'白班',start:'08:00',end:'16:00',need:1,days:[0,1,2,3,4,5,6]}]
const config={minRestHours:10,maxWeeklyHours:48,onePerDay:true}
const assignment=(o={})=>({id:'a',date:'2026-11-01',staffId:'p0',staffName:'人员0',shiftId:'day',shiftName:'白班',start:'08:00',end:'16:00',...o})
test('balances eligible people and never violates its own constraints',()=>{const p=generatePlan({staff,shifts,config,assignments:[],start:'2026-11-01',end:'2026-11-28'});assert.equal(p.missing,0);const counts=staff.map(s=>p.assignments.filter(a=>a.staffId===s.id).length);assert.ok(Math.max(...counts)-Math.min(...counts)<=1);for(const a of p.assignments)assert.deepEqual(reasonsFor(staff.find(s=>s.id===a.staffId),a,p.assignments,config),[])})
test('preserves locked, recorded and out-of-range entries on regeneration',()=>{const kept=[assignment({id:'locked',locked:true}),assignment({id:'done',date:'2026-11-02'}),assignment({id:'old',date:'2026-10-01'})];const records={done:{status:'done',actualStart:'2026-11-02T08:00',actualEnd:'2026-11-02T16:00',breakMinutes:0}};const p=generatePlan({staff,shifts,config,assignments:kept,records,start:'2026-11-01',end:'2026-11-07'});for(const a of kept)assert.ok(p.assignments.some(b=>b.id===a.id));assert.equal(p.assignments.length,8)})
test('reports insufficient capacity without double-booking',()=>{const p=generatePlan({staff:staff.slice(0,1),shifts:[...shifts,{...shifts[0],id:'night',start:'16:00',end:'00:00'}],config,assignments:[],start:'2026-11-01',end:'2026-11-01'});assert.equal(p.missing,1);assert.equal(p.assignments.length,1)})
test('honors unavailable dates and cross-midnight rest',()=>{const p={...staff[0],unavailableDates:['2026-11-02']};assert.ok(reasonsFor(p,assignment({start:'20:00',end:'04:00'}),[],config).includes('该时段不可值班'));const night=assignment({id:'night',start:'20:00',end:'04:00'});assert.ok(reasonsFor(staff[0],assignment({id:'new',date:'2026-11-02'}),[night],config).includes('班次间休息不足'))})
test('splits overnight work over calendar weeks and enforces both weeks',()=>{const a=assignment({start:'20:00',end:'04:00'});assert.deepEqual(weeklyMinutes(a),{'2026-10-26':240,'2026-11-02':240});assert.ok(reasonsFor(staff[0],a,[],{...config,maxWeeklyHours:3}).includes('超过每周时长上限'))})
test('actual hours use completed records, cross midnight and subtract breaks',()=>{const r={status:'done',actualStart:'2026-11-01T22:00',actualEnd:'2026-11-02T06:00',breakMinutes:30};validateRecord(r);assert.equal(actualMinutes(r),450);assert.equal(actualMinutes({...r,status:'working'}),0);assert.throws(()=>validateRecord({...r,actualEnd:'2026-11-01T06:00'}));assert.throws(()=>validateRecord({...r,breakMinutes:480}))})
test('retains leave records while generating a replacement and excludes the absent person',()=>{const a=assignment();const p=generatePlan({staff,shifts,config,assignments:[a],records:{a:{status:'leave'}},start:a.date,end:a.date});assert.ok(p.assignments.some(b=>b.id==='a'));assert.equal(p.missing,0);assert.equal(p.assignments.length,2);assert.notEqual(p.assignments.find(b=>b.id!=='a').staffId,'p0')})
test('rejects malformed backups before any mutation',()=>{const backup={version:2,staff,config:{...config,shifts},assignments:[assignment()],records:{}};assert.equal(validateBackup(backup),true);assert.throws(()=>validateBackup({...backup,records:{missing:{status:'leave'}}}));assert.throws(()=>validateBackup({...backup,assignments:[assignment({date:'2026-02-30'})]}));assert.throws(()=>validateBackup({...backup,staff:[{name:'bad'}]}))})
test('next shifts honor the recorded actual finish rather than the planned finish',()=>{const old=assignment();const records={a:{status:'done',actualStart:'2026-11-01T08:00',actualEnd:'2026-11-01T22:00',breakMinutes:0}};const next=assignment({id:'b',date:'2026-11-02',start:'06:00',end:'14:00'});assert.ok(reasonsFor(staff[0],next,[old],config,records).includes('班次间休息不足'));assert.throws(()=>validateRecord({...records.a,actualStart:null}));assert.throws(()=>validateRecord({...records.a,actualStart:'2026-02-30T08:00'}))})

test('assigns one or two people per patrol vehicle and a separate office person',async()=>{
  const {defaultDutyShifts,requiredStaff}=await import('../src/lib/engine.js')
  const posts=[...defaultDutyShifts(),{...defaultDutyShifts()[0],id:'patrol-2',vehicleName:'巡逻车2',need:1}]
  const cfg={...config,shifts:posts,dailyNeeds:{'2026-11-02|patrol-1':1}}
  const plan=generatePlan({staff,shifts:posts,config:cfg,assignments:[],start:'2026-11-01',end:'2026-11-02'})
  assert.equal(plan.missing,0)
  for(const date of ['2026-11-01','2026-11-02']){
    const entries=plan.assignments.filter(a=>a.date===date)
    assert.equal(new Set(entries.map(a=>a.staffId)).size,entries.length)
    for(const post of posts)assert.equal(entries.filter(a=>a.shiftId===post.id).length,isShiftScheduled(post,date)?requiredStaff(post,date,cfg):0)
  }
  assert.equal(plan.assignments.find(a=>a.shiftId==='patrol-1').vehicleName,'巡逻车1')
  assert.equal(plan.assignments.find(a=>a.shiftId==='office-1').kind,'office')
})
test('keeps legacy records intact when introducing night patrol and office posts',async()=>{
  const {upgradeDutyData}=await import('../src/lib/engine.js')
  const old={version:2,staff,assignments:[assignment({shiftId:'day'})],records:{a:{status:'done',actualStart:'2026-11-01T08:00',actualEnd:'2026-11-01T16:00',breakMinutes:0}},config:{...config,shifts:[{...shifts[0],id:'day',name:'早班'},{...shifts[0],id:'night',name:'晚班',start:'16:00',end:'00:00'}]}}
  const migrated=upgradeDutyData(old)
  assert.equal(migrated.assignments[0].shiftName,'活动值班')
  assert.equal(migrated.assignments[0].kind,'activity')
  assert.deepEqual(migrated.records,old.records)
  assert.equal(migrated.config.shifts.find(s=>s.id==='day').enabled,false)
  assert.equal(migrated.config.shifts.filter(s=>s.kind==='patrol').length,1)
  assert.equal(migrated.config.shifts.filter(s=>s.kind==='office').length,1)
  assert.deepEqual(upgradeDutyData(migrated),migrated)
  assert.equal(old.config.dutyModeVersion,undefined)
})
test('rotates office and patrol duties rather than assigning one person to the office all month',async()=>{
  const {defaultDutyShifts}=await import('../src/lib/engine.js');const shifts=defaultDutyShifts();const cfg={...config,shifts};const people=staff.slice(0,3);const p=generatePlan({staff:people,shifts,config:cfg,assignments:[],start:'2026-11-01',end:'2026-11-30'});assert.equal(p.missing,0)
  const office=people.map(person=>p.assignments.filter(a=>a.staffId===person.id&&a.kind==='office').length);assert.ok(Math.max(...office)-Math.min(...office)<=1,JSON.stringify(office))
})
test('never schedules a non-driver alone in a patrol vehicle',async()=>{
  const {defaultDutyShifts}=await import('../src/lib/engine.js');const posts=[{...defaultDutyShifts()[0],need:1}];const people=staff.map(p=>({...p,canDrive:false}));const p=generatePlan({staff:people,shifts:posts,assignments:[],config:{...config,shifts:posts},start:'2026-11-01',end:'2026-11-01'});assert.equal(p.assignments.length,0);assert.equal(p.missing,1);assert.equal(p.driverGaps,1)
})
test('reserves drivers across multiple cars before assigning passengers or office duty',async()=>{
  const {defaultDutyShifts}=await import('../src/lib/engine.js');const posts=[...defaultDutyShifts(),{...defaultDutyShifts()[0],id:'patrol-2',vehicleName:'巡逻车2'}];const people=Array.from({length:5},(_,i)=>({...staff[0],id:`m${i}`,name:`成员${i}`,canDrive:i<2}));const p=generatePlan({staff:people,shifts:posts,assignments:[],config:{...config,shifts:posts},start:'2026-11-01',end:'2026-11-01'});assert.equal(p.missing,0);assert.equal(p.driverGaps,0);assert.equal(new Set(p.assignments.map(a=>a.staffId)).size,5);for(const shift of posts.filter(s=>s.kind==='patrol')){const crew=p.assignments.filter(a=>a.shiftId===shift.id);assert.equal(crew.length,2);assert.ok(crew.some(a=>a.role==='driver'&&people.find(p=>p.id===a.staffId).canDrive===true));assert.ok(crew.some(a=>a.role==='partner'&&people.find(p=>p.id===a.staffId).canDrive===false))}
})
test('flags a locked full car with no qualified driver without rewriting it',async()=>{
  const {defaultDutyShifts}=await import('../src/lib/engine.js');const posts=[defaultDutyShifts()[0]],people=staff.map(p=>({...p,canDrive:p.id==='p2'})),locked=[assignment({id:'x',kind:'patrol',shiftId:'patrol-1',staffId:'p0',locked:true}),assignment({id:'y',kind:'patrol',shiftId:'patrol-1',staffId:'p1',locked:true})];const p=generatePlan({staff:people,shifts:posts,assignments:locked,config:{...config,shifts:posts},start:'2026-11-01',end:'2026-11-01'});assert.equal(p.assignments.length,2);assert.equal(p.driverGaps,1);assert.equal(p.missing,0)
})

test('weekly caps include adjacent months and reset on Monday',async()=>{
  const {defaultDutyShifts,weekKey}=await import('../src/lib/engine.js');const shifts=[{...defaultDutyShifts()[0],need:1}],person=staff[0],old={...assignment({id:'last-saturday',date:'2026-10-31',staffId:person.id,shiftId:'patrol-1',kind:'patrol',role:'driver',start:'20:00',end:'22:00'}),locked:true};const p=generatePlan({staff:[person],shifts,assignments:[old],config:{...config,maxShiftsPerWeek:1,shifts},start:'2026-11-01',end:'2026-11-02'});assert.equal(p.assignments.filter(a=>a.date==='2026-11-01').length,0);assert.equal(p.assignments.filter(a=>a.date==='2026-11-02').length,1);assert.equal(weekKey('2026-11-01'),'2026-10-26')
})
test('distributes one week fairly without exceeding the per-person limit and prefers non-drivers in the office',async()=>{
  const {defaultDutyShifts,weeklyShiftCount}=await import('../src/lib/engine.js');const shifts=defaultDutyShifts(),people=Array.from({length:20},(_,i)=>({...staff[0],id:`w${i}`,name:`人员${i}`,canDrive:i<4})),cfg={...config,maxShiftsPerWeek:2,preferNonDriverOffice:true,shifts};const p=generatePlan({staff:people,shifts,assignments:[],config:cfg,start:'2026-11-02',end:'2026-11-08'});assert.equal(p.missing,0);assert.equal(p.driverGaps,0);assert.ok(people.every(person=>weeklyShiftCount(person.id,'2026-11-02',p.assignments)<=2));assert.ok(p.assignments.filter(a=>a.kind==='office').every(a=>people.find(p=>p.id===a.staffId).canDrive===false));const nonDriverCounts=people.filter(person=>!person.canDrive).map(person=>weeklyShiftCount(person.id,'2026-11-02',p.assignments));assert.ok(Math.max(...nonDriverCounts)-Math.min(...nonDriverCounts)<=1)
})
test('weekly rotation avoids repeating every person on the same weekday',async()=>{
  const {defaultDutyShifts,addDays}=await import('../src/lib/engine.js');const shifts=[{...defaultDutyShifts()[0],need:1}],people=Array.from({length:7},(_,i)=>({...staff[0],id:`r${i}`,name:`轮换${i}`,canDrive:true}));const p=generatePlan({staff:people,shifts,assignments:[],config:{...config,maxShiftsPerWeek:1,shifts},start:'2026-11-02',end:'2026-11-15'});assert.equal(p.missing,0);const first=p.assignments.filter(a=>a.date<='2026-11-08');const repeats=first.filter(a=>p.assignments.find(b=>b.date===addDays(a.date,7)).staffId===a.staffId).length;assert.ok(repeats<=1,`${repeats} repeated weekdays`)
})
test('activity and other duty run only on selected dates and keep their custom times',async()=>{
  const {defaultDutyShifts,plannedMinutes}=await import('../src/lib/engine.js');const posts=defaultDutyShifts().filter(s=>['activity','other'].includes(s.kind));posts[0]={...posts[0],dates:['2026-11-03'],start:'08:30',end:'10:30'};posts[1]={...posts[1],dates:['2026-11-05'],start:'15:00',end:'16:00'};const p=generatePlan({staff,shifts:posts,assignments:[],config:{...config,maxShiftsPerWeek:2,shifts:posts},start:'2026-11-02',end:'2026-11-08'});assert.equal(p.assignments.length,2);assert.deepEqual(p.assignments.map(a=>a.date),['2026-11-03','2026-11-05']);assert.equal(plannedMinutes(p.assignments[0]),120);assert.equal(plannedMinutes(p.assignments[1]),60)
})
test('automatic completion uses Shanghai time, respects the exact end boundary and supports overnight duty',async()=>{
  const {automaticRecord,effectiveRecords}=await import('../src/lib/engine.js');const a=assignment({start:'20:00',end:'22:00'});assert.equal(automaticRecord(a,Date.parse('2026-11-01T21:59:59+08:00')),null);const r=automaticRecord(a,Date.parse('2026-11-01T22:00:00+08:00'));assert.equal(r.source,'auto');assert.equal(actualMinutes(r),120);const manual={status:'absent',note:'缺勤'};assert.deepEqual(effectiveRecords([a],{a:manual},Date.parse('2026-11-05T00:00:00+08:00')).a,manual);const night=assignment({start:'23:30',end:'01:15'});assert.equal(automaticRecord(night,Date.parse('2026-11-02T01:14:59+08:00')),null);assert.equal(actualMinutes(automaticRecord(night,Date.parse('2026-11-02T01:15:00+08:00'))),105);assert.equal(hours(105),1.75)
})

test('preserves and flags pre-existing locked assignments above a new weekly cap',()=>{const old=['2026-11-02','2026-11-03','2026-11-04'].map((date,i)=>assignment({id:'protected'+i,date,locked:true}));const p=generatePlan({staff:[staff[0]],shifts,assignments:old,config:{...config,maxShiftsPerWeek:2},start:'2026-11-02',end:'2026-11-08'});assert.equal(p.assignments.length,3);assert.equal(p.overLimit.length,1);assert.equal(p.overLimit[0].count,3)})

test('leave ranges cover both endpoints and overnight overlap, but not an exact midnight finish',async()=>{
  const {leaveForAssignment,validateLeave,effectiveRecords}=await import('../src/lib/engine.js')
  const p={...staff[0],leavePeriods:[{id:'holiday',start:'2026-11-03',end:'2026-11-05',reason:'考试'}]}
  for(const date of ['2026-11-03','2026-11-04','2026-11-05'])assert.equal(leaveForAssignment(p,assignment({date})).id,'holiday')
  assert.equal(leaveForAssignment(p,assignment({date:'2026-11-02',start:'23:00',end:'01:00'})).id,'holiday')
  assert.equal(leaveForAssignment(p,assignment({date:'2026-11-02',start:'20:00',end:'00:00'})),undefined)
  assert.equal(leaveForAssignment(p,assignment({date:'2026-11-06'})),undefined)
  assert.ok(reasonsFor(p,assignment({date:'2026-11-04'}),[],config).includes('该时段正在请假'))
  const a=assignment({date:'2026-11-04'});assert.equal(effectiveRecords([a],{},Date.parse('2026-12-01'),true,[p]).a.status,'leave')
  assert.equal(effectiveRecords([a],{},Date.parse('2026-11-01'),false,[p]).a.status,'leave')
  assert.throws(()=>validateLeave({start:'2026-02-30',end:'2026-03-03'}));assert.throws(()=>validateLeave({start:'2026-11-05',end:'2026-11-03'}))
})
test('the scheduler replaces locked duties on leave while keeping the leave history',()=>{
  const people=staff.map(p=>({...p,leavePeriods:p.id==='p0'?[{id:'leave',start:'2026-11-01',end:'2026-11-03'}]:[]}))
  const old=assignment({locked:true}),plan=generatePlan({staff:people,shifts,config,assignments:[old],start:'2026-11-01',end:'2026-11-05'})
  assert.equal(plan.missing,0);assert.ok(plan.assignments.some(a=>a.id===old.id));assert.equal(plan.assignments.filter(a=>a.date===old.date).length,2)
  assert.ok(plan.assignments.filter(a=>a.id!==old.id&&a.date<='2026-11-03').every(a=>a.staffId!=='p0'))
})
