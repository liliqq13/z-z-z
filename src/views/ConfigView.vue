<template>
  <div>
    <!-- Staff Management -->
    <div class="card">
      <div class="card-title">👥 人员管理</div>
      <div class="form-row">
        <div class="form-group">
          <label>添加人员</label>
          <div style="display:flex;gap:8px;">
            <input v-model="staffName" placeholder="输入姓名" @keyup.enter="addStaff">
            <select v-model="staffGroup" style="width:80px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;">
              <option value="A">A组</option><option value="B">B组</option>
              <option value="C">C组</option><option value="D">D组</option>
            </select>
            <button class="btn btn-primary btn-sm" @click="addStaff">添加</button>
          </div>
        </div>
      </div>
      <div v-if="store.staff.length === 0" class="empty-state" style="padding:20px;">
        <p>暂无人员，请先添加值班人员</p>
      </div>
      <div v-else class="staff-list">
        <template v-for="(members, g) in groupedStaff" :key="g">
          <div style="width:100%;margin-top:8px;font-size:12px;color:var(--text-light);font-weight:600;">{{ g }}组</div>
          <div v-for="s in members" :key="s.id" class="staff-tag" :class="'group-' + g.toLowerCase()">
            {{ s.name }}
            <span class="remove" @click="store.removeStaff(s.id)">✕</span>
          </div>
        </template>
      </div>
    </div>

    <!-- Shift Mode -->
    <div class="card">
      <div class="card-title">🕐 班次模式</div>
      <div class="form-group">
        <label>选择值班模式</label>
        <div class="radio-group">
          <div class="radio-item" :class="{ selected: store.config.mode === '24h' }" @click="store.config.mode = '24h'; store.save()">
            <span>🕐 24小时值班</span>
            <span style="font-size:11px;color:var(--text-light);">一人值一整天</span>
          </div>
          <div class="radio-item" :class="{ selected: store.config.mode === 'split' }" @click="store.config.mode = 'split'; store.save()">
            <span>🕓 分时段值班</span>
            <span style="font-size:11px;color:var(--text-light);">白班/中班/夜班</span>
          </div>
        </div>
      </div>
      <div v-if="store.config.mode === 'split'">
        <div class="form-group">
          <label>班次划分</label>
          <div class="radio-group">
            <div class="radio-item" :class="{ selected: store.config.shiftCount === 2 }" @click="setShiftCount(2)">
              <span>2班制</span><span style="font-size:11px;color:var(--text-light);">白班+夜班</span>
            </div>
            <div class="radio-item" :class="{ selected: store.config.shiftCount === 3 }" @click="setShiftCount(3)">
              <span>3班制</span><span style="font-size:11px;color:var(--text-light);">白班+中班+夜班</span>
            </div>
          </div>
        </div>
        <div v-for="(shift, i) in activeShifts" :key="i" class="form-row" style="margin-bottom:8px;align-items:center;">
          <span style="font-size:13px;font-weight:500;min-width:60px;">班次{{ i + 1 }}</span>
          <input v-model="activeShifts[i].name" style="width:80px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;">
          <input type="time" v-model="activeShifts[i].start" style="width:100px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;">
          <span style="font-size:12px;">至</span>
          <input type="time" v-model="activeShifts[i].end" style="width:100px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;font-size:13px;">
        </div>
      </div>
    </div>

    <!-- Rotation Rules -->
    <div class="card">
      <div class="card-title">🔄 轮班规则</div>
      <div style="margin-bottom:12px;padding:10px 14px;background:var(--primary-light);border-radius:8px;font-size:12px;color:var(--primary-dark);line-height:1.6;">
        💡 <strong>排班逻辑：</strong><br>
        • <strong>24小时模式</strong>：所有人按顺序轮流值班<br>
        • <strong>分时段模式</strong>：分组绑定班次，每隔固定天数组间轮换
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>每组每班需要人数</label>
          <input type="number" v-model.number="store.config.dailyNeed" min="1" max="10" style="width:100px;">
        </div>
        <div class="form-group">
          <label>轮换周期（天）</label>
          <input type="number" v-model.number="store.config.rotationDays" min="1" max="90" style="width:100px;">
        </div>
        <div class="form-group">
          <label>生成天数</label>
          <input type="number" v-model.number="store.config.daysToGenerate" min="1" max="365" style="width:100px;">
        </div>
        <div class="form-group">
          <label>排班起始日期</label>
          <input type="date" v-model="store.config.startDate">
        </div>
      </div>
    </div>

    <!-- Color Settings -->
    <div class="card">
      <div class="card-title">🎨 颜色设置</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;">
        <div v-for="i in colorCount" :key="i" style="display:flex;align-items:center;gap:6px;">
          <input type="color" :value="store.colors[i-1]" @input="store.updateColor(i-1, $event.target.value)" style="width:36px;height:28px;border:1px solid var(--border);border-radius:4px;cursor:pointer;">
          <span style="font-size:12px;">{{ colorLabel(i-1) }}</span>
        </div>
      </div>
      <button class="btn btn-outline btn-xs" style="margin-top:8px;" @click="store.resetColors()">恢复默认</button>
    </div>

    <div style="text-align:center;margin:20px 0;">
      <button class="btn btn-primary" @click="generate" style="padding:12px 40px;font-size:16px;">
        🚀 一键生成排班
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSchedulerStore } from '../stores/scheduler'

const emit = defineEmits(['generated'])
const store = useSchedulerStore()

const staffName = ref('')
const staffGroup = ref('A')

const shiftPresets = {
  2: [
    { name: '白班', start: '08:00', end: '20:00' },
    { name: '夜班', start: '20:00', end: '08:00' },
  ],
  3: [
    { name: '白班', start: '08:00', end: '16:00' },
    { name: '中班', start: '16:00', end: '00:00' },
    { name: '夜班', start: '00:00', end: '08:00' },
  ],
}

function setShiftCount(count) {
  store.config.shiftCount = count
  store.config.shifts = shiftPresets[count].map(s => ({ ...s }))
  store.save()
}

const activeShifts = computed(() => {
  const count = store.config.shiftCount
  // If shifts array is too short, fill with presets
  const preset = shiftPresets[count] || []
  while (store.config.shifts.length < count) {
    const i = store.config.shifts.length
    store.config.shifts.push(preset[i] ? { ...preset[i] } : { name: `班次${i+1}`, start: '00:00', end: '00:00' })
  }
  return store.config.shifts.slice(0, count)
})

const groupedStaff = computed(() => store.getGroups())
const colorCount = computed(() => store.config.mode === '24h' ? 1 : store.config.shiftCount)
const colorLabel = (i) => store.config.mode === '24h' ? '值班' : (store.config.shifts[i]?.name || `班次${i + 1}`)

function addStaff() {
  const name = staffName.value.trim()
  if (!name) return alert('请输入姓名')
  if (!store.addStaff(name, staffGroup.value)) return alert('姓名已存在')
  staffName.value = ''
}

function generate() {
  if (!store.config.startDate) return alert('请设置起始日期')
  if (store.staff.length === 0) return alert('请先添加人员')
  if (store.generateSchedule()) {
    alert('排班已生成！')
    emit('generated')
  }
}
</script>
