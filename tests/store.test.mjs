import test from 'node:test'
import assert from 'node:assert/strict'
import {createPinia,setActivePinia} from 'pinia'
import * as XLSX from 'xlsx'
import {useSchedulerStore} from '../src/stores/scheduler.js'
const memory=new Map()
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)}
test('actual records round-trip and Excel contains actual hours and staff totals',async()=>{setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('验证人员','A',true);const person=s.staff[0];s.saveAssignment({staffId:person.id,shiftId:'patrol-1',date:'2026-11-01'});const a=s.assignments[0];s.saveRecord(a.id,{status:'done',actualStart:'2026-11-01T16:00',actualEnd:'2026-11-02T00:00',breakMinutes:30,note:'值班完成'});assert.equal(s.stats('2026-11')[0].actual,7.5);s.currentMonth='2026-11';s.save();const file=await s.exportExcel();const workbook=XLSX.read(await file.blob.arrayBuffer(),{type:'array'});assert.deepEqual(workbook.SheetNames,['排班表','值班记录','时长统计','人员名单','请假记录']);const rows=XLSX.utils.sheet_to_json(workbook.Sheets['值班记录'],{header:1});assert.equal(rows[1][11],7.5);const totals=XLSX.utils.sheet_to_json(workbook.Sheets['时长统计'],{header:1});assert.equal(totals[1][5],7.5);setActivePinia(createPinia());const restored=useSchedulerStore();assert.equal(restored.stats('2026-11')[0].actual,7.5);assert.equal(restored.assignments[0].id,a.id);const before=JSON.stringify(restored.assignments);assert.throws(()=>restored.importData('{}'));assert.equal(JSON.stringify(restored.assignments),before);restored.saveRecord(a.id,{status:'leave',actualStart:'2026-11-01T16:00',actualEnd:'2026-11-02T00:00',breakMinutes:30,note:'请假'});assert.equal(restored.records[a.id].actualStart,'');assert.equal(restored.stats('2026-11')[0].actual,0)})
test('daily vehicle staffing persists and office/patrol conflicts are rejected',async()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore()
  for(const name of ['甲','乙','丙'])s.addStaff(name,'',true)
  const [a,b,c]=s.staff;s.saveAssignment({staffId:a.id,shiftId:'patrol-1',date:'2026-11-01'})
  s.setDailyNeed('patrol-1','2026-11-01',1)
  assert.throws(()=>s.saveAssignment({staffId:b.id,shiftId:'patrol-1',date:'2026-11-01'}),/人数已满/)
  assert.throws(()=>s.saveAssignment({staffId:a.id,shiftId:'office-1',date:'2026-11-01'}),/时间重叠/)
  s.setDailyNeed('patrol-1','2026-11-01',2)
  s.saveAssignment({staffId:b.id,shiftId:'patrol-1',date:'2026-11-01'})
  assert.throws(()=>s.setDailyNeed('patrol-1','2026-11-01',1),/先移除一人/)
  s.saveAssignment({staffId:c.id,shiftId:'office-1',date:'2026-11-01'})
  s.setDailyNeed('patrol-1','2026-11-02',1)
  const plan=s.previewPlan('2026-11-01','2026-11-02');assert.equal(plan.missing,0);assert.equal(plan.assignments.filter(a=>a.date==='2026-11-02'&&a.kind==='patrol').length,1)
  s.applyPlan(plan,'2026-11-01','2026-11-02');setActivePinia(createPinia());const restored=useSchedulerStore();assert.equal(restored.config.dailyNeeds['2026-11-02|patrol-1'],1);assert.equal(restored.assignments.filter(a=>a.kind==='office').length,2)
  const file=await restored.exportExcel();const wb=XLSX.read(await file.blob.arrayBuffer(),{type:'array'});const rows=XLSX.utils.sheet_to_json(wb.Sheets['值班记录'],{header:1});assert.equal(rows[0][13],'岗位类型');assert.equal(rows[0][14],'巡逻车辆');assert.ok(rows.slice(1).some(r=>r[14]==='巡逻车1'));assert.ok(rows.slice(1).some(r=>r[13]==='办公室值班'))
})
test('saving the complete crew validates driver rules atomically and preserves actual records',async()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('司机','',true);s.addStaff('随车','',false);s.addStaff('办公室','',false);const [d,p,o]=s.staff
  const empty=JSON.stringify(s.assignments),overrides=JSON.stringify(s.config.dailyNeeds)
  assert.throws(()=>s.saveDutyCrew({date:'2026-11-01',shiftId:'patrol-1',need:1,staffIds:[p.id]}),/能开车/);assert.equal(JSON.stringify(s.assignments),empty);assert.equal(JSON.stringify(s.config.dailyNeeds),overrides)
  s.saveDutyCrew({date:'2026-11-01',shiftId:'patrol-1',need:2,staffIds:[d.id,p.id]});s.saveDutyCrew({date:'2026-11-01',shiftId:'office-1',need:1,staffIds:[o.id]});const before=JSON.stringify(s.assignments)
  assert.throws(()=>s.saveDutyCrew({date:'2026-11-01',shiftId:'patrol-1',need:2,staffIds:[d.id,o.id]}),/时间重叠/);assert.equal(JSON.stringify(s.assignments),before)
  const driver=s.assignments.find(a=>a.staffId===d.id);s.saveRecord(driver.id,{status:'done',actualStart:'2026-11-01T21:00',actualEnd:'2026-11-01T23:00',breakMinutes:0,note:''})
  assert.throws(()=>s.saveDutyCrew({date:'2026-11-01',shiftId:'patrol-1',need:1,staffIds:[]}),/实际记录/)
  const file=await s.exportExcel();const wb=XLSX.read(await file.blob.arrayBuffer(),{type:'array'}),rows=XLSX.utils.sheet_to_json(wb.Sheets['排班表'],{header:1});assert.deepEqual(rows[0],['日期','星期','巡逻车1','办公室值班','活动值班','其他值班']);assert.match(rows[1][2],/司机：司机/);assert.match(rows[1][2],/随车：随车/);assert.equal(rows[1][3],'办公室')
  const roster=XLSX.utils.sheet_to_json(wb.Sheets['人员名单'],{header:1});assert.equal(roster[1][1],'能开车');assert.equal(roster[2][1],'不能开车')
  setActivePinia(createPinia());const reloaded=useSchedulerStore();assert.equal(reloaded.staff[0].canDrive,true);assert.equal(reloaded.staff[1].canDrive,false);assert.equal(reloaded.records[driver.id].status,'done')
})
test('legacy staff remain unconfirmed rather than being assumed to drive',()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('旧人员');const backup=JSON.parse(memory.get('duty_roster_v2'));delete backup.staff[0].canDrive;s.importData(JSON.stringify(backup));assert.equal(s.staff[0].canDrive,null);const p=s.previewPlan('2026-11-01','2026-11-01');assert.equal(p.assignments.filter(a=>a.kind==='patrol').length,0);assert.equal(p.driverGaps,1)
})

