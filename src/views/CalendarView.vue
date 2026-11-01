<template>
  <div>
    <div class="card">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="btn btn-outline btn-sm" @click="changeMonth(-1)">◀</button>
          <h3>{{ monthTitle }}</h3>
          <button class="btn btn-outline btn-sm" @click="changeMonth(1)">▶</button>
          <button class="btn btn-outline btn-sm" @click="goToday">今天</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="legend">
            <div v-if="store.config.mode === '24h'" class="legend-item">
              <div class="legend-dot" :style="{ background: store.colors[0] }"></div>全天值班
            </div>
            <template v-else>
              <div v-for="(s, i) in store.config.shifts" :key="i" class="legend-item">
                <div class="legend-dot" :style="{ background: store.colors[i] }"></div>{{ s.name }}
              </div>
            </template>
          </div>
          <button class="btn btn-outline btn-sm" @click="print">🖨️ 打印</button>
        </div>
      </div>
      <table class="calendar-table">
        <thead><tr><th v-for="d in ['一','二','三','四','五','六','日']" :key="d">{{ d }}</th></tr></thead>
        <tbody>
          <tr v-for="(week, wi) in calendarCells" :key="wi">
            <td v-for="(cell, di) in week" :key="di"
                :class="{ today: cell.dateStr === todayStr, 'other-month': cell.other }"
                @click="cell.dateStr && openEdit(cell.dateStr)">
              <div class="day-num">{{ cell.day }}</div>
              <template v-if="cell.dateStr">
                <div v-for="(info, sid) in getDayShifts(cell.dateStr)" :key="sid">
                  <div v-if="store.config.mode === '24h'" class="shift-tag" :style="{ background: store.colors[0] }">
                    📊 {{ info.name }}
                  </div>
                  <template v-else>
                    <div v-for="si in info.shifts" :key="si" class="shift-tag" :style="{ background: store.colors[si] }">
                      {{ store.config.shifts[si]?.name }}:{{ info.name }}
                    </div>
                  </template>
                </div>
                <div v-for="(reason, sid) in store.leaveRecords[cell.dateStr] || {}" :key="'l'+sid" class="leave-tag">
                  🏖️ {{ getStaffName(sid) }}（{{ reason }}）
                </div>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Stats -->
    <div v-if="hasSchedule" class="card no-print">
      <div class="card-title">📊 公平性统计（按月）</div>
      <div v-html="statsHtml"></div>
    </div>

    <!-- Day Edit Modal -->
    <div class="modal-overlay" :class="{ active: editDate }" @click.self="editDate = null">
      <div class="modal">
        <h3>编辑排班 - {{ editDateLabel }}</h3>
        <div v-for="person in store.staff" :key="person.id"
             style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
          <span style="min-width:80px;font-weight:500;">{{ person.name }}</span>
          <template v-if="store.config.mode === '24h'">
            <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
              <input type="checkbox" :checked="editAssignments[person.id]" @change="toggleAssignment(person.id, 0)"> 值班
            </label>
          </template>
          <template v-else>
            <label v-for="(shift, si) in store.config.shifts" :key="si"
                   style="display:flex;align-items:center;gap:4px;font-size:12px;">
              <input type="checkbox" :checked="editAssignments[person.id]?.includes(si)" @change="toggleAssignment(person.id, si)">
              {{ shift.name }}
            </label>
          </template>
        </div>
        <div class="modal-actions">
          <button class="btn btn-outline" @click="editDate = null">取消</button>
          <button class="btn btn-primary" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSchedulerStore } from '../stores/scheduler'

const store = useSchedulerStore()
const editDate = ref(null)
const editAssignments = ref({})

const todayStr = store.formatDate(new Date())

const monthTitle = computed(() => {
  const [y, m] = store.currentMonth.split('-').map(Number)
  return `${y}年${m}月`
})

const calendarCells = computed(() => {
  const [year, month] = store.currentMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  let startWd = firstDay.getDay()
  if (startWd === 0) startWd = 7

  const cells = []
  // Prev month fill
  const prevDays = new Date(year, month - 1, 0).getDate()
  for (let i = 1; i < startWd; i++) {
    cells.push({ day: prevDays - startWd + i + 1, other: true, dateStr: '' })
  }
  // This month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, other: false, dateStr })
  }
  // Next month fill
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - daysInMonth - startWd + 2, other: true, dateStr: '' })
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
})

