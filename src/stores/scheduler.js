// Adapted from aiastia/shift-scheduler's Vue/Pinia scheduling store.
import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import {uid,dateKey,generatePlan,validateRecord,validateBackup,reasonsFor,actualMinutes,plannedMinutes,hours,defaultDutyShifts,upgradeDutyData,requiredStaff,availableAssignment,dutyLabel,dutyTypeLabel,hasQualifiedDriver,dateRange,businessDate,automaticRecord,effectiveRecords,weekKey,weeklyShiftCount,validateLeave,leaveForAssignment,leaveRecord} from '../lib/engine.js'
const STORAGE_KEY='duty_roster_v2'
export const useSchedulerStore=defineStore('scheduler',()=>{
  const staff=ref([]),assignments=ref([]),records=ref({}),activity=ref([])
  const currentMonth=ref(businessDate().slice(0,7)),persistenceError=ref(''),lastSaved=ref('')
  const config=reactive({name:'校卫队值班表',minRestHours:10,maxWeeklyHours:48,maxShiftsPerWeek:2,preferNonDriverOffice:true,autoCount:true,onePerDay:true,dutyModeVersion:1,schoolVersion:1,dailyNeeds:{},shifts:defaultDutyShifts()})
  function snapshot(){return {version:2,staff:staff.value,assignments:assignments.value,records:records.value,activity:activity.value,config:{...config},currentMonth:currentMonth.value}}
  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot()));persistenceError.value='';lastSaved.value=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});return true}catch{persistenceError.value='当前设备未能保存更改，请立即导出备份。';return false}}
  function log(message){activity.value.unshift({id:uid(),message,time:new Date().toISOString()});activity.value=activity.value.slice(0,100)}
  function load(){try{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;let d=JSON.parse(raw);validateBackup(d);const upgraded=!d.config.schoolVersion||!d.config.dutyModeVersion||d.staff.some(p=>p.canDrive===undefined||!p.leavePeriods);d=upgradeDutyData(d);staff.value=d.staff;assignments.value=d.assignments;records.value=d.records;Object.assign(config,d.config);activity.value=Array.isArray(d.activity)?d.activity:[];if(/^\d{4}-\d{2}$/.test(d.currentMonth))currentMonth.value=d.currentMonth;if(upgraded)save()}catch{persistenceError.value='未能读取设备中的数据，请从 JSON 备份恢复。'}}
  function addStaff(name,group='',canDrive=null){name=name.trim();if(!name)throw Error('请填写姓名');if(staff.value.some(p=>p.name===name))throw Error(`${name} 已在人员名单中`);staff.value.push({id:uid(),name,group:group.trim(),active:true,canDrive:typeof canDrive==='boolean'?canDrive:null,unavailableDates:[],unavailableWeekdays:[],leavePeriods:[]});log(`添加人员：${name}`);save()}
  function updateStaff(id,data){const p=staff.value.find(p=>p.id===id);if(!p)return;const name=data.name.trim();if(!name)throw Error('姓名不能为空');if(staff.value.some(s=>s.id!==id&&s.name===name))throw Error('该姓名已存在');if(data.canDrive!==undefined&&data.canDrive!==null&&typeof data.canDrive!=='boolean')throw Error('请选择能开车或不能开车');Object.assign(p,data,{name});log(`更新人员：${name}`);save()}
  function deleteStaff(id){
    const person=staff.value.find(p=>p.id===id);if(!person)throw Error('该人员已不存在，请刷新人员列表')
    const ids=new Set(assignments.value.filter(a=>a.staffId===id).map(a=>a.id))
    assignments.value=assignments.value.filter(a=>!ids.has(a.id))
    records.value=Object.fromEntries(Object.entries(records.value).filter(([id])=>!ids.has(id)))
    staff.value=staff.value.filter(p=>p.id!==id)
    log(`删除人员：${person.name}，同时删除 ${ids.size} 条排班及关联记录`);save()
  }
  const leaves=computed(()=>staff.value.flatMap(p=>(p.leavePeriods||[]).map(l=>({...l,staffId:p.id,staffName:p.name}))).sort((a,b)=>b.start.localeCompare(a.start)))
  function preserveReleasedLeave(person,old,next=null){
    for(const a of assignments.value.filter(a=>a.staffId===person.id))if(!records.value[a.id]&&leaveForAssignment({...person,leavePeriods:[old]},a)&&(!next||!leaveForAssignment({...person,leavePeriods:[next]},a)))records.value[a.id]={...leaveRecord(old),source:'leave-history',note:`原${leaveRecord(old).note}（请假已调整或取消，可重新排班）`}
  }
  function saveLeave(data){
    const person=staff.value.find(p=>p.id===data.staffId);if(!person)throw Error('请选择请假人员')
    const period={id:data.id||uid(),start:data.start,end:data.end,reason:(data.reason||'').trim()};validateLeave(period)
    const old=person.leavePeriods?.find(l=>l.id===period.id);if(data.id&&!old)throw Error('原请假记录不存在')
    if((person.leavePeriods||[]).some(l=>l.id!==period.id&&l.start<=period.end&&l.end>=period.start))throw Error('与该人员已有请假日期重叠，请修改原记录')
    if(old)preserveReleasedLeave(person,old,period)
    person.leavePeriods=[...(person.leavePeriods||[]).filter(l=>l.id!==period.id),period]
    log(`登记请假：${person.name} ${period.start} 至 ${period.end}`);save()
  }
  function cancelLeave(staffId,id){const person=staff.value.find(p=>p.id===staffId),old=person?.leavePeriods?.find(l=>l.id===id);if(!old)return;preserveReleasedLeave(person,old);person.leavePeriods=person.leavePeriods.filter(l=>l.id!==id);log(`取消请假：${person.name} ${old.start} 至 ${old.end}`);save()}
  function recordFor(a,now=Date.now()){if(records.value[a.id])return records.value[a.id];const leave=leaveForAssignment(staff.value.find(p=>p.id===a.staffId),a);return leave?leaveRecord(leave):config.autoCount!==false?automaticRecord(a,now):null}
  function allRecords(now=Date.now()){return effectiveRecords(assignments.value,records.value,now,config.autoCount!==false,staff.value)}
  function weeklyStats(date=businessDate(),now=Date.now()){const r=allRecords(now);return staff.value.map(p=>({...p,weeklyCount:weeklyShiftCount(p.id,date,assignments.value,r)}))}
  function previewPlan(start,end){return generatePlan({staff:staff.value,shifts:config.shifts,assignments:assignments.value,records:allRecords(),config,start,end})}
  function applyPlan(plan,start,end){assignments.value=plan.assignments;currentMonth.value=start.slice(0,7);log(`生成排班：${start} 至 ${end}，缺口 ${plan.missing} 人次`);save()}
  function saveAssignment(data){const effective=allRecords();if(!data.staffId||!data.shiftId||!data.date)throw Error('请选择日期、班次和人员');const old=assignments.value.find(a=>a.id===data.id);if(old&&records.value[old.id])throw Error('该班次已有实际记录，请先删除记录再调整人员');const person=staff.value.find(p=>p.id===data.staffId),shift=config.shifts.find(s=>s.id===data.shiftId);if(!person||!shift)throw Error('人员或班次不存在');const candidate={id:data.id||uid(),staffId:person.id,staffName:person.name,shiftId:shift.id,shiftName:shift.name,kind:shift.kind||'general',vehicleName:shift.vehicleName||'',date:data.date,start:shift.start,end:shift.end,source:'manual',locked:true};if(shift.kind==='patrol'){const crew=assignments.value.filter(a=>a.date===data.date&&a.shiftId===shift.id&&a.id!==candidate.id&&availableAssignment(a,effective));candidate.role=hasQualifiedDriver(crew,staff.value,effective)?'partner':'driver';candidate.canDriveAtAssignment=person.canDrive===true}const reasons=reasonsFor(person,candidate,assignments.value,config,effective);if(reasons.length)throw Error(reasons.join('；'));if(old)Object.assign(old,candidate);else assignments.value.push(candidate);log(`手动安排：${candidate.date} ${person.name} ${shift.name}`);save()}
  function saveDutyCrew({date,shiftId,need,staffIds}){
    const shift=config.shifts.find(s=>s.id===shiftId);if(!shift)throw Error('岗位不存在')
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||dateKey(new Date(`${date}T12:00:00`))!==date)throw Error('日期无效')
    need=Number(need);if(!Number.isInteger(need)||need<1||need>100||(shift.kind==='patrol'&&![1,2].includes(need)))throw Error('巡逻车人数请选择 1 人或 2 人')
    if(!Array.isArray(staffIds)||staffIds.length>need)throw Error('选择的人员超过岗位人数')
    const selected=staffIds.filter(Boolean);if(new Set(selected).size!==selected.length)throw Error('同一个人不能占两个位置')
    if(shift.kind==='patrol'&&selected.length&&(!staffIds[0]||staff.value.find(p=>p.id===staffIds[0])?.canDrive!==true))throw Error('每辆巡逻车至少安排一名能开车的司机')
    const effective=allRecords(),original=assignments.value.filter(a=>a.date===date&&a.shiftId===shiftId),active=original.filter(a=>availableAssignment(a,effective))
    for(const a of active)if(records.value[a.id]&&!selected.includes(a.staffId))throw Error('已有实际记录的人员不能直接移除，请先处理该记录')
    const retained=assignments.value.filter(a=>!active.some(old=>old.id===a.id)),nextConfig={...config,dailyNeeds:{...config.dailyNeeds}}
    if(shift.kind==='patrol')nextConfig.dailyNeeds[`${date}|${shiftId}`]=need
    const drafts=staffIds.map((id,index)=>{
      if(!id)return null;const person=staff.value.find(p=>p.id===id);if(!person)throw Error('所选人员不存在')
      const old=active.find(a=>a.staffId===id)
      return {...(old||{id:uid(),date,shiftId:shift.id,shiftName:shift.name,kind:shift.kind||'general',vehicleName:shift.vehicleName||'',start:shift.start,end:shift.end}),staffId:id,staffName:old?.staffName||person.name,role:shift.kind==='patrol'?(index===0?'driver':'partner'):'office',canDriveAtAssignment:person.canDrive===true,source:'manual',locked:true}
    }).filter(Boolean)
    for(const a of drafts){const reasons=reasonsFor(staff.value.find(p=>p.id===a.staffId),a,[...retained,...drafts],nextConfig,effective);if(reasons.length)throw Error(`${a.staffName}：${reasons.join('；')}`)}
    // Apply the full crew only after every driver and time constraint passed.
    assignments.value=[...retained,...drafts]
    if(shift.kind==='patrol'){if(need===shift.need)delete config.dailyNeeds[`${date}|${shiftId}`];else config.dailyNeeds[`${date}|${shiftId}`]=need}
    if(['activity','other'].includes(shift.kind)){shift.dates||=[];if(drafts.length&&!shift.dates.includes(date))shift.dates.push(date);if(!drafts.length&&!original.some(a=>records.value[a.id]))shift.dates=shift.dates.filter(d=>d!==date)}
    log(`${date} ${dutyLabel(shift)}：${drafts.map(a=>a.staffName).join('、')||'清空未登记人员'}`);save()
  }
  function columns(month=currentMonth.value){
    const result=config.shifts.filter(s=>s.enabled!==false||assignments.value.some(a=>a.shiftId===s.id&&a.date.startsWith(month))).map(s=>({...s}))
    for(const a of assignments.value.filter(a=>a.date.startsWith(month)))if(!result.some(s=>s.id===a.shiftId))result.push({id:a.shiftId,name:a.shiftName,kind:a.kind||'general',vehicleName:a.vehicleName||'',start:a.start,end:a.end,need:1,enabled:false,days:[0,1,2,3,4,5,6]})
    return result.sort((a,b)=>({patrol:0,office:1,activity:2,other:3,general:4}[a.kind]??2)-({patrol:0,office:1,activity:2,other:3,general:4}[b.kind]??2))
  }
  function setDailyNeed(shiftId,date,need){const effective=allRecords(),shift=config.shifts.find(s=>s.id===shiftId);if(!shift||shift.kind!=='patrol'||![1,2].includes(need))throw Error('巡逻车只能安排 1 人或 2 人');const count=assignments.value.filter(a=>a.date===date&&a.shiftId===shiftId&&availableAssignment(a,effective)).length;if(count>need)throw Error('这辆车已安排两人，请先移除一人后再改为单人巡逻');if(need===shift.need)delete config.dailyNeeds[`${date}|${shiftId}`];else config.dailyNeeds[`${date}|${shiftId}`]=need;log(`${date} ${shift.vehicleName} 调整为 ${need} 人巡逻`);save()}
  function deleteAssignment(id){const a=assignments.value.find(a=>a.id===id);if(!a)return;if(records.value[id])throw Error('请先删除该班次的值班记录');assignments.value=assignments.value.filter(a=>a.id!==id);log(`删除排班：${a.date} ${a.staffName}`);save()}
  function toggleLock(id){const a=assignments.value.find(a=>a.id===id);if(a){a.locked=!a.locked;save()}}
  function saveRecord(assignmentId,data){if(!assignments.value.some(a=>a.id===assignmentId))throw Error('对应的排班不存在');validateRecord(data);records.value[assignmentId]={...data,source:'manual',automatic:false,note:data.source==='auto'&&data.note==='按排班时间自动计入，可修改'?'人工修改（原为自动计入）':data.note||'',actualStart:['done','working'].includes(data.status)?data.actualStart:'',actualEnd:data.status==='done'?data.actualEnd:'',breakMinutes:data.status==='done'?Number(data.breakMinutes||0):0,updatedAt:new Date().toISOString()};const a=assignments.value.find(a=>a.id===assignmentId);log(`值班登记：${a.date} ${a.staffName} ${{working:'已到岗',done:'已完成',leave:'请假',absent:'缺勤'}[data.status]}`);save()}
  function deleteRecord(id){delete records.value[id];log('删除一条值班记录');save()}
  function exportData(){download(new Blob([JSON.stringify({...snapshot(),exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),`校卫队值班表备份_${businessDate()}.json`)}
  function importData(json){let d=JSON.parse(json);validateBackup(d);d=upgradeDutyData(d);staff.value=d.staff;assignments.value=d.assignments;records.value=d.records;Object.assign(config,d.config);activity.value=Array.isArray(d.activity)?d.activity:[];if(/^\d{4}-\d{2}$/.test(d.currentMonth))currentMonth.value=d.currentMonth;log('从 JSON 备份恢复数据');save()}
  function stats(month=currentMonth.value,now=Date.now()){const effective=allRecords(now);return staff.value.map(p=>{const list=assignments.value.filter(a=>a.staffId===p.id&&a.date.startsWith(month));const done=list.filter(a=>effective[a.id]?.status==='done');return {...p,activityCount:list.filter(a=>a.kind==='activity').length,otherCount:list.filter(a=>a.kind==='other'||a.kind==='general').length,autoCount:done.filter(a=>effective[a.id]?.source==='auto').length,patrolCount:list.filter(a=>a.kind==='patrol').length,officeCount:list.filter(a=>a.kind==='office').length,patrolActual:hours(done.filter(a=>a.kind==='patrol').reduce((n,a)=>n+actualMinutes(effective[a.id]),0)),officeActual:hours(done.filter(a=>a.kind==='office').reduce((n,a)=>n+actualMinutes(effective[a.id]),0)),count:list.length,planned:hours(list.reduce((s,a)=>s+plannedMinutes(a),0)),done:done.length,actual:hours(done.reduce((s,a)=>s+actualMinutes(effective[a.id]),0)),leave:list.filter(a=>effective[a.id]?.status==='leave').length,absent:list.filter(a=>effective[a.id]?.status==='absent').length}})}
  async function exportExcel(){
    const effective=allRecords(),now=Date.now();const XLSX=await import('xlsx'),month=currentMonth.value,list=assignments.value.filter(a=>a.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)),wb=XLSX.utils.book_new(),cols=columns(month)
    const [year,m]=month.split('-').map(Number),last=dateKey(new Date(year,m,0)),days=dateRange(month+'-01',last)
    const roster=[['日期','星期',...cols.map(s=>s.kind==='patrol'?s.vehicleName:s.name)]]
    for(const date of days)roster.push([date,'周'+['日','一','二','三','四','五','六'][new Date(`${date}T12:00:00`).getDay()],...cols.map(s=>list.filter(a=>a.date===date&&a.shiftId===s.id).map(a=>`${a.role==='driver'?'司机：':a.role==='partner'?'随车：':''}${a.staffName}${['leave','absent'].includes(effective[a.id]?.status)?'（'+{leave:'请假',absent:'缺勤'}[effective[a.id].status]+'）':''}`).join(' / '))])
    const rs=XLSX.utils.aoa_to_sheet(roster);rs['!cols']=[{wch:14},{wch:8},...cols.map(()=>({wch:32}))];XLSX.utils.book_append_sheet(wb,rs,'排班表')
    const rows=[['日期','姓名','分组','班次','计划开始','计划结束','计划小时','状态','计入开始','计入结束','扣除分钟','计入小时','备注','岗位类型','巡逻车辆','岗位角色','记录来源']]
    for(const a of list){const r=effective[a.id]||{};rows.push([a.date,a.staffName,staff.value.find(p=>p.id===a.staffId)?.group||'',dutyLabel(a),a.start,a.end+(a.end<=a.start?'（次日）':''),hours(plannedMinutes(a)),r.source==='auto'?'自动计入':({working:'值班中',done:'已完成',leave:'请假',absent:'缺勤'}[r.status]||'待登记'),r.actualStart||'',r.actualEnd||'',r.breakMinutes||0,hours(actualMinutes(r)),r.note||'',dutyTypeLabel(a.kind),a.vehicleName||'',{driver:'司机',partner:'随车人员',office:'办公室值班'}[a.role]||'',r.source==='auto'?'按计划自动计入':['leave','leave-history'].includes(r.source)?'请假记录':r.status?'人工修改':'未登记'])}
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'值班记录')
    const sr=[['姓名','分组','排班次数','计划小时','完成次数','计入小时','请假次数','缺勤次数','巡逻人次','办公室人次','巡逻实际小时','办公室实际小时','活动值班次数','其他值班次数','自动计入次数'],...stats(month,now).map(p=>[p.name,p.group,p.count,p.planned,p.done,p.actual,p.leave,p.absent,p.patrolCount,p.officeCount,p.patrolActual,p.officeActual,p.activityCount,p.otherCount,p.autoCount])]
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(sr),'时长统计')
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['姓名','驾驶能力','分组','是否参与排班'],...staff.value.map(p=>[p.name,p.canDrive===true?'能开车':p.canDrive===false?'不能开车':'待确认',p.group,p.active===false?'已停用':'参与排班'])]),'人员名单')
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['姓名','请假开始','请假结束','备注'],...leaves.value.map(l=>[l.staffName,l.start,l.end,l.reason||''])]),'请假记录')
    return {blob:new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name:`校卫队值班表_${month}.xlsx`}
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  load()
  return {staff,leaves,saveLeave,cancelLeave,config,assignments,records,activity,currentMonth,persistenceError,lastSaved,save,recordFor,allRecords,weeklyStats,addStaff,updateStaff,deleteStaff,previewPlan,applyPlan,saveAssignment,saveDutyCrew,columns,setDailyNeed,deleteAssignment,toggleLock,saveRecord,deleteRecord,exportData,importData,stats,exportExcel}
})
