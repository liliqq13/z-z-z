<template>
  <div class="card">
    <div class="calendar-header">
      <div class="calendar-nav">
        <button class="btn btn-outline btn-sm" @click="changeMonth(-1)">◀</button>
        <h3>{{ monthTitle }}</h3>
        <button class="btn btn-outline btn-sm" @click="changeMonth(1)">▶</button>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm" @click="doExport">📗 导出Excel</button>
        <button class="btn btn-outline btn-sm" @click="print">🖨️ 打印</button>
      </div>
    </div>
    <div v-if="store.staff.length === 0 || !hasSchedule" class="empty-state">
      <p>暂无排班数据，请先配置并生成排班</p>
    </div>
    <div v-else class="table-view">
      <table class="schedule-table">
        <thead>
          <tr>
            <th class="name-col">姓名</th>
            <th v-for="d in daysInMonth" :key="d" :style="getDayStyle(d)">
              {{ d }}<br><span style="font-size:10px;font-weight:400;">{{ getWeekday(d) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in store.staff" :key="person.id">
            <td class="name-col">{{ person.name }}</td>
            <td v-for="d in daysInMonth" :key="d">
              <template v-if="isLeave(person.id, d)">
                <span style="font-size:11px;padding:3px 6px;border-radius:4px;background:#999;color:white;font-weight:500;text-decoration:line-through;">
                  {{ getLeaveReason(person.id, d) }}
                </span>
              </template>
              <template v-else-if="getCellValue(person.id, d)">
                <span v-if="store.config.mode === '24h'" class="shift-cell" :style="{ background: store.colors[0] }">值班</span>
                <template v-else>
                  <span v-for="si in getCellValue(person.id, d)" :key="si" class="shift-cell" :style="{ background: store.colors[si] }">
                    {{ store.config.shifts[si]?.name || si }}
                  </span>
                </template>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSchedulerStore } from '../stores/scheduler'

const store = useSchedulerStore()

const monthTitle = computed(() => {
  const [y, m] = store.currentMonth.split('-').map(Number)
  return `${y}年${m}月`
})

const daysInMonth = computed(() => {
  const [y, m] = store.currentMonth.split('-').map(Number)
  return new Date(y, m, 0).getDate()
})

const hasSchedule = computed(() => Object.keys(store.schedule).length > 0)

function dateStr(d) {
  const [y, m] = store.currentMonth.split('-')
  return `${y}-${m}-${String(d).padStart(2, '0')}`
}

function getWeekday(d) {
  const ds = dateStr(d)
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(ds).getDay()]
}

function getDayStyle(d) {
  const ds = dateStr(d)
  const day = new Date(ds).getDay()
  return day === 0 || day === 6 ? 'color:var(--danger);' : ''
}

function getCellValue(sid, d) {
  const ds = dateStr(d)
  const dayData = store.schedule[ds]
  if (!dayData || dayData[sid] === undefined) return null
  const val = dayData[sid]
  if (store.config.mode === '24h') return [0]
  return Array.isArray(val) ? val : []
}

function isLeave(sid, d) {
  const ds = dateStr(d)
  return store.leaveRecords[ds]?.[sid] !== undefined
}

function getLeaveReason(sid, d) {
  const ds = dateStr(d)
  return store.leaveRecords[ds]?.[sid] || ''
}

function changeMonth(delta) {
  const [y, m] = store.currentMonth.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  store.currentMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

function doExport() {
  if (!store.exportExcel()) alert('导出失败，请确认已安装xlsx库')
}

function print() {
  // 测量表格实际宽度，计算缩放比例适配横向打印
  const tableView = document.querySelector('.table-view')
  const table = document.querySelector('.schedule-table')
  if (!tableView || !table) { window.print(); return }

  const tableWidth = table.scrollWidth
  // A4 横向可打印宽度约 277mm ≈ 1046px (96dpi)
  const pageWidth = 1040
  const scale = tableWidth > pageWidth ? pageWidth / tableWidth : 1

  const style = document.createElement('style')
  style.id = 'print-landscape-style'
  style.textContent = `
    @page { size: landscape; margin: 8mm; }
    @media print {
      .card { padding: 4px !important; border: none !important; box-shadow: none !important; }
      .calendar-header { margin-bottom: 4px !important; }
      .calendar-header .calendar-nav h3 { font-size: 14px !important; }
      .calendar-header .btn { display: none !important; }
      .table-view { overflow: visible !important; }
      .table-view .schedule-table {
        transform: scale(${scale});
        transform-origin: top left;
        width: ${tableWidth}px !important;
      }
      .schedule-table th, .schedule-table td { padding: 3px 2px !important; border-width: 0.5px !important; font-size: 10px !important; }
      .name-col { min-width: auto !important; padding-left: 4px !important; white-space: nowrap; }
      .shift-cell { font-size: 9px !important; padding: 1px 3px !important; margin: 0 !important; }
    }
  `
  document.head.appendChild(style)
  window.print()
  setTimeout(() => {
    const el = document.getElementById('print-landscape-style')
    if (el) el.remove()
  }, 1000)
}
</script>
