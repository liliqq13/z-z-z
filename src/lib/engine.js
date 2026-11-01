// Rule-based scheduling extension for aiastia/shift-scheduler.
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
export const dutyTypeLabel=kind=>({patrol:'夜间巡逻',office:'办公室值班',activity:'活动值班',other:'其他值班',general:'其他值班'}[kind]||'其他班次')
export function dutyLabel(item){const name=item.shiftName||item.name||dutyTypeLabel(item.kind);return item.kind==='patrol'&&item.vehicleName?`${item.vehicleName} · ${name}`:name}
export function defaultDutyShifts(){return [{id:'patrol-1',kind:'patrol',vehicleName:'巡逻车1',name:'夜间巡逻',start:'20:00',end:'22:00',need:2,days:[0,1,2,3,4,5,6],enabled:true,color:'#167866'},{id:'office-1',kind:'office',vehicleName:'',name:'办公室值班',start:'20:00',end:'22:00',need:1,days:[0,1,2,3,4,5,6],enabled:true,color:'#6979bf'},{id:'activity-1',kind:'activity',vehicleName:'',name:'活动值班',start:'20:00',end:'22:00',need:1,days:[0,1,2,3,4,5,6],dates:[],enabled:true,color:'#b28a49'},{id:'other-1',kind:'other',vehicleName:'',name:'其他值班',start:'20:00',end:'22:00',need:1,days:[0,1,2,3,4,5,6],dates:[],enabled:true,color:'#9a78ae'}]}
const CHINA_DATE_FORMAT=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'})
const WEEK_CACHE=new Map()
export function businessDate(now=Date.now()){const p=Object.fromEntries(CHINA_DATE_FORMAT.formatToParts(new Date(now)).map(p=>[p.type,p.value]));return `${p.year}-${p.month}-${p.day}`}
export const dutyTime=(date,time)=>new Date(`${date}T${time}:00+08:00`).getTime()
export const recordTime=value=>new Date(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?value+':00+08:00':value).getTime()
export function isShiftScheduled(shift,date){if(shift.enabled===false)return false;if(['activity','other'].includes(shift.kind))return (shift.dates||[]).includes(date);return (shift.days||[0,1,2,3,4,5,6]).includes(new Date(`${date}T12:00:00`).getDay())}
export function automaticRecord(assignment,now=Date.now()){if(timeWindow(assignment).end>now)return null;return {status:'done',actualStart:`${assignment.date}T${assignment.start}`,actualEnd:`${assignment.end<=assignment.start?addDays(assignment.date,1):assignment.date}T${assignment.end}`,breakMinutes:0,note:'按排班时间自动计入，可修改',source:'auto',automatic:true}}
export function validateLeave(period){
  const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&dateKey(new Date(`${d}T12:00:00`))===d
  if(!period||!valid(period.start)||!valid(period.end)||period.end<period.start)throw Error('请假结束日期不能早于开始日期，请选择有效日期')
  if(period.reason!==undefined&&(typeof period.reason!=='string'||period.reason.length>300))throw Error('请假备注最多 300 字')
  return true
}
export function leaveForAssignment(person,assignment){const w=timeWindow(assignment);return (person?.leavePeriods||[]).find(l=>w.start<dutyTime(addDays(l.end,1),'00:00')&&w.end>dutyTime(l.start,'00:00'))}
export function leaveRecord(period){return {status:'leave',actualStart:'',actualEnd:'',breakMinutes:0,note:`请假 ${period.start} 至 ${period.end}${period.reason?' · '+period.reason:''}`,source:'leave',leaveId:period.id,automatic:false}}
export function effectiveRecords(assignments,records,now=Date.now(),enabled=true,staff=[]){
  const result={...records},people=new Map(staff.map(p=>[p.id,p]))
  for(const a of assignments)if(!result[a.id]){const leave=leaveForAssignment(people.get(a.staffId),a);if(leave)result[a.id]=leaveRecord(leave);else if(enabled){const auto=automaticRecord(a,now);if(auto)result[a.id]=auto}}
  return result
}
export function weeklyShiftCount(staffId,date,assignments,records={}){return assignments.filter(a=>a.staffId===staffId&&weekKey(a.date)===weekKey(date)&&availableAssignment(a,records)).length}
export function requiredStaff(shift,date,config={}){return config.dailyNeeds?.[`${date}|${shift.id}`]??shift.need}
export function upgradeDutyData(data){
  const d=JSON.parse(JSON.stringify(data));d.config.dailyNeeds ||= {}
  d.staff=d.staff.map(p=>({...p,canDrive:typeof p.canDrive==='boolean'?p.canDrive:null,leavePeriods:p.leavePeriods||[]}))
  d.assignments=d.assignments.map(a=>({...a,kind:a.kind||'general',vehicleName:a.vehicleName||''}))
  if(!d.config.dutyModeVersion){
    const isOldDefault=d.config.shifts.length===2&&d.config.shifts.some(s=>s.id==='day'&&s.name==='早班'&&s.start==='08:00'&&s.end==='16:00')&&d.config.shifts.some(s=>s.id==='night'&&s.name==='晚班'&&s.start==='16:00'&&s.end==='00:00')
    const used=new Set(d.assignments.map(a=>a.shiftId))
    d.config.shifts=d.config.shifts.filter(s=>!isOldDefault||used.has(s.id)).map(s=>({...s,kind:s.kind||'general',vehicleName:s.vehicleName||'',enabled:isOldDefault?false:s.enabled}))
    const ids=new Set(d.config.shifts.map(s=>s.id));for(const s of defaultDutyShifts()){if(ids.has(s.id))s.id=uid();d.config.shifts.push(s)}
    d.config.dutyModeVersion=1
  }
  d.config.shifts=d.config.shifts.map(s=>({...s,kind:s.kind||'general',vehicleName:s.vehicleName||''}))
  if(!d.config.schoolVersion){
    const convert=s=>{if((s.kind==='general'||!s.kind)&&['早班','白班'].includes(s.name))return {...s,kind:'activity',name:'活动值班',dates:s.dates||[]};if((s.kind==='general'||!s.kind)&&['晚班','夜班'].includes(s.name))return {...s,kind:'other',name:'其他值班',dates:s.dates||[]};return s}
    d.config.shifts=d.config.shifts.map(convert).map(s=>['patrol','office'].includes(s.kind)?{...s,start:'20:00',end:'22:00'}:s)
    for(const template of defaultDutyShifts().filter(s=>['activity','other'].includes(s.kind)))if(!d.config.shifts.some(s=>s.kind===template.kind)){if(d.config.shifts.some(s=>s.id===template.id))template.id=uid();d.config.shifts.push(template)}
    d.assignments=d.assignments.map(a=>{const target=d.config.shifts.find(s=>s.id===a.shiftId);if(target&&['activity','other'].includes(target.kind)&&['早班','白班','晚班','夜班'].includes(a.shiftName))a={...a,kind:target.kind,shiftName:target.name};if(['patrol','office'].includes(a.kind)&&a.date>=businessDate()&&!d.records[a.id])return {...a,start:'20:00',end:'22:00'};return a})
    d.config.name='校卫队值班表';d.config.maxShiftsPerWeek??=2;d.config.preferNonDriverOffice=true;d.config.autoCount=true;d.config.schoolVersion=1
  }
  d.config.shifts=d.config.shifts.map(s=>({...s,dates:s.dates||[]}))
  return d
}
export function dateKey(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function addDays(key, n) { const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate()+n); return dateKey(d) }
export function dateRange(start,end) { const out=[]; for(let d=start;d<=end;d=addDays(d,1)){out.push(d);if(out.length>370)throw Error('每次最多生成 366 天');} return out }
export const hours = minutes => Math.round((minutes || 0)/60*100)/100
export function timeWindow(a,record) {if(record?.status==='done')return {start:recordTime(record.actualStart),end:recordTime(record.actualEnd)};return {start:dutyTime(a.date,a.start),end:dutyTime(a.end<=a.start?addDays(a.date,1):a.date,a.end)}}
export function plannedMinutes(a) { const {start,end}=timeWindow(a);return (end-start)/60000 }
export function weekKey(key) {if(WEEK_CACHE.has(key))return WEEK_CACHE.get(key);const d=new Date(`${key}T12:00:00`),result=addDays(key,-((d.getDay()+6)%7));if(WEEK_CACHE.size>4000)WEEK_CACHE.clear();WEEK_CACHE.set(key,result);return result}
export function weeklyMinutes(a,record) { const {start,end}=timeWindow(a,record);let t=start;const totals={};while(t<end){const date=businessDate(t);const next=dutyTime(addDays(date,1),'00:00');const e=Math.min(end,next),week=weekKey(date);totals[week]=(totals[week]||0)+(e-t)/60000;t=e;}return totals }
export const availableAssignment=(a,records={})=>!['leave','absent'].includes(records[a.id]?.status)
export function actualMinutes(record) { if(record?.status!=='done')return 0; const duration=(recordTime(record.actualEnd)-recordTime(record.actualStart))/60000-Number(record.breakMinutes||0);return Number.isFinite(duration)?Math.max(0,duration):0 }
export function touchedDates(a){ const w=timeWindow(a);const out=[];for(let d=a.date;dutyTime(d,'00:00')<w.end;d=addDays(d,1))out.push(d);return out }
export function reasonsFor(person, candidate, assignments, config, records={}) {
  if(!person || person.active===false)return ['人员已停用']
  const reasons=[];if(candidate.role==='driver'&&person.canDrive!==true)reasons.push('司机必须选择能开车的人员');const dates=touchedDates(candidate)
  if(leaveForAssignment(person,candidate))reasons.push('该时段正在请假')
  if(dates.some(d=>(person.unavailableDates||[]).includes(d)||(person.unavailableWeekdays||[]).includes(new Date(`${d}T12:00:00`).getDay())))reasons.push('该时段不可值班')
  if(assignments.some(a=>a.staffId===person.id&&records[a.id]&&records[a.id].source!=='leave-history'&&['leave','absent'].includes(records[a.id].status)&&touchedDates(a).some(d=>dates.includes(d))))reasons.push('该日有请假或缺勤记录')
  const own=assignments.filter(a=>a.staffId===person.id&&a.id!==candidate.id&&availableAssignment(a,records))
  if(config.onePerDay&&own.some(a=>a.date===candidate.date))reasons.push('当天已有班次')
  const c=timeWindow(candidate), rest=Number(config.minRestHours||0)*3600000
  for(const a of own){const w=timeWindow(a,records[a.id]);if(c.start<w.end&&c.end>w.start){reasons.push('值班时间重叠');break;}if((c.start>=w.end&&c.start-w.end<rest)||(w.start>=c.end&&w.start-c.end<rest)){reasons.push('班次间休息不足');break;}}
  if(Number(config.maxWeeklyHours)>0){const totals={};for(const a of own){for(const [k,v] of Object.entries(weeklyMinutes(a,records[a.id])))totals[k]=(totals[k]||0)+v;}for(const [k,v] of Object.entries(weeklyMinutes(candidate))){if((totals[k]||0)+v>Number(config.maxWeeklyHours)*60){reasons.push('超过每周时长上限');break;}}}
  if(Number(config.maxShiftsPerWeek)>0&&weeklyShiftCount(person.id,candidate.date,own,records)>=Number(config.maxShiftsPerWeek))reasons.push('超过每周值班次数上限')
  const shift=config.shifts?.find(s=>s.id===candidate.shiftId)
  if(shift&&['patrol','office','activity','other'].includes(shift.kind)&&assignments.filter(a=>a.id!==candidate.id&&a.date===candidate.date&&a.shiftId===candidate.shiftId&&availableAssignment(a,records)).length>=requiredStaff(shift,candidate.date,config))reasons.push('该车辆或岗位人数已满，请先调整人数或移除人员')
  return [...new Set(reasons)]
}
export function hasQualifiedDriver(crew,staff,records={}){return crew.some(a=>{const p=staff.find(p=>p.id===a.staffId);return (p?.canDrive===true&&p.active!==false)||(records[a.id]?.status==='done'&&a.role==='driver'&&a.canDriveAtAssignment===true)})}
export function coverageGaps(assignments,shifts,start,end,records={},config={},staff=[]) {
  const gaps=[]
  for(const date of dateRange(start,end))for(const shift of shifts.filter(s=>isShiftScheduled(s,date))){
    const crew=assignments.filter(a=>a.date===date&&a.shiftId===shift.id&&availableAssignment(a,records)),need=requiredStaff(shift,date,config),missing=Math.max(0,need-crew.length),driverMissing=shift.kind==='patrol'&&!hasQualifiedDriver(crew,staff,records)
    if(missing||driverMissing)gaps.push({date,shiftName:dutyLabel(shift),kind:shift.kind,vehicleName:shift.vehicleName,missing,driverMissing,shiftId:shift.id})
  }
  return gaps
}
export function generatePlan({staff,shifts,assignments,records={},config,start,end}) {
  records=effectiveRecords(assignments,records,Date.now(),false,staff)
  if(!staff.some(p=>p.active!==false))throw Error('请先添加人员')
  if(!shifts.some(s=>s.enabled!==false))throw Error('请先设置巡逻车和办公室岗位')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)throw Error('请选择有效的起止日期')
  const dates=dateRange(start,end);if(dates.length>366)throw Error('每次最多生成 366 天')
  const kept=assignments.filter(a=>a.date<start||a.date>end||a.locked||records[a.id]);let best=null
  for(let trial=0;trial<16;trial++){
    const result=[...kept],load={},nights={},weekends={},roleCounts={},postCounts={}
    for(const p of staff){load[p.id]=0;nights[p.id]=0;weekends[p.id]=0;roleCounts[p.id]={};postCounts[p.id]={}}
    function countAssignment(a,minutes){const id=a.staffId,role=a.kind||a.shiftId;load[id]=(load[id]||0)+minutes;roleCounts[id]||={};postCounts[id]||={};roleCounts[id][role]=(roleCounts[id][role]||0)+1;postCounts[id][a.shiftId]=(postCounts[id][a.shiftId]||0)+1;if(a.end<=a.start)nights[id]=(nights[id]||0)+1;if([0,6].includes(new Date(`${a.date}T12:00:00`).getDay()))weekends[id]=(weekends[id]||0)+1}
    for(const a of result)if(availableAssignment(a,records))countAssignment(a,records[a.id]?.status==='done'?actualMinutes(records[a.id]):plannedMinutes(a))
    const crewFor=(shift,date)=>result.filter(a=>a.date===date&&a.shiftId===shift.id&&availableAssignment(a,records))
    const baseFor=(shift,date,role)=>({date,shiftId:shift.id,shiftName:shift.name,kind:shift.kind||'general',vehicleName:shift.vehicleName||'',start:shift.start,end:shift.end,role,locked:false,source:'auto'})
    function pick(shift,date,role){
      const base=baseFor(shift,date,role);let eligible=staff.filter(p=>reasonsFor(p,base,result,config,records).length===0)
      if(shift.kind==='office'&&config.preferNonDriverOffice!==false&&eligible.some(p=>p.canDrive!==true))eligible=eligible.filter(p=>p.canDrive!==true)
      const score=p=>(load[p.id]||0)+(roleCounts[p.id][shift.kind||shift.id]||0)*45+(postCounts[p.id][shift.id]||0)*15+(result.some(a=>a.staffId===p.id&&a.date===addDays(date,-7)&&availableAssignment(a,records))?160:0)+(base.end<=base.start?(nights[p.id]||0)*120:0)+([0,6].includes(new Date(`${date}T12:00:00`).getDay())?(weekends[p.id]||0)*60:0)
      const rotation=Math.floor((Date.parse(weekKey(date)+'T00:00:00Z')-Date.parse('2026-01-05T00:00:00Z'))/604800000);eligible.sort((a,b)=>weeklyShiftCount(a.id,date,result,records)-weeklyShiftCount(b.id,date,result,records)||score(a)-score(b)||((staff.indexOf(a)+trial+rotation%staff.length+staff.length)%staff.length)-((staff.indexOf(b)+trial+rotation%staff.length+staff.length)%staff.length))
      if(!eligible.length)return false
      const p=eligible[0],a={...base,id:uid(),staffId:p.id,staffName:p.name,canDriveAtAssignment:p.canDrive===true};result.push(a);countAssignment(a,plannedMinutes(a));return true
    }
    for(const date of dates){
      const daily=shifts.filter(s=>isShiftScheduled(s,date)).sort((a,b)=>a.start.localeCompare(b.start))
      // Reserve a driver for every car before filling passenger and office seats.
      const patrols=daily.filter(s=>s.kind==='patrol').sort((a,b)=>staff.filter(p=>reasonsFor(p,baseFor(a,date,'driver'),result,config,records).length===0).length-staff.filter(p=>reasonsFor(p,baseFor(b,date,'driver'),result,config,records).length===0).length)
      for(const shift of patrols){const crew=crewFor(shift,date);if(crew.length<requiredStaff(shift,date,config)&&!hasQualifiedDriver(crew,staff,records))pick(shift,date,'driver')}
      for(const shift of [...daily.filter(s=>s.kind==='office'),...patrols,...daily.filter(s=>!['patrol','office'].includes(s.kind))]){
        if(shift.kind==='patrol'&&!hasQualifiedDriver(crewFor(shift,date),staff,records))continue
        while(crewFor(shift,date).length<requiredStaff(shift,date,config))if(!pick(shift,date,shift.kind==='patrol'?'partner':'office'))break
      }
    }
    const gaps=coverageGaps(result,shifts,start,end,records,config,staff),missing=gaps.reduce((n,g)=>n+g.missing,0),driverGaps=gaps.filter(g=>g.driverMissing).length
    const loads=staff.filter(p=>p.active!==false).map(p=>load[p.id]||0),spread=Math.max(...loads)-Math.min(...loads),cost=missing+driverGaps
    if(!best||cost<best.cost||(cost===best.cost&&spread<best.spread))best={assignments:result,gaps,missing,driverGaps,cost,spread,kept:kept.filter(a=>a.date>=start&&a.date<=end).length}
  }
  const overLimit=[];if(Number(config.maxShiftsPerWeek)>0)for(const p of staff)for(const week of new Set(dates.map(weekKey))){const count=weeklyShiftCount(p.id,week,best.assignments,records);if(count>config.maxShiftsPerWeek)overLimit.push({staffId:p.id,name:p.name,week,count})}
  return {...best,overLimit}
}
export function validateRecord(r) {
  if(!['working','done','leave','absent'].includes(r.status))throw Error('请选择有效的值班状态')
  const validTimestamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)&&Number.isFinite(new Date(v).getTime())&&dateKey(new Date(v))===v.slice(0,10)
  if(['working','done'].includes(r.status)&&!validTimestamp(r.actualStart))throw Error('请填写实际到岗时间')
  if(r.status==='done'){
    if(!validTimestamp(r.actualEnd))throw Error('请填写有效的离岗时间')
    const span=(new Date(r.actualEnd)-new Date(r.actualStart))/60000
    if(!Number.isFinite(span)||span<=0)throw Error('离岗时间必须晚于到岗时间，跨日请修改日期')
    if(!Number.isFinite(Number(r.breakMinutes))||Number(r.breakMinutes)<0||Number(r.breakMinutes)>=span)throw Error('扣除分钟必须为非负数且小于值班总时长')
  }
  return true
}
export function validateBackup(d) {
  if(d?.version!==2||!Array.isArray(d.staff)||!Array.isArray(d.assignments)||!Array.isArray(d.config?.shifts)||!d.records||typeof d.records!=='object'||Array.isArray(d.records))throw Error('备份格式不正确，请选择校卫队值班表导出的 JSON 文件')
  const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&dateKey(new Date(`${d}T12:00:00`))===d
  const validTime=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)
  if(d.config.maxShiftsPerWeek!==undefined&&(!Number.isInteger(d.config.maxShiftsPerWeek)||d.config.maxShiftsPerWeek<0||d.config.maxShiftsPerWeek>21))throw Error('每周次数上限无效');if(d.config.autoCount!==undefined&&typeof d.config.autoCount!=='boolean')throw Error('自动计入设置无效')
  const ids=new Set(),aids=new Set(),sids=new Set()
  for(const p of d.staff){if(!p||typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||!Array.isArray(p.unavailableDates)||p.unavailableDates.some(v=>!validDate(v))||!Array.isArray(p.unavailableWeekdays)||p.unavailableWeekdays.some(v=>!Number.isInteger(v)||v<0||v>6))throw Error('备份中的人员资料不完整');if(p.canDrive!==undefined&&p.canDrive!==null&&typeof p.canDrive!=='boolean')throw Error('驾驶能力选项无效');if(p.leavePeriods!==undefined){if(!Array.isArray(p.leavePeriods))throw Error('请假记录格式无效');const lids=new Set();for(const l of p.leavePeriods){validateLeave(l);if(typeof l.id!=='string'||!l.id||lids.has(l.id))throw Error('请假记录编号无效');lids.add(l.id)}for(let i=0;i<p.leavePeriods.length;i++)for(let j=i+1;j<p.leavePeriods.length;j++)if(p.leavePeriods[i].start<=p.leavePeriods[j].end&&p.leavePeriods[j].start<=p.leavePeriods[i].end)throw Error('同一人员的请假日期不能重叠')}ids.add(p.id)}
  for(const s of d.config.shifts){if(!s||!s.id||sids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||!validTime(s.start)||!validTime(s.end)||!Number.isInteger(s.need)||s.need<1||s.need>100||!Array.isArray(s.days)||s.days.some(v=>!Number.isInteger(v)||v<0||v>6))throw Error('备份中的班次配置无效');if(s.kind!==undefined&&!['patrol','office','activity','other','general'].includes(s.kind))throw Error('备份中的岗位类型无效');if(s.kind==='patrol'&&(typeof s.vehicleName!=='string'||!s.vehicleName.trim()||![1,2].includes(s.need)))throw Error('巡逻车辆需填写名称，人数为 1 人或 2 人');if(s.dates!==undefined&&(!Array.isArray(s.dates)||s.dates.some(d=>!validDate(d))))throw Error('活动或其他值班日期无效');sids.add(s.id)}
  for(const a of d.assignments){if(!a||typeof a.id!=='string'||aids.has(a.id)||!ids.has(a.staffId)||typeof a.shiftId!=='string'||typeof a.shiftName!=='string'||typeof a.staffName!=='string'||!validDate(a.date)||!validTime(a.start)||!validTime(a.end))throw Error('备份中的排班资料无效');if(a.kind!==undefined&&!['patrol','office','activity','other','general'].includes(a.kind))throw Error('备份中的值班类型无效');if(a.vehicleName!==undefined&&typeof a.vehicleName!=='string')throw Error('备份中的车辆资料无效');if(a.role!==undefined&&!['driver','partner','office'].includes(a.role))throw Error('排班角色无效');aids.add(a.id)}
  if(d.config.dailyNeeds!==undefined){if(!d.config.dailyNeeds||typeof d.config.dailyNeeds!=='object'||Array.isArray(d.config.dailyNeeds))throw Error('指定日期人数配置无效');for(const [key,need]of Object.entries(d.config.dailyNeeds)){const [date,id]=key.split('|');const shift=d.config.shifts.find(s=>s.id===id);if(!validDate(date)||!shift||!Number.isInteger(need)||(shift.kind==='patrol'?![1,2].includes(need):need<1||need>100))throw Error('指定日期人数配置无效')}}
  for(const [id,r]of Object.entries(d.records)){if(!aids.has(id))throw Error('备份中有无法对应排班的值班记录');validateRecord(r)}
  if(!Number.isFinite(Number(d.config.minRestHours))||Number(d.config.minRestHours)<0||Number(d.config.minRestHours)>168||!Number.isFinite(Number(d.config.maxWeeklyHours))||Number(d.config.maxWeeklyHours)<0||Number(d.config.maxWeeklyHours)>168)throw Error('备份中的规则配置无效')
  return true
}