test('automatically counted duty survives reopening and manual changes override it',()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('计时人员','',true);s.saveDutyCrew({date:'2026-11-02',shiftId:'patrol-1',need:1,staffIds:[s.staff[0].id]});const a=s.assignments[0],end=Date.parse('2026-11-02T22:00:00+08:00');assert.equal(s.recordFor(a,end-1),null);assert.equal(s.recordFor(a,end).source,'auto');assert.equal(s.stats('2026-11',end)[0].actual,2);assert.equal(s.records[a.id],undefined)
  setActivePinia(createPinia());const restored=useSchedulerStore();assert.equal(restored.recordFor(restored.assignments[0],end+86400000).source,'auto');restored.saveRecord(a.id,{status:'done',actualStart:'2026-11-02T20:15',actualEnd:'2026-11-02T21:45',breakMinutes:0,note:'修正'});assert.equal(restored.recordFor(a,end).source,'manual');assert.equal(restored.stats('2026-11',end)[0].actual,1.5);restored.saveRecord(a.id,{status:'leave',note:'请假'});assert.equal(restored.stats('2026-11',end)[0].actual,0);restored.deleteRecord(a.id);assert.equal(restored.stats('2026-11',end)[0].actual,2)
})
test('manual activity dates join the schedule and count toward the weekly limit',()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('活动人员','',false);const p=s.staff[0];const activity=s.config.shifts.find(s=>s.kind==='activity');activity.start='09:00';activity.end='11:00';s.saveDutyCrew({date:'2026-11-03',shiftId:activity.id,need:1,staffIds:[p.id]});assert.ok(activity.dates.includes('2026-11-03'));s.saveDutyCrew({date:'2026-11-05',shiftId:'other-1',need:1,staffIds:[p.id]});assert.throws(()=>s.saveDutyCrew({date:'2026-11-06',shiftId:'office-1',need:1,staffIds:[p.id]}),/每周值班次数/)
})