function getDayShifts(dateStr) {
  const dayData = store.schedule[dateStr]
  if (!dayData) return {}
  const result = {}
  Object.entries(dayData).forEach(([sid, val]) => {
    const person = store.staff.find(s => s.id === sid)
    if (!person) return
    result[sid] = {
      name: person.name,
      shifts: store.config.mode === '24h' ? [0] : (Array.isArray(val) ? val : []),
    }
  })
  return result
}

function getStaffName(sid) {
  return store.staff.find(s => s.id === sid)?.name || ''
}

function changeMonth(delta) {
  const [y, m] = store.currentMonth.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  store.currentMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

function goToday() {
  const now = new Date()
  store.currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
}

function openEdit(dateStr) {
  editDate.value = dateStr
  const dayData = store.schedule[dateStr] || {}
  const assignments = {}
  store.staff.forEach(person => {
    const val = dayData[person.id]
    if (val !== undefined) {
      assignments[person.id] = store.config.mode === '24h' ? true : (Array.isArray(val) ? [...val] : [])
    }
  })
  editAssignments.value = assignments
}

const editDateLabel = computed(() => {
  if (!editDate.value) return ''
  const parts = editDate.value.split('-')
  return `${parseInt(parts[1])}月${parseInt(parts[2])}日`
})

function toggleAssignment(sid, shiftIdx) {
  if (store.config.mode === '24h') {
    if (editAssignments.value[sid]) delete editAssignments.value[sid]
    else editAssignments.value[sid] = true
  } else {
    if (!editAssignments.value[sid]) editAssignments.value[sid] = []
    const arr = editAssignments.value[sid]
    const idx = arr.indexOf(shiftIdx)
    if (idx >= 0) arr.splice(idx, 1)
    else arr.push(shiftIdx)
    if (arr.length === 0) delete editAssignments.value[sid]
  }
}

function saveEdit() {
  const assignments = {}
  Object.entries(editAssignments.value).forEach(([sid, val]) => {
    if (store.config.mode === '24h') {
      assignments[sid] = 0
    } else {
      assignments[sid] = val
    }
  })
  store.saveDayEdit(editDate.value, assignments)
  editDate.value = null
}

function print() { window.print() }

// Stats
const hasSchedule = computed(() => Object.keys(store.schedule).length > 0)

const statsHtml = computed(() => {
  const [curYear, curMonth] = store.currentMonth.split('-').map(Number)
  const monthPrefix = `${curYear}-${String(curMonth).padStart(2, '0')}`
  const stats = {}
  store.staff.forEach(s => { stats[s.id] = { name: s.name, group: s.group, workDays: 0, shifts: {} } })

  Object.entries(store.schedule).forEach(([dateStr, dayData]) => {
    if (!dateStr.startsWith(monthPrefix)) return
    Object.entries(dayData).forEach(([sid]) => {
      if (stats[sid]) stats[sid].workDays++
    })
  })

  const vals = Object.values(stats)
  if (vals.length === 0) return ''
  const minDays = Math.min(...vals.map(v => v.workDays))
  const maxDays = Math.max(...vals.map(v => v.workDays))

  let html = `<div style="margin-bottom:8px;font-size:13px;color:var(--text-light);">📅 ${curYear}年${curMonth}月</div>`
  html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
  html += '<tr style="background:#FAFAFA;"><th style="padding:8px;text-align:left;border:1px solid var(--border);">姓名</th>'
  html += '<th style="padding:8px;border:1px solid var(--border);">组</th>'
  html += '<th style="padding:8px;border:1px solid var(--border);">工作天数</th></tr>'

  vals.forEach(s => {
    const bg = s.workDays === minDays ? 'var(--warning-light)' : 'transparent'
    html += `<tr style="background:${bg};"><td style="padding:8px;border:1px solid var(--border);font-weight:500;">${s.name}</td>`
    html += `<td style="padding:8px;border:1px solid var(--border);text-align:center;">${s.group}</td>`
    html += `<td style="padding:8px;border:1px solid var(--border);text-align:center;font-weight:600;">${s.workDays}天</td></tr>`
  })
  html += '</table>'
  if (maxDays - minDays > 0) {
    html += `<div style="margin-top:8px;font-size:12px;color:var(--warning);">⚠️ 差距 ${maxDays - minDays} 天</div>`
  } else {
    html += `<div style="margin-top:8px;font-size:12px;color:var(--success);">✅ 完美均衡！</div>`
  }
  return html
})
</script>
