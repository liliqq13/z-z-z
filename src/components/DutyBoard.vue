<script setup>
import {ref,computed} from 'vue'
import Icon from './Icon.vue'
import {requiredStaff,availableAssignment,dutyLabel,dutyTypeLabel} from '../lib/engine.js'
const props=defineProps({date:String,config:Object,assignments:Array,records:Object})
const emit=defineEmits(['date','previous','next','add','edit','record','remove','need'])
const kind=ref('')
const posts=computed(()=>props.config.shifts.filter(s=>s.enabled!==false&&s.days.includes(new Date(`${props.date}T12:00:00`).getDay())&&(!kind.value||s.kind===kind.value)))
const members=s=>props.assignments.filter(a=>a.date===props.date&&a.shiftId===s.id&&availableAssignment(a,props.records))
const absent=s=>props.assignments.filter(a=>a.date===props.date&&a.shiftId===s.id&&!availableAssignment(a,props.records))
const need=s=>requiredStaff(s,props.date,props.config)
const status=a=>({working:'值班中',done:'已完成',leave:'请假',absent:'缺勤'}[props.records[a.id]?.status]||'待登记')
</script>
<template>
  <section class="duty-board">
    <div class="board-toolbar"><div><h2><Icon name="moon" :size="19"/>当晚岗位安排</h2><p>每辆巡逻车独立配人，办公室单独值守。</p></div><div class="board-date"><button class="icon-btn prev" aria-label="前一天" @click="emit('previous')"><Icon name="chevron" :size="16"/></button><input type="date" :value="date" aria-label="岗位安排日期" @change="emit('date',$event.target.value)"/><button class="icon-btn" aria-label="后一天" @click="emit('next')"><Icon name="chevron" :size="16"/></button><select v-model="kind" aria-label="筛选岗位类型"><option value="">全部岗位</option><option value="patrol">巡逻车辆</option><option value="office">办公室值班</option></select></div></div>
    <div v-if="!posts.length" class="panel empty-state"><Icon name="calendar" :size="30"/><h3>当日没有启用的岗位</h3><p>可在排班设置中添加车辆或调整值班星期。</p></div>
    <div class="post-grid"><article v-for="s in posts" :key="s.id" class="panel post-card" :class="s.kind" :data-post="s.vehicleName||s.name"><div class="post-card-head"><span class="post-icon"><Icon :name="s.kind==='patrol'?'car':s.kind==='office'?'office':'calendar'" :size="25"/></span><div><span class="post-type">{{dutyTypeLabel(s.kind)}}</span><h3>{{s.kind==='patrol'?s.vehicleName:s.name}}</h3></div><span class="post-coverage" :class="{complete:members(s).length>=need(s)}">{{members(s).length}} / {{need(s)}} 人</span></div><div class="post-time"><Icon name="clock" :size="14"/>{{s.start}}—{{s.end}}{{s.end<=s.start?'（次日）':''}}<span>{{s.kind==='patrol'?s.name:'固定值守岗位'}}</span></div>
    <div v-if="s.kind==='patrol'" class="post-capacity"><span>当晚随车人数</span><div class="segmented"><button :class="{active:need(s)===1}" :aria-label="s.vehicleName+'当晚安排1人'" @click="emit('need',s.id,1)">1 人</button><button :class="{active:need(s)===2}" :aria-label="s.vehicleName+'当晚安排2人'" @click="emit('need',s.id,2)">2 人</button></div></div><div v-else class="post-capacity"><span>岗位需求</span><strong>{{need(s)}} 人值守</strong></div>
    <div class="post-slots"><div v-for="n in Math.max(need(s),members(s).length)" :key="n" class="post-slot"><template v-if="members(s)[n-1]"><span class="person-avatar">{{members(s)[n-1].staffName.slice(-2)}}</span><div class="slot-person"><strong>{{members(s)[n-1].staffName}}</strong><span class="badge" :class="records[members(s)[n-1].id]?.status">{{status(members(s)[n-1])}}</span></div><div class="slot-actions"><button class="text-btn" @click="emit('record',members(s)[n-1])">登记</button><button class="icon-btn" :aria-label="'调整'+members(s)[n-1].staffName+'的岗位'" @click="emit('edit',members(s)[n-1])"><Icon name="edit" :size="14"/></button><button class="icon-btn" :aria-label="'移除'+members(s)[n-1].staffName+'的安排'" @click="emit('remove',members(s)[n-1])"><Icon name="close" :size="14"/></button></div></template><button v-else class="vacant-slot" @click="emit('add',s.id)"><span class="vacant-icon"><Icon name="plus" :size="18"/></span><span>安排第 {{n}} 位{{s.kind==='patrol'?'巡逻人员':'值班人员'}}</span><span class="vacant-hint">待安排</span></button></div></div>
    <div v-if="absent(s).length" class="post-absences"><button v-for="a in absent(s)" :key="a.id" class="text-btn" @click="emit('record',a)">{{a.staffName}} · {{status(a)}}（已留档）</button></div><div class="post-footer"><span>{{s.kind==='patrol'?`默认每车 ${s.need} 人，可按日期调整`:'与巡逻共用人员，避免同时间重复安排'}}</span><Icon name="shield" :size="13"/></div></article></div>
  </section>
</template>