test('leave ranges persist, exclude manual and automatic duty, and export with zero counted hours',async()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('请假人员','',false);s.addStaff('补班人员','',false);const [p,q]=s.staff
  s.saveDutyCrew({date:'2026-11-03',shiftId:'office-1',need:1,staffIds:[p.id]});const old=s.assignments[0]
  s.saveLeave({staffId:p.id,start:'2026-11-03',end:'2026-11-05',reason:'考试'})
  assert.equal(s.recordFor(old,Date.parse('2026-12-01')).status,'leave');assert.equal(s.records[old.id],undefined);assert.equal(s.stats('2026-11',Date.parse('2026-12-01'))[0].actual,0)
  const before=JSON.stringify(s.assignments);assert.throws(()=>s.saveDutyCrew({date:'2026-11-04',shiftId:'office-1',need:1,staffIds:[p.id]}),/请假/);assert.equal(JSON.stringify(s.assignments),before)
  s.saveDutyCrew({date:'2026-11-03',shiftId:'office-1',need:1,staffIds:[q.id]});assert.ok(s.assignments.some(a=>a.id===old.id));assert.equal(s.assignments.length,2)
  s.currentMonth='2026-11';const file=await s.exportExcel(),wb=XLSX.read(await file.blob.arrayBuffer(),{type:'array'}),rows=XLSX.utils.sheet_to_json(wb.Sheets['请假记录'],{header:1});assert.deepEqual(rows[1],['请假人员','2026-11-03','2026-11-05','考试']);const recordRows=XLSX.utils.sheet_to_json(wb.Sheets['值班记录'],{header:1});assert.equal(recordRows.find(r=>r[1]==='请假人员')[7],'请假')
  setActivePinia(createPinia());const restored=useSchedulerStore();assert.equal(restored.leaves.length,1);assert.equal(restored.leaves[0].reason,'考试');assert.equal(restored.recordFor(restored.assignments.find(a=>a.id===old.id)).status,'leave')
})
test('cancelling or shortening leave frees eligibility without reviving replaced duties',()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('原值班人','',false);s.addStaff('替班人','',false);const [p,q]=s.staff
  s.saveDutyCrew({date:'2026-11-03',shiftId:'office-1',need:1,staffIds:[p.id]});const old=s.assignments[0]
  s.saveLeave({staffId:p.id,start:'2026-11-03',end:'2026-11-05'});const leave=s.leaves[0]
  s.saveDutyCrew({date:'2026-11-03',shiftId:'office-1',need:1,staffIds:[q.id]})
  s.saveLeave({...leave,start:'2026-11-04'});assert.equal(s.recordFor(old).status,'leave');assert.equal(s.recordFor(old).source,'leave-history')
  s.cancelLeave(p.id,leave.id);assert.equal(s.leaves.length,0);assert.equal(s.recordFor(old).status,'leave')
  s.saveDutyCrew({date:'2026-11-03',shiftId:'other-1',need:1,staffIds:[p.id]});assert.equal(s.weeklyStats('2026-11-03').find(x=>x.id===p.id).weeklyCount,1)
  assert.equal(s.assignments.filter(a=>a.date==='2026-11-03'&&s.recordFor(a)?.status!=='leave'&&a.staffId===p.id).length,1)
})
test('manual attendance overrides leave and invalid or overlapping leave changes are atomic',()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('人工登记','',false);const p=s.staff[0]
  s.saveDutyCrew({date:'2026-11-03',shiftId:'office-1',need:1,staffIds:[p.id]});const a=s.assignments[0]
  s.saveRecord(a.id,{status:'done',actualStart:'2026-11-03T20:00',actualEnd:'2026-11-03T21:30',breakMinutes:0,note:'实际到岗'})
  s.saveLeave({staffId:p.id,start:'2026-11-03',end:'2026-11-05'});assert.equal(s.recordFor(a).source,'manual');assert.equal(s.stats('2026-11',Date.parse('2026-12-01'))[0].actual,1.5)
  const before=memory.get('duty_roster_v2');assert.throws(()=>s.saveLeave({staffId:p.id,start:'2026-11-05',end:'2026-11-06'}),/重叠/);assert.equal(memory.get('duty_roster_v2'),before)
  const backup=JSON.parse(before);backup.staff[0].leavePeriods[0].end='2026-02-30';assert.throws(()=>s.importData(JSON.stringify(backup)));assert.equal(memory.get('duty_roster_v2'),before)
  s.deleteRecord(a.id);assert.equal(s.recordFor(a).status,'leave');assert.equal(s.stats('2026-11',Date.parse('2026-12-01'))[0].actual,0)
})

test('deleting staff removes only their linked data and leaves a restorable, valid backup',async()=>{
  memory.clear();setActivePinia(createPinia());const s=useSchedulerStore();s.addStaff('待删除司机','',true);s.addStaff('保留值班人','',false);const [p,q]=s.staff
  s.saveDutyCrew({date:'2026-11-03',shiftId:'patrol-1',need:1,staffIds:[p.id]})
  s.saveDutyCrew({date:'2026-11-03',shiftId:'office-1',need:1,staffIds:[q.id]})
  s.saveDutyCrew({date:'2026-11-05',shiftId:'other-1',need:1,staffIds:[p.id]})
  const pa=s.assignments.find(a=>a.staffId===p.id),qa=s.assignments.find(a=>a.staffId===q.id)
  for(const a of [pa,qa])s.saveRecord(a.id,{status:'done',actualStart:'2026-11-03T20:00',actualEnd:'2026-11-03T22:00',breakMinutes:0,note:'已登记'})
  s.saveLeave({staffId:p.id,start:'2026-11-05',end:'2026-11-06'});s.saveLeave({staffId:q.id,start:'2026-11-07',end:'2026-11-08'})
  const backup=memory.get('duty_roster_v2'),otherPerson=JSON.stringify(q),otherRecord=JSON.stringify(s.records[qa.id]),settings=JSON.stringify(s.config)
  s.deleteStaff(p.id);assert.equal(s.staff.length,1);assert.equal(JSON.stringify(s.staff[0]),otherPerson);assert.equal(s.assignments.length,1);assert.equal(s.assignments[0].id,qa.id);assert.deepEqual(Object.keys(s.records),[qa.id]);assert.equal(JSON.stringify(s.records[qa.id]),otherRecord);assert.equal(s.leaves.length,1);assert.equal(s.leaves[0].staffId,q.id);assert.equal(JSON.stringify(s.config),settings)
  setActivePinia(createPinia());const reloaded=useSchedulerStore();assert.equal(reloaded.persistenceError,'');assert.equal(reloaded.staff.length,1);assert.ok(reloaded.previewPlan('2026-11-03','2026-11-03').driverGaps>0)
  const unchanged=memory.get('duty_roster_v2');assert.throws(()=>reloaded.deleteStaff('missing'),/已不存在/);assert.equal(memory.get('duty_roster_v2'),unchanged)
  reloaded.importData(backup);assert.equal(reloaded.staff.length,2);assert.equal(reloaded.assignments.length,3);assert.equal(reloaded.leaves.length,2);assert.equal(reloaded.records[pa.id].status,'done')
  reloaded.addStaff('无排班人员','',false);const newcomer=reloaded.staff.at(-1);reloaded.deleteStaff(newcomer.id);assert.equal(reloaded.staff.length,2);assert.equal(reloaded.assignments.length,3)
})
